"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireEquipeEditar, registrarAuditoria, type AcessoAtual } from "@/lib/acesso";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  expiracaoSenhaTemporaria,
  gerarSenhaTemporaria,
  MENSAGEM_CONTA_TITULAR,
  mensagemEditarVinculo,
  mensagemGerarProvisoria,
  normalizarWhatsapp,
  whatsappTrocadoHaPouco,
  pedidoEdicaoValido,
  podeAdministrarVinculo,
} from "@/lib/equipe/regras";
import {
  contaPendente,
  editarVinculoNoBanco,
  gerarSenhaProvisoriaNoBanco,
  hashSenhaTemporaria,
  salvarPermissoesNoBanco,
} from "@/lib/equipe/servidor";
import { CHAVES, ehChavePermissao, ehNivel, mensagemSalvarPermissoes } from "@/lib/permissoes/modulos";
import { podeAdministrarPermissoes, podeMexerNaContaDe, podeMudarPermissoesDe } from "@/lib/permissoes/quem-administra";
import { vinculoEhDono } from "@/lib/permissoes/dono";
import { carregarTitularOrganizacao } from "@/lib/equipe/titular-servidor";
import { enviarAcessoPeloVini, type ResultadoEnvio } from "@/lib/equipe/envio";
import { cadastrarMembro, type SituacaoCadastro } from "@/lib/equipe/cadastrar-membro";

// Toda ação começa por `requireEquipe()` (gestão ou master, flag ligada na
// organização da sessão). A organização vem sempre da sessão; o client
// admin só é criado depois da autorização. Desenho e veredito do Codex em
// _execucao/zatti-hub/equipe-cliente-v1.md.

type Resultado<T = { ok: true }> = T | { erro: string };

type VinculoAlvo = {
  id: string;
  user_id: string;
  organizacao_id: string;
  unidade_id: string | null;
  role: string;
  status: string;
  whatsapp: string | null;
  acesso_envio_em: string | null;
  whatsapp_alterado_em: string | null;
};

const MINUTOS_ENTRE_ENVIOS = 2;

function finalWhatsapp(numero: string | null): string | null {
  return numero ? numero.slice(-4) : null;
}

function revalidarEquipe() {
  revalidatePath("/equipe");
}

function concedente(acesso: AcessoAtual) {
  return {
    role: acesso.role,
    unidadeFixa: acesso.unidadeFixa,
    userId: acesso.userId,
    organizacaoId: acesso.organizacaoId,
  };
}

async function carregarAlvo(
  admin: ReturnType<typeof createAdminClient>,
  acesso: AcessoAtual,
  vinculoId: string,
): Promise<Resultado<{ alvo: VinculoAlvo }>> {
  const { data, error } = await admin
    .from("vinculos")
    .select("id, user_id, organizacao_id, unidade_id, role, status, whatsapp, acesso_envio_em, whatsapp_alterado_em")
    .eq("id", vinculoId)
    .maybeSingle();
  if (error) return { erro: "Não foi possível carregar esse acesso." };
  const alvo = data as VinculoAlvo | null;
  if (
    !alvo ||
    !podeAdministrarVinculo({
      concedente: concedente(acesso),
      alvo: { userId: alvo.user_id, organizacaoId: alvo.organizacao_id, unidadeId: alvo.unidade_id, role: alvo.role },
    })
  ) {
    // Mesma resposta para "não existe" e "não é seu": não revela vínculo de outro cliente.
    return { erro: "Acesso não encontrado." };
  }
  return { alvo };
}

/** A conta do titular (senha, WhatsApp, editar e tirar acesso) só o master mexe. O banco confere
 * de novo na senha provisória e na edição ('alvo_titular'). */
async function recusaContaTitular(
  admin: ReturnType<typeof createAdminClient>,
  acesso: AcessoAtual,
  alvo: VinculoAlvo,
): Promise<{ erro: string } | null> {
  if (acesso.role === "master") return null;
  const titular = await carregarTitularOrganizacao(admin, acesso.organizacaoId);
  if (podeMexerNaContaDe(acesso, { ehTitular: titular?.userId === alvo.user_id })) return null;
  return { erro: MENSAGEM_CONTA_TITULAR };
}

async function gravarResultadoEnvio(
  admin: ReturnType<typeof createAdminClient>,
  vinculoId: string,
  resultado: ResultadoEnvio,
) {
  await admin
    .from("vinculos")
    .update({ acesso_envio_status: resultado, acesso_envio_em: new Date().toISOString() })
    .eq("id", vinculoId);
}

