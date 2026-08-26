import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias, listarEstoqueMensal, listarLancamentos } from "@/lib/banco/financeiro-gerencial";
import { calcularDre } from "@/lib/financeiro-gerencial/dre";
import { montarDreAnual } from "@/lib/financeiro-gerencial/dre-anual";
import { DreVisualizacao } from "@/components/financeiro-gerencial/dre-visualizacao";

export const dynamic = "force-dynamic";

export default async function DrePage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const acesso = await requireFinanceiroGerencial();
  const { ano: anoParam } = await searchParams;
  const ano = anoParam && /^\d{4}$/.test(anoParam) ? Number(anoParam) : new Date().getFullYear();

  const [lancamentos, categorias, estoques] = await Promise.all([
    listarLancamentos(acesso.unidadeId, { de: `${ano}-01-01`, ate: `${ano}-12-31` }),
    listarCategorias(acesso.unidadeId),
    listarEstoqueMensal(acesso.unidadeId),
  ]);

  const estoquePorCompetencia = new Map(estoques.map((e) => [e.competencia.slice(0, 7), e]));

  const dresPorMes = Array.from({ length: 12 }, (_, indice) => {
    const competencia = `${ano}-${String(indice + 1).padStart(2, "0")}`;
    return calcularDre({ competencia, lancamentos, categorias, estoqueMensal: estoquePorCompetencia.get(competencia) ?? null });
  });

  const dreAnual = montarDreAnual(dresPorMes, ano);

  return <DreVisualizacao dreAnual={dreAnual} ano={ano} />;
}
