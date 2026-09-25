import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias, listarEstoqueMensal, listarSaidasSemReceita } from "@/lib/banco/financeiro-gerencial";
import { carregarBaseFinanceira, listarParametrosProvisao, listarReversoesProvisao } from "@/lib/banco/financeiro-gerencial-v1";
import { calcularProvisoes, valoresDreProvisao } from "@/lib/financeiro-gerencial/provisoes";
import { calcularDre, lancamentosDaVisao } from "@/lib/financeiro-gerencial/dre";
import type { VisaoCaixa } from "@/lib/financeiro-gerencial/caixa";
import { montarDreAnual } from "@/lib/financeiro-gerencial/dre-anual";
import { DreVisualizacao } from "@/components/financeiro-gerencial/dre-visualizacao";
import type { EstoqueMensal } from "@/lib/financeiro-gerencial/tipos";

export const dynamic = "force-dynamic";

export default async function DrePage({ searchParams }: { searchParams: Promise<{ ano?: string; visao?: string }> }) {
  const acesso = await requireFinanceiroGerencial();
  const { ano: anoParam, visao: visaoParam } = await searchParams;
  const visao: VisaoCaixa = visaoParam === "realizado" ? "realizado" : "projetado";
  const ano = anoParam && /^\d{4}$/.test(anoParam) ? Number(anoParam) : new Date().getFullYear();
  const podeGerir = acesso.role !== "operacional";

  // Carga completa (não só o ano): o saldo das provisões depende do
  // histórico inteiro da unidade.
  const [{ lancamentos: todosLancamentos, baixas }, categorias, estoques, saidasSemReceita, parametros, reversoes] = await Promise.all([
    carregarBaseFinanceira(acesso.unidadeId),
    listarCategorias(acesso.unidadeId),
    listarEstoqueMensal(acesso.unidadeId),
    listarSaidasSemReceita(acesso.unidadeId),
    listarParametrosProvisao(acesso.unidadeId),
    listarReversoesProvisao(acesso.unidadeId),
  ]);
  // Realizado: provisões também calculadas só sobre a folha/FGTS/INSS já pagos.
  const lancamentos = lancamentosDaVisao(visao, todosLancamentos, baixas);
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
      valoresProvisao: valoresDreProvisao(provisoes.get(competencia), categorias),
    });
  });

  const dreAnual = montarDreAnual(dresPorMes, ano, receitaVendasProdutosPorMes);

  return (
    <DreVisualizacao
      dreAnual={dreAnual}
      ano={ano}
      visao={visao}
      estoquesDoAno={estoquesDoAno}
      saidasSemReceitaDoAno={saidasSemReceitaDoAno}
      podeGerir={podeGerir}
    />
  );
}
