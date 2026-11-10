import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { Role } from "@/lib/acesso";
import type { createAdminClient } from "@/lib/supabase/admin";
import { expiracaoSenhaTemporaria, gerarSenhaTemporaria, normalizarWhatsapp, validarConcessao } from "@/lib/equipe/regras";
import { buscarUsuarioPorEmail, contaPendente, hashSenhaTemporaria } from "@/lib/equipe/servidor";
import { enviarAcessoPeloVini, type ResultadoEnvio } from "@/lib/equipe/envio";

// Cadastro de alguém da equipe, usado pela tela Equipe e pela porta do Vini (09/11/2026). Quem chama
// já conferiu quem pede; aqui valem as mesmas regras de papel, unidade, conta nova e conta existente.

type Admin = ReturnType<typeof createAdminClient>;

export type ConcedenteCadastro = {
  role: Role;
  unidadeFixa: string | null;
  userId: string;
  organizacaoId: string;
  organizacaoNome: string;
};

export type EntradaCadastro = {
  nome: string;
  email: string;
  whatsapp: string;
  role: string;
  unidadeId: string | null;
};

export type SituacaoCadastro = "enviado" | "pendente_de_outro_cliente" | "conta_existente";

/** Grava a auditoria do jeito de quem chama (sessão na tela, client admin na porta). */
export type Auditar = (acao: string, vinculoId: string, unidadeId: string | null, dadosNovos: unknown) => Promise<void>;

type Resultado<T> = T | { erro: string };

async function gravarResultadoEnvio(admin: Admin, vinculoId: string, resultado: ResultadoEnvio) {
  await admin
    .from("vinculos")
    .update({ acesso_envio_status: resultado, acesso_envio_em: new Date().toISOString() })
    .eq("id", vinculoId);
}

/** Conta nova: senha provisória pelo WhatsApp e vínculo 'convidado' até a troca. Conta que já
 * existe: vínculo ativo, sem senha nova; se ela ainda estiver pendente, o vínculo também espera. */
