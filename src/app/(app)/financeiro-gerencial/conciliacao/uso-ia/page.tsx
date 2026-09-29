import { requireMaster } from "@/lib/acesso";
import { listarUsoIa } from "@/lib/banco/conciliacao";
import { agruparPorSemana, segundaDaSemana } from "@/lib/conciliacao/uso-ia";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { UsoIaVisualizacao } from "@/components/financeiro-gerencial/uso-ia-visualizacao";

export const dynamic = "force-dynamic";

const SEMANAS = 8;

/** Custo da IA da Conciliação, por semana, para Vinícius (só master). */
export default async function UsoIaPage() {
  await requireMaster();
  const hoje = hojeIsoBrasil();
  const inicio = segundaDaSemana(hoje);
  const [a, m, d] = inicio.split("-").map(Number);
  // Margem de um dia para o fuso: a agregação por semana é feita em Brasília.
  const desde = new Date(Date.UTC(a, m - 1, d - 7 * (SEMANAS - 1) - 1)).toISOString();
  const chamadas = await listarUsoIa(desde);
  return <UsoIaVisualizacao semanas={agruparPorSemana(chamadas, hoje, SEMANAS)} />;
}
