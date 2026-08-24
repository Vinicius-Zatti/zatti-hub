import { requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias } from "@/lib/banco/financeiro-gerencial";
import { CategoriasFinanceirasGerenciador } from "@/components/financeiro-gerencial/categorias-financeiras-gerenciador";

export const dynamic = "force-dynamic";

export default async function CategoriasFinanceirasPage() {
  const acesso = await requireGestaoFinanceiroGerencial();
  const categorias = await listarCategorias(acesso.unidadeId);
  return <CategoriasFinanceirasGerenciador categorias={categorias} />;
}
