"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireEquipe, registrarAuditoria, type AcessoAtual } from "@/lib/acesso";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  expiracaoSenhaTemporaria,
  gerarSenhaTemporaria,
  mensagemGerarProvisoria,
  normalizarWhatsapp,
  whatsappTrocadoHaPouco,
  podeAdministrarVinculo,
  validarConcessao,
} from "@/lib/equipe/regras";
import {
  buscarUsuarioPorEmail,
  contaPendente,
  gerarSenhaProvisoriaNoBanco,
  hashSenhaTemporaria,
} from "@/lib/equipe/servidor";
import { enviarAcessoPeloVini, type ResultadoEnvio } from "@/lib/equipe/envio";

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

/** Cadastra alguém da equipe. Conta nova: senha provisória pelo WhatsApp e
 * vínculo 'convidado' até a troca. Conta que já existe: vínculo ativo, sem
 * senha nova; se ela ainda estiver pendente, o vínculo também espera. */
export async function cadastrarMembroAction(formData: FormData): Promise<
  Resultado<{ ok: true; situacao: "enviado" | "pendente_de_outro_cliente" | "conta_existente"; envio: ResultadoEnvio | null }>
> {
  const acesso = await requireEquipe();

  const nome = String(formData.get("nome") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const whatsapp = normalizarWhatsapp(String(formData.get("whatsapp") ?? ""));
  const roleBruto = String(formData.get("role") ?? "");
  const unidadeBruta = String(formData.get("unidadeId") ?? "").trim();
  const unidadeId = unidadeBruta || null;

  if (!nome || nome.length > 160) return { erro: "Informe o nome (até 160 caracteres)." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { erro: "E-mail inválido." };
  if (!whatsapp) return { erro: "WhatsApp inválido. Use DDD + número, ex.: 31 99999-8888." };

  const admin = createAdminClient();

  const { data: unidadesData, error: erroUnidades } = await admin
    .from("unidades")
    .select("id")
    .eq("organizacao_id", acesso.organizacaoId)
    .eq("ativo", true);
  if (erroUnidades) return { erro: "Não foi possível conferir as unidades." };

  const concessao = validarConcessao({
    concedente: { role: acesso.role, unidadeFixa: acesso.unidadeFixa },
    role: roleBruto,
    unidadeId,
    unidadesDaOrganizacao: new Set((unidadesData ?? []).map((u) => u.id as string)),
  });
  if (!concessao.ok) return { erro: concessao.erro };

  let existente;
  try {
    existente = await buscarUsuarioPorEmail(admin, email);
  } catch (err) {
    return { erro: (err as Error).message };
  }

  const vinculoBase = {
    organizacao_id: acesso.organizacaoId,
    unidade_id: concessao.unidadeId,
    role: concessao.role,
    whatsapp,
    criado_por: acesso.userId,
  };

  if (existente) {
    let pendente: boolean;
    try {
      pendente = await contaPendente(admin, existente);
    } catch (err) {
      return { erro: (err as Error).message };
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

    await registrarAuditoria({
      acesso,
      acao: pendente ? "equipe_vincular_conta_pendente" : "equipe_vincular_conta_existente",
      entidade: "vinculo",
      entidadeId: vinculoNovo.id,
      dadosNovos: { unidadeId: concessao.unidadeId, role: concessao.role },
    });

    // Conta pendente: o acesso libera quando ela trocar a senha que já recebeu.
    // Não manda "use sua senha", porque ainda não está liberado.
    if (pendente) {
      revalidarEquipe();
      return { ok: true, situacao: "pendente_de_outro_cliente", envio: null };
    }

    const envio = await enviarAcessoPeloVini({
      tipo: "conta_existente",
      idempotencia: randomUUID(),
      whatsapp,
      nome,
      email,
      organizacaoNome: acesso.organizacaoNome,
    });
    await gravarResultadoEnvio(admin, vinculoNovo.id, envio);
    revalidarEquipe();
    return { ok: true, situacao: "conta_existente", envio };
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
    organizacaoNome: acesso.organizacaoNome,
    senhaTemporaria: senha,
    validaAte,
  });
  await gravarResultadoEnvio(admin, vinculoNovo.id, envio);

  await registrarAuditoria({
    acesso,
    acao: "equipe_cadastrar_conta_nova",
    entidade: "vinculo",
    entidadeId: vinculoNovo.id,
    dadosNovos: { unidadeId: concessao.unidadeId, role: concessao.role, envio },
  });

  revalidarEquipe();
  return { ok: true, situacao: "enviado", envio };
}

/** Reenvia o acesso. Conta pendente: senha provisória nova (a anterior deixa
 * de valer). Conta ativa: só o lembrete de como entrar. Nunca reenvia
 * sozinho depois de um envio incerto: quem decide é a gestão. */
export async function reenviarAcessoMembroAction(
  vinculoId: string,
): Promise<Resultado<{ ok: true; envio: ResultadoEnvio }>> {
  const acesso = await requireEquipe();
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
  const acesso = await requireEquipe();
  const admin = createAdminClient();
  const carregado = await carregarAlvo(admin, acesso, vinculoId);
  if ("erro" in carregado) return carregado;
  const { alvo } = carregado;

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

/** Corrige o WhatsApp de alguém da equipe. */
export async function atualizarWhatsappMembroAction(vinculoId: string, bruto: string): Promise<Resultado> {
  const acesso = await requireEquipe();
  const whatsapp = normalizarWhatsapp(bruto);
  if (!whatsapp) return { erro: "WhatsApp inválido. Use DDD + número, ex.: 31 99999-8888." };
  const admin = createAdminClient();
  const carregado = await carregarAlvo(admin, acesso, vinculoId);
  if ("erro" in carregado) return carregado;
  const { error } = await admin.from("vinculos").update({ whatsapp }).eq("id", carregado.alvo.id);
  if (error) return { erro: "Não foi possível salvar o WhatsApp." };
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
  const acesso = await requireEquipe();
  const admin = createAdminClient();
  const carregado = await carregarAlvo(admin, acesso, vinculoId);
  if ("erro" in carregado) return carregado;
  const { alvo } = carregado;
  if (alvo.status === "revogado") return { ok: true };

  // Trava a gestão do cliente no banco: dois gestores não se revogam ao
  // mesmo tempo e o cliente nunca fica sem gestão geral nem loja sem gestão.
  const { data: resultado, error } = await admin.rpc("revogar_vinculo_equipe", { p_vinculo_id: alvo.id });
  if (error) return { erro: "Não foi possível tirar o acesso." };
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
  const acesso = await requireEquipe();
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
