import { getAcessoAtual } from "@/lib/acesso";
import {
  getFichaTecnicaCompleta,
  listarCategoriasFicha,
  listarFichasTecnicas,
  listarProdutosParaFicha,
} from "@/lib/banco/fichas-tecnicas";
import { FichaTecnicaDetalhe } from "@/components/ficha-tecnica-detalhe";

export const dynamic = "force-dynamic";

export default async function FichaTecnicaPage({ params }: { params: Promise<{ id: string }> }) {
  const acesso = await getAcessoAtual();
  const { id } = await params;
  const podeGerir = acesso.role !== "operacional";

  const [ficha, categorias, produtos, fichas] = await Promise.all([
    getFichaTecnicaCompleta(acesso.unidadeId, id),
    podeGerir ? listarCategoriasFicha(acesso.unidadeId) : Promise.resolve([]),
    podeGerir ? listarProdutosParaFicha(acesso.unidadeId) : Promise.resolve([]),
    podeGerir ? listarFichasTecnicas(acesso.unidadeId) : Promise.resolve([]),
  ]);

  if (!ficha) {
    return (
      <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-sm text-cinza-medio">
        Ficha técnica não encontrada - pode já ter sido removida, ou o link está errado.
      </div>
    );
  }

  return (
    <FichaTecnicaDetalhe
      ficha={ficha}
      podeGerir={podeGerir}
      categorias={categorias}
      produtos={produtos}
      fichasDisponiveis={fichas.map((f) => ({
        id: f.id,
        nome: f.nome,
        sku: f.sku,
        rendimentoUnidade: f.rendimentoUnidade,
        custoPorUnidade: f.custo.custoPorUnidade,
      }))}
    />
  );
}
