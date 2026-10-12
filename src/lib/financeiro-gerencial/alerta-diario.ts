import { formatarDataBr } from "./datas";

// Alerta diário de contas a pagar pelo WhatsApp (Financeiro V2, 11/10/2026). Pedido de Vinícius:
// "oi Vinicius hoje temos essas contas vencendo 1) ... e por ai vai". Função pura: o Hub monta o
// texto, o Vini só envia. Sem emoji, sem travessão.

export type ContaDoDia = { contraparte: string | null; descricao: string; numero: string | null; saldoCentavos: number };
export type ResumoAlerta = {
  nomeDestinatario: string;
  unidadeNome: string;
  data: string;
  vencendoHoje: ContaDoDia[];
  vencidas: { quantidade: number; totalCentavos: number; maisAntiga: string | null };
  movimentosParados: number;
  mesAnteriorAberto: string | null;
};

export function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/** Segunda-feira no calendário (data ISO), para lembrar de vencidas sem conta no dia. */
export function ehSegunda(dataIso: string): boolean {
  const [a, m, d] = dataIso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay() === 1;
}

/** Texto do alerta, ou null quando não há nada a dizer. Vencidas sozinhas só às segundas. */
export function montarAlertaDiario(r: ResumoAlerta): string | null {
  const temHoje = r.vencendoHoje.length > 0;
  const temVencidas = r.vencidas.quantidade > 0;
  if (!temHoje && !(temVencidas && ehSegunda(r.data))) return null;

  const linhas: string[] = [];
  const dia = formatarDataBr(r.data).slice(0, 5);
  if (temHoje) {
    linhas.push(`Oi ${primeiroNome(r.nomeDestinatario)}, hoje (${dia}) temos estas contas vencendo na ${r.unidadeNome}:`);
    r.vencendoHoje.forEach((c, i) => {
      const quem = c.contraparte?.trim() || c.descricao;
      const detalhe = [c.numero ? `NF ${c.numero}` : null, c.contraparte ? c.descricao : null].filter(Boolean).join(" - ");
      linhas.push(`${i + 1}) ${quem}${detalhe ? ` - ${detalhe}` : ""} - ${reais(c.saldoCentavos)}`);
    });
    const total = r.vencendoHoje.reduce((a, c) => a + c.saldoCentavos, 0);
    linhas.push(`Total de hoje: ${reais(total)}.`);
  } else {
    linhas.push(`Oi ${primeiroNome(r.nomeDestinatario)}, hoje (${dia}) não vence nenhuma conta na ${r.unidadeNome}.`);
  }
  if (temVencidas) {
    const desde = r.vencidas.maisAntiga ? ` A mais antiga venceu em ${formatarDataBr(r.vencidas.maisAntiga)}.` : "";
    const plural = r.vencidas.quantidade === 1 ? "conta vencida" : "contas vencidas";
    linhas.push("");
    linhas.push(`Ainda sem pagamento: ${r.vencidas.quantidade} ${plural}, ${reais(r.vencidas.totalCentavos)}.${desde}`);
  }
  if (r.movimentosParados > 0) {
    linhas.push(`Tem ${r.movimentosParados} ${r.movimentosParados === 1 ? "movimento" : "movimentos"} do extrato esperando conciliação há mais de 3 dias.`);
  }
  if (r.mesAnteriorAberto) linhas.push(`O mês ${r.mesAnteriorAberto} ainda não foi fechado.`);
  linhas.push("");
  linhas.push("Já pagou? Dá baixa no Zatti Hub, em Financeiro > Contas a pagar e receber.");
  return linhas.join("\n");
}
