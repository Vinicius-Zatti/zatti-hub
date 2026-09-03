import { requireMeuTempo } from "@/lib/acesso";
import { listarFrentesTempo, listarMetasMensaisTempo, listarValoresHoraTempo } from "@/lib/banco/meu-tempo";
import { ConfiguracoesTempo } from "@/components/meu-tempo/configuracoes-tempo";

export const dynamic = "force-dynamic";

export default async function MeuTempoConfiguracoesPage() {
  const acesso = await requireMeuTempo();
  const [frentes, valoresHora, metasMensais] = await Promise.all([
    listarFrentesTempo(acesso.userId),
    listarValoresHoraTempo(acesso.userId),
    listarMetasMensaisTempo(acesso.userId),
  ]);

  return <ConfiguracoesTempo frentes={frentes} valoresHora={valoresHora} metasMensais={metasMensais} />;
}
