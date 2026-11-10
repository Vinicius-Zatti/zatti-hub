import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenAtor } from "@/lib/integracao/token";
import { validarPedidoPorta } from "@/lib/equipe/porta";
import { cadastrarMembro } from "@/lib/equipe/cadastrar-membro";
import { contaPendente, editarVinculoNoBanco } from "@/lib/equipe/servidor";
import { carregarTitularOrganizacao } from "@/lib/equipe/titular-servidor";
import { MENSAGEM_CONTA_TITULAR, mensagemEditarVinculo } from "@/lib/equipe/regras";

// Porta de acesso de equipe do Vini (09/11/2026). Desde a trava do vini_operador, o Vini não escreve
// mais em vínculos direto no banco: lista, cadastra, edita, revoga e reativa acesso de gestão e
// operacional por aqui. O token do escopo 'equipe' age em nome de uma conta master (o banco só aceita
// enquanto ela for master ativa) e passa pelas mesmas regras da tela Equipe. Fora daqui: master,
// titular do cliente, área interna da Zatti e senha. Corpo JSON:
//   { acao: 'listar', organizacao_id }
//   { acao: 'cadastrar', organizacao_id, nome, email, whatsapp, role, unidade_id? }
//   { acao: 'editar', organizacao_id, vinculo_id, role, unidade_id? }
//   { acao: 'revogar' | 'reativar', organizacao_id, vinculo_id }

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LIMITE_CORPO = 4 * 1024;
const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

type Admin = ReturnType<typeof createAdminClient>;

type Vinculo = {
  id: string;
  user_id: string;
  organizacao_id: string;
  unidade_id: string | null;
  role: string;
  status: string;
  whatsapp: string | null;
};

function responder(corpo: Record<string, unknown>, status = 200) {
  return NextResponse.json(corpo, { status, ...SEM_CACHE });
}

/** `logs_auditoria` exige unidade: a do vínculo ou, para acesso da organização inteira, a primeira
 * unidade da organização. Quem responde é o master dono do token. */
async function auditar(
  admin: Admin,
  ator: string,
  organizacaoId: string,
  acao: string,
  vinculoId: string,
  unidadeId: string | null,
  dadosAntigos: unknown,
  dadosNovos: unknown,
) {
  let unidade = unidadeId;
  if (!unidade) {
    const { data } = await admin.from("unidades").select("id").eq("organizacao_id", organizacaoId).order("id").limit(1).maybeSingle();
    unidade = (data?.id as string | undefined) ?? null;
  }
  if (!unidade) {
    console.error("[porta-equipe] auditoria sem unidade", { acao });
    return;
  }
  const { error } = await admin.from("logs_auditoria").insert({
    unidade_id: unidade,
    user_id: ator,
    acao,
    entidade: "vinculo",
    entidade_id: vinculoId,
    dados_antigos: dadosAntigos ?? null,
    dados_novos: { dados: dadosNovos ?? null, origem: "porta_vini" },
  });
  if (error) console.error("[porta-equipe] auditoria falhou", { codigo: error.code ?? null });
}

function revalidarTelas() {
  revalidatePath("/equipe");
  revalidatePath("/acessos");
  revalidatePath("/acessos/usuarios");
}

async function listar(admin: Admin, organizacaoId: string) {
  const { data, error } = await admin
    .from("vinculos")
    .select("id, user_id, unidade_id, role, status, whatsapp")
    .eq("organizacao_id", organizacaoId)
    .neq("role", "master")
    .order("created_at")
    .limit(200);
  if (error) return responder({ erro: "indisponivel" }, 503);
  const vinculos = (data ?? []) as Omit<Vinculo, "organizacao_id">[];
  const ids = [...new Set(vinculos.map((v) => v.user_id))];
  const [{ data: perfis }, { data: unidades }, titular, contas] = await Promise.all([
    admin.from("perfis").select("id, nome").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    admin.from("unidades").select("id, nome").eq("organizacao_id", organizacaoId),
    carregarTitularOrganizacao(admin, organizacaoId).catch(() => null),
    Promise.all(ids.map(async (id) => [id, (await admin.auth.admin.getUserById(id)).data.user?.email ?? null] as const)),
  ]);
  const nomes = new Map((perfis ?? []).map((p) => [p.id as string, (p.nome as string | null) ?? null]));
  const nomesUnidade = new Map((unidades ?? []).map((u) => [u.id as string, u.nome as string]));
  const emails = new Map(contas);
  return responder({
    status: "ok",
    acessos: vinculos.map((v) => ({
      vinculo_id: v.id,
      nome: nomes.get(v.user_id) ?? null,
      email: emails.get(v.user_id) ?? null,
      papel: v.role,
      unidade_id: v.unidade_id,
      unidade_nome: v.unidade_id ? (nomesUnidade.get(v.unidade_id) ?? null) : "todas as unidades",
      status: v.status,
      whatsapp_final: v.whatsapp ? v.whatsapp.slice(-4) : null,
      titular: titular?.userId === v.user_id,
    })),
  });
}