export async function cadastrarMembro(
  admin: Admin,
  concedente: ConcedenteCadastro,
  entrada: EntradaCadastro,
  auditar: Auditar,
): Promise<Resultado<{ ok: true; situacao: SituacaoCadastro; envio: ResultadoEnvio | null; vinculoId: string }>> {
  const nome = entrada.nome.trim();
  const email = entrada.email.trim().toLowerCase();
  const whatsapp = normalizarWhatsapp(entrada.whatsapp);

  if (!nome || nome.length > 160) return { erro: "Informe o nome (até 160 caracteres)." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { erro: "E-mail inválido." };
  if (!whatsapp) return { erro: "WhatsApp inválido. Use DDD + número, ex.: 31 99999-8888." };

  const { data: unidadesData, error: erroUnidades } = await admin
    .from("unidades")
    .select("id")
    .eq("organizacao_id", concedente.organizacaoId)
    .eq("ativo", true);
  if (erroUnidades) return { erro: "Não foi possível conferir as unidades." };

  const concessao = validarConcessao({
    concedente: { role: concedente.role, unidadeFixa: concedente.unidadeFixa },
    role: entrada.role,
    unidadeId: entrada.unidadeId,
    unidadesDaOrganizacao: new Set((unidadesData ?? []).map((u) => u.id as string)),
  });
  if (!concessao.ok) return { erro: concessao.erro };

  let existente;
  try {
    existente = await buscarUsuarioPorEmail(admin, email);
  } catch {
    // A mensagem interna do Auth não vai para a tela (revisão de segurança, 09/11/2026).
    return { erro: "Não foi possível consultar as contas agora. Tente de novo em instantes." };
  }

  const vinculoBase = {
    organizacao_id: concedente.organizacaoId,
    unidade_id: concessao.unidadeId,
    role: concessao.role,
    whatsapp,
    criado_por: concedente.userId,
  };

  if (existente) {
    // Conta antiga sem nome ganha o nome informado agora; nome já existente não é trocado.
    await admin.from("perfis").update({ nome }).eq("id", existente.id).is("nome", null);
    let pendente: boolean;
    try {
      pendente = await contaPendente(admin, existente);
    } catch {
      return { erro: "Não foi possível conferir o primeiro acesso dessa conta." };
    }
    const { data: vinculoNovo, error: erroVinculo } = await admin
      .from("vinculos")
      .insert({ ...vinculoBase, user_id: existente.id, status: pendente ? "convidado" : "ativo" })
      .select("id")
      .single();
    if (erroVinculo) {
      if (erroVinculo.code === "23505") return { erro: "Essa pessoa já tem esse acesso." };
      return { erro: "Não foi possível criar o acesso." };
    }

    await auditar(
      pendente ? "equipe_vincular_conta_pendente" : "equipe_vincular_conta_existente",
      vinculoNovo.id,
      concessao.unidadeId,
      { unidadeId: concessao.unidadeId, role: concessao.role },
    );

    // Conta pendente: o acesso libera quando ela trocar a senha que já recebeu.
    // Não manda "use sua senha", porque ainda não está liberado.
    if (pendente) return { ok: true, situacao: "pendente_de_outro_cliente", envio: null, vinculoId: vinculoNovo.id };

    const envio = await enviarAcessoPeloVini({
      tipo: "conta_existente",
      idempotencia: randomUUID(),
      whatsapp,
      nome,
      email,
      organizacaoNome: concedente.organizacaoNome,
    });
    await gravarResultadoEnvio(admin, vinculoNovo.id, envio);
    return { ok: true, situacao: "conta_existente", envio, vinculoId: vinculoNovo.id };
  }

  // Conta nova.
  const senha = gerarSenhaTemporaria();
  const validaAte = expiracaoSenhaTemporaria(new Date());
  // A senha do Auth é sorteada e ninguém conhece: a conta pendente não
  // consegue entrar nem ter sessão. A provisória só existe como hash em
  // senhas_temporarias e vale no primeiro acesso (sem sessão).
  const { data: criado, error: erroCriacao } = await admin.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { nome },
    // Marca de pendência no próprio Auth desde o primeiro instante: outro
    // cadastro que achar esta conta antes da pendência ir pro banco a trata
    // como pendente, nunca como conta regular.
    app_metadata: { zh_pendente: true, zh_v2: true },
  });
  if (erroCriacao || !criado.user) {
    // Corrida: alguém criou a conta entre a busca e aqui. Tentar de novo cai
    // no caminho de conta existente.
    return { erro: "Não foi possível criar a conta agora. Tente de novo em instantes." };
  }
  const userId = criado.user.id;

  const desfazer = async (): Promise<boolean> => {
    // Apaga a conta recém-criada; perfis, senhas_temporarias e vinculos
    // caem junto (on delete cascade). Se nem isso der certo, a conta fica
    // marcada como pendente no Auth (falha fechada) e o suporte resolve.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error("[equipe] conta criada pela metade não foi apagada", { userId });
    return !error;
  };

  const { error: erroPerfil } = await admin.from("perfis").insert({ id: userId, nome });
  const { data: vinculoNovo, error: erroVinculo } = erroPerfil
    ? { data: null, error: erroPerfil }
    : await admin
        .from("vinculos")
        .insert({ ...vinculoBase, user_id: userId, status: "convidado" })
        .select("id")
        .single();
  // A pendência guarda o vínculo de origem: só ele reenvia senha.
  const { error: erroSenha } =
    erroVinculo || !vinculoNovo
      ? { error: erroVinculo ?? new Error("sem vínculo") }
      : await admin.from("senhas_temporarias").insert({
          user_id: userId,
          vinculo_id: vinculoNovo.id,
          hash: hashSenhaTemporaria(userId, senha),
          expira_em: validaAte.toISOString(),
          versao: 1,
        });
  if (erroSenha || !vinculoNovo) {
    const desfeito = await desfazer();
    return {
      erro: desfeito
        ? "Não foi possível concluir o cadastro. Nada foi criado; tente de novo."
        : "Não foi possível concluir o cadastro. Avise o suporte da Zatti antes de tentar de novo.",
    };
  }

  const envio = await enviarAcessoPeloVini({
    tipo: "conta_nova",
    idempotencia: randomUUID(),
    whatsapp,
    nome,
    email,
    organizacaoNome: concedente.organizacaoNome,
    senhaTemporaria: senha,
    validaAte,
  });
  await gravarResultadoEnvio(admin, vinculoNovo.id, envio);

  await auditar("equipe_cadastrar_conta_nova", vinculoNovo.id, concessao.unidadeId, {
    unidadeId: concessao.unidadeId,
    role: concessao.role,
    envio,
  });

  return { ok: true, situacao: "enviado", envio, vinculoId: vinculoNovo.id };
}
