import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias, listarContasFinanceiras } from "@/lib/banco/financeiro-gerencial";
import { carregarBaseFinanceira, listarParametrosProvisao, listarReversoesProvisao } from "@/lib/banco/financeiro-gerencial-v1";
import { montarMovimentosCaixa, saldoInicialContas, type VisaoCaixa } from "@/lib/financeiro-gerencial/caixa";
import { calcularDivisorMedia } from "@/lib/financeiro-gerencial/dre-anual";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { calcularProvisoes } from "@/lib/financeiro-gerencial/provisoes";
import { montarConciliacaoProvisoes, montarDfcAnual } from "@/lib/financeiro-gerencial/relatorios-caixa";
import { DfcVisualizacao } from "@/components/financeiro-gerencial/dfc-visualizacao";

export const dynamic = "force-dynamic";

export default async function DfcPage({ searchParams }: { searchParams: Promise<{ ano?: string; visao?: string }> }) {
  const acesso = await requireFinanceiroGerencial();
  const params = await searchParams;
  const ano = params.ano && /^\d{4}$/.test(params.ano) ? Number(params.ano) : Number(hojeIsoBrasil().slice(0, 4));
  const visao: VisaoCaixa = params.visao === "realizado" ? "realizado" : "projetado";

  const [{ lancamentos, baixas }, categorias, contas, parametros, reversoes] = await Promise.all([
    carregarBaseFinanceira(acesso.unidadeId),
    listarCategorias(acesso.unidadeId),
    listarContasFinanceiras(acesso.unidadeId),
    listarParametrosProvisao(acesso.unidadeId),
    listarReversoesProvisao(acesso.unidadeId),
  ]);

  const divisorMedia = calcularDivisorMedia(ano);
  const movimentos = montarMovimentosCaixa({ visao, lancamentos, baixas });
  const linhas = montarDfcAnual({ ano, movimentos, categorias, saldoBase: saldoInicialContas(contas), divisorMedia });

  const provisoes = calcularProvisoes({ lancamentos, categorias, parametros, reversoes, ateCompetencia: `${ano}-12` });
  const conciliacao = montarConciliacaoProvisoes({
    ano,
    provisaoPorMes: (competencia) => provisoes.get(competencia)?.calculo.porTipo ?? null,
    divisorMedia,
  });

  return <DfcVisualizacao ano={ano} visao={visao} linhas={linhas} conciliacao={conciliacao} />;
}
