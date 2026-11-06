import { NovoLancamentoForm } from "@/components/novo-lancamento-form";
import { getAcessoAtual, redirecionarSemEdicao } from "@/lib/acesso";
import { podeEscolherDataConsolidado } from "@/lib/consolidado-data";

export default async function NovoLancamentoPage() {
  // Só para separar o rascunho do navegador por unidade; quem pode salvar
  // continua decidido na action (`requireConsolidadoVendas`).
  const acesso = await getAcessoAtual();
  redirecionarSemEdicao(acesso, "/financeiro/consolidado/novo");
  return (
    <NovoLancamentoForm
      userId={acesso.userId}
      unidadeId={acesso.unidadeId}
      podeEscolherData={podeEscolherDataConsolidado(acesso.role)}
    />
  );
}
