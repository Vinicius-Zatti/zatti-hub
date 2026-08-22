"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireMaster, registrarAuditoria, type Role } from "@/lib/acesso";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  gerarIdComColisao,
  gerarIdOrganizacao,
  gerarIdUnidade,
  validarPapelVinculo,
} from "@/lib/acessos/slug";

type Resultado<T = { ok: true }> = T | { erro: string };

const TIPOS_CLIENTE = ["consultoria", "saas", "hybrid"] as const;
type TipoCliente = (typeof TIPOS_CLIENTE)[number];

/** Origem do site a partir dos headers da própria requisição - mesma fonte
 * que o Next.js já usa pra checar CSRF em Server Action (Origin x Host),
 * sem precisar de env var nova. `x-forwarded-*` cobre o caso atrás de
 * proxy (Vercel); sem eles, cai pro Host cru (dev local). */
async function origemAtual(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function revalidarAcessos() {
  revalidatePath("/acessos");
  revalidatePath("/acessos/usuarios");
}

/** Procura um usuário do Auth pelo email - a Admin API do supabase-js não
 * tem um "getUserByEmail" direto, só paginação. Limitado a 20 páginas de
 * 1000 (20 mil contas) - muito acima do que este app B2B jamais deve ter;
 * é só um teto de segurança contra um loop sem fim, não uma paginação de
 * verdade pensada pra escala. */
async function buscarUsuarioPorEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
) {
  const alvo = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Falha ao consultar usuários existentes: ${error.message}`);
    const achado = data.users.find((u) => u.email?.toLowerCase() === alvo);
    if (achado) return achado;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** Cria uma organização + primeira unidade juntas. IDs textuais gerados no
 * servidor a partir do nome - nunca aceitos do formulário (evita id
 * arbitrário/malformado e mantém a convenção de id legível). Colisão de id
 * sempre bloqueia com mensagem clara, nunca sobrescreve um cadastro
 * existente. */
export async function criarClienteAction(formData: FormData): Promise<
  Resultado<{ ok: true; organizacaoId: string; unidadeId: string }>
> {
  const acesso = await requireMaster();

  const nomeCliente = String(formData.get("nomeCliente") ?? "").trim();
  const tipoCliente = String(formData.get("tipoCliente") ?? "");
  const nomeUnidade = String(formData.get("nomeUnidade") ?? "").trim();
  const fonteDadosEstoque = String(formData.get("fonteDadosEstoque") ?? "");
  const spreadsheetId = String(formData.get("spreadsheetId") ?? "").trim();
  const consolidadoVendasHabilitado = formData.get("consolidadoVendasHabilitado") === "on";

  if (!nomeCliente) return { erro: "Nome do cliente é obrigatório." };
  if (!TIPOS_CLIENTE.includes(tipoCliente as TipoCliente)) {
    return { erro: `Tipo de cliente inválido: "${tipoCliente}".` };
  }
  if (!nomeUnidade) return { erro: "Nome da primeira unidade é obrigatório." };
  if (fonteDadosEstoque !== "banco" && fonteDadosEstoque !== "planilha") {
    return { erro: `Fonte de dados de estoque inválida: "${fonteDadosEstoque}".` };
  }
  if (fonteDadosEstoque === "planilha" && !spreadsheetId) {
    return { erro: "spreadsheet_id é obrigatório quando a fonte de estoque é planilha." };
  }

  const admin = createAdminClient();

  const [{ data: orgsExistentes, error: erroOrgs }, { data: unidadesExistentes, error: erroUnidades }] =
    await Promise.all([
      admin.from("organizacoes").select("id"),
      admin.from("unidades").select("id"),
    ]);
  if (erroOrgs || erroUnidades) {
    return { erro: `Falha ao conferir cadastros existentes: ${(erroOrgs ?? erroUnidades)?.message}` };
  }

  const organizacaoResultado = gerarIdComColisao({
    candidato: gerarIdOrganizacao(nomeCliente),
    idsExistentes: new Set((orgsExistentes ?? []).map((o) => o.id as string)),
    rotulo: "uma organização",
  });
  if (!organizacaoResultado.ok) return { erro: organizacaoResultado.erro };
  const organizacaoId = organizacaoResultado.id;

  const unidadeResultado = gerarIdComColisao({
    candidato: gerarIdUnidade(organizacaoId, nomeUnidade),
    idsExistentes: new Set((unidadesExistentes ?? []).map((u) => u.id as string)),
    rotulo: "uma unidade",
  });
  if (!unidadeResultado.ok) return { erro: unidadeResultado.erro };
  const unidadeId = unidadeResultado.id;

  const { error: erroInsertOrg } = await admin.from("organizacoes").insert({
    id: organizacaoId,
    nome: nomeCliente,
    tipo_cliente: tipoCliente,
    ativo: true,
  });
  if (erroInsertOrg) return { erro: `Falha ao criar organização: ${erroInsertOrg.message}` };

  const { error: erroInsertUnidade } = await admin.from("unidades").insert({
    id: unidadeId,
    organizacao_id: organizacaoId,
    nome: nomeUnidade,
    spreadsheet_id: fonteDadosEstoque === "planilha" ? spreadsheetId : null,
    fonte_dados_estoque: fonteDadosEstoque,
    consolidado_vendas_habilitado: consolidadoVendasHabilitado,
    ativo: true,
  });
  if (erroInsertUnidade) {
    // Organização ficou sem unidade nenhuma - não apaga (nunca exclusão
    // física, item 12), só reporta claro pra tentar de novo com outro nome
    // de unidade (o id da organização já ficou reservado).
    return {
      erro: `Organização "${nomeCliente}" criada, mas falha ao criar a unidade: ${erroInsertUnidade.message}. A organização já existe - tente cadastrar a unidade de novo.`,
    };
  }

  await registrarAuditoria({
    acesso,
    acao: "criar",
    entidade: "organizacao",
    entidadeId: organizacaoId,
    dadosNovos: { nome: nomeCliente, tipoCliente },
  });
  await registrarAuditoria({
    acesso,
    acao: "criar",
    entidade: "unidade",
    entidadeId: unidadeId,
    dadosNovos: { nome: nomeUnidade, fonteDadosEstoque, consolidadoVendasHabilitado },
  });

  revalidarAcessos();
  return { ok: true, organizacaoId, unidadeId };
}

/** Convida (ou vincula, se o email já tiver conta) um usuário a uma
 * organização/unidade. Nunca mostra nem define senha - quem recebe o
 * convite cria a própria senha pelo mesmo fluxo de "esqueci minha senha"
 * já usado no app (link por email, /auth/callback -> /redefinir-senha). */
export async function convidarEVincularAction(formData: FormData): Promise<
  Resultado<{ ok: true; jaExistia: boolean }>
> {
  const acesso = await requireMaster();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nome = String(formData.get("nome") ?? "").trim();
  const organizacaoId = String(formData.get("organizacaoId") ?? "").trim();
  const roleBruto = String(formData.get("role") ?? "");
  const unidadeIdBruto = String(formData.get("unidadeId") ?? "").trim();
  const unidadeId = unidadeIdBruto ? unidadeIdBruto : null;

  if (!email || !email.includes("@")) return { erro: "Email inválido." };
  if (!organizacaoId) return { erro: "Selecione a organização." };

  const papel = validarPapelVinculo({ role: roleBruto, unidadeId });
  if (!papel.ok) return { erro: papel.erro };

  const admin = createAdminClient();

  const { data: organizacao, error: erroOrganizacao } = await admin
    .from("organizacoes")
    .select("id")
    .eq("id", organizacaoId)
    .maybeSingle();
  if (erroOrganizacao) return { erro: erroOrganizacao.message };
  if (!organizacao) return { erro: "Organização não encontrada - a lista pode ter mudado, recarregue a página." };

  if (papel.unidadeId) {
    const { data: unidade, error: erroUnidade } = await admin
      .from("unidades")
      .select("id, organizacao_id")
      .eq("id", papel.unidadeId)
      .maybeSingle();
    if (erroUnidade) return { erro: erroUnidade.message };
    if (!unidade || unidade.organizacao_id !== organizacaoId) {
      return { erro: "Unidade não pertence à organização selecionada." };
    }
  }

  let userId: string;
  let usuarioCriadoAgora = false;

  try {
    const existente = await buscarUsuarioPorEmail(admin, email);
    if (existente) {
      userId = existente.id;
    } else {
      const origem = await origemAtual();
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${origem}/auth/callback?next=/redefinir-senha`,
        data: nome ? { nome } : undefined,
      });
      if (error || !data.user) {
        return { erro: `Falha ao convidar ${email}: ${error?.message ?? "erro desconhecido"}` };
      }
      userId = data.user.id;
      usuarioCriadoAgora = true;
    }
  } catch (err) {
    return { erro: (err as Error).message };
  }

  const { error: erroPerfil } = await admin
    .from("perfis")
    .upsert({ id: userId, nome: nome || null }, { onConflict: "id" });
  if (erroPerfil) {
    if (usuarioCriadoAgora) {
      // Auth criou a conta, perfil falhou - não deixa usuário órfão sem
      // perfil (item 14): apaga o que acabou de ser criado.
      await admin.auth.admin.deleteUser(userId);
    }
    return { erro: `Falha ao criar o perfil: ${erroPerfil.message}` };
  }

  const consultaVinculoDuplicado = admin
    .from("vinculos")
    .select("id")
    .eq("user_id", userId)
    .eq("organizacao_id", organizacaoId)
    .eq("status", "ativo")
    .eq("role", papel.role);

  const { data: vinculoDuplicado, error: erroChecagem } = await (
    papel.unidadeId
      ? consultaVinculoDuplicado.eq("unidade_id", papel.unidadeId)
      : consultaVinculoDuplicado.is("unidade_id", null)
  ).maybeSingle();
  if (erroChecagem) return { erro: erroChecagem.message };
  if (vinculoDuplicado) {
    return { erro: `${email} já tem esse exato vínculo ativo - nada a fazer.` };
  }

  const { error: erroVinculo } = await admin.from("vinculos").insert({
    user_id: userId,
    organizacao_id: organizacaoId,
    unidade_id: papel.unidadeId,
    role: papel.role,
    status: "ativo",
  });
  if (erroVinculo) {
    return {
      erro: `Perfil pronto, mas falha ao criar o vínculo: ${erroVinculo.message}. A conta já existe - tente vincular de novo.`,
    };
  }

  await registrarAuditoria({
    acesso,
    acao: usuarioCriadoAgora ? "convidar_e_vincular" : "vincular_usuario_existente",
    entidade: "vinculo",
    entidadeId: userId,
    dadosNovos: { email, organizacaoId, unidadeId: papel.unidadeId, role: papel.role },
  });

  revalidarAcessos();
  return { ok: true, jaExistia: !usuarioCriadoAgora };
}

