// Extrato do estoque v1 - funções puras (servidor e tela). Sem acesso a banco.
// Regras no desenho `_execucao/zatti-hub/extrato-estoque-v1.md` (Cérebro do Gestor).

import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";

export type TipoMovimento = "compra" | "perda" | "saida" | "entrada";
export type TipoLinhaExtrato = TipoMovimento | "posicao";
export type MotivoPerda = "vencido" | "estragou" | "erro_preparo" | "quebra" | "outro";

export const MOTIVOS_PERDA: { valor: MotivoPerda; rotulo: string }[] = [
  { valor: "vencido", rotulo: "Vencido" },
  { valor: "estragou", rotulo: "Estragou" },
  { valor: "erro_preparo", rotulo: "Erro de preparo" },
  { valor: "quebra", rotulo: "Quebra" },
  { valor: "outro", rotulo: "Outro (descrever)" },
];

export const ROTULO_TIPO: Record<TipoLinhaExtrato, string> = {
  posicao: "Posição (contagem)",
  compra: "Compra",
  perda: "Perda",
  saida: "Saída",
  entrada: "Entrada",
};

export const TIPOS_FILTRO: TipoLinhaExtrato[] = ["posicao", "compra", "perda", "saida", "entrada"];

export function rotuloMotivoPerda(motivo: string | null): string {
  if (!motivo) return "";
  return MOTIVOS_PERDA.find((m) => m.valor === motivo)?.rotulo.replace(" (descrever)", "") ?? motivo;
}

/** Uma linha do extrato como vem da view `estoque_extrato_linhas`. */
export type LinhaExtrato = {
  linhaId: string;
  movimentacaoId: string | null;
  data: string;
  natureza: "movimento" | "posicao";
  tipo: TipoLinhaExtrato;
  origem: "recebimento" | "manual" | null;
  sku: string;
  nome: string;
  unidadeBase: string;
  quantidade: number;
  /** Positivo entra, negativo sai. Nulo na posição (não é movimento). */
  quantidadeSinal: number | null;
  custoUnitario: number | null;
  valor: number | null;
  quantidadeConferida: boolean;
  motivo: string | null;
  observacao: string | null;
  fornecedor: string | null;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
};

export type FiltroExtrato = {
  de: string | null;
  ate: string | null;
  tipo: TipoLinhaExtrato | null;
  sku: string | null;
  incluirCancelados: boolean;
  pagina: number;
};

export const TAMANHO_PAGINA_EXTRATO = 50;

function dataIsoOuNull(valor: string | undefined): string | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === valor ? valor : null;
}

/** Lê os filtros da URL sem confiar neles: valor inválido vira "sem filtro". */
export function lerFiltroExtrato(params: Record<string, string | undefined>): FiltroExtrato {
  const tipo = TIPOS_FILTRO.find((t) => t === params.tipo) ?? null;
  const sku = (params.sku ?? "").trim().toUpperCase();
  const pagina = Number.parseInt(params.pagina ?? "1", 10);
  let de = dataIsoOuNull(params.de);
  let ate = dataIsoOuNull(params.ate);
  if (de && ate && de > ate) [de, ate] = [ate, de];
  return {
    de,
    ate,
    tipo,
    sku: sku && /^[A-Z0-9._-]{1,80}$/.test(sku) ? sku : null,
    incluirCancelados: params.cancelados === "1",
    pagina: Number.isFinite(pagina) && pagina >= 1 ? Math.min(pagina, 100_000) : 1,
  };
}

export function totalPaginas(totalLinhas: number, tamanho = TAMANHO_PAGINA_EXTRATO): number {
  return Math.max(1, Math.ceil(totalLinhas / tamanho));
}

/** Situação mostrada ao lado da linha. Compra sem preço fica pendente, nunca R$ 0. */
export function situacaoLinha(linha: Pick<LinhaExtrato, "canceladoEm" | "natureza" | "custoUnitario" | "quantidadeConferida">): string {
  if (linha.canceladoEm) return "Cancelado";
  if (linha.natureza === "posicao") return "";
  const partes: string[] = [];
  if (linha.custoUnitario === null) partes.push("Preço pendente");
  if (!linha.quantidadeConferida) partes.push("Quantidade não conferida");
  return partes.join(" · ");
}

export type ProdutoParaPerda = { id: string; sku: string; nome: string; unidadeBase: string };

/** Por que o saldo tem (ou não tem) número - vem da view `estoque_saldos`. */
export type SituacaoSaldo = "calculado" | "sem_posicao" | "sem_historico_completo" | "unidade_divergente";

