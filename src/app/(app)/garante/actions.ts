"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireGarante, requireGestaoGarante, registrarAuditoria } from "@/lib/acesso";
import { createClient } from "@/lib/supabase/server";
import { modeloDaBiblioteca } from "@/lib/garante/biblioteca";
import { hojeOperacao, mensagemErroGarante, validarItem, validarPublicacao } from "@/lib/garante/regras";

// Tudo pelo client do usuário: RLS e as RPCs garante_* conferem acesso, papel,
// responsável e meta no banco. As barreiras aqui (requireGarante /
// requireGestaoGarante) são a primeira camada, não a única.

type Resultado<T = { ok: true }> = T | { erro: string };

function revalidarGarante() {
  revalidatePath("/garante", "layout");
}

// ── Cumprir ──────────────────────────────────────────────────────────────

export async function iniciarChecklistAction(publicacaoId: string): Promise<Resultado<{ ok: true; execucaoId: string }>> {
  await requireGarante();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("garante_iniciar", { p_publicacao_id: publicacaoId, p_data: hojeOperacao() });
  if (error || !data) return { erro: mensagemErroGarante(error?.message ?? "") };
  revalidarGarante();
  return { ok: true, execucaoId: data as string };
}

export async function responderItemAction(
  execucaoId: string,
  itemId: string,
  resposta: { valorBool?: boolean; valorNumero?: number; valorTexto?: string; naoSeAplica?: boolean; justificativa?: string },
): Promise<Resultado<{ ok: true; dentroMeta: boolean }>> {
  await requireGarante();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("garante_responder", {
    p_execucao_id: execucaoId,
    p_item_id: itemId,
    p_valor_bool: resposta.valorBool ?? null,
    p_valor_numero: resposta.valorNumero ?? null,
    p_valor_texto: resposta.valorTexto ?? null,
    p_nao_se_aplica: resposta.naoSeAplica ?? false,
    p_justificativa: resposta.justificativa ?? null,
  });
  if (error) return { erro: mensagemErroGarante(error.message) };
  return { ok: true, dentroMeta: data !== false };
}

export async function registrarFotoAction(execucaoId: string, itemId: string, caminho: string): Promise<Resultado> {
  await requireGarante();
  const supabase = await createClient();
  const { error } = await supabase.rpc("garante_registrar_foto", {
    p_execucao_id: execucaoId,
    p_item_id: itemId,
    p_caminho: caminho,
  });
  if (error) return { erro: mensagemErroGarante(error.message) };
  return { ok: true };
}

export async function concluirChecklistAction(execucaoId: string): Promise<Resultado<{ ok: true; faltam: number }>> {
  await requireGarante();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("garante_concluir", { p_execucao_id: execucaoId });
  if (error) return { erro: mensagemErroGarante(error.message) };
  revalidarGarante();
  return { ok: true, faltam: Number(data ?? 0) };
}

// ── Montar (gestão) ──────────────────────────────────────────────────────

export async function criarModeloAction(formData: FormData): Promise<void> {
  const acesso = await requireGestaoGarante();
  const supabase = await createClient();
  const chave = String(formData.get("biblioteca") ?? "");
  const base = chave ? modeloDaBiblioteca(chave) : undefined;
  const nome = (String(formData.get("nome") ?? "").trim() || base?.nome || "").slice(0, 120);
  if (!nome) redirect("/garante/modelos?erro=nome");

  const { data: modelo, error } = await supabase
    .from("garante_modelos")
    .insert({
      unidade_id: acesso.unidadeId,
      nome,
      descricao: base?.descricao ?? null,
      origem_pop: base?.chave ?? null,
      criado_por: acesso.userId,
    })
    .select("id")
    .single();
  if (error || !modelo) redirect("/garante/modelos?erro=criar");

  if (base) {
    const { error: erroItens } = await supabase.from("garante_itens").insert(
      base.itens.map((item, i) => ({
        modelo_id: modelo.id,
        unidade_id: acesso.unidadeId,
        ordem: (i + 1) * 10,
        grupo: item.grupo,
        titulo: item.titulo,
        tipo: item.tipo ?? "check",
        meta_min: item.metaMin ?? null,
        meta_max: item.metaMax ?? null,
      })),
    );
    if (erroItens) {
      await supabase.from("garante_modelos").update({ ativo: false }).eq("id", modelo.id);
      redirect("/garante/modelos?erro=itens");
    }
  }

  await registrarAuditoria({ acesso, acao: "garante_criar_modelo", entidade: "garante_modelo", entidadeId: modelo.id, dadosNovos: { nome, origem: base?.chave ?? null } });
  revalidarGarante();
  redirect(`/garante/modelos/${modelo.id}`);
}

export async function arquivarModeloAction(modeloId: string): Promise<Resultado> {
  const acesso = await requireGestaoGarante();
  const supabase = await createClient();
  const hoje = hojeOperacao();
  // Arquivar encerra as publicações; o histórico das execuções fica.
  await supabase.from("garante_publicacoes").update({ ativo: false, vigente_ate: hoje }).eq("modelo_id", modeloId).eq("ativo", true);
  const { error } = await supabase.from("garante_modelos").update({ ativo: false, atualizado_em: new Date().toISOString() }).eq("id", modeloId);
  if (error) return { erro: "Não foi possível arquivar." };
  await registrarAuditoria({ acesso, acao: "garante_arquivar_modelo", entidade: "garante_modelo", entidadeId: modeloId });
  revalidarGarante();
  return { ok: true };
}

