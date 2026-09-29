// Pontuação explicável de uma parcela candidata para um movimento importado.
// Só ordena e explica o que já veio do banco (a relevância global e a
// paginação são feitas na RPC). Nunca decide sozinha: a tela mostra todos.

export type CandidatoParcela = {
  grupo: "aberta" | "quitada";
  parcelaId: string;
  lancamentoId: string;
  descricao: string;
  categoriaNome: string;
  dataPrevista: string;
  valor: number;
  saldoAberto: number;
  status: string;
  numero: number;
  totalParcelas: number;
  contaFinanceiraId: string | null;
};

export type Pontuacao = { pontos: number; motivos: string[]; diferencaCentavos: number };

export const EXPLICACAO_PONTUACAO =
  "Pontos = 50 se o saldo em aberto da parcela é igual ao valor do extrato + até 30 pela proximidade da data (30 menos 6 por dia de diferença) + 20 se a parcela já indica a mesma conta financeira. Máximo 100. É só uma ordem de leitura: nada é conciliado sem confirmação.";

function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round(Math.abs(Date.UTC(ya, ma - 1, da) - Date.UTC(yb, mb - 1, db)) / 86_400_000);
}

export function pontuarCandidato(
  movimento: { data: string; valorCentavos: number; contaFinanceiraId: string },
  candidato: CandidatoParcela,
): Pontuacao {
  const motivos: string[] = [];
  let pontos = 0;
  const saldoCentavos = Math.round(candidato.saldoAberto * 100);
  const diferencaCentavos = movimento.valorCentavos - saldoCentavos;
  if (diferencaCentavos === 0) {
    pontos += 50;
    motivos.push("Valor igual ao saldo em aberto");
  } else {
    motivos.push("Valor diferente do saldo em aberto");
  }
  const dias = diasEntre(movimento.data, candidato.dataPrevista);
  pontos += Math.max(0, 30 - 6 * dias);
  motivos.push(dias === 0 ? "Mesma data prevista" : `${dias} dia(s) de diferença na data`);
  if (candidato.contaFinanceiraId && candidato.contaFinanceiraId === movimento.contaFinanceiraId) {
    pontos += 20;
    motivos.push("Mesma conta financeira");
  }
  if (candidato.grupo === "quitada") {
    motivos.push("Esta conta já consta como paga. O extrato apresenta outro débito semelhante.");
  }
  return { pontos, motivos, diferencaCentavos };
}
