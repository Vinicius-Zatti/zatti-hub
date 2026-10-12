import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import { buscarTudo } from "@/lib/banco/paginacao";
import { assinarEnvelope } from "@/lib/conciliacao/atestado";

// Financeiro V2 (11/10/2026), fatia F2: decisões da Conciliação que gravam no financeiro.
// Toda escrita passa por `fin_conciliacao_decidir` / `fin_conciliacao_desfazer` (envelope
// assinado). O banco revalida acesso, unidade, conta, direção, saldo e estado.

export type ParcelaDecisao = { parcelaId: string; valorCentavos: number; quitarRestante?: boolean };
export type AjusteDecisao = { categoriaId: string; valorCentavos: number };
export type DocumentoDecisao = {
  chave: string;
  digest: string;
  tipo: "receita" | "despesa";
  contraparte_id: string | null;
  numero: string;
  descricao: string;
  data_competencia: string;
  observacao: string;
  linhas: { categoria_id: string; descricao: string; valor: number; celulas: number[] }[];
};

export type ItemDecisao =
  | { movimentoId: string; acao: "baixar_parcelas"; parcelas: ParcelaDecisao[]; ajuste: AjusteDecisao | null; aprender: Aprendizado | null }
  | { movimentoId: string; acao: "vincular_baixas"; baixaIds: string[] }
  | { movimentoId: string; acao: "criar_documento"; documento: DocumentoDecisao; aprender: Aprendizado | null }
  | { movimentoId: string; acao: "transferencia"; contaContraparteId: string | null; transferenciaId: string | null }
  | { movimentoId: string; acao: "ignorar"; motivo: string };

/** Só quando a decisão tem um único Plano de Contas (decisão rateada nunca ensina). */
export type Aprendizado = { categoriaId: string; padrao: string; versaoNormalizacao: number };

// Frases do banco (ASCII) para o usuário. O número do item vem na frente ("Item 2: ...").
const FRASES: [RegExp, string][] = [
  [/Movimento ja tratado/, "este movimento já foi tratado por outra pessoa. Atualize a página."],
  [/Movimento invalido/, "movimento não encontrado nesta unidade."],
  [/Diferenca de (-?\d+) centavos sem ajuste correspondente/, "o valor do extrato não fecha com as parcelas escolhidas. Informe o ajuste."],
  [/Pagamento menor que as parcelas/, "o pagamento é menor que as parcelas: ajuste o valor de cada parcela (baixa parcial) ou quite o restante como desconto."],
  [/Ajuste informado sem diferenca/, "não há diferença para ajustar."],
  [/Parcela de \w+ nao concilia movimento/, "entrada só concilia com receita e saída só com despesa."],
  [/Valor maior que o saldo em aberto/, "o valor passa do saldo em aberto da parcela."],
  [/Parcela cancelada/, "a parcela está cancelada."],
  [/Escolha pelo menos uma parcela/, "escolha pelo menos uma parcela."],
  [/As baixas somam/, "as baixas escolhidas não somam o valor do extrato."],
  [/Baixa ja estornada/, "uma das baixas escolhidas já foi estornada."],
  [/Baixa de outra conta/, "a baixa é de outra conta ou de outro tipo."],
  [/Documento com total diferente/, "o total da nota precisa ser igual ao valor do extrato."],
  [/Documento de tipo diferente/, "entrada vira receita e saída vira despesa."],
  [/Transferencia nao corresponde/, "a transferência escolhida não corresponde a este movimento."],
  [/Conta da outra ponta invalida/, "escolha a outra conta da transferência."],
  [/Informe o motivo para ignorar/, "informe o motivo para ignorar."],
  [/Plano de Contas do ajuste invalido/, "escolha o Plano de Contas do ajuste."],
  [/Mes fechado/, "o mês do extrato está fechado. Só Gestão/master concilia nesse período."],
  [/Edicao de parcela|restrito a Gestao/, "esta ação é só de Gestão/master."],
];

