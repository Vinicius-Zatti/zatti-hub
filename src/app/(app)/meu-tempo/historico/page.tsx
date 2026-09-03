import { requireMeuTempo } from "@/lib/acesso";
import { listarFrentesTempo, listarLancamentosTempo } from "@/lib/banco/meu-tempo";
import { HistoricoGerenciador } from "@/components/meu-tempo/historico-gerenciador";

export const dynamic = "force-dynamic";

export default async function MeuTempoHistoricoPage() {
  const acesso = await requireMeuTempo();
  const [lancamentos, frentes] = await Promise.all([
    listarLancamentosTempo(acesso.userId),
    listarFrentesTempo(acesso.userId),
  ]);

  return <HistoricoGerenciador lancamentos={lancamentos} frentes={frentes} />;
}
