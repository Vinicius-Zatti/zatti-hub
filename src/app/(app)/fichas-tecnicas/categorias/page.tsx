import { requireGestaoFichasTecnicas } from "@/lib/acesso";
import { contarFichasPorCategoria, listarCategoriasFicha } from "@/lib/banco/fichas-tecnicas";
import { CategoriasFichaGerenciador } from "@/components/categorias-ficha-gerenciador";

export const dynamic = "force-dynamic";

export default async function CategoriasFichaPage() {
  const acesso = await requireGestaoFichasTecnicas();
  const [categorias, fichasPorCategoria] = await Promise.all([
    listarCategoriasFicha(acesso.unidadeId),
    contarFichasPorCategoria(acesso.unidadeId),
  ]);
  return <CategoriasFichaGerenciador categorias={categorias} fichasPorCategoria={fichasPorCategoria} />;
}
