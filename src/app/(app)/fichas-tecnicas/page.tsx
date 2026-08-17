import { getAcessoAtual } from "@/lib/acesso";
import { listarFichasTecnicas } from "@/lib/banco/fichas-tecnicas";
import { ListaFichasTecnicas } from "@/components/lista-fichas-tecnicas";

export const dynamic = "force-dynamic";

export default async function FichasTecnicasPage() {
  const acesso = await getAcessoAtual();
  const fichas = await listarFichasTecnicas(acesso.unidadeId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Fichas Técnicas</h1>
        <p className="text-sm text-cinza-medio">
          Piloto exclusivo - receitas de pré-preparo (uso interno) e itens vendáveis.
        </p>
      </div>
      <ListaFichasTecnicas fichas={fichas} podeGerir={acesso.role !== "operacional"} />
    </div>
  );
}