/** Reenvia o fluxo de acesso: convite (se a pessoa nunca confirmou a
 * conta) ou recuperação de senha (se já confirmou e só precisa entrar de
 * novo) - o mesmo mecanismo já usado no app, nunca uma senha visível. */
export async function reenviarAcessoAction(
  userId: string
): Promise<Resultado<{ ok: true; tipo: "convite" | "recuperacao" }>> {
  const acesso = await requireMaster();
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return { erro: "Usuário não encontrado." };
  const email = data.user.email;
  if (!email) return { erro: "Usuário sem email cadastrado." };

  const origem = await origemAtual();
  const redirectTo = `${origem}/auth/callback?next=/redefinir-senha`;

  if (!data.user.email_confirmed_at) {
    const { error: erroConvite } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (erroConvite) return { erro: erroConvite.message };
    await registrarAuditoria({ acesso, acao: "reenviar_convite", entidade: "usuario", entidadeId: userId });
    return { ok: true, tipo: "convite" };
  }

  const supabase = await createClient();
  const { error: erroRecuperacao } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (erroRecuperacao) return { erro: erroRecuperacao.message };
  await registrarAuditoria({ acesso, acao: "reenviar_recuperacao", entidade: "usuario", entidadeId: userId });
  return { ok: true, tipo: "recuperacao" };
}

