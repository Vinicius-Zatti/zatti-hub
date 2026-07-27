import { NovoFornecedorForm } from "@/components/novo-fornecedor-form";

export default async function NovoFornecedorPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display text-2xl font-bold text-azul-noite">Novo fornecedor</h1>
      <p className="mt-1 text-xs text-cinza-medio">
        O código é gerado automaticamente. Nome Fantasia, Vendedor e WhatsApp são obrigatórios.
      </p>
      {erro && (
        <p className="mt-3 rounded-md border border-vermelho/30 bg-vermelho/5 px-3 py-2 text-sm text-vermelho">
          {erro}
        </p>
      )}
      <NovoFornecedorForm />
    </div>
  );
}
