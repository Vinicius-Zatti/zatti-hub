import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias, listarEstoqueMensal, listarSaidasSemReceita } from "@/lib/banco/financeiro-gerencial";
import { carregarBaseFinanceira, listarParametrosProvisao, listarReversoesProvisao } from "@/lib/banco/financeiro-gerencial-v1";
import { calcularProvisoes, valoresDreProvisao } from "@/lib/financeiro-gerencial/provisoes";
import { calcularDre, lancamentosDaDre } from "@/lib/financeiro-gerencial/dre";
import { montarDreAnual } from "@/lib/financeiro-gerencial/dre-anual";
import { DreVisualizacao } from "@/components/financeiro-gerencial/dre-visualizacao";
import type { EstoqueMensal } from "@/lib/financeiro-gerencial/tipos";

export const dynamic = "force-dynamic";

/** "2026-01" -> "2025-12" (estoque final do mês anterior vira o inicial). */
function competenciaAnterior(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
}

// `?visao=` (Realizada/Projetada/Completa) saiu em 25/09 - link antigo com ele
// continua abrindo, o parâmetro só é ignorado.
export default async function DrePage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const acesso = await requireFinanceiroGerencial();
  const { ano: anoParam } = await searchParams;
  const ano = anoParam && /^\d{4}$/.test(anoParam) ? Number(anoParam) : new Date().getFullYear();
  const podeGerir = acesso.role !== "operacional";

  // Carga completa (não só o ano): o saldo das provisões depende do
  // histórico inteiro da unidade.
  const [{ lancamentos: todosLancamentos }, categorias, estoques, saidasSemReceita, parametros, reversoes] = await Promise.all([
    carregarBaseFinanceira(acesso.unidadeId),
    listarCategorias(acesso.unidadeId),
    listarEstoqueMensal(acesso.unidadeId),
    listarSaidasSemReceita(acesso.unidadeId),
    listarParametrosProvisao(acesso.unidadeId),
    listarReversoesProvisao(acesso.unidadeId),
  ]);
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

  const saidasSemReceitaDoAno = saidasSemReceita.filter((s) => s.competencia.startsWith(`${ano}-`));

  const dresPorMes = Array.from({ length: 12 }, (_, indice) => {
    const competencia = `${ano}-${String(indice + 1).padStart(2, "0")}`;
    return calcularDre({
      competencia,
      lancamentos,
      categorias,
      estoqueMensal: estoquePorCompetencia.get(competencia) ?? null,
      estoqueMesAnterior: estoquePorCompetencia.get(competenciaAnterior(competencia)) ?? null,
      valoresProvisao: valoresDreProvisao(provisoes.get(competencia), categorias),
    });
  });

  // Ano completo: meses futuros aparecem como previsão; Total e Média são
  // só dos meses realizados.
  const dreAnual = montarDreAnual(dresPorMes, ano, receitaVendasProdutosPorMes, new Date(), { incluirMesesFuturos: true });

  return (
    <DreVisualizacao
      dreAnual={dreAnual}
      ano={ano}
      estoquesDoAno={estoquesDoAno}
      saidasSemReceitaDoAno={saidasSemReceitaDoAno}
      podeGerir={podeGerir}
    />
  );
}
