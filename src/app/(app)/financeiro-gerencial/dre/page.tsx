import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias, listarEstoqueMensal, listarLancamentos, listarSaidasSemReceita } from "@/lib/banco/financeiro-gerencial";
import { calcularDre } from "@/lib/financeiro-gerencial/dre";
import { montarDreAnual } from "@/lib/financeiro-gerencial/dre-anual";
import { DreVisualizacao } from "@/components/financeiro-gerencial/dre-visualizacao";
import type { EstoqueMensal } from "@/lib/financeiro-gerencial/tipos";

export const dynamic = "force-dynamic";

export default async function DrePage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const acesso = await requireFinanceiroGerencial();
  const { ano: anoParam } = await searchParams;
  const ano = anoParam && /^\d{4}$/.test(anoParam) ? Number(anoParam) : new Date().getFullYear();
  const podeGerir = acesso.role !== "operacional";

  const [lancamentos, categorias, estoques, saidasSemReceita] = await Promise.all([
    listarLancamentos(acesso.unidadeId, { de: `${ano}-01-01`, ate: `${ano}-12-31` }),
    listarCategorias(acesso.unidadeId),
    listarEstoqueMensal(acesso.unidadeId),
    listarSaidasSemReceita(acesso.unidadeId),
  ]);

  const estoquePorCompetencia = new Map(estoques.map((e) => [e.competencia.slice(0, 7), e]));
  const estoquesDoAno: (EstoqueMensal | null)[] = Array.from({ length: 12 }, (_, indice) => {
    const competencia = `${ano}-${String(indice + 1).padStart(2, "0")}`;
    return estoquePorCompetencia.get(competencia) ?? null;
  });
  const receitaVendasProdutosPorMes = estoquesDoAno.map((e) => e?.receitaVendasProdutos ?? 0);

  const saidasSemReceitaDoAno = saidasSemReceita.filter((s) => s.competencia.startsWith(`${ano}-`));

  const dresPorMes = Array.from({ length: 12 }, (_, indice) => {
    const competencia = `${ano}-${String(indice + 1).padStart(2, "0")}`;
    return calcularDre({ competencia, lancamentos, categorias, estoqueMensal: estoquePorCompetencia.get(competencia) ?? null });
  });

  const dreAnual = montarDreAnual(dresPorMes, ano, receitaVendasProdutosPorMes);

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
