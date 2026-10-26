import { requireGestaoFichasTecnicas } from "@/lib/acesso";
import { getConfiguracaoFinanceira, listarFichasTecnicas, listarRascunhosPrecoFichas } from "@/lib/banco/fichas-tecnicas";
import { calcularMargemContribuicao } from "@/lib/fichas-tecnicas";
import { TabelaPrecificacao } from "@/components/tabela-precificacao";
import { RascunhosPrecoChef } from "@/components/rascunhos-preco-chef";

export const dynamic = "force-dynamic";

export default async function PrecificacaoPage() {
  const acesso = await requireGestaoFichasTecnicas();

  const [fichas, configuracao, rascunhosPorFicha] = await Promise.all([
    listarFichasTecnicas(acesso.unidadeId, { camada: "VEN" }),
    getConfiguracaoFinanceira(acesso.unidadeId),
    listarRascunhosPrecoFichas(acesso.unidadeId),
  ]);
  // Preço sugerido pelo chef (26/10/2026): a gestão aceita ou descarta antes da tabela.
  const rascunhos = fichas
    .filter((f) => rascunhosPorFicha.has(f.id))
    .map((f) => ({
      fichaId: f.id,
      nome: f.nome,
      sku: f.sku,
      precoAtual: f.precoVenda,
      rascunho: rascunhosPorFicha.get(f.id) ?? 0,
      custoPorUnidade: f.custo.custoPorUnidade,
    }));
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
      <RascunhosPrecoChef rascunhos={rascunhos} />
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
