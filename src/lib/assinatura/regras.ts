/** Regras puras da vigência anual de quem compra o Zatti Hub (15/10/2026), testáveis sem banco.
 * Sem cobrança automática: avisos com link de renovação antes de vencer; depois de vencer,
 * CARENCIA_DIAS de uso com aviso e depois o app trava (nada é apagado). */

export const CARENCIA_DIAS = 10;
/** Faixa discreta para a gestão nos últimos dias antes de vencer. */
export const AVISO_APP_DIAS = 7;
/** Endereço da página de renovação no site (o token identifica a conta). */
export const URL_RENOVACAO = "https://zatticonsultoria.com.br/zatti-hub/renovar/";

export type Marco = "d30" | "d7" | "d1" | "d0";

export type SituacaoAssinatura =
  | { tipo: "sem_vigencia" }
  | { tipo: "em_dia"; dias: number }
  | { tipo: "vencendo"; dias: number }
  | { tipo: "carencia"; diasParaTravar: number }
  | { tipo: "bloqueada" };

/** Data de hoje (AAAA-MM-DD) no fuso de São Paulo. */
export function hojeSP(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

const diaUTC = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** Dias do hoje até o último dia pago: 0 = vence hoje, negativo = já venceu. */
export function diasAteFim(fim: string, hoje: string): number {
  return Math.round((diaUTC(fim) - diaUTC(hoje)) / 86_400_000);
}

/** Fim da vigência de uma compra: dia do pagamento aprovado (SP) + 12 meses. */
export function fimDaVigencia(aprovadoEm: Date): string {
  const [a, m, d] = hojeSP(aprovadoEm).split("-").map(Number);
  // Date.UTC normaliza 29/02 do ano seguinte para 01/03.
  return new Date(Date.UTC(a + 1, m - 1, d)).toISOString().slice(0, 10);
}

export function situacaoAssinatura(fim: string | null, hoje: string): SituacaoAssinatura {
  if (!fim) return { tipo: "sem_vigencia" };
  const dias = diasAteFim(fim, hoje);
  if (dias > AVISO_APP_DIAS) return { tipo: "em_dia", dias };
  if (dias >= 0) return { tipo: "vencendo", dias };
  const diasParaTravar = CARENCIA_DIAS + dias;
  return diasParaTravar > 0 ? { tipo: "carencia", diasParaTravar } : { tipo: "bloqueada" };
}

/** Aviso do WhatsApp que vale hoje. O dia do vencimento aceita até 3 dias de atraso (Vini fora do
 * ar); os marcos de antes só valem na própria faixa, para nunca mandar dois avisos no mesmo dia. */
export function marcoDoDia(fim: string, hoje: string): Marco | null {
  const dias = diasAteFim(fim, hoje);
  if (dias <= 0 && dias >= -3) return "d0";
  if (dias === 1) return "d1";
  if (dias >= 2 && dias <= 7) return "d7";
  if (dias >= 8 && dias <= 30) return "d30";
  return null;
}

export function linkRenovacao(token: string): string {
  return `${URL_RENOVACAO}?c=${encodeURIComponent(token)}`;
}

/** Data AAAA-MM-DD em DD/MM/AAAA. */
export function dataBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export type Faixa = { tom: "aviso" | "alerta"; texto: string; botao: boolean };

/** Faixa no topo do app. Antes de vencer, só a gestão vê (discreta); na carência, todos veem, e
 * quem não é gestão é orientado a falar com a gestão (só ela tem o botão de renovar). */
export function faixaAssinatura(s: SituacaoAssinatura, podeGerir: boolean): Faixa | null {
  if (s.tipo === "vencendo") {
    if (!podeGerir) return null;
    const quando = s.dias === 0 ? "vence hoje" : s.dias === 1 ? "vence amanhã" : `vence em ${s.dias} dias`;
    return { tom: "aviso", texto: `Sua assinatura do Zatti Hub ${quando}.`, botao: true };
  }
  if (s.tipo === "carencia") {
    const prazo = s.diasParaTravar === 1 ? "até amanhã" : `em até ${s.diasParaTravar} dias`;
    return podeGerir
      ? { tom: "alerta", texto: `Sua assinatura venceu. Renove ${prazo} para continuar usando.`, botao: true }
      : { tom: "alerta", texto: `A assinatura do Zatti Hub venceu. Avise a gestão: o app trava ${prazo === "até amanhã" ? "amanhã" : prazo.replace("em até", "em")}.`, botao: false };
  }
  return null;
}
