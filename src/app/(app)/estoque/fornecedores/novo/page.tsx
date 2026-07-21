import { NovoFornecedorForm } from "@/components/novo-fornecedor-form";

export default function NovoFornecedorPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display text-2xl font-bold text-azul-noite">Novo fornecedor</h1>
      <p className="mt-1 text-xs text-cinza-medio">
        O código é gerado automaticamente. Nome Fantasia, Vendedor e WhatsApp são obrigatórios.
      </p>
      <NovoFornecedorForm />
    </div>
  );
}
