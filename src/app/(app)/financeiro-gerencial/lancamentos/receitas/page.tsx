import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias, listarContasFinanceiras, listarLancamentos } from "@/lib/banco/financeiro-gerencial";
import { listarContasLancaveis } from "@/lib/financeiro-gerencial/categorias";
import { LancamentosGerenciador } from "@/components/financeiro-gerencial/lancamentos-gerenciador";

export const dynamic = "force-dynamic";

/** `?novo=1` (atalho "Nova receita" do Início e da busca do piloto) já abre o modal de criação. */
export default async function LancamentosReceitasPage({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
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
      // Cartão de crédito só recebe despesa (o banco recusa receita nele).
      contas={contas.filter((c) => c.tipo !== "cartao_credito")}
      podeGerir={acesso.role !== "operacional"}
      abrirNovo={(await searchParams).novo === "1"}
    />
  );
}
