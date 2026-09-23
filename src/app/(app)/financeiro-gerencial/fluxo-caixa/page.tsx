import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias, listarContasFinanceiras } from "@/lib/banco/financeiro-gerencial";
import { carregarBaseFinanceira } from "@/lib/banco/financeiro-gerencial-v1";
import { aberturasDasContas, montarMovimentosCaixa, type VisaoCaixa } from "@/lib/financeiro-gerencial/caixa";
import { calcularDivisorMedia } from "@/lib/financeiro-gerencial/dre-anual";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { montarFluxoDiario, montarFluxoMensal } from "@/lib/financeiro-gerencial/relatorios-caixa";
import { FluxoCaixaVisualizacao } from "@/components/financeiro-gerencial/fluxo-caixa-visualizacao";

export const dynamic = "force-dynamic";

export default async function FluxoCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; visao?: string; modo?: string; mes?: string; conta?: string }>;
}) {
  const acesso = await requireFinanceiroGerencial();
  const params = await searchParams;
  const hoje = hojeIsoBrasil();
  const ano = params.ano && /^\d{4}$/.test(params.ano) ? Number(params.ano) : Number(hoje.slice(0, 4));
  const visao: VisaoCaixa = params.visao === "realizado" ? "realizado" : "projetado";
  const modo = params.modo === "diario" ? "diario" : "mensal";
  const mesNumero = params.mes && /^(0?[1-9]|1[0-2])$/.test(params.mes) ? Number(params.mes) : Number(hoje.slice(5, 7));

  const [{ lancamentos, baixas }, categorias, contas] = await Promise.all([
    carregarBaseFinanceira(acesso.unidadeId),
    listarCategorias(acesso.unidadeId),
    listarContasFinanceiras(acesso.unidadeId),
  ]);
  // Conta vinda da URL só vale se for desta unidade (a lista já vem filtrada).
  const contaId = params.conta && contas.some((c) => c.id === params.conta) ? params.conta : null;

  const movimentos = montarMovimentosCaixa({ visao, lancamentos, baixas, contas, contaFinanceiraId: contaId });
  const aberturas = aberturasDasContas(contas, contaId);

  return (
    <FluxoCaixaVisualizacao
      ano={ano}
      visao={visao}
      modo={modo}
      mes={mesNumero}
      contaId={contaId}
      contas={contas.map((c) => ({ id: c.id, nome: c.nome }))}
      linhasMensais={modo === "mensal" ? montarFluxoMensal({ ano, movimentos, categorias, aberturas, divisorMedia: calcularDivisorMedia(ano) }) : []}
      diario={modo === "diario" ? montarFluxoDiario({ ano, mesIndice0: mesNumero - 1, movimentos, aberturas }) : null}
    />
  );
}
