import { requireGestaoFichasTecnicas } from "@/lib/acesso";
import {
  getFichaTecnicaCompleta,
  listarCategoriasFicha,
  listarFichasTecnicas,
  listarProdutosParaFicha,
} from "@/lib/banco/fichas-tecnicas";
import { FichaTecnicaForm } from "@/components/ficha-tecnica-form";

export const dynamic = "force-dynamic";

export default async function EditarFichaTecnicaPage({ params }: { params: Promise<{ id: string }> }) {
  const acesso = await requireGestaoFichasTecnicas();
  const { id } = await params;

  const [ficha, categorias, produtos, fichas] = await Promise.all([
    getFichaTecnicaCompleta(acesso.unidadeId, id),
    listarCategoriasFicha(acesso.unidadeId),
    listarProdutosParaFicha(acesso.unidadeId),
    listarFichasTecnicas(acesso.unidadeId),
  ]);

  if (!ficha) {
    return (
      <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-sm text-cinza-medio">
        Ficha técnica não encontrada - pode já ter sido removida, ou o link está errado.
      </div>
    );
  }

  return (
    <FichaTecnicaForm
      existente={ficha}
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