export async function salvarItemAction(modeloId: string, itemId: string | null, formData: FormData): Promise<Resultado> {
  const acesso = await requireGestaoGarante();
  const r = validarItem({
    titulo: String(formData.get("titulo") ?? ""),
    tipo: String(formData.get("tipo") ?? "check"),
    critico: formData.get("critico") === "on",
    fotoObrigatoria: formData.get("foto") === "on",
    permiteNa: formData.get("permiteNa") === "on",
    metaMin: String(formData.get("metaMin") ?? ""),
    metaMax: String(formData.get("metaMax") ?? ""),
  });
  if (!r.ok) return { erro: r.erro };
  const grupo = String(formData.get("grupo") ?? "").trim().slice(0, 80) || null;
  const supabase = await createClient();
  const campos = {
    titulo: r.titulo,
    grupo,
    tipo: r.tipo,
    critico: r.critico,
    foto_obrigatoria: r.fotoObrigatoria,
    permite_na: r.permiteNa,
    meta_min: r.metaMin,
    meta_max: r.metaMax,
  };
  if (itemId) {
    const { error } = await supabase.from("garante_itens").update(campos).eq("id", itemId).eq("modelo_id", modeloId);
    if (error) return { erro: "Não foi possível salvar o item." };
  } else {
    const { data: ultimo } = await supabase
      .from("garante_itens")
      .select("ordem")
      .eq("modelo_id", modeloId)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase
      .from("garante_itens")
      .insert({ ...campos, modelo_id: modeloId, unidade_id: acesso.unidadeId, ordem: ((ultimo?.ordem as number) ?? 0) + 10 });
    if (error) return { erro: "Não foi possível criar o item." };
  }
  revalidarGarante();
  return { ok: true };
}

export async function removerItemAction(modeloId: string, itemId: string): Promise<Resultado> {
  await requireGestaoGarante();
  const supabase = await createClient();
  // Desativa, não apaga: execuções antigas guardam o item no snapshot.
  const { error } = await supabase.from("garante_itens").update({ ativo: false }).eq("id", itemId).eq("modelo_id", modeloId);
  if (error) return { erro: "Não foi possível remover o item." };
  revalidarGarante();
  return { ok: true };
}

export async function moverItemAction(modeloId: string, itemId: string, direcao: "subir" | "descer"): Promise<Resultado> {
  await requireGestaoGarante();
  const supabase = await createClient();
  const { data } = await supabase
    .from("garante_itens")
    .select("id, ordem")
    .eq("modelo_id", modeloId)
    .eq("ativo", true)
    .order("ordem");
  const itens = (data ?? []) as { id: string; ordem: number }[];
  const i = itens.findIndex((x) => x.id === itemId);
  const j = direcao === "subir" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= itens.length) return { ok: true };
  [itens[i], itens[j]] = [itens[j], itens[i]];
  for (let k = 0; k < itens.length; k++) {
    await supabase.from("garante_itens").update({ ordem: (k + 1) * 10 }).eq("id", itens[k].id);
  }
  revalidarGarante();
  return { ok: true };
}

export async function publicarAction(modeloId: string, formData: FormData): Promise<Resultado> {
  const acesso = await requireGestaoGarante();
  const r = validarPublicacao({
    dias: formData.getAll("dias").map(String),
    horario: String(formData.get("horario") ?? ""),
  });
  if (!r.ok) return { erro: r.erro };
  const setorId = String(formData.get("setorId") ?? "") || null;
  const responsavelId = String(formData.get("responsavelId") ?? "") || null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("garante_publicacoes")
    .insert({
      modelo_id: modeloId,
      unidade_id: acesso.unidadeId,
      setor_id: setorId,
      responsavel_id: responsavelId,
      dias_semana: r.dias,
      horario_limite: r.horario,
      vigente_desde: hojeOperacao(),
      criado_por: acesso.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { erro: "Não foi possível publicar." };
  await registrarAuditoria({ acesso, acao: "garante_publicar", entidade: "garante_publicacao", entidadeId: data.id, dadosNovos: { modeloId, dias: r.dias, horario: r.horario, setorId, responsavelId } });
  revalidarGarante();
  return { ok: true };
}

/** Encerra a publicação depois de hoje (o dia de hoje ainda conta). Mudar
 * dias, horário ou responsável = encerrar e publicar de novo, para o
 * histórico de atrasos não ser reescrito. */
export async function encerrarPublicacaoAction(publicacaoId: string): Promise<Resultado> {
  const acesso = await requireGestaoGarante();
  const supabase = await createClient();
  const { error } = await supabase
    .from("garante_publicacoes")
    .update({ vigente_ate: hojeOperacao() })
    .eq("id", publicacaoId);
  if (error) return { erro: "Não foi possível encerrar." };
  await registrarAuditoria({ acesso, acao: "garante_encerrar_publicacao", entidade: "garante_publicacao", entidadeId: publicacaoId });
  revalidarGarante();
  return { ok: true };
}