export type SaldoSku = {
  produtoId: string;
  sku: string;
  nome: string;
  unidadeBase: string;
  ativo: boolean;
  ultimoPrecoPago: number | null;
  ultimoPrecoPagoEm: string | null;
  dataPosicao: string | null;
  quantidadePosicao: number | null;
  /** Unidade gravada na contagem (a da época), não a do cadastro de hoje. */
  unidadePosicao: string | null;
  entradas: number;
  saidas: number;
  /** Nulo sempre que a situação não é "calculado": indeterminado, nunca zero. */
  saldo: number | null;
  lancamentosDesdePosicao: number;
  /** Primeiro dia com todas as compras no extrato. Nulo = unidade fora do extrato. */
  inicioExtrato: string | null;
  situacao: SituacaoSaldo;
};

const SITUACOES_SALDO: SituacaoSaldo[] = ["calculado", "sem_posicao", "sem_historico_completo", "unidade_divergente"];

/** Texto da célula de saldo quando não há número. */
export const ROTULO_SITUACAO_SALDO: Record<Exclude<SituacaoSaldo, "calculado">, string> = {
  sem_posicao: "Indeterminado",
  sem_historico_completo: "Sem histórico completo",
  unidade_divergente: "Unidade divergente",
};

/** Texto do "i" do saldo - linguagem simples, com a fórmula. */
export const DICA_SALDO =
  "Saldo = quantidade da última contagem completa em que o item foi contado + compras e entradas " +
  "− perdas e saídas lançadas a partir do dia dessa contagem. Não desconta o consumo que não foi " +
  "lançado (vendas e uso do dia a dia), então é o que deveria haver se nada mais tivesse saído. " +
  "Fica sem número (nunca zero) quando: o item não tem contagem completa; a contagem é anterior " +
  "ao início do extrato da unidade (as compras de antes não foram lançadas, então o número não " +
  "seria confiável); ou a unidade da contagem, do cadastro ou de algum lançamento não bate.";

/** O que fica fora das compras do extrato - mesmo quando o pedido está recebido. */
export const DICA_EXCLUSOES_EXTRATO =
  "Entram como compra só os itens de pedido recebido com vencedor confirmado e quantidade maior " +
  "que zero. Ficam de fora: item sem vencedor confirmado, item sem cadastro de produto nesta " +
  "unidade, item com unidade diferente da do cadastro, pedidos de outras unidades e pedidos " +
  "recebidos antes do início do extrato. A Calculadora de CMV conta compras de outro jeito " +
  "(ela não exige vencedor confirmado), então os totais podem não bater.";

export function textoInicioExtrato(inicio: string | null): string {
  return inicio
    ? `O extrato desta unidade tem todas as compras a partir de ${formatarDataBr(inicio)}.`
    : "Esta unidade não está com o estoque no banco: o extrato não tem as compras.";
}

export const DICA_CUSTO_PERDA =
  "Custo da perda = quantidade × último preço pago do item até a data da perda (compra recebida " +
  "mais recente). Sem compra com preço, o custo fica desconhecido.";