/** Cadastra alguém da equipe. A regra mora em `cadastrarMembro` (também usada pela porta do
 * Vini, 09/11/2026); aqui só a barreira da sessão, a auditoria e a tela. */
export async function cadastrarMembroAction(formData: FormData): Promise<
  Resultado<{ ok: true; situacao: SituacaoCadastro; envio: ResultadoEnvio | null }>
> {
  const acesso = await requireEquipeEditar();
  const unidadeBruta = String(formData.get("unidadeId") ?? "").trim();
  const resultado = await cadastrarMembro(
    createAdminClient(),
    { ...concedente(acesso), organizacaoNome: acesso.organizacaoNome },
    {
      nome: String(formData.get("nome") ?? ""),
      email: String(formData.get("email") ?? ""),
      whatsapp: String(formData.get("whatsapp") ?? ""),
      role: String(formData.get("role") ?? ""),
      unidadeId: unidadeBruta || null,
    },
    (acao, vinculoId, _unidadeId, dadosNovos) =>
      registrarAuditoria({ acesso, acao, entidade: "vinculo", entidadeId: vinculoId, dadosNovos }),
  );
  if ("erro" in resultado) return resultado;
  revalidarEquipe();
  return { ok: true, situacao: resultado.situacao, envio: resultado.envio };
}

/** Reenvia o acesso. Conta pendente: senha provisória nova (a anterior deixa
 * de valer). Conta ativa: só o lembrete de como entrar. Nunca reenvia
 * sozinho depois de um envio incerto: quem decide é a gestão. */
export async function reenviarAcessoMembroAction(
  vinculoId: string,
): Promise<Resultado<{ ok: true; envio: ResultadoEnvio }>> {
  const acesso = await requireEquipeEditar();
  const admin = createAdminClient();
  const carregado = await carregarAlvo(admin, acesso, vinculoId);
  if ("erro" in carregado) return carregado;
  const { alvo } = carregado;

  if (alvo.status === "revogado") return { erro: "Reative o acesso antes de reenviar." };
  if (!alvo.whatsapp) return { erro: "Cadastre o WhatsApp dessa pessoa antes de reenviar." };

  const { data: usuario, error: erroUsuario } = await admin.auth.admin.getUserById(alvo.user_id);
  if (erroUsuario || !usuario.user?.email) return { erro: "Conta não encontrada." };
  const { data: perfil } = await admin.from("perfis").select("nome").eq("id", alvo.user_id).maybeSingle();
  const nome = (perfil?.nome as string | null) ?? "";

  let pendente: boolean;
  try {
    pendente = await contaPendente(admin, usuario.user);
  } catch (err) {
    return { erro: (err as Error).message };
  }

  if (!pendente) {
    // Reserva atômica do envio (um update só): dois cliques simultâneos não
    // mandam duas mensagens.
    const limite = new Date(Date.now() - MINUTOS_ENTRE_ENVIOS * 60_000).toISOString();
    const { data: reservado } = await admin
      .from("vinculos")
      .update({ acesso_envio_em: new Date().toISOString() })
      .eq("id", alvo.id)
      .or(`acesso_envio_em.is.null,acesso_envio_em.lt.${limite}`)
      .select("id");
    if (!reservado?.length) {
      return { erro: `Espere ${MINUTOS_ENTRE_ENVIOS} minutos entre um envio e outro.` };
    }
    const envio = await enviarAcessoPeloVini({
      tipo: "conta_existente",
      idempotencia: randomUUID(),
      whatsapp: alvo.whatsapp,
      nome,
      email: usuario.user.email,
      organizacaoNome: acesso.organizacaoNome,
    });
    await gravarResultadoEnvio(admin, alvo.id, envio);
    await registrarAuditoria({ acesso, acao: "equipe_reenviar_lembrete", entidade: "vinculo", entidadeId: alvo.id, dadosNovos: { envio } });
    revalidarEquipe();
    return { ok: true, envio };
  }

  // Senha provisória só é redefinida pelo vínculo que criou a conta. Gestor
  // de outro cliente nunca redefine a conta global de ninguém (veredito do
  // Codex, item 6); `rotacionar_senha_temporaria` confere de novo no banco.
  const { data: origem } = await admin
    .from("senhas_temporarias")
    .select("vinculo_id, origem")
    .eq("user_id", alvo.user_id)
    .maybeSingle();
  if (!origem || origem.vinculo_id !== alvo.id) {
    return {
      erro: "Essa pessoa foi cadastrada por outro acesso e ainda não entrou. Só quem cadastrou pode reenviar a senha.",
    };
  }
  // Senha redefinida (conta que já existia) não é reenviada para um número trocado
  // há pouco: o banco também recusa (`rotacionar_senha_temporaria`).
  if (origem.origem === "redefinicao" && whatsappTrocadoHaPouco(alvo.whatsapp_alterado_em, new Date())) {
    return { erro: mensagemGerarProvisoria("whatsapp_recente") ?? "Não foi possível reenviar." };
  }

  // Só o hash da provisória muda (nenhuma escrita no Auth): a conta pendente
  // não tem senha conhecida no Auth. Limite de 2 minutos e vínculo de origem
  // conferidos no banco; a provisória anterior deixa de valer na hora.
  const senha = gerarSenhaTemporaria();
  const validaAte = expiracaoSenhaTemporaria(new Date());
  const { data: trocou, error: erroRotacao } = await admin.rpc("rotacionar_senha_temporaria", {
    p_user_id: alvo.user_id,
    p_vinculo_id: alvo.id,
    p_hash: hashSenhaTemporaria(alvo.user_id, senha),
    p_expira_em: validaAte.toISOString(),
  });
  if (erroRotacao) return { erro: "Não foi possível gerar a senha nova." };
  if (!trocou) {
    return { erro: `Espere ${MINUTOS_ENTRE_ENVIOS} minutos entre um envio e outro (ou a pessoa acabou de criar a senha dela).` };
  }

  const envio = await enviarAcessoPeloVini({
    tipo: "conta_nova",
    idempotencia: randomUUID(),
    whatsapp: alvo.whatsapp,
    nome,
    email: usuario.user.email,
    organizacaoNome: acesso.organizacaoNome,
    senhaTemporaria: senha,
    validaAte,
  });
  await gravarResultadoEnvio(admin, alvo.id, envio);
  await registrarAuditoria({ acesso, acao: "equipe_reenviar_senha", entidade: "vinculo", entidadeId: alvo.id, dadosNovos: { envio } });
  revalidarEquipe();
  return { ok: true, envio };
}

