"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireConciliacao } from "@/lib/conciliacao/acesso";
import { createClient } from "@/lib/supabase/server";
import {
  decidirMovimentos,
  desfazerDecisao,
  listarBaixasCandidatas,
  listarTransferenciasAbertas,
  type Aprendizado,
  type BaixaCandidata,
  type ItemDecisao,
  type TransferenciaAberta,
} from "@/lib/banco/conciliacao-decisoes";
import { descricaoParaBusca, VERSAO_NORMALIZACAO } from "@/lib/conciliacao/normalizacao";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";

// Financeiro V2 (11/10/2026): a Conciliação grava. A unidade vem sempre do acesso autenticado; o
// banco revalida tudo de novo. Limites reaproveitam as chaves da Conciliação.

const uuid = z.string().uuid();
const centavos = z.number().int().min(1).max(9_999_999_999);

const itemSchema = z.discriminatedUnion("acao", [
  z.object({
    movimentoId: uuid,
    acao: z.literal("baixar_parcelas"),
    parcelas: z.array(z.object({ parcelaId: uuid, valorCentavos: centavos, quitarRestante: z.boolean().optional() }).strict()).min(1).max(50),
    ajuste: z.object({ categoriaId: uuid, valorCentavos: centavos }).strict().nullable(),
    aprender: z.boolean(),
  }).strict(),
  z.object({ movimentoId: uuid, acao: z.literal("vincular_baixas"), baixaIds: z.array(uuid).min(1).max(50) }).strict(),
  z.object({
    movimentoId: uuid,
    acao: z.literal("criar_documento"),
    contraparteId: uuid.nullable(),
    numero: z.string().max(60),
    descricao: z.string().trim().min(1).max(200),
    linhas: z.array(z.object({ categoriaId: uuid, descricao: z.string().max(200), valorCentavos: centavos }).strict()).min(1).max(50),
    aprender: z.boolean(),
  }).strict(),
  z.object({ movimentoId: uuid, acao: z.literal("transferencia"), contaContraparteId: uuid.nullable(), transferenciaId: uuid.nullable() }).strict(),
  z.object({ movimentoId: uuid, acao: z.literal("ignorar"), motivo: z.string().trim().min(3).max(300) }).strict(),
]);

const entradaDecidir = z.object({ chave: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/), itens: z.array(itemSchema).min(1).max(200) }).strict();

export type RespostaDecisao = { ok: true; quantidade: number } | { ok: false; mensagem: string };

type MovimentoBase = { id: string; data: string; valor: number; direcao: "entrada" | "saida"; descricao_normalizada: string };

async function carregarMovimentos(unidadeId: string, ids: string[]): Promise<Map<string, MovimentoBase>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fin_movimentos_importados")
    .select("id, data, valor, direcao, descricao_normalizada")
    .eq("unidade_id", unidadeId)
    .in("id", ids);
  if (error) throw new Error("conciliacao_movimentos");
  return new Map(((data as MovimentoBase[] | null) ?? []).map((m) => [m.id, { ...m, valor: Number(m.valor) }]));
}

async function categoriaUnicaDasParcelas(unidadeId: string, parcelaIds: string[]): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fin_parcelas")
    .select("id, fin_lancamentos!inner(categoria_id)")
    .eq("unidade_id", unidadeId)
    .in("id", parcelaIds);
  type Row = { fin_lancamentos: { categoria_id: string } | { categoria_id: string }[] };
  const categorias = new Set(
    ((data as Row[] | null) ?? []).map((r) => (Array.isArray(r.fin_lancamentos) ? r.fin_lancamentos[0]?.categoria_id : r.fin_lancamentos.categoria_id)),
  );
  return categorias.size === 1 ? Array.from(categorias)[0] ?? null : null;
}

function aprendizado(mov: MovimentoBase, categoriaId: string | null, aprender: boolean): Aprendizado | null {
  if (!aprender || !categoriaId) return null;
  const padrao = descricaoParaBusca(mov.descricao_normalizada);
  if (padrao.length < 3) return null;
  return { categoriaId, padrao, versaoNormalizacao: VERSAO_NORMALIZACAO };
}

