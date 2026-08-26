import { somarValores } from "./parcelas";
import type { SaidaSemReceita, TipoSaidaSemReceita } from "./tipos";

/** Soma o valor de todas as ocorrências de um tipo de Saída sem Receita -
 * dado exclusivamente gerencial. Nem `calcularDre` nem `montarDreAnual`
 * aceitam `SaidaSemReceita` como parâmetro - estruturalmente não tem como
 * este valor mudar CMV, Receita ou qualquer linha da DRE (ver
 * `saidas-sem-receita.test.ts`, que prova isso rodando a mesma DRE com dados
 * de saída completamente diferentes). */
export function somarSaidaSemReceitaPorTipo(saidas: SaidaSemReceita[], tipo: TipoSaidaSemReceita): number {
  const valores = saidas.filter((s) => s.tipo === tipo).map((s) => s.valor);
  return somarValores(valores);
}
