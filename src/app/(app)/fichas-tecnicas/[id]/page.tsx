import { getAcessoAtual } from "@/lib/acesso";
import { carregarFichaTecnicaParaExibir, getConfiguracaoFinanceira } from "@/lib/banco/fichas-tecnicas";
import { calcularMargemContribuicao } from "@/lib/fichas-tecnicas";
import { FichaTecnicaDetalhe } from "@/components/ficha-tecnica-detalhe";

export const dynamic = "force-dynamic";

export default async function FichaTecnicaPage({ params }: { params: Promise<{ id: string }> }) {
  const acesso = await getAcessoAtual();
  const { id } = await params;
  const podeGerir = acesso.role !== "operacional";

  const [dados, configuracao] = await Promise.all([
    carregarFichaTecnicaParaExibir(acesso.unidadeId, id, podeGerir),
    podeGerir ? getConfiguracaoFinanceira(acesso.unidadeId) : Promise.resolve(null),
  ]);

  if (!dados) {
    return (
      <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-sm text-cinza-medio">
        Ficha técnica não encontrada - pode já ter sido removida, ou o link está errado.
      </div>
    );
  }

  const margem = configuracao ? calcularMargemContribuicao(configuracao) : null;

  return (
    <FichaTecnicaDetalhe
      ficha={dados.ficha}
      podeGerir={podeGerir}
      categorias={dados.categorias}
      produtos={dados.produtos}
      fichasDisponiveis={dados.fichasDisponiveis}
      margemNecessaria={margem?.margemNecessaria ?? null}
      margemPontoEquilibrio={margem?.margemPontoEquilibrio ?? null}
      deducoesSalao={margem?.deducoesTotal ?? 0}
      deducoesIfood={(configuracao?.comissaoIfood ?? 0) + (configuracao?.aliquotaImposto ?? 0)}
      deducoes99Food={(configuracao?.comissao99Food ?? 0) + (configuracao?.aliquotaImposto ?? 0)}
    />
  );
}
