import { requireFinanceiroGerencial, temPermissao } from "@/lib/acesso";
import { listarCategorias, listarContasFinanceiras } from "@/lib/banco/financeiro-gerencial";
import { carregarBaseFinanceira, listarRecorrenciasResumo } from "@/lib/banco/financeiro-gerencial-v1";
import { listarContasLancaveis } from "@/lib/financeiro-gerencial/categorias";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { RecorrenciasVisualizacao } from "@/components/financeiro-gerencial/recorrencias-visualizacao";

export const dynamic = "force-dynamic";

// Criar recorrência continua no formulário de Receitas/Despesas; aqui é acompanhar, editar
// (24/11/2026: mesmo formulário de "Editar pagamento recorrente" das Despesas) e encerrar.
export default async function RecorrenciasPage() {
  const acesso = await requireFinanceiroGerencial();
  const [{ lancamentos, baixas }, categorias, contas] = await Promise.all([
    carregarBaseFinanceira(acesso.unidadeId),
    listarCategorias(acesso.unidadeId),
    listarContasFinanceiras(acesso.unidadeId, true),
  ]);
  const recorrencias = await listarRecorrenciasResumo(acesso.unidadeId, lancamentos, baixas);
  return (
    <RecorrenciasVisualizacao
      recorrencias={recorrencias}
      categoriasDespesa={categorias.filter((c) => c.papelDre !== "receita")}
      categoriasReceita={listarContasLancaveis(categorias).filter((c) => c.papelDre === "receita")}
      contas={contas}
      podeGerir={acesso.role !== "operacional" && temPermissao(acesso, "financeiro", "editar")}
      hoje={hojeIsoBrasil()}
    />
  );
}
