import { getAcessoAtual } from "@/lib/acesso";
import { carregarFichaTecnicaParaExibir } from "@/lib/banco/fichas-tecnicas";
import { FichaTecnicaDetalhe } from "@/components/ficha-tecnica-detalhe";

export const dynamic = "force-dynamic";

export default async function FichaTecnicaPage({ params }: { params: Promise<{ id: string }> }) {
  const acesso = await getAcessoAtual();
  const { id } = await params;
  const podeGerir = acesso.role !== "operacional";

  const dados = await carregarFichaTecnicaParaExibir(acesso.unidadeId, id, podeGerir);

  if (!dados) {
    return (
      <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-sm text-cinza-medio">
        Ficha técnica não encontrada - pode já ter sido removida, ou o link está errado.
      </div>
    );
  }

  return (
    <FichaTecnicaDetalhe
      ficha={dados.ficha}
      podeGerir={podeGerir}
      categorias={dados.categorias}
      produtos={dados.produtos}
      fichasDisponiveis={dados.fichasDisponiveis}
    />
  );
}
