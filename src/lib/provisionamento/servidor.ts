import "server-only";
import { randomBytes } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { gerarIdOrganizacao, gerarIdUnidade } from "@/lib/acessos/slug";
import { expiracaoSenhaTemporaria, gerarSenhaTemporaria } from "@/lib/equipe/regras";
import { buscarUsuarioPorEmail, hashSenhaTemporaria } from "@/lib/equipe/servidor";
import { enviarAcessoPeloVini, type ResultadoEnvio } from "@/lib/equipe/envio";
import { chaveEnvio, idLivre, MODULOS_UNIDADE_NOVA, whatsappDoCrm, type PedidoProvisionamento } from "./regras";
import { ORGANIZACAO_NOVA } from "@/lib/modulos-padrao";

// Cadastro automático de quem compra o Zatti Hub (15/10/2026). Cada passo grava o que criou em
// `zh_provisionamentos` antes do próximo: se a tentativa cair no meio, a seguinte continua de
// onde parou e nunca cria uma segunda organização ou conta para o mesmo pagamento.
// A senha provisória só existe em memória até ir ao Vini; no banco fica só o hash.

type Admin = ReturnType<typeof createAdminClient>;

export type Registro = {
  id: string;
  pagamento_id: string;
  status: "processando" | "concluido" | "revisao_manual" | "falhou";
  email: string;
  nome: string;
  whatsapp: string;
  restaurante: string;
  organizacao_id: string | null;
  unidade_id: string | null;
  user_id: string | null;
  vinculo_id: string | null;
  envio: ResultadoEnvio | null;
  motivo: string;
  tentativas: number;
};

export type Desfecho =
  | { status: "concluido"; envio: ResultadoEnvio; organizacaoId: string }
  | { status: "revisao_manual"; motivo: string }
  | { status: "falhou"; motivo: string };

class PassoFalhou extends Error {}

async function gravar(admin: Admin, id: string, campos: Partial<Registro> & Record<string, unknown>) {
  const { error } = await admin.from("zh_provisionamentos").update(campos).eq("id", id);
  if (error) throw new PassoFalhou("não gravou o andamento");
}

async function criarOrganizacao(admin: Admin, reg: Registro): Promise<string> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { data, error } = await admin.from("organizacoes").select("id");
    if (error) throw new PassoFalhou("não leu as organizações");
    const id = idLivre(gerarIdOrganizacao(reg.restaurante), new Set((data ?? []).map((o) => o.id as string)));
    if (!id) throw new PassoFalhou("nome do restaurante sem id livre");
    const { error: erroInsert } = await admin
      .from("organizacoes")
      .insert({ id, nome: reg.restaurante, tipo_cliente: "saas", ativo: true, ...ORGANIZACAO_NOVA });
    if (!erroInsert) return id;
    if (erroInsert.code !== "23505") throw new PassoFalhou("não criou a organização");
    // Corrida com outro cadastro do mesmo nome: tenta o próximo id livre.
  }
  throw new PassoFalhou("não achou id livre para a organização");
}

async function criarUnidade(admin: Admin, reg: Registro, organizacaoId: string): Promise<string> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { data, error } = await admin.from("unidades").select("id");
    if (error) throw new PassoFalhou("não leu as unidades");
    const id = idLivre(gerarIdUnidade(organizacaoId, reg.restaurante), new Set((data ?? []).map((u) => u.id as string)));
    if (!id) throw new PassoFalhou("sem id livre para a unidade");
    const { error: erroInsert } = await admin.from("unidades").insert({
      id,
      organizacao_id: organizacaoId,
      nome: reg.restaurante,
      spreadsheet_id: null,
      ativo: true,
      ...MODULOS_UNIDADE_NOVA,
    });
    if (!erroInsert) return id;
    if (erroInsert.code !== "23505") throw new PassoFalhou("não criou a unidade");
  }
  throw new PassoFalhou("não achou id livre para a unidade");
}

/** Conta nova pendente, igual à da Equipe: senha do Auth sorteada (ninguém conhece), marca de
 * pendência no Auth e vínculo 'convidado' até a troca no /primeiro-acesso. */
async function criarConta(admin: Admin, reg: Registro, organizacaoId: string): Promise<{ userId: string; vinculoId: string }> {
  const { data: criado, error } = await admin.auth.admin.createUser({
    email: reg.email,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { nome: reg.nome },
    app_metadata: { zh_pendente: true, zh_v2: true },
  });
  if (error || !criado.user) throw new PassoFalhou("não criou a conta");
  const userId = criado.user.id;

  const { error: erroPerfil } = await admin.from("perfis").insert({ id: userId, nome: reg.nome });
  const { data: vinculo, error: erroVinculo } = erroPerfil
    ? { data: null, error: erroPerfil }
    : await admin
        .from("vinculos")
        .insert({
          user_id: userId,
          organizacao_id: organizacaoId,
          unidade_id: null,
          role: "gestao",
          status: "convidado",
          whatsapp: reg.whatsapp,
        })
        .select("id")
        .single();
  if (erroVinculo || !vinculo) {
    // Desfaz a conta (perfis e vínculos caem junto). Se nem isso der, a conta fica pendente no
    // Auth (falha fechada) e a próxima tentativa cai em revisão manual pelo e-mail já existente.
    const { error: erroApagar } = await admin.auth.admin.deleteUser(userId);
    if (erroApagar) console.error("[provisionamento] conta criada pela metade não foi apagada", { userId });
    throw new PassoFalhou("não criou o vínculo");
  }
  return { userId, vinculoId: vinculo.id as string };
}