function campoCsv(texto: string): string {
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** 1234.5 -> "1234,5" (sem ponto de milhar, para a planilha abrir como número). */
export function numeroCsv(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return "";
  return String(Math.round(valor * 10_000) / 10_000).replace(".", ",");
}

/** CSV com BOM UTF-8 e separador ";" (o Excel em português abre direto). */
export function gerarCsvExtrato(linhas: LinhaExtrato[]): string {
  const cabecalho = [
    "Data", "Tipo", "SKU", "Produto", "Unidade", "Quantidade", "Custo unitário", "Valor",
    "Fornecedor", "Motivo", "Observação", "Situação", "Motivo do cancelamento",
  ];
  const corpo = linhas.map((l) =>
    [
      formatarDataBr(l.data),
      ROTULO_TIPO[l.tipo],
      l.sku,
      l.nome,
      l.unidadeBase,
      numeroCsv(l.natureza === "posicao" ? l.quantidade : l.quantidadeSinal),
      numeroCsv(l.custoUnitario),
      numeroCsv(l.valor),
      l.fornecedor ?? "",
      rotuloMotivoPerda(l.motivo),
      l.observacao ?? "",
      situacaoLinha(l),
      l.motivoCancelamento ?? "",
    ]
      .map(campoCsv)
      .join(";"),
  );
  return `﻿${[cabecalho.map(campoCsv).join(";"), ...corpo].join("\r\n")}\r\n`;
}

/** Converte a linha crua da view (números chegam como string do PostgREST). */
export function linhaDaView(row: Record<string, unknown>): LinhaExtrato {
  const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
  return {
    linhaId: String(row.linha_id),
    movimentacaoId: (row.movimentacao_id as string | null) ?? null,
    data: String(row.data),
    natureza: row.natureza === "posicao" ? "posicao" : "movimento",
    tipo: row.tipo as TipoLinhaExtrato,
    origem: (row.origem as LinhaExtrato["origem"]) ?? null,
    sku: String(row.sku ?? ""),
    nome: String(row.nome ?? ""),
    unidadeBase: String(row.unidade_base ?? ""),
    quantidade: Number(row.quantidade),
    quantidadeSinal: num(row.quantidade_sinal),
    custoUnitario: num(row.custo_unitario),
    valor: num(row.valor),
    quantidadeConferida: row.quantidade_conferida !== false,
    motivo: (row.motivo as string | null) ?? null,
    observacao: (row.observacao as string | null) ?? null,
    fornecedor: (row.fornecedor as string | null) ?? null,
    canceladoEm: (row.cancelado_em as string | null) ?? null,
    motivoCancelamento: (row.motivo_cancelamento as string | null) ?? null,
  };
}

export function saldoDaView(row: Record<string, unknown>): SaldoSku {
  const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
  // Valor desconhecido nunca vira "calculado": cai no caso mais conservador.
  const situacao = SITUACOES_SALDO.find((s) => s === row.situacao_saldo) ?? "sem_posicao";
  return {
    produtoId: String(row.produto_id),
    sku: String(row.sku ?? ""),
    nome: String(row.nome ?? ""),
    unidadeBase: String(row.unidade_base ?? ""),
    ativo: row.ativo !== false,
    ultimoPrecoPago: num(row.ultimo_preco_pago),
    ultimoPrecoPagoEm: (row.ultimo_preco_pago_em as string | null) ?? null,
    dataPosicao: (row.data_posicao as string | null) ?? null,
    quantidadePosicao: num(row.quantidade_posicao),
    unidadePosicao: (row.unidade_posicao as string | null) ?? null,
    entradas: Number(row.entradas ?? 0),
    saidas: Number(row.saidas ?? 0),
    saldo: situacao === "calculado" ? num(row.saldo) : null,
    lancamentosDesdePosicao: Number(row.lancamentos_desde_posicao ?? 0),
    inicioExtrato: (row.inicio_extrato as string | null) ?? null,
    situacao,
  };
}

/** Textos do aviso das telas do extrato com a chave da unidade desligada
 * (`unidades.extrato_estoque_habilitado`, decisão 7 de 13/10/2026). */
export const AVISO_EXTRATO_DESLIGADO = {
  titulo: "O extrato do estoque está desligado nesta unidade.",
  corpo:
    "Enquanto os pedidos não forem recebidos 100% pelo Zatti Hub, o saldo sairia errado com cara de certo. " +
    "As compras recebidas continuam sendo registradas em segundo plano: quando a chave ligar, o histórico já está aqui.",
  quemLiga: "Quem liga é a Zatti (acesso master), em Acessos > Unidades, chave \"Usar extrato do estoque\".",
} as const;

export const ERRO_EXTRATO_DESLIGADO = "O extrato do estoque está desligado nesta unidade.";

/** Mensagem após salvar o recebimento: só fala do extrato quando há algo a dizer
 * e a chave da unidade está ligada (desligada, a tela Movimentações não mostra
 * o que ficou pendente, então o aviso só confundiria). */
export function mensagemRecebimento(
  resultado: {
    sem_preco?: number;
    pendencias?: { sku: string; motivo: string }[];
  },
  extratoLigado = true,
): string {
  const partes = ["Salvo."];
  if (!extratoLigado) return partes[0];
  const semPreco = Number(resultado.sem_preco ?? 0);
  if (semPreco > 0) {
    partes.push(
      semPreco === 1
        ? "1 item entrou no extrato sem preço (fica pendente em Movimentações)."
        : `${semPreco} itens entraram no extrato sem preço (ficam pendentes em Movimentações).`,
    );
  }
  const pend = resultado.pendencias ?? [];
  if (pend.length > 0) {
    partes.push(
      `Fora do extrato: ${pend.map((p) => `${p.sku} (${p.motivo.toLowerCase()})`).join(", ")}.`,
    );
  }
  return partes.join(" ");
}
