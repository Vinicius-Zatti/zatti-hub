import { NovoLancamentoForm } from "@/components/novo-lancamento-form";
import { getAcessoAtual } from "@/lib/acesso";

export default async function NovoLancamentoPage() {
  // Só para separar o rascunho do navegador por unidade; quem pode salvar
  // continua decidido na action (`requireConsolidadoVendas`).
  const acesso = await getAcessoAtual();
  return <NovoLancamentoForm unidadeId={acesso.unidadeId} />;
}
