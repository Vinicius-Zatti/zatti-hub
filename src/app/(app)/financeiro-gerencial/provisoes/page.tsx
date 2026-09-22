import { requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias } from "@/lib/banco/financeiro-gerencial";
import { carregarBaseFinanceira, listarParametrosProvisao, listarReversoesProvisao } from "@/lib/banco/financeiro-gerencial-v1";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { calcularProvisoes, montarQuadroProvisoesAnual, parametrosVigentes, saldoProvisaoAte, TIPOS_PROVISAO } from "@/lib/financeiro-gerencial/provisoes";
import { ProvisoesVisualizacao } from "@/components/financeiro-gerencial/provisoes-visualizacao";

export const dynamic = "force-dynamic";

// Provisões são configuração (parâmetros, reversão) - Gestão/master, igual
// Plano de Contas e Contas financeiras.
export default async function ProvisoesPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const acesso = await requireGestaoFinanceiroGerencial();
  const { ano: anoParam } = await searchParams;
  const hoje = hojeIsoBrasil();
  const ano = anoParam && /^\d{4}$/.test(anoParam) ? Number(anoParam) : Number(hoje.slice(0, 4));
  const competenciaAtual = hoje.slice(0, 7);

  const [{ lancamentos }, categorias, parametros, reversoes] = await Promise.all([
    carregarBaseFinanceira(acesso.unidadeId),
    listarCategorias(acesso.unidadeId),
    listarParametrosProvisao(acesso.unidadeId),
    listarReversoesProvisao(acesso.unidadeId),
  ]);

  const ate = `${ano}-12` > competenciaAtual ? `${ano}-12` : competenciaAtual;
  const provisoes = calcularProvisoes({ lancamentos, categorias, parametros, reversoes, ateCompetencia: ate });
  const saldosAtuais = Object.fromEntries(TIPOS_PROVISAO.map((t) => [t, saldoProvisaoAte(provisoes, t, competenciaAtual)])) as Record<
    (typeof TIPOS_PROVISAO)[number],
    number
  >;

  return (
    <ProvisoesVisualizacao
      ano={ano}
      linhas={montarQuadroProvisoesAnual(ano, provisoes)}
      parametrosAtuais={parametrosVigentes(parametros, competenciaAtual)}
      historicoParametros={parametros}
      reversoes={reversoes}
      saldosAtuais={saldosAtuais}
      competenciaAtual={competenciaAtual}
    />
  );
}
