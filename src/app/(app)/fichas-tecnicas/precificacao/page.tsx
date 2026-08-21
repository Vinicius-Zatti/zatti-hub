import { requireGestaoFichasTecnicas } from "@/lib/acesso";
import { getConfiguracaoFinanceira, listarFichasTecnicas } from "@/lib/banco/fichas-tecnicas";
import { calcularMargemContribuicao } from "@/lib/fichas-tecnicas";
import { TabelaPrecificacao } from "@/components/tabela-precificacao";

export const dynamic = "force-dynamic";

export default async function PrecificacaoPage() {
  const acesso = await requireGestaoFichasTecnicas();

  const [fichas, configuracao] = await Promise.all([
    listarFichasTecnicas(acesso.unidadeId, { camada: "VEN" }),
    getConfiguracaoFinanceira(acesso.unidadeId),
  ]);
  const margem = calcularMargemContribuicao(configuracao);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Tabela de Precificação</h1>
        <p className="text-sm text-cinza-medio">
          Preço praticado e preço sugerido de cada prato, Salão e nos 3 canais de delivery lado a
          lado - edita e salva sem precisar abrir a ficha.
        </p>
      </div>
      <TabelaPrecificacao
        fichas={fichas}
        margemNecessaria={margem.margemNecessaria}
        margemPontoEquilibrio={margem.margemPontoEquilibrio}
        deducoesSalao={margem.deducoesTotal}
        deducoesIfood={configuracao.comissaoIfood + configuracao.aliquotaImposto}
        deducoes99Food={configuracao.comissao99Food + configuracao.aliquotaImposto}
      />
    </div>
  );
}