/** Senha provisória nova para a conta do registro (só o hash vai ao banco). Na retomada, a
 * anterior deixa de valer: a senha só é conhecida no momento do envio. */
async function novaSenha(admin: Admin, userId: string, vinculoId: string) {
  const senha = gerarSenhaTemporaria();
  const validaAte = expiracaoSenhaTemporaria(new Date());
  const { error } = await admin.from("senhas_temporarias").upsert(
    {
      user_id: userId,
      vinculo_id: vinculoId,
      hash: hashSenhaTemporaria(userId, senha),
      expira_em: validaAte.toISOString(),
      versao: 1,
      enviada_em: new Date().toISOString(),
      tentativas: 0,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new PassoFalhou("não gravou a senha provisória");
  return { senha, validaAte };
}

/** Liga o lead do CRM à organização nova e deixa o evento na linha do tempo. Nunca derruba o cadastro. */
async function ligarLead(admin: Admin, reg: Registro, organizacaoId: string) {
  const whatsapp = whatsappDoCrm(reg.whatsapp);
  if (!whatsapp) return;
  const { data: lead } = await admin.from("zh_leads").select("id, organizacao_id").eq("whatsapp", whatsapp).maybeSingle();
  if (!lead) return;
  if (!lead.organizacao_id) await admin.from("zh_leads").update({ organizacao_id: organizacaoId, ultimo_evento_em: new Date().toISOString() }).eq("id", lead.id);
  await admin.from("zh_leads_eventos").insert({
    lead_id: lead.id,
    chave_externa: `prov-${reg.pagamento_id}`,
    tipo: "virou_cliente",
    texto: "Conta criada sozinha depois da compra do app.",
    dados: { organizacao_id: organizacaoId },
    autor: "vini",
    criado_por: null,
  });
}

/** Executa (ou retoma) o cadastro de um registro já reservado. */
export async function executarProvisionamento(admin: Admin, reg: Registro): Promise<Desfecho> {
  try {
    // E-mail que já tem conta: nunca vincula sozinho (decisão do plano). Só na primeira vez:
    // na retomada a conta encontrada é a que este próprio registro criou.
    if (!reg.user_id) {
      const existente = await buscarUsuarioPorEmail(admin, reg.email).catch(() => {
        throw new PassoFalhou("não conferiu o e-mail");
      });
      if (existente) {
        const motivo = "E-mail já tem conta no Zatti Hub";
        await gravar(admin, reg.id, { status: "revisao_manual", motivo });
        return { status: "revisao_manual", motivo };
      }
    }

    const organizacaoId = reg.organizacao_id ?? (await criarOrganizacao(admin, reg));
    if (!reg.organizacao_id) await gravar(admin, reg.id, { organizacao_id: organizacaoId });
    if (!reg.unidade_id) await gravar(admin, reg.id, { unidade_id: await criarUnidade(admin, reg, organizacaoId) });

    let { user_id: userId, vinculo_id: vinculoId } = reg;
    if (!userId || !vinculoId) {
      const conta = await criarConta(admin, reg, organizacaoId);
      userId = conta.userId;
      vinculoId = conta.vinculoId;
      await gravar(admin, reg.id, { user_id: userId, vinculo_id: vinculoId });
    }

    const { senha, validaAte } = await novaSenha(admin, userId, vinculoId);
    const envio = await enviarAcessoPeloVini({
      tipo: "conta_nova",
      idempotencia: chaveEnvio(reg.pagamento_id, reg.tentativas),
      whatsapp: reg.whatsapp,
      nome: reg.nome,
      email: reg.email,
      organizacaoNome: reg.restaurante,
      senhaTemporaria: senha,
      validaAte,
    });
    await admin.from("vinculos").update({ acesso_envio_status: envio, acesso_envio_em: new Date().toISOString() }).eq("id", vinculoId);

    await ligarLead(admin, reg, organizacaoId).catch(() => console.error("[provisionamento] lead do CRM não foi ligado"));
    await gravar(admin, reg.id, { status: "concluido", envio, motivo: "", concluido_em: new Date().toISOString() });
    return { status: "concluido", envio, organizacaoId };
  } catch (erro) {
    const motivo = erro instanceof PassoFalhou ? erro.message : "erro inesperado";
    console.error("[provisionamento] tentativa falhou", { pagamento: reg.pagamento_id, motivo });
    await admin.from("zh_provisionamentos").update({ status: "falhou", motivo }).eq("id", reg.id);
    return { status: "falhou", motivo };
  }
}

/** Converte o pedido validado no formato da RPC de reserva. */
export function pedidoParaReserva(p: PedidoProvisionamento) {
  return {
    pagamento_id: p.pagamentoId,
    email: p.email,
    nome: p.nome,
    whatsapp: p.whatsapp,
    restaurante: p.restaurante,
    valor: p.valor,
    lead_site_id: p.leadSiteId,
  };
}