async function alterarStatusVinculo(
  vinculoId: string,
  novoStatus: "ativo" | "revogado"
): Promise<Resultado> {
  const acesso = await requireMaster();
  const admin = createAdminClient();

  const { data: vinculoAtual, error: erroLeitura } = await admin
    .from("vinculos")
    .select("role, status")
    .eq("id", vinculoId)
    .maybeSingle();
  if (erroLeitura) return { erro: erroLeitura.message };
  if (!vinculoAtual) return { erro: "Vínculo não encontrado." };
  if ((vinculoAtual.role as Role) === "master") {
    return { erro: "Vínculos com papel master não são administrados por este painel." };
  }

  const { error } = await admin.from("vinculos").update({ status: novoStatus }).eq("id", vinculoId);
  if (error) return { erro: error.message };

  await registrarAuditoria({
    acesso,
    acao: novoStatus === "revogado" ? "revogar_vinculo" : "reativar_vinculo",
    entidade: "vinculo",
    entidadeId: vinculoId,
    dadosAntigos: { status: vinculoAtual.status },
    dadosNovos: { status: novoStatus },
  });

  revalidarAcessos();
  return { ok: true };
}

export async function revogarVinculoAction(vinculoId: string): Promise<Resultado> {
  return alterarStatusVinculo(vinculoId, "revogado");
}

export async function reativarVinculoAction(vinculoId: string): Promise<Resultado> {
  return alterarStatusVinculo(vinculoId, "ativo");
}

/** Único jeito hoje de editar o nome de um usuário já cadastrado - o painel
 * só definia isso no convite (`convidarEVincularAction`), sem forma nenhuma
 * de corrigir depois. Upsert (não update) porque, em teoria, um `perfis`
 * sem linha ainda (usuário criado antes da tabela existir) não deve travar
 * a primeira edição. */
export async function atualizarNomeUsuarioAction(userId: string, nome: string): Promise<Resultado> {
  const acesso = await requireMaster();
  const admin = createAdminClient();

  const nomeLimpo = nome.trim();
  if (nomeLimpo.length > 160) return { erro: "Nome muito longo (máximo 160 caracteres)." };

  const { data: perfilAtual } = await admin.from("perfis").select("nome").eq("id", userId).maybeSingle();

  const { error } = await admin.from("perfis").upsert({ id: userId, nome: nomeLimpo || null }, { onConflict: "id" });
  if (error) return { erro: error.message };

  await registrarAuditoria({
    acesso,
    acao: "editar_nome_usuario",
    entidade: "usuario",
    entidadeId: userId,
    dadosAntigos: { nome: perfilAtual?.nome ?? null },
    dadosNovos: { nome: nomeLimpo || null },
  });

  revalidarAcessos();
  return { ok: true };
}