/** Senha provisória para quem já tem conta ativa (24/10/2026). A senha
 * atual deixa de valer, as sessões caem e a conta volta ao primeiro acesso;
 * a provisória vai só para o WhatsApp da pessoa (a gestão não vê). Só para
 * conta que pertence apenas a este cliente: o banco confere de novo papel,
 * organização, unidade e limite, e grava a auditoria. */
export async function gerarSenhaProvisoriaMembroAction(
  vinculoId: string,
): Promise<Resultado<{ ok: true; envio: ResultadoEnvio }>> {
  const acesso = await requireEquipeEditar();
  const admin = createAdminClient();
  const carregado = await carregarAlvo(admin, acesso, vinculoId);
  if ("erro" in carregado) return carregado;
  const { alvo } = carregado;
  const recusaTitular = await recusaContaTitular(admin, acesso, alvo);
  if (recusaTitular) return recusaTitular;

  if (alvo.status !== "ativo") return { erro: "Só dá para gerar senha provisória para acesso ativo." };
  // Antes de trocar: sem WhatsApp, a pessoa ficaria sem senha nenhuma.
  if (!alvo.whatsapp) return { erro: "Cadastre o WhatsApp dessa pessoa antes de gerar a senha provisória." };

  const { data: usuario, error: erroUsuario } = await admin.auth.admin.getUserById(alvo.user_id);
  if (erroUsuario || !usuario.user?.email) return { erro: "Conta não encontrada." };
  const { data: perfil } = await admin.from("perfis").select("nome").eq("id", alvo.user_id).maybeSingle();

  const gerado = await gerarSenhaProvisoriaNoBanco(admin, {
    atorId: acesso.userId,
    vinculoId: alvo.id,
    alvoUserId: alvo.user_id,
    escopo: "equipe",
    organizacaoId: acesso.organizacaoId,
  });
  const erro = mensagemGerarProvisoria(gerado.codigo);
  if (erro || !gerado.senha) return { erro: erro ?? "Não foi possível gerar a senha provisória." };

  const envio = await enviarAcessoPeloVini({
    tipo: "conta_nova",
    idempotencia: randomUUID(),
    whatsapp: alvo.whatsapp,
    nome: (perfil?.nome as string | null) ?? "",
    email: usuario.user.email,
    organizacaoNome: acesso.organizacaoNome,
    senhaTemporaria: gerado.senha,
    validaAte: gerado.validaAte,
  });
  await gravarResultadoEnvio(admin, alvo.id, envio);
  // A geração já foi auditada no banco; aqui, o que aconteceu com o envio.
  await registrarAuditoria({
    acesso,
    acao: "senha_provisoria_envio",
    entidade: "usuario",
    entidadeId: alvo.user_id,
    dadosNovos: { vinculoId: alvo.id, envio, exibidaNaTela: false },
  });
  revalidarEquipe();
  return { ok: true, envio };
}

