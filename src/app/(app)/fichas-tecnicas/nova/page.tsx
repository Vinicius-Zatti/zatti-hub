import { requireGestaoFichasTecnicas } from "@/lib/acesso";
import { listarCategoriasFicha, listarFichasTecnicas } from "@/lib/banco/fichas-tecnicas";
import { listarProdutosBanco } from "@/lib/banco/estoque";
import { FichaTecnicaForm } from "@/components/ficha-tecnica-form";

export const dynamic = "force-dynamic";

export default async function NovaFichaTecnicaPage() {
  const acesso = await requireGestaoFichasTecnicas();
  const [categorias, produtos, fichas] = await Promise.all([
    listarCategoriasFicha(acesso.unidadeId),
    listarProdutosBanco(acesso.unidadeId),
    listarFichasTecnicas(acesso.unidadeId),
  ]);

  return (
    <FichaTecnicaForm
      categorias={categorias}
      produtos={produtos.map((p) => ({ sku: p.sku, nome: p.nome, unidadeBase: p.unidadeBase, custoUnitario: p.precoUnitario }))}
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