export async function POST(request: NextRequest) {
  const ator = await tokenAtor(request, "equipe");
  if (!ator) return responder({ erro: "nao_autorizado" }, 401);

  const bruto = await request.text();
  if (bruto.length > LIMITE_CORPO) return responder({ erro: "corpo_grande" }, 413);
  let corpo: unknown;
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return responder({ erro: "json_invalido" }, 400);
  }
  const validado = validarPedidoPorta(corpo);
  if (!validado.ok) return responder({ erro: validado.erro }, 400);
  const pedido = validado.pedido;

  const admin = createAdminClient();
  const { data: organizacao, error: erroOrganizacao } = await admin
    .from("organizacoes")
    .select("id, nome, ativo, area_interna")
    .eq("id", pedido.organizacaoId)
    .maybeSingle();
  if (erroOrganizacao) return responder({ erro: "indisponivel" }, 503);
  if (!organizacao || !organizacao.ativo) return responder({ erro: "organizacao_nao_encontrada" }, 404);
  // A área de trabalho da Zatti fica de fora: acesso a ela só pela tela, com o master logado.
  if (organizacao.area_interna) return responder({ erro: "area_interna" }, 403);

  if (pedido.acao === "listar") return listar(admin, pedido.organizacaoId);

  if (pedido.acao === "cadastrar") {
    const resultado = await cadastrarMembro(
      admin,
      { role: "master", unidadeFixa: null, userId: ator, organizacaoId: pedido.organizacaoId, organizacaoNome: organizacao.nome as string },
      { nome: pedido.nome, email: pedido.email, whatsapp: pedido.whatsapp, role: pedido.role, unidadeId: pedido.unidadeId },
      (acao, vinculoId, unidadeId, dadosNovos) =>
        auditar(admin, ator, pedido.organizacaoId, acao, vinculoId, unidadeId, null, dadosNovos),
    );
    if ("erro" in resultado) return responder({ erro: "recusado", mensagem: resultado.erro }, 422);
    revalidarTelas();
    return responder({ status: "ok", situacao: resultado.situacao, envio: resultado.envio, vinculo_id: resultado.vinculoId });
  }

  // editar, revogar, reativar: o vínculo tem que ser desta organização, não master e não o titular.
  const { data: vinculoData, error: erroVinculo } = await admin
    .from("vinculos")
    .select("id, user_id, organizacao_id, unidade_id, role, status, whatsapp")
    .eq("id", pedido.vinculoId)
    .maybeSingle();
  if (erroVinculo) return responder({ erro: "indisponivel" }, 503);
  const alvo = vinculoData as Vinculo | null;
  // Mesma resposta para "não existe" e "é de outro cliente".
  if (!alvo || alvo.organizacao_id !== pedido.organizacaoId || alvo.role === "master") {
    return responder({ erro: "vinculo_nao_encontrado" }, 404);
  }
  let titular;
  try {
    titular = await carregarTitularOrganizacao(admin, pedido.organizacaoId);
  } catch {
    return responder({ erro: "indisponivel" }, 503);
  }
  if (titular?.userId === alvo.user_id) return responder({ erro: "alvo_titular", mensagem: MENSAGEM_CONTA_TITULAR }, 403);

  if (pedido.acao === "editar") {
    // O banco confere de novo o ator, a organização, a unidade, duplicata e última gestão, e audita.
    const codigo = await editarVinculoNoBanco(admin, {
      atorId: ator,
      vinculoId: alvo.id,
      escopo: "equipe",
      organizacaoId: pedido.organizacaoId,
      role: pedido.role,
      unidadeId: pedido.unidadeId,
    });
    const mensagem = mensagemEditarVinculo(codigo);
    if (mensagem) return responder({ erro: "recusado", codigo, mensagem }, 422);
    revalidarTelas();
    return responder({ status: "ok" });
  }

  if (pedido.acao === "revogar") {
    if (alvo.status === "revogado") return responder({ status: "ok", sem_mudanca: true });
    const { data: codigo, error } = await admin.rpc("revogar_vinculo_equipe", {
      p_ator: ator,
      p_vinculo_id: alvo.id,
      p_escopo: "equipe",
    });
    if (error) return responder({ erro: "indisponivel" }, 503);
    if (codigo === "ultima_gestao") {
      return responder({ erro: "recusado", codigo, mensagem: "Essa é a última pessoa de gestão que cobre esse acesso. Cadastre outra antes." }, 422);
    }
    if (codigo !== "ok") return responder({ erro: "recusado", codigo }, 422);
    await auditar(admin, ator, pedido.organizacaoId, "equipe_revogar", alvo.id, alvo.unidade_id, { status: alvo.status }, { status: "revogado" });
    revalidarTelas();
    return responder({ status: "ok" });
  }

  // reativar: conta que ainda não trocou a senha volta como 'convidado'.
  if (alvo.status !== "revogado") return responder({ status: "ok", sem_mudanca: true });
  const { data: conta, error: erroConta } = await admin.auth.admin.getUserById(alvo.user_id);
  if (erroConta || !conta.user) return responder({ erro: "vinculo_nao_encontrado" }, 404);
  let pendente: boolean;
  try {
    pendente = await contaPendente(admin, conta.user);
  } catch {
    return responder({ erro: "indisponivel" }, 503);
  }
  const novoStatus = pendente ? "convidado" : "ativo";
  const { error: erroReativar } = await admin.from("vinculos").update({ status: novoStatus }).eq("id", alvo.id);
  if (erroReativar) {
    if (erroReativar.code === "23505") return responder({ erro: "recusado", mensagem: "Essa pessoa já tem esse acesso ativo." }, 422);
    return responder({ erro: "indisponivel" }, 503);
  }
  await auditar(admin, ator, pedido.organizacaoId, "equipe_reativar", alvo.id, alvo.unidade_id, { status: alvo.status }, { status: novoStatus });
  revalidarTelas();
  return responder({ status: "ok", novo_status: novoStatus });
}
