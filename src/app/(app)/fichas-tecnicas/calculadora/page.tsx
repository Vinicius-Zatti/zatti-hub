import { requireGestaoFichasTecnicas } from "@/lib/acesso";
import { getConfiguracaoFinanceira } from "@/lib/banco/fichas-tecnicas";
import { CalculadoraMargemContribuicao } from "@/components/calculadora-margem-contribuicao";

export const dynamic = "force-dynamic";

export default async function CalculadoraMargemPage() {
  const acesso = await requireGestaoFichasTecnicas();
  const configuracao = await getConfiguracaoFinanceira(acesso.unidadeId);
  return <CalculadoraMargemContribuicao configuracaoInicial={configuracao} />;
}
