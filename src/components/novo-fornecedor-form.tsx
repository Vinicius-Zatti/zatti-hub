"use client";

import { criarFornecedorAction } from "@/app/(app)/estoque/fornecedores/actions";

export function NovoFornecedorForm() {
  return (
    <form action={criarFornecedorAction} className="mt-4 flex flex-col gap-3">
      <Campo label="Nome Fantasia *" name="nomeFantasia" required />
      <Campo label="Nome do Vendedor *" name="nomeVendedor" required />
      <Campo label="WhatsApp *" name="whatsapp" required placeholder="Ex: 11999999999" />
      <Campo label="Razão Social" name="razaoSocial" />
      <Campo label="Condições de Pagamento" name="condicoesPagamento" placeholder="Ex: Boleto Bancário" />
      <Campo label="Prazo do Boleto (dias)" name="prazoBoleto" />
      <Campo label="Limite de Crédito" name="limiteCredito" type="number" step="0.01" />
      <Campo label="Pedido Mínimo" name="pedidoMinimo" type="number" step="0.01" />
      <Campo label="Dias de Entrega" name="diasEntrega" placeholder="Ex: terça e quinta" />
      <div>
        <label className="text-xs font-semibold text-cinza-medio">Observações</label>
        <textarea
          name="observacoes"
          rows={2}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        className="mt-2 rounded-md bg-azul-noite px-4 py-2.5 text-sm font-semibold text-branco hover:bg-azul-petroleo"
      >
        Salvar fornecedor
      </button>
    </form>
  );
}

function Campo({
  label,
  name,
  ...rest
}: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-xs font-semibold text-cinza-medio">{label}</label>
      <input
        name={name}
        {...rest}
        className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none"
      />
    </div>
  );
}
