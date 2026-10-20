import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias, listarContasFinanceiras, listarEstoqueMensal } from "@/lib/banco/financeiro-gerencial";
import { carregarBaseFinanceira, listarParametrosProvisao, listarReversoesProvisao } from "@/lib/banco/financeiro-gerencial-v1";
import { caminhoCategoria } from "@/lib/financeiro-gerencial/categorias";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { calcularDre } from "@/lib/financeiro-gerencial/dre";
import { calcularProvisoes, saldoProvisaoAte, TIPOS_PROVISAO, valoresDreProvisao } from "@/lib/financeiro-gerencial/provisoes";
import { montarVisaoGeral } from "@/lib/financeiro-gerencial/visao-geral";
import { listarMetasUnidade } from "@/lib/banco/financeiro-metas";
import { metaVigente } from "@/lib/financeiro-gerencial/painel-mega";
import { mesUsaPercentualCmv } from "@/lib/financeiro-gerencial/dre-anual";
import { somarValores } from "@/lib/financeiro-gerencial/parcelas";
import { VisaoGeralVisualizacao } from "@/components/financeiro-gerencial/visao-geral-visualizacao";

export const dynamic = "force-dynamic";

export default async function VisaoGeralPage() {
  const acesso = await requireFinanceiroGerencial();
  const hoje = hojeIsoBrasil();
  const competencia = hoje.slice(0, 7);
  const [anoAtual, mesAtual] = competencia.split("-").map(Number);
  const competenciaAnterior = mesAtual === 1 ? `${anoAtual - 1}-12` : `${anoAtual}-${String(mesAtual - 1).padStart(2, "0")}`;
  const competenciaSeguinte = mesAtual === 12 ? `${anoAtual + 1}-01` : `${anoAtual}-${String(mesAtual + 1).padStart(2, "0")}`;

  const [{ lancamentos, baixas }, categorias, contas, estoques, parametros, reversoes, metas] = await Promise.all([
    carregarBaseFinanceira(acesso.unidadeId),
    listarCategorias(acesso.unidadeId),
    listarContasFinanceiras(acesso.unidadeId),
    listarEstoqueMensal(acesso.unidadeId),
    listarParametrosProvisao(acesso.unidadeId),
    listarReversoesProvisao(acesso.unidadeId),
    listarMetasUnidade(acesso.unidadeId),
  ]);

  const visao = montarVisaoGeral({ hoje, lancamentos, baixas, contas });
  const provisoes = calcularProvisoes({ lancamentos, categorias, parametros, reversoes, ateCompetencia: competencia });
  const estoqueDoMes = estoques.find((e) => e.competencia.startsWith(competencia)) ?? null;
  const dre = calcularDre({
    competencia,
    lancamentos,
    categorias,
    estoqueMensal: estoqueDoMes,
    // Estoque final do mês anterior vira o inicial quando o do mês não foi informado.
    estoqueMesAnterior: estoques.find((e) => e.competencia.startsWith(competenciaAnterior)) ?? null,
    estoqueMesSeguinte: estoques.find((e) => e.competencia.startsWith(competenciaSeguinte)) ?? null,
    valoresProvisao: valoresDreProvisao(provisoes.get(competencia), categorias),
  });

  return (
    <VisaoGeralVisualizacao
      hoje={hoje}
      visao={{
        ...visao,
        proximosVencimentos: visao.proximosVencimentos.map((t) => ({ ...t, categoriaNome: caminhoCategoria(t.categoriaId, categorias) })),
      }}
      resumoDre={{
        faturamento: dre.receitas.total,
        cmv: dre.cmv.total,
        // % CMV só com o estoque final do mês e a Venda de Produtos (mesma regra da DRE).
        cmvPercentual: mesUsaPercentualCmv(dre.cmv.provisorio, estoqueDoMes?.receitaVendasProdutos)
          ? dre.cmv.total / (estoqueDoMes?.receitaVendasProdutos ?? 1)
          : null,
        resultado: dre.resultadoOperacional,
        meta: metaVigente(metas, competencia),
      }}
      saldoProvisoes={somarValores(TIPOS_PROVISAO.map((t) => saldoProvisaoAte(provisoes, t, competencia)))}
    />
  );
}
