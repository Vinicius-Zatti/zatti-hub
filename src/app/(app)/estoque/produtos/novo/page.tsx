import { NovoProdutoForm } from "@/components/novo-produto-form";

export default async function NovoProdutoPage({
  searchParams,
}: {
  searchParams: Promise<{ nome?: string; unidade?: string }>;
}) {
  const { nome, unidade } = await searchParams;
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display text-2xl font-bold text-azul-noite">Novo produto</h1>
      {nome && (
        <p className="mt-1 text-xs text-cinza-medio">
          Preenchido a partir de um item contado como avulso.
        </p>
      )}
      <NovoProdutoForm nomeInicial={nome} unidadeInicial={unidade} />
    </div>
  );
}
