"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireGarante, requireGestaoGarante, registrarAuditoria } from "@/lib/acesso";
import { createClient } from "@/lib/supabase/server";
import { modeloDaBiblioteca } from "@/lib/garante/biblioteca";
import {
  dataDoDiaAgenda,
  hojeOperacao,
  mensagemErroGarante,
  type DiaAgenda,
  validarDiaSemOperacao,
  validarItem,
  validarPublicacao,
  validarRegra,
} from "@/lib/garante/regras";

// Tudo pelo client do usuário: RLS e as RPCs garante_* conferem acesso, papel,
// responsável e meta no banco. As barreiras aqui (requireGarante /
// requireGestaoGarante) são a primeira camada, não a única.

type Resultado<T = { ok: true }> = T | { erro: string };

function revalidarGarante() {
  revalidatePath("/garante", "layout");
}

// ── Cumprir ──────────────────────────────────────────────────────────────

/** Começa (ou continua) o checklist de hoje, o de ontem (fechamento que
 * passou da meia-noite) ou o de amanhã (antecedência que começa antes da
 * meia-noite). A data sai daqui, nunca do navegador. O banco só deixa começar
 * dentro da janela da unidade (prazo - antecedência até prazo + atraso) e fora
 * de dia sem operação. */
export async function iniciarChecklistAction(
  publicacaoId: string,
  dia: DiaAgenda = "hoje",
): Promise<Resultado<{ ok: true; execucaoId: string }>> {
  await requireGarante();
  if (dia !== "hoje" && dia !== "ontem" && dia !== "amanha") return { erro: "Dia inválido." };
  const supabase = await createClient();
  const dataDoChecklist = dataDoDiaAgenda(dia);
  const { data, error } = await supabase.rpc("garante_iniciar", { p_publicacao_id: publicacaoId, p_data: dataDoChecklist });
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
  if (resposta.valorNumero !== undefined && !Number.isFinite(resposta.valorNumero)) return { erro: "Digite um número válido." };
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
        foto_obrigatoria: item.foto ?? false,
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

/** Parar de usar o checklist: sai da lista de hoje em diante, para todo
 * mundo. Nada do passado muda (execuções, fotos e dias sem fazer continuam
 * no Quadro do dia). Regra no banco: `garante_parar_modelo`. */
export async function pararDeUsarModeloAction(modeloId: string): Promise<Resultado> {
  const acesso = await requireGestaoGarante();
  const supabase = await createClient();
  const { error } = await supabase.rpc("garante_parar_modelo", { p_modelo_id: modeloId });
  if (error) return { erro: mensagemErroGarante(error.message) };
  await registrarAuditoria({ acesso, acao: "garante_parar_modelo", entidade: "garante_modelo", entidadeId: modeloId });
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

/** Publica (programa) o checklist: entra na lista de Hoje de quem vai fazer,
 * nos dias escolhidos, a partir de hoje. Responsável precisa ter acesso à
 * unidade; o banco confere (`garante_publicar`). */
export async function publicarAction(
  modeloId: string,
  dados: { dias: string[]; horario: string; setorId: string; responsavelId: string },
): Promise<Resultado> {
  const acesso = await requireGestaoGarante();
  const r = validarPublicacao({ dias: dados.dias, horario: dados.horario });
  if (!r.ok) return { erro: r.erro };
  const setorId = dados.setorId || null;
  const responsavelId = dados.responsavelId || null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("garante_publicar", {
    p_modelo_id: modeloId,
    p_setor_id: setorId,
    p_responsavel_id: responsavelId,
    p_dias: r.dias,
    p_horario: r.horario,
  });
  if (error || !data) return { erro: mensagemErroGarante(error?.message ?? "") };
  await registrarAuditoria({ acesso, acao: "garante_publicar", entidade: "garante_publicacao", entidadeId: data as string, dadosNovos: { modeloId, dias: r.dias, horario: r.horario, setorId, responsavelId } });
  revalidarGarante();
  return { ok: true };
}

/** Para uma programação: hoje ainda vale, a partir de amanhã sai da lista.
 * Mudar dias, horário ou responsável = parar e publicar de novo, para o
 * histórico de atrasos não ser reescrito. Regra no banco. */
export async function encerrarPublicacaoAction(publicacaoId: string): Promise<Resultado> {
  const acesso = await requireGestaoGarante();
  const supabase = await createClient();
  const { error } = await supabase.rpc("garante_encerrar_publicacao", { p_publicacao_id: publicacaoId });
  if (error) return { erro: mensagemErroGarante(error.message) };
  await registrarAuditoria({ acesso, acao: "garante_encerrar_publicacao", entidade: "garante_publicacao", entidadeId: publicacaoId });
  revalidarGarante();
  return { ok: true };
}

// ── Regras da unidade (gestão) ───────────────────────────────────────────

/** Muda a antecedência e a tolerância de atraso da unidade a partir de
 * amanhã. Hoje e o passado continuam com a regra que valia (o banco recusa
 * data de hoje ou anterior: `garante_definir_regra`). */
export async function definirRegraAction(dados: { antecedenciaMin: number | null; atrasoMaxMin: number | null }): Promise<Resultado> {
  const acesso = await requireGestaoGarante();
  const r = validarRegra(dados);
  if (!r.ok) return { erro: r.erro };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("garante_definir_regra", {
    p_unidade_id: acesso.unidadeId,
    p_antecedencia_min: r.antecedenciaMin,
    p_atraso_max_min: r.atrasoMaxMin,
  });
  if (error) return { erro: mensagemErroGarante(error.message) };
  await registrarAuditoria({ acesso, acao: "garante_definir_regra", entidade: "garante_regra_unidade", entidadeId: acesso.unidadeId, dadosNovos: { ...r, vigenteDesde: data } });
  revalidarGarante();
  return { ok: true };
}

/** Marca um dia futuro sem operação: os checklists daquele dia somem da lista
 * e da nota. Recusado em data passada, hoje e data com checklist começado. */
export async function marcarDiaSemOperacaoAction(dados: { data: string; motivo: string }): Promise<Resultado> {
  const acesso = await requireGestaoGarante();
  const r = validarDiaSemOperacao({ ...dados, hoje: hojeOperacao() });
  if (!r.ok) return { erro: r.erro };
  const supabase = await createClient();
  const { error } = await supabase.rpc("garante_marcar_dia_sem_operacao", { p_unidade_id: acesso.unidadeId, p_data: r.data, p_motivo: r.motivo });
  if (error) return { erro: mensagemErroGarante(error.message) };
  await registrarAuditoria({ acesso, acao: "garante_marcar_dia_sem_operacao", entidade: "garante_dia_sem_operacao", entidadeId: r.data, dadosNovos: { motivo: r.motivo } });
  revalidarGarante();
  return { ok: true };
}

/** Desfaz um dia sem operação futuro: os checklists daquele dia voltam. */
export async function desmarcarDiaSemOperacaoAction(data: string): Promise<Resultado> {
  const acesso = await requireGestaoGarante();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Data inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("garante_desmarcar_dia_sem_operacao", { p_unidade_id: acesso.unidadeId, p_data: data });
  if (error) return { erro: mensagemErroGarante(error.message) };
  await registrarAuditoria({ acesso, acao: "garante_desmarcar_dia_sem_operacao", entidade: "garante_dia_sem_operacao", entidadeId: data });
  revalidarGarante();
  return { ok: true };
}
