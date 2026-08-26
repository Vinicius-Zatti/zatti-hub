import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias, listarLancamentos, obterEstoqueMensal } from "@/lib/banco/financeiro-gerencial";
import { calcularDre } from "@/lib/financeiro-gerencial/dre";
import { ultimoDiaDoMes } from "@/lib/financeiro-gerencial/datas";
import { DreVisualizacao } from "@/components/financeiro-gerencial/dre-visualizacao";

export const dynamic = "force-dynamic";

function competenciaAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

export default async function DrePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const acesso = await requireFinanceiroGerencial();
  const { mes } = await searchParams;
  const competencia = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : competenciaAtual();

  const [ano, mesNumero] = competencia.split("-").map(Number);
  const de = `${competencia}-01`;
  const ate = `${competencia}-${String(ultimoDiaDoMes(ano, mesNumero - 1)).padStart(2, "0")}`;

  const [lancamentos, categorias, estoqueMensal] = await Promise.all([
    listarLancamentos(acesso.unidadeId, { de, ate }),
    listarCategorias(acesso.unidadeId),
    obterEstoqueMensal(acesso.unidadeId, `${competencia}-01`),
  ]);

  const dre = calcularDre({ competencia, lancamentos, categorias, estoqueMensal });

  return <DreVisualizacao dre={dre} competencia={competencia} />;
}
