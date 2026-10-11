// Cálculos puros da tela de decisão da Conciliação (neutro: servidor e navegador).
// Só reflete as regras do banco (fin_conciliacao_decidir), nunca as substitui: o banco
// revalida tudo. Dinheiro em centavos inteiros.

export type Direcao = "entrada" | "saida";

export function paraCentavos(reais: number | null | undefined): number {
  if (reais === null || reais === undefined || !Number.isFinite(reais)) return 0;
  return Math.round(reais * 100);
}

/** Chave de envio: id novo por confirmação, no formato aceito pela action. */
export function novaChaveEnvio(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "");
}

// ── Diferença entre extrato e parcelas escolhidas ─────────────────────────

export type CasoDiferenca =
  | "fecha" // extrato = selecionado
  | "juros_multa" // saída paga a mais: ajuste de despesa
  | "tarifa_desconto" // entrada recebida a menos: ajuste de despesa
  | "receita_a_mais" // entrada recebida a mais: ajuste de receita
  | "pagamento_menor"; // saída paga a menos: baixa parcial ou quitar o restante

export type AnaliseDiferenca = {
  diferencaCentavos: number; // extrato - selecionado (com sinal)
  caso: CasoDiferenca;
  ajusteCentavos: number; // valor do ajuste quando o caso pede ajuste; 0 nos demais
  ajusteTipo: "despesa" | "receita" | null;
};

export function analisarDiferenca(direcao: Direcao, extratoCentavos: number, selecionadoCentavos: number): AnaliseDiferenca {
  const dif = extratoCentavos - selecionadoCentavos;
  if (dif === 0) return { diferencaCentavos: 0, caso: "fecha", ajusteCentavos: 0, ajusteTipo: null };
  if (direcao === "saida") {
    return dif > 0
      ? { diferencaCentavos: dif, caso: "juros_multa", ajusteCentavos: dif, ajusteTipo: "despesa" }
      : { diferencaCentavos: dif, caso: "pagamento_menor", ajusteCentavos: 0, ajusteTipo: null };
  }
  return dif > 0
    ? { diferencaCentavos: dif, caso: "receita_a_mais", ajusteCentavos: dif, ajusteTipo: "receita" }
    : { diferencaCentavos: dif, caso: "tarifa_desconto", ajusteCentavos: -dif, ajusteTipo: "despesa" };
}

export const TEXTO_CASO: Record<CasoDiferenca, string> = {
  fecha: "O valor do extrato fecha com as contas escolhidas.",
  juros_multa: "Foi pago a mais que as contas escolhidas. A diferença vira um lançamento de juros ou multa (Plano de Contas de despesa).",
  tarifa_desconto: "Foi recebido a menos que as contas escolhidas. A diferença vira tarifa ou desconto concedido (Plano de Contas de despesa).",
  receita_a_mais: "Foi recebido a mais que as contas escolhidas. A diferença vira uma receita (ex.: juros recebidos).",
  pagamento_menor: "Foi pago a menos que as contas escolhidas. Diminua o valor a baixar (baixa parcial) até fechar com o extrato.",
};

/** Valor padrão ao marcar uma parcela: o menor entre o saldo e o que ainda falta do extrato. */
export function valorPadraoBaixa(saldoCentavos: number, faltaCentavos: number): number {
  return faltaCentavos > 0 ? Math.min(saldoCentavos, faltaCentavos) : saldoCentavos;
}

/** Reparte o valor do extrato pelas parcelas na ordem, sem passar do saldo de cada uma. */
export function distribuirExtrato(extratoCentavos: number, saldosCentavos: number[]): number[] {
  let resta = extratoCentavos;
  return saldosCentavos.map((saldo) => {
    const v = Math.max(0, Math.min(saldo, resta));
    resta -= v;
    return v;
  });
}

// ── Nota nova ─────────────────────────────────────────────────────────────

