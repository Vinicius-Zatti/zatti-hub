import { getAcessoAtual } from "@/lib/acesso";
import { getConfiguracaoFinanceira, listarFichasTecnicas } from "@/lib/banco/fichas-tecnicas";
import { calcularMargemContribuicao } from "@/lib/fichas-tecnicas";
import { ListaFichasTecnicas } from "@/components/lista-fichas-tecnicas";

export const dynamic = "force-dynamic";

export default async function FichasTecnicasPage() {
  const acesso = await getAcessoAtual();
  const podeGerir = acesso.role !== "operacional";

  const [fichas, configuracao] = await Promise.all([
    listarFichasTecnicas(acesso.unidadeId),
    podeGerir ? getConfiguracaoFinanceira(acesso.unidadeId) : Promise.resolve(null),
  ]);
  const margem = configuracao ? calcularMargemContribuicao(configuracao) : null;
  const margemNecessaria = margem?.margemNecessaria ?? null;
  const margemPontoEquilibrio = margem?.margemPontoEquilibrio ?? null;
  const deducoesTotal = margem?.deducoesTotal ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Fichas Técnicas</h1>
        <p className="text-sm text-cinza-medio">
          Piloto exclusivo - receitas de pré-preparo (uso interno) e itens vendáveis.
        </p>
      </div>
      <ListaFichasTecnicas
        fichas={fichas}
        podeGerir={podeGerir}
        margemNecessaria={margemNecessaria}
        margemPontoEquilibrio={margemPontoEquilibrio}
        deducoesTotal={deducoesTotal}
      />
    </div>
  );
}
