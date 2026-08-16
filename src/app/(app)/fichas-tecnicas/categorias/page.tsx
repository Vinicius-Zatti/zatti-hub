import { requireGestaoFichasTecnicas } from "@/lib/acesso";
import { listarCategoriasFicha } from "@/lib/banco/fichas-tecnicas";
import { CategoriasFichaGerenciador } from "@/components/categorias-ficha-gerenciador";

export const dynamic = "force-dynamic";

export default async function CategoriasFichaPage() {
  const acesso = await requireGestaoFichasTecnicas();
  const categorias = await listarCategoriasFicha(acesso.unidadeId);
  return <CategoriasFichaGerenciador categorias={categorias} />;
}