export async function decidirMovimentosAction(input: unknown): Promise<RespostaDecisao> {
  const ctx = await requireConciliacao();
  try {
    await exigirLimiteRequisicao("fin_conciliacao_reprocessar");
    const entrada = entradaDecidir.parse(input);
    const unidadeId = ctx.acesso.unidadeId;
    const movimentos = await carregarMovimentos(unidadeId, entrada.itens.map((i) => i.movimentoId));
    const itens: ItemDecisao[] = [];
    for (const item of entrada.itens) {
      const mov = movimentos.get(item.movimentoId);
      if (!mov) throw new ErroPublico("Movimento não encontrado nesta unidade. Atualize a página.");
      if (item.acao === "baixar_parcelas") {
        const categoria = item.aprender ? await categoriaUnicaDasParcelas(unidadeId, item.parcelas.map((p) => p.parcelaId)) : null;
        itens.push({ ...item, aprender: aprendizado(mov, categoria, item.aprender) });
      } else if (item.acao === "criar_documento") {
        const total = item.linhas.reduce((a, l) => a + l.valorCentavos, 0);
        if (total !== Math.round(mov.valor * 100)) throw new ErroPublico("O total da nota precisa ser igual ao valor do extrato.");
        const documento = {
          chave: `conc-${entrada.chave}-${item.movimentoId.slice(0, 8)}`,
          tipo: (mov.direcao === "entrada" ? "receita" : "despesa") as "receita" | "despesa",
          contraparte_id: item.contraparteId,
          numero: item.numero.trim(),
          descricao: item.descricao.trim(),
          data_competencia: mov.data,
          observacao: "Criado pela Conciliação",
          linhas: item.linhas.map((l) => ({ categoria_id: l.categoriaId, descricao: l.descricao.trim(), valor: l.valorCentavos, celulas: [l.valorCentavos] })),
        };
        const digest = createHash("sha256").update(JSON.stringify(documento), "utf8").digest("hex");
        const categoriaUnica = new Set(item.linhas.map((l) => l.categoriaId)).size === 1 ? item.linhas[0].categoriaId : null;
        itens.push({
          movimentoId: item.movimentoId,
          acao: "criar_documento",
          documento: { ...documento, digest },
          aprender: aprendizado(mov, categoriaUnica, item.aprender),
        });
      } else {
        itens.push(item);
      }
    }
    await decidirMovimentos({ unidadeId, usuarioId: ctx.acesso.userId, chave: entrada.chave, itens });
    revalidatePath("/financeiro-gerencial/conciliacao");
    revalidatePath("/financeiro-gerencial/lancamentos/despesas");
    revalidatePath("/financeiro-gerencial/lancamentos/receitas");
    return { ok: true, quantidade: itens.length };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível gravar a conciliação.") };
  }
}

const entradaDesfazer = z.object({ decisaoId: uuid, motivo: z.string().trim().min(3).max(300) }).strict();

export async function desfazerDecisaoAction(input: unknown): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  const ctx = await requireConciliacao();
  try {
    if (ctx.acesso.role === "operacional") throw new ErroPublico("Só Gestão/master desfaz uma conciliação.");
    await exigirLimiteRequisicao("fin_conciliacao_reprocessar");
    const entrada = entradaDesfazer.parse(input);
    await desfazerDecisao({ unidadeId: ctx.acesso.unidadeId, usuarioId: ctx.acesso.userId, ...entrada });
    revalidatePath("/financeiro-gerencial/conciliacao");
    return { ok: true };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível desfazer a conciliação.") };
  }
}

export async function listarBaixasCandidatasAction(movimentoId: string): Promise<{ ok: true; itens: BaixaCandidata[] } | { ok: false; mensagem: string }> {
  await requireConciliacao();
  try {
    return { ok: true, itens: await listarBaixasCandidatas(uuid.parse(movimentoId)) };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível buscar pagamentos já registrados.") };
  }
}

export async function listarTransferenciasAbertasAction(movimentoId: string): Promise<{ ok: true; itens: TransferenciaAberta[] } | { ok: false; mensagem: string }> {
  const ctx = await requireConciliacao();
  try {
    const mov = (await carregarMovimentos(ctx.acesso.unidadeId, [uuid.parse(movimentoId)])).get(movimentoId);
    if (!mov) throw new ErroPublico("Movimento não encontrado.");
    const supabase = await createClient();
    const { data } = await supabase.from("fin_movimentos_importados").select("conta_financeira_id").eq("id", movimentoId).single();
    const contaFinanceiraId = (data as { conta_financeira_id: string }).conta_financeira_id;
    return { ok: true, itens: await listarTransferenciasAbertas(ctx.acesso.unidadeId, { ...mov, contaFinanceiraId }) };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível buscar transferências.") };
  }
}
