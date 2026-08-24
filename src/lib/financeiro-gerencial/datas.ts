/** Último dia válido de um mês (0-indexado) - `new Date(ano, mes+1, 0)` é o
 * truque padrão pra isso (dia 0 do mês seguinte = último dia do mês atual). */
export function ultimoDiaDoMes(ano: number, mesIndice0: number): number {
  return new Date(Date.UTC(ano, mesIndice0 + 1, 0)).getUTCDate();
}

/** Soma meses a uma data ISO (AAAA-MM-DD), preservando o dia quando o mês de
 * destino tem esse dia, ou caindo pro último dia válido quando não tem (ex:
 * dia 31 de janeiro + 1 mês = 28 ou 29 de fevereiro, conforme o ano) - regra
 * usada tanto no parcelamento quanto nas recorrências (Fase 7). */
export function somarMesesClampado(dataIso: string, meses: number): string {
  const [anoStr, mesStr, diaStr] = dataIso.split("-");
  const ano = Number(anoStr);
  const mesIndice0 = Number(mesStr) - 1;
  const dia = Number(diaStr);

  const totalMeses = mesIndice0 + meses;
  const novoAno = ano + Math.floor(totalMeses / 12);
  const novoMesIndice0 = ((totalMeses % 12) + 12) % 12;
  const novoDia = Math.min(dia, ultimoDiaDoMes(novoAno, novoMesIndice0));

  return `${String(novoAno).padStart(4, "0")}-${String(novoMesIndice0 + 1).padStart(2, "0")}-${String(novoDia).padStart(2, "0")}`;
}