function traduzir(mensagem: string): string {
  const item = mensagem.match(/^Item (\d+): (.*)$/);
  const corpo = item ? item[2] : mensagem;
  const frase = FRASES.find(([re]) => re.test(corpo));
  const texto = frase ? frase[1] : "não foi possível gravar esta decisão.";
  return item ? `Item ${item[1]}: ${texto}` : texto.charAt(0).toUpperCase() + texto.slice(1);
}

function erroDecisao(error: { code?: string; message: string }): Error {
  if (error.code === "23505") return new ErroPublico("Esta confirmação já foi enviada com outro conteúdo. Atualize a página.");
  if (error.code && ["23514", "42501", "P0001"].includes(error.code)) return new ErroPublico(traduzir(error.message));
  console.error("conciliacao_decisao_falhou", { codigo: error.code ?? null });
  return new Error("conciliacao_decisao_falhou");
}

export function itemParaEnvelope(item: ItemDecisao): Record<string, unknown> {
  const base = { movimento_id: item.movimentoId, acao: item.acao };
  switch (item.acao) {
    case "baixar_parcelas":
      return {
        ...base,
        parcelas: item.parcelas.map((p) => ({ parcela_id: p.parcelaId, valor: p.valorCentavos, quitar_restante: !!p.quitarRestante })),
        ...(item.ajuste ? { ajuste: { categoria_id: item.ajuste.categoriaId, valor: item.ajuste.valorCentavos } } : {}),
        ...aprendizadoParaEnvelope(item.aprender),
      };
    case "vincular_baixas":
      return { ...base, baixas: item.baixaIds };
    case "criar_documento":
      return { ...base, documento: item.documento, ...aprendizadoParaEnvelope(item.aprender) };
    case "transferencia":
      return item.transferenciaId
        ? { ...base, transferencia_id: item.transferenciaId }
        : { ...base, conta_contraparte_id: item.contaContraparteId };
    case "ignorar":
      return { ...base, motivo: item.motivo };
  }
}

function aprendizadoParaEnvelope(a: Aprendizado | null): Record<string, unknown> {
  if (!a) return { aprender: false };
  return { aprender: true, categoria_aprendida: a.categoriaId, padrao: a.padrao, versao_normalizacao: a.versaoNormalizacao };
}

export async function decidirMovimentos(params: {
  unidadeId: string;
  usuarioId: string;
  chave: string;
  itens: ItemDecisao[];
}): Promise<string[]> {
  if (params.itens.length === 0 || params.itens.length > 200) throw new ErroPublico("Escolha de 1 a 200 movimentos.");
  const supabase = await createClient();
  const { envelope, atestado } = assinarEnvelope("decidir", params.usuarioId, {
    unidade: params.unidadeId,
    chave: params.chave,
    itens: params.itens.map(itemParaEnvelope),
  });
  const { data, error } = await supabase.rpc("fin_conciliacao_decidir", { p_envelope: envelope, p_atestado: atestado });
  if (error) throw erroDecisao(error);
  return ((data as { decisoes: string[] }).decisoes ?? []) as string[];
}

export async function desfazerDecisao(params: { unidadeId: string; usuarioId: string; decisaoId: string; motivo: string }): Promise<void> {
  const supabase = await createClient();
  const { envelope, atestado } = assinarEnvelope("desfazer", params.usuarioId, {
    unidade: params.unidadeId,
    decisao_id: params.decisaoId,
    motivo: params.motivo,
  });
  const { error } = await supabase.rpc("fin_conciliacao_desfazer", { p_envelope: envelope, p_atestado: atestado });
  if (error) throw erroDecisao(error);
}

export type BaixaCandidata = { baixaId: string; parcelaId: string; lancamentoId: string; descricao: string; data: string; valor: number };

