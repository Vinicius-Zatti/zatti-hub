import { requireMeuTempo } from "@/lib/acesso";
import { listarFrentesTempo, listarLancamentosTempo, obterLancamentoAtivoTempo } from "@/lib/banco/meu-tempo";
import { dataLocalBrasil } from "@/lib/meu-tempo/tempo";
import { CronometroHoje } from "@/components/meu-tempo/cronometro-hoje";

export const dynamic = "force-dynamic";

export default async function MeuTempoHojePage() {
  const acesso = await requireMeuTempo();
  const hoje = dataLocalBrasil(new Date());

  const [frentes, lancamentoAtivo, lancamentosHoje] = await Promise.all([
    listarFrentesTempo(acesso.userId, true),
    obterLancamentoAtivoTempo(acesso.userId),
    listarLancamentosTempo(acesso.userId, { de: hoje, ate: hoje }),
  ]);

  return <CronometroHoje frentes={frentes} lancamentoAtivo={lancamentoAtivo} lancamentosHoje={lancamentosHoje} />;
}
