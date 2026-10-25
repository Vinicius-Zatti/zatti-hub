import { redirecionarSemEdicao, requireFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias, listarContasFinanceiras } from "@/lib/banco/financeiro-gerencial";
import { lerConfigCaixa, listarDestinatariosAlerta, listarEntradas } from "@/lib/banco/caixa-entrada";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { CaixaEntrada } from "@/components/financeiro-gerencial/caixa-entrada";

export const dynamic = "force-dynamic";
// O envio lê os documentos depois da resposta (`after`); as Server Actions desta página herdam este limite.
export const maxDuration = 300;

// Lançar e anexar é liberado pro Operacional; a seção Configurar é só Gestão/master
// (as actions de configuração usam `requireGestaoFinanceiroGerencial`, que aceita os dois).
export default async function CaixaEntradaPage() {
  const acesso = await requireFinanceiroGerencial();
  redirecionarSemEdicao(acesso, "/financeiro-gerencial/caixa-entrada");
  const podeGestao = acesso.role === "gestao" || acesso.role === "master";
  const [pendentes, tratadas, categorias, contas, config, alertas] = await Promise.all([
    listarEntradas(acesso.unidadeId, "pendentes"),
    listarEntradas(acesso.unidadeId, "tratadas"),
    listarCategorias(acesso.unidadeId),
    listarContasFinanceiras(acesso.unidadeId, true),
    podeGestao ? lerConfigCaixa(acesso.unidadeId) : Promise.resolve(null),
    podeGestao ? listarDestinatariosAlerta(acesso.unidadeId) : Promise.resolve(null),
  ]);

  return (
    <CaixaEntrada
      pendentes={pendentes}
      tratadas={tratadas}
      categorias={categorias}
      contas={contas}
      hoje={hojeIsoBrasil()}
      config={config}
      alertas={alertas}
    />
  );
}