/** Edita função e unidade de alguém da equipe sem tirar o acesso (24/10/2026).
 * Nunca o próprio, nunca master, nunca promove a master; gestor de uma unidade
 * só mexe dentro dela. O banco confere tudo de novo (com a organização da
 * sessão), recusa duplicata e a última gestão, troca e grava a auditoria. */
export async function editarAcessoMembroAction(
  vinculoId: string,
  role: string,
  unidadeId: string | null,
): Promise<Resultado> {
  const acesso = await requireEquipeEditar();
  if (!pedidoEdicaoValido(vinculoId, role, unidadeId)) return { erro: "Pedido inválido." };
  const admin = createAdminClient();
  const carregado = await carregarAlvo(admin, acesso, vinculoId);
  if ("erro" in carregado) return carregado;
  const recusaTitular = await recusaContaTitular(admin, acesso, carregado.alvo);
  if (recusaTitular) return recusaTitular;
  const codigo = await editarVinculoNoBanco(admin, {
    atorId: acesso.userId,
    vinculoId: carregado.alvo.id,
    escopo: "equipe",
    organizacaoId: acesso.organizacaoId,
    role,
    unidadeId,
  });
  const erro = mensagemEditarVinculo(codigo);
  if (erro) return { erro };
  revalidarEquipe();
  return { ok: true };
}

/** Corrige o WhatsApp de alguém da equipe. */
export async function atualizarWhatsappMembroAction(vinculoId: string, bruto: string): Promise<Resultado> {
  const acesso = await requireEquipeEditar();
  const whatsapp = normalizarWhatsapp(bruto);
  if (!whatsapp) return { erro: "WhatsApp inválido. Use DDD + número, ex.: 31 99999-8888." };
  const admin = createAdminClient();
  const carregado = await carregarAlvo(admin, acesso, vinculoId);
  if ("erro" in carregado) return carregado;
  const recusaTitular = await recusaContaTitular(admin, acesso, carregado.alvo);
  if (recusaTitular) return recusaTitular;
  // O banco confere de novo quem pede e recusa a conta do titular ('alvo_titular', 26/10/2026).
  const { data: codigo, error } = await admin.rpc("atualizar_whatsapp_vinculo", {
    p_ator: acesso.userId,
    p_vinculo_id: carregado.alvo.id,
    p_escopo: "equipe",
    p_whatsapp: whatsapp,
  });
  if (error) return { erro: "Não foi possível salvar o WhatsApp." };
  if (codigo === "alvo_titular") return { erro: MENSAGEM_CONTA_TITULAR };
  if (codigo === "sem_mudanca") return { ok: true };
  if (codigo !== "ok") return { erro: "Acesso não encontrado." };
  // Só os 4 finais (nunca o número inteiro na auditoria). A troca também marca
  // `vinculos.whatsapp_alterado_em` (gatilho no banco): a Equipe não gera senha
  // provisória para esse vínculo nos 30 minutos seguintes.
  await registrarAuditoria({
    acesso,
    acao: "equipe_editar_whatsapp",
    entidade: "vinculo",
    entidadeId: carregado.alvo.id,
    dadosAntigos: { whatsappFinal: finalWhatsapp(carregado.alvo.whatsapp) },
    dadosNovos: { whatsappFinal: finalWhatsapp(whatsapp) },
  });
  revalidarEquipe();
  return { ok: true };
}

/** Tira o acesso. Nunca o próprio, nunca master, nunca a última gestão
 * que cobre o cliente ou a loja. Vale na hora: toda policy confere o status
 * do vínculo a cada consulta, não o que está no token. */
export async function revogarMembroAction(vinculoId: string): Promise<Resultado> {
  const acesso = await requireEquipeEditar();
  const admin = createAdminClient();
  const carregado = await carregarAlvo(admin, acesso, vinculoId);
  if ("erro" in carregado) return carregado;
  const { alvo } = carregado;
  if (alvo.status === "revogado") return { ok: true };
  const recusaTitular = await recusaContaTitular(admin, acesso, alvo);
  if (recusaTitular) return recusaTitular;

  // Trava a gestão do cliente no banco: dois gestores não se revogam ao
  // mesmo tempo e o cliente nunca fica sem gestão geral nem loja sem gestão.
  // O banco também confere quem pede e recusa a conta do titular ('alvo_titular', 26/10/2026).
  const { data: resultado, error } = await admin.rpc("revogar_vinculo_equipe", {
    p_ator: acesso.userId,
    p_vinculo_id: alvo.id,
    p_escopo: "equipe",
  });
  if (error) return { erro: "Não foi possível tirar o acesso." };
  if (resultado === "alvo_titular") return { erro: MENSAGEM_CONTA_TITULAR };
  if (resultado === "ultima_gestao") {
    return { erro: "Essa é a última pessoa de gestão que cobre esse acesso. Cadastre outra antes." };
  }
  if (resultado !== "ok") return { erro: "Acesso não encontrado." };
  await registrarAuditoria({
    acesso,
    acao: "equipe_revogar",
    entidade: "vinculo",
    entidadeId: alvo.id,
    dadosAntigos: { status: alvo.status },
    dadosNovos: { status: "revogado" },
  });
  revalidarEquipe();
  return { ok: true };
}

