import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias, listarContasFinanceiras, listarLancamentos } from "@/lib/banco/financeiro-gerencial";
import { listarContasLancaveis } from "@/lib/financeiro-gerencial/categorias";
import { LancamentosGerenciador } from "@/components/financeiro-gerencial/lancamentos-gerenciador";

export const dynamic = "force-dynamic";

export default async function LancamentosDespesasPage() {
  const acesso = await requireFinanceiroGerencial();
  const [lancamentos, categorias, contas] = await Promise.all([
    listarLancamentos(acesso.unidadeId, { tipo: "despesa" }),
    listarCategorias(acesso.unidadeId),
    listarContasFinanceiras(acesso.unidadeId, true),
  ]);
  const categoriasDespesa = listarContasLancaveis(categorias).filter((c) => c.papelDre !== "receita");

  return (
    <LancamentosGerenciador tipo="despesa" lancamentos={lancamentos} categorias={categoriasDespesa} contas={contas} />
  );
}
