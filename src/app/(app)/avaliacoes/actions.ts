"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mensagemSemEdicao } from "@/lib/acesso";
import { requireAvaliacoes } from "@/lib/avaliacoes/acesso";
import { BUCKET_LOGOS } from "@/lib/avaliacoes/servidor";
import { TIPOS_LOGO, validarLogo, validarMarca, type EntradaMarca } from "@/lib/avaliacoes/marca";
import { validarPerguntas, type PerguntaConfig } from "@/lib/avaliacoes/perguntas";

// Avaliações (gestão). Tudo que grava vai pela sessão da pessoa, nas RPCs `avaliacoes_*`, que
// conferem de novo gestão/master, módulo ligado e "editar" e gravam a auditoria na unidade. A
// unidade sai sempre da sessão, nunca do formulário. Só a logo passa pelo client admin (o bucket
// não tem policy de escrita), depois desta mesma checagem.

type Resultado = { ok: true } | { erro: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidar() {
  revalidatePath("/avaliacoes", "layout");
}

async function acessoEditar() {
  const acesso = await requireAvaliacoes();
  const bloqueio = mensagemSemEdicao(acesso, "avaliacoes");
  return { acesso, bloqueio };
}

/** Mensagem simples para os códigos que as RPCs levantam. */
function mensagemErro(mensagem: string): string {
  if (mensagem.includes("sem_permissao")) return "Você não tem permissão para mudar as Avaliações desta unidade.";
  if (mensagem.includes("contraste_baixo")) return "A cor principal e a de fundo estão parecidas demais. Escureça ou clareie uma delas.";
  if (mensagem.includes("cor_invalida")) return "Cor inválida. Use o formato #1F4E79.";
  if (mensagem.includes("nome_invalido")) return "O nome exibido deve ter de 2 a 60 letras.";
  if (mensagem.includes("agradecimento_invalido")) return "O texto de agradecimento deve ter de 3 a 200 letras.";
  if (mensagem.includes("link_google_invalido")) return "O link do Google precisa começar com https://.";
  if (mensagem.includes("pesquisa_inexistente")) return "Crie a pesquisa antes.";
  if (mensagem.includes("vinculo_sem_whatsapp")) return "Essa pessoa não tem WhatsApp cadastrado. Cadastre em Equipe antes.";
  if (mensagem.includes("vinculo_nao_elegivel")) return "Essa pessoa não tem acesso a esta unidade.";
  if (mensagem.includes("nenhuma_ativa")) return "Deixe ao menos uma pergunta ligada.";
  if (mensagem.includes("texto_pergunta")) return "O texto de cada pergunta deve ter de 3 a 200 letras.";
  if (mensagem.includes("logo_invalida")) return "Arquivo de logo inválido.";
  return "Não foi possível salvar. Tente de novo.";
}

export async function criarPesquisaAction(): Promise<Resultado> {
  const { acesso, bloqueio } = await acessoEditar();
  if (bloqueio) return { erro: bloqueio };
  const supabase = await createClient();
  const { error } = await supabase.rpc("avaliacoes_criar_pesquisa", { p_unidade_id: acesso.unidadeId });
  if (error) return { erro: mensagemErro(error.message) };
  revalidar();
  return { ok: true };
}

export async function salvarMarcaAction(entrada: EntradaMarca): Promise<Resultado> {
  const { acesso, bloqueio } = await acessoEditar();
  if (bloqueio) return { erro: bloqueio };
  if (!entrada || typeof entrada !== "object" || typeof entrada.ativa !== "boolean") return { erro: "Pedido inválido." };
  const texto = (v: unknown) => (typeof v === "string" ? v : "");
  const v = validarMarca({
    nomeExibido: texto(entrada.nomeExibido),
    corPrincipal: texto(entrada.corPrincipal),
    corFundo: texto(entrada.corFundo),
    textoAgradecimento: texto(entrada.textoAgradecimento),
    linkGoogle: texto(entrada.linkGoogle),
    ativa: entrada.ativa,
  });
  if (!v.ok) return { erro: v.erro };
  const supabase = await createClient();
  const { error } = await supabase.rpc("avaliacoes_salvar_marca", {
    p_unidade_id: acesso.unidadeId,
    p_nome_exibido: v.marca.nomeExibido,
    p_cor_principal: v.marca.corPrincipal,
    p_cor_fundo: v.marca.corFundo,
    p_texto_agradecimento: v.marca.textoAgradecimento,
    p_link_google: v.marca.linkGoogle,
    p_ativa: v.marca.ativa,
  });
  if (error) return { erro: mensagemErro(error.message) };
  revalidar();
  return { ok: true };
}

export async function salvarPerguntasAction(perguntas: PerguntaConfig[]): Promise<Resultado> {
  const { acesso, bloqueio } = await acessoEditar();
  if (bloqueio) return { erro: bloqueio };
  if (!Array.isArray(perguntas)) return { erro: "Pedido inválido." };
  const v = validarPerguntas(
    perguntas.map((p) => ({ chave: p?.chave, texto: typeof p?.texto === "string" ? p.texto : "", ativa: p?.ativa })) as PerguntaConfig[],
  );
  if (!v.ok) return { erro: v.erro };
  const supabase = await createClient();
  const { error } = await supabase.rpc("avaliacoes_salvar_perguntas", { p_unidade_id: acesso.unidadeId, p_perguntas: v.perguntas });
  if (error) return { erro: mensagemErro(error.message) };
  revalidar();
  return { ok: true };
}

export async function definirDestinatarioAction(vinculoId: string | null): Promise<Resultado> {
  const { acesso, bloqueio } = await acessoEditar();
  if (bloqueio) return { erro: bloqueio };
  if (vinculoId !== null && (typeof vinculoId !== "string" || !UUID.test(vinculoId))) return { erro: "Pessoa inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("avaliacoes_definir_destinatario", { p_unidade_id: acesso.unidadeId, p_vinculo_id: vinculoId });
  if (error) return { erro: mensagemErro(error.message) };
  revalidar();
  return { ok: true };
}

/** Sobe a logo (ou tira, sem arquivo). O tipo é conferido pelo conteúdo; o banco grava o caminho
 * (só da própria unidade) e devolve o anterior, que é apagado depois. */
export async function salvarLogoAction(formData: FormData): Promise<Resultado> {
  const { acesso, bloqueio } = await acessoEditar();
  if (bloqueio) return { erro: bloqueio };
  const supabase = await createClient();
  const admin = createAdminClient();

  if (formData.get("remover") === "sim") {
    const { data, error } = await supabase.rpc("avaliacoes_definir_logo", { p_unidade_id: acesso.unidadeId, p_logo_path: null });
    if (error) return { erro: mensagemErro(error.message) };
    if (typeof data === "string" && data) await admin.storage.from(BUCKET_LOGOS).remove([data]);
    revalidar();
    return { ok: true };
  }

  const arquivo = formData.get("logo");
  if (!(arquivo instanceof File)) return { erro: "Escolha o arquivo da logo." };
  if (arquivo.size > 400 * 1024) return { erro: "A logo pode ter até 300 KB." };
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const v = validarLogo(bytes);
  if (!v.ok) return { erro: v.erro };
  if (!/^[A-Za-z0-9_-]+$/.test(acesso.unidadeId)) return { erro: "Unidade com código fora do padrão. Fale com a Zatti." };

  const caminho = `${acesso.unidadeId}/${randomUUID()}.${TIPOS_LOGO[v.tipo]}`;
  const { error: erroUpload } = await admin.storage.from(BUCKET_LOGOS).upload(caminho, bytes, { contentType: v.tipo, upsert: false, cacheControl: "31536000" });
  if (erroUpload) {
    console.error("avaliacoes_logo_upload_falhou", erroUpload.message);
    return { erro: "Não foi possível subir a logo. Tente de novo." };
  }
  const { data, error } = await supabase.rpc("avaliacoes_definir_logo", { p_unidade_id: acesso.unidadeId, p_logo_path: caminho });
  if (error) {
    await admin.storage.from(BUCKET_LOGOS).remove([caminho]);
    return { erro: mensagemErro(error.message) };
  }
  if (typeof data === "string" && data && data !== caminho) await admin.storage.from(BUCKET_LOGOS).remove([data]);
  revalidar();
  return { ok: true };
}