/** Devolve o acesso. Conta que ainda não trocou a senha volta como
 * 'convidado' (libera junto com o primeiro acesso). */
export async function reativarMembroAction(vinculoId: string): Promise<Resultado> {
  const acesso = await requireEquipeEditar();
  const admin = createAdminClient();
  const carregado = await carregarAlvo(admin, acesso, vinculoId);
  if ("erro" in carregado) return carregado;
  const { alvo } = carregado;
  if (alvo.status !== "revogado") return { ok: true };

  const { data: conta, error: erroConta } = await admin.auth.admin.getUserById(alvo.user_id);
  if (erroConta || !conta.user) return { erro: "Conta não encontrada." };
  let pendente: boolean;
  try {
    pendente = await contaPendente(admin, conta.user);
  } catch (err) {
    return { erro: (err as Error).message };
  }
  const novoStatus = pendente ? "convidado" : "ativo";
  const { error } = await admin.from("vinculos").update({ status: novoStatus }).eq("id", alvo.id);
  if (error) {
    if (error.code === "23505") return { erro: "Essa pessoa já tem esse acesso ativo." };
    return { erro: "Não foi possível devolver o acesso." };
  }
  await registrarAuditoria({
    acesso,
    acao: "equipe_reativar",
    entidade: "vinculo",
    entidadeId: alvo.id,
    dadosAntigos: { status: alvo.status },
    dadosNovos: { status: novoStatus },
  });
  revalidarEquipe();
  return { ok: true };
}

/** Permissões por módulo de alguém da equipe (Navegação V2, fase 6 - 25/10/2026). Só master ou
 * o titular (sem titular marcado, a gestão da organização inteira), com a Equipe em "editar". `niveis` é o
 * estado completo da tela (o rascunho só grava aqui). O banco confere tudo de novo, guarda só
 * as exceções ao padrão da função e grava a auditoria. */
export async function salvarPermissoesMembroAction(vinculoId: string, niveis: unknown): Promise<Resultado> {
  const acesso = await requireEquipeEditar();
  if (!podeAdministrarPermissoes(acesso)) return { erro: mensagemSalvarPermissoes("sem_permissao") ?? "" };
  if (typeof vinculoId !== "string" || !/^[0-9a-f-]{36}$/i.test(vinculoId)) return { erro: "Pedido inválido." };
  if (!niveis || typeof niveis !== "object" || Array.isArray(niveis)) return { erro: "Pedido inválido." };
  const entrada = niveis as Record<string, unknown>;
  const limpo: Record<string, string> = {};
  for (const [chave, nivel] of Object.entries(entrada)) {
    if (!ehChavePermissao(chave) || !ehNivel(nivel)) return { erro: "Pedido inválido." };
    limpo[chave] = nivel;
  }
  if (Object.keys(limpo).length > CHAVES.length) return { erro: "Pedido inválido." };
  const admin = createAdminClient();
  const carregado = await carregarAlvo(admin, acesso, vinculoId);
  if ("erro" in carregado) return carregado;
  const titular = await carregarTitularOrganizacao(admin, acesso.organizacaoId);
  const alvoDono = vinculoEhDono(
    { id: carregado.alvo.id, role: carregado.alvo.role, unidadeId: carregado.alvo.unidade_id, status: carregado.alvo.status },
    titular?.vinculoId ?? null,
  );
  if (!podeMudarPermissoesDe(acesso, { ehDono: alvoDono })) {
    return { erro: mensagemSalvarPermissoes("alvo_dono") ?? "" };
  }
  const codigo = await salvarPermissoesNoBanco(admin, {
    atorId: acesso.userId,
    organizacaoId: acesso.organizacaoId,
    vinculoId: carregado.alvo.id,
    niveis: limpo,
  });
  const erro = mensagemSalvarPermissoes(codigo);
  if (erro && codigo !== "sem_mudanca") return { erro };
  revalidarEquipe();
  return { ok: true };
}
