import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias, listarContasFinanceiras, listarEstoqueMensal } from "@/lib/banco/financeiro-gerencial";
import { carregarBaseFinanceira, listarParametrosProvisao, listarReversoesProvisao } from "@/lib/banco/financeiro-gerencial-v1";
import { caminhoCategoria } from "@/lib/financeiro-gerencial/categorias";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { calcularDre } from "@/lib/financeiro-gerencial/dre";
import { calcularProvisoes, saldoProvisaoAte, TIPOS_PROVISAO, valoresDreProvisao } from "@/lib/financeiro-gerencial/provisoes";
import { montarVisaoGeral } from "@/lib/financeiro-gerencial/visao-geral";
import { somarValores } from "@/lib/financeiro-gerencial/parcelas";
import { VisaoGeralVisualizacao } from "@/components/financeiro-gerencial/visao-geral-visualizacao";

export const dynamic = "force-dynamic";

export default async function VisaoGeralPage() {
  const acesso = await requireFinanceiroGerencial();
  const hoje = hojeIsoBrasil();
  const competencia = hoje.slice(0, 7);

  const [{ lancamentos, baixas }, categorias, contas, estoques, parametros, reversoes] = await Promise.all([
    carregarBaseFinanceira(acesso.unidadeId),
    listarCategorias(acesso.unidadeId),
    listarContasFinanceiras(acesso.unidadeId),
    listarEstoqueMensal(acesso.unidadeId),
    listarParametrosProvisao(acesso.unidadeId),
    listarReversoesProvisao(acesso.unidadeId),
  ]);

  const visao = montarVisaoGeral({ hoje, lancamentos, baixas, contas });
  const provisoes = calcularProvisoes({ lancamentos, categorias, parametros, reversoes, ateCompetencia: competencia });
  const dre = calcularDre({
    competencia,
    lancamentos,
    categorias,
    estoqueMensal: estoques.find((e) => e.competencia.startsWith(competencia)) ?? null,
    valoresProvisao: valoresDreProvisao(provisoes.get(competencia), categorias),
  });

  return (
    <VisaoGeralVisualizacao
      hoje={hoje}
      visao={{
        ...visao,
        proximosVencimentos: visao.proximosVencimentos.map((t) => ({ ...t, categoriaNome: caminhoCategoria(t.categoriaId, categorias) })),
      }}
      resultadoLiquidoMes={dre.geracaoCaixaAposSaidas}
      receitaMes={dre.receitas.total}
      saldoProvisoes={somarValores(TIPOS_PROVISAO.map((t) => saldoProvisaoAte(provisoes, t, competencia)))}
    />
  );
}
