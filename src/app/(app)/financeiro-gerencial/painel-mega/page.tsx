import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias, listarContasFinanceiras, listarEstoqueMensal } from "@/lib/banco/financeiro-gerencial";
import { carregarBaseFinanceira, listarParametrosProvisao, listarReversoesProvisao } from "@/lib/banco/financeiro-gerencial-v1";
import { listarMetasUnidade } from "@/lib/banco/financeiro-metas";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { montarDreAnualDaUnidade } from "@/lib/financeiro-gerencial/dre-unidade";
import { caixaProjetadoEmDias, metaVigente, montarPainelMega } from "@/lib/financeiro-gerencial/painel-mega";
import { PainelMegaVisualizacao } from "@/components/financeiro-gerencial/painel-mega-visualizacao";

export const dynamic = "force-dynamic";

/** Painel M.E.G.A. (Financeiro V2, Fase 3, item 3): os números da DRE de um
 * mês, com farol só onde a gestão cadastrou meta. `?mes=AAAA-MM` (padrão: mês atual). */
export default async function PainelMegaPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const acesso = await requireFinanceiroGerencial();
  const { mes: mesParam } = await searchParams;
  const hoje = hojeIsoBrasil();
  const competencia = mesParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam) ? mesParam : hoje.slice(0, 7);
  const [ano, mes] = competencia.split("-").map(Number);
  const podeGerir = acesso.role !== "operacional";

  const [{ lancamentos: todosLancamentos, baixas }, categorias, contas, estoques, parametros, reversoes, metas] = await Promise.all([
    carregarBaseFinanceira(acesso.unidadeId),
    listarCategorias(acesso.unidadeId),
    listarContasFinanceiras(acesso.unidadeId),
    listarEstoqueMensal(acesso.unidadeId),
    listarParametrosProvisao(acesso.unidadeId),
    listarReversoesProvisao(acesso.unidadeId),
    listarMetasUnidade(acesso.unidadeId),
  ]);

  // Mesma função da página da DRE: o painel nunca mostra número diferente da DRE do mês.
  const { dreAnual, receitaVendasProdutosPorMes } = montarDreAnualDaUnidade({ ano, todosLancamentos, categorias, estoques, parametros, reversoes });
  const painel = montarPainelMega({
    dreAnual,
    mesIndice: mes - 1,
    receitaVendasProdutosPorMes,
    metas,
    caixaProjetado30Dias: caixaProjetadoEmDias({ hoje, dias: 30, lancamentos: todosLancamentos, baixas, contas }),
  });

  return (
    <PainelMegaVisualizacao
      painel={painel}
      metaDoMes={metaVigente(metas, competencia)}
      metas={metas}
      podeGerir={podeGerir}
    />
  );
}
