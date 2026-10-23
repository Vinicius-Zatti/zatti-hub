/** Recorte do aviso de divergências do Consolidado de Vendas (Dashboard):
 * conta só o mês atual e o mês anterior, enquanto o anterior não estiver
 * fechado no Fechamento mensal do Financeiro (`fin_fechamentos`). Meses mais
 * antigos nunca entram no aviso, mas continuam no Histórico quando a pessoa
 * filtra o período. Função pura (string AAAA-MM-DD, sem `Date`), usada no
 * servidor e no componente. */

export const EXPLICACAO_AVISO_DIVERGENCIA =
  "Mostra o mês atual e o anterior até ele ser fechado no Financeiro. Meses mais antigos não entram nesta contagem, mas continuam no Histórico: filtre o período para vê-los. Com um período filtrado, conta todas as divergências do período.";

export type JanelaAvisoDivergencia = { de: string; ate: string };

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** `hoje` em AAAA-MM-DD (fuso de Brasília); `mesesFechados` em AAAA-MM. */
export function janelaAvisoDivergencia(hoje: string, mesesFechados: ReadonlySet<string>): JanelaAvisoDivergencia {
  const [ano, mes] = hoje.split("-").map(Number);
  const anoAnterior = mes === 1 ? ano - 1 : ano;
  const mesAnterior = mes === 1 ? 12 : mes - 1;
  const chaveAtual = `${ano}-${doisDigitos(mes)}`;
  const chaveAnterior = `${anoAnterior}-${doisDigitos(mesAnterior)}`;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const de = mesesFechados.has(chaveAnterior) ? `${chaveAtual}-01` : `${chaveAnterior}-01`;
  return { de, ate: `${chaveAtual}-${doisDigitos(ultimoDia)}` };
}

export function divergenciasDoAviso<T extends { data: string; status: string }>(
  lancamentos: T[],
  janela: JanelaAvisoDivergencia
): T[] {
  return lancamentos.filter((l) => l.status === "divergente" && l.data >= janela.de && l.data <= janela.ate);
}
