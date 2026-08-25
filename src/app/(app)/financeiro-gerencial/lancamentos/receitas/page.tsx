import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias, listarContasFinanceiras, listarLancamentos } from "@/lib/banco/financeiro-gerencial";
import { listarContasLancaveis } from "@/lib/financeiro-gerencial/categorias";
import { LancamentosGerenciador } from "@/components/financeiro-gerencial/lancamentos-gerenciador";

export const dynamic = "force-dynamic";

export default async function LancamentosReceitasPage() {
  const acesso = await requireFinanceiroGerencial();
  const [lancamentos, categorias, contas] = await Promise.all([
    listarLancamentos(acesso.unidadeId, { tipo: "receita" }),
    listarCategorias(acesso.unidadeId),
    listarContasFinanceiras(acesso.unidadeId, true),
  ]);
  const categoriasReceita = listarContasLancaveis(categorias).filter((c) => c.papelDre === "receita");

  return (
    <LancamentosGerenciador
      tipo="receita"
      lancamentos={lancamentos}
      categorias={categoriasReceita}
      contas={contas}
      podeGerir={acesso.role !== "operacional"}
    />
  );
}
