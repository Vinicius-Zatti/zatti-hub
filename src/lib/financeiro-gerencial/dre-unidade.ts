import { calcularDre, lancamentosDaDre } from "./dre";
import { montarDreAnual, type DreAnual } from "./dre-anual";
import { calcularProvisoes, valoresDreProvisao } from "./provisoes";
import type { CategoriaFinanceira, EstoqueMensal, LancamentoBase, ParametrosProvisaoRegistro, ReversaoProvisao } from "./tipos";

/** "2026-01" -> "2026-02". */
function competenciaSeguinte(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

/** "2026-01" -> "2025-12" (estoque final do mês anterior vira o inicial). */
function competenciaAnterior(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
}

export type DreAnualDaUnidade = {
  dreAnual: DreAnual;
  /** Índice 0 = janeiro; null = mês sem linha em `fin_estoque_mensal`. */
  estoquesDoAno: (EstoqueMensal | null)[];
  receitaVendasProdutosPorMes: number[];
};

/** O cálculo da página da DRE, num lugar só (Fase 3, 13/10): a DRE e o Painel
 * M.E.G.A. chamam esta função, então o painel nunca mostra número diferente
 * da DRE do mesmo mês. Movida sem mudança de fórmula de `dre/page.tsx`.
 * `todosLancamentos` = carga completa da unidade (o saldo das provisões
 * depende do histórico inteiro); `estoques` = histórico inteiro também
 * (dezembro olha o janeiro seguinte). */
export function montarDreAnualDaUnidade(params: {
  ano: number;
  todosLancamentos: LancamentoBase[];
  categorias: CategoriaFinanceira[];
  estoques: EstoqueMensal[];
  parametros: ParametrosProvisaoRegistro[];
  reversoes: ReversaoProvisao[];
  hoje?: Date;
}): DreAnualDaUnidade {
  const { ano, todosLancamentos, categorias, estoques, parametros, reversoes, hoje = new Date() } = params;
  // Visão pela competência (nunca pelo pagamento); as provisões seguem a
  // mesma base da visão escolhida.
  const lancamentos = lancamentosDaDre(todosLancamentos);
  const provisoes = calcularProvisoes({ lancamentos, categorias, parametros, reversoes, ateCompetencia: `${ano}-12` });

  const estoquePorCompetencia = new Map(estoques.map((e) => [e.competencia.slice(0, 7), e]));
  const estoquesDoAno: (EstoqueMensal | null)[] = Array.from({ length: 12 }, (_, indice) => {
    const competencia = `${ano}-${String(indice + 1).padStart(2, "0")}`;
    return estoquePorCompetencia.get(competencia) ?? null;
  });
  const receitaVendasProdutosPorMes = estoquesDoAno.map((e) => e?.receitaVendasProdutos ?? 0);

  const dresPorMes = Array.from({ length: 12 }, (_, indice) => {
    const competencia = `${ano}-${String(indice + 1).padStart(2, "0")}`;
    return calcularDre({
      competencia,
      lancamentos,
      categorias,
      estoqueMensal: estoquePorCompetencia.get(competencia) ?? null,
      estoqueMesAnterior: estoquePorCompetencia.get(competenciaAnterior(competencia)) ?? null,
      // Dezembro olha janeiro do ano seguinte (a carga de estoque é o histórico inteiro da unidade).
      estoqueMesSeguinte: estoquePorCompetencia.get(competenciaSeguinte(competencia)) ?? null,
      valoresProvisao: valoresDreProvisao(provisoes.get(competencia), categorias),
    });
  });

  // Ano completo: meses futuros aparecem como previsão; Total e Média são
  // só dos meses realizados.
  const dreAnual = montarDreAnual(dresPorMes, ano, receitaVendasProdutosPorMes, hoje, { incluirMesesFuturos: true });
  return { dreAnual, estoquesDoAno, receitaVendasProdutosPorMes };
}
