import { requireGestaoFichasTecnicas } from "@/lib/acesso";
import { listarCategoriasFicha, listarFichasTecnicas, listarProdutosParaFicha } from "@/lib/banco/fichas-tecnicas";
import { FichaTecnicaForm } from "@/components/ficha-tecnica-form";

export const dynamic = "force-dynamic";

export default async function NovaFichaTecnicaPage() {
  const acesso = await requireGestaoFichasTecnicas();
  const [categorias, produtos, fichas] = await Promise.all([
    listarCategoriasFicha(acesso.unidadeId),
    listarProdutosParaFicha(acesso.unidadeId),
    listarFichasTecnicas(acesso.unidadeId),
  ]);

  return (
    <FichaTecnicaForm
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
