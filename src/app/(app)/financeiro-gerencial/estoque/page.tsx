import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarEstoqueMensal } from "@/lib/banco/financeiro-gerencial";
import { EstoqueMensalGerenciador } from "@/components/financeiro-gerencial/estoque-mensal-gerenciador";

export const dynamic = "force-dynamic";

export default async function EstoqueMensalPage() {
  const acesso = await requireFinanceiroGerencial();
  const estoques = await listarEstoqueMensal(acesso.unidadeId);

  return <EstoqueMensalGerenciador estoques={estoques} podeGerir={acesso.role !== "operacional"} />;
}