/** Quanto falta para as linhas da nota fecharem com o extrato (negativo = passou). */
export function faltaNaNota(extratoCentavos: number, valoresCentavos: number[]): number {
  return extratoCentavos - valoresCentavos.reduce((a, v) => a + v, 0);
}

/** "Confirmar e aprender" só ensina quando a decisão tem um único Plano de Contas. */
export function umUnicoPlano(ids: (string | null | undefined)[]): boolean {
  const validos = ids.filter((i): i is string => !!i);
  return validos.length > 0 && new Set(validos).size === 1;
}

// ── Lote: fila agrupada por descrição ─────────────────────────────────────

/** Descrição em minúsculas, sem números longos (4+ dígitos, mascarados ou não) e sem
 * espaços repetidos, mais a direção. "PIX ENVIADO 12345678 JOAO" e "Pix enviado 87654321 joao"
 * caem no mesmo grupo. */
export function chaveGrupo(descricao: string, direcao: Direcao): string {
  const texto = descricao
    .toLowerCase()
    .replace(/[\d*][\d*./-]{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${direcao}|${texto}`;
}

export type ItemAgrupavel = { id: string; descricaoOriginal: string; direcao: Direcao; valor: number };
export type GrupoFila<T extends ItemAgrupavel> = { chave: string; descricao: string; direcao: Direcao; itens: T[]; totalCentavos: number };

/** Grupos ordenados pelos que mais repetem; empate pelo maior total, depois pela descrição. */
export function agruparFila<T extends ItemAgrupavel>(itens: T[]): GrupoFila<T>[] {
  const grupos = new Map<string, GrupoFila<T>>();
  for (const item of itens) {
    const chave = chaveGrupo(item.descricaoOriginal, item.direcao);
    const g = grupos.get(chave) ?? { chave, descricao: item.descricaoOriginal, direcao: item.direcao, itens: [], totalCentavos: 0 };
    g.itens.push(item);
    g.totalCentavos += paraCentavos(item.valor);
    grupos.set(chave, g);
  }
  return Array.from(grupos.values()).sort(
    (a, b) => b.itens.length - a.itens.length || b.totalCentavos - a.totalCentavos || a.chave.localeCompare(b.chave),
  );
}

export const LIMITE_LOTE = 200;

/** Resumo do lote antes de enviar. Direção única é exigida para criar notas (entrada vira
 * receita e saída vira despesa, com Plano de Contas do tipo certo). */
export function resumirLote(itens: { direcao: Direcao; valor: number }[]): {
  quantidade: number;
  totalCentavos: number;
  direcao: Direcao | "mista" | null;
  acimaDoLimite: boolean;
} {
  const direcoes = new Set(itens.map((i) => i.direcao));
  return {
    quantidade: itens.length,
    totalCentavos: itens.reduce((a, i) => a + paraCentavos(i.valor), 0),
    direcao: direcoes.size === 0 ? null : direcoes.size > 1 ? "mista" : (Array.from(direcoes)[0] as Direcao),
    acimaDoLimite: itens.length > LIMITE_LOTE,
  };
}

// ── Já conciliados ────────────────────────────────────────────────────────

export const DIAS_CONCILIADOS = 60;

/** Instante (ISO) de início da aba "Conciliados": `DIAS_CONCILIADOS` dias antes de `agora`. */
export function inicioJanelaConciliados(agora: Date): string {
  return new Date(agora.getTime() - DIAS_CONCILIADOS * 86_400_000).toISOString();
}

export const TEXTO_ACAO_DECISAO: Record<string, string> = {
  baixar_parcelas: "Baixa de contas em aberto",
  vincular_baixas: "Ligado a pagamento já registrado",
  criar_documento: "Nova nota já paga",
  transferencia: "Transferência entre contas",
  ignorar: "Ignorado",
};

export function textoAcaoDecisao(acao: string): string {
  return TEXTO_ACAO_DECISAO[acao] ?? acao.replace(/_/g, " ");
}