export async function listarBaixasCandidatas(movimentoId: string): Promise<BaixaCandidata[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_conciliacao_candidatos_baixa", { p_movimento: movimentoId, p_janela_dias: 5 });
  if (error) throw erroDecisao(error);
  type Row = { baixa_id: string; parcela_id: string; lancamento_id: string; descricao: string; data: string; valor: number | string };
  return ((data as Row[] | null) ?? []).map((r) => ({
    baixaId: r.baixa_id,
    parcelaId: r.parcela_id,
    lancamentoId: r.lancamento_id,
    descricao: r.descricao,
    data: r.data,
    valor: Number(r.valor),
  }));
}

export type TransferenciaAberta = { id: string; contaOrigemId: string; contaDestinoId: string; valor: number; data: string; faltaPonta: "origem" | "destino" };

/** Transferências criadas por um lado que ainda esperam a outra ponta (mesmo valor, até 5 dias). */
export async function listarTransferenciasAbertas(unidadeId: string, movimento: { contaFinanceiraId: string; direcao: "entrada" | "saida"; valor: number; data: string }): Promise<TransferenciaAberta[]> {
  const supabase = await createClient();
  const coluna = movimento.direcao === "entrada" ? "conta_destino_id" : "conta_origem_id";
  const vazia = movimento.direcao === "entrada" ? "movimento_destino_id" : "movimento_origem_id";
  const { data, error } = await supabase
    .from("fin_transferencias")
    .select("id, conta_origem_id, conta_destino_id, valor, data")
    .eq("unidade_id", unidadeId)
    .eq(coluna, movimento.contaFinanceiraId)
    .is(vazia, null)
    .is("cancelada_em", null)
    .eq("valor", movimento.valor)
    .order("data")
    .limit(20);
  if (error) throw new Error("conciliacao_transferencias_abertas");
  type Row = { id: string; conta_origem_id: string; conta_destino_id: string; valor: number | string; data: string };
  const dia = Date.parse(`${movimento.data}T00:00:00Z`);
  return ((data as Row[] | null) ?? [])
    .filter((r) => Math.abs(Date.parse(`${r.data}T00:00:00Z`) - dia) <= 5 * 86_400_000)
    .map((r) => ({
      id: r.id,
      contaOrigemId: r.conta_origem_id,
      contaDestinoId: r.conta_destino_id,
      valor: Number(r.valor),
      data: r.data,
      faltaPonta: movimento.direcao === "entrada" ? "destino" : "origem",
    }));
}

export type DecisaoResumo = {
  id: string;
  movimentoId: string;
  acao: string;
  motivo: string | null;
  decididoEm: string;
  data: string;
  descricao: string;
  valor: number;
  direcao: "entrada" | "saida";
};

/** Movimentos já tratados (para conferir e, se for Gestão, desfazer). */
export async function listarDecisoesAtivas(unidadeId: string, desde: string): Promise<DecisaoResumo[]> {
  const supabase = await createClient();
  type Row = {
    id: string;
    movimento_id: string;
    acao: string;
    motivo: string | null;
    decidido_em: string;
    fin_movimentos_importados: { data: string; descricao_original: string; valor: number | string; direcao: "entrada" | "saida" } | null;
  };
  const linhas = await buscarTudo<Row>((de, ate) =>
    supabase
      .from("fin_conciliacao_decisoes")
      .select("id, movimento_id, acao, motivo, decidido_em, fin_movimentos_importados(data, descricao_original, valor, direcao)")
      .eq("unidade_id", unidadeId)
      .eq("situacao", "ativa")
      .gte("decidido_em", desde)
      .order("decidido_em", { ascending: false })
      .order("id")
      .range(de, ate),
  );
  return linhas.map((r) => ({
    id: r.id,
    movimentoId: r.movimento_id,
    acao: r.acao,
    motivo: r.motivo,
    decididoEm: r.decidido_em,
    data: r.fin_movimentos_importados?.data ?? "",
    descricao: r.fin_movimentos_importados?.descricao_original ?? "",
    valor: Number(r.fin_movimentos_importados?.valor ?? 0),
    direcao: r.fin_movimentos_importados?.direcao ?? "saida",
  }));
}
