"use client";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Aviso de divergência do Consolidado de Vendas - reaproveita o mesmo
 * visual de overlay/card dos outros modais do app (ver
 * `novo-fornecedor-modal.tsx`, `guarda-edicao.tsx`). */
export function AvisoDivergenciaModal({
  totais,
  pending,
  onVoltar,
  onSalvarMesmoAssim,
}: {
  totais: { totalFormasPagamento: number; totalCanais: number; diferenca: number };
  pending: boolean;
  onVoltar: () => void;
  onSalvarMesmoAssim: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-azul-noite/70 p-4">
      <div className="w-full max-w-sm rounded-xl bg-branco p-5 shadow-xl">
        <h2 className="font-display text-lg font-bold text-vermelho">
          Os valores informados não estão batendo
        </h2>
        <div className="mt-3 flex flex-col gap-1.5 text-sm text-cinza">
          <div className="flex justify-between">
            <span>Total das formas de pagamento</span>
            <span className="font-semibold">{brl(totais.totalFormasPagamento)}</span>
          </div>
          <div className="flex justify-between">
            <span>Total dos canais de venda</span>
            <span className="font-semibold">{brl(totais.totalCanais)}</span>
          </div>
          <div className="flex justify-between border-t border-cinza-claro pt-1.5">
            <span className="font-semibold text-vermelho">Diferença</span>
            <span className="font-bold text-vermelho">{brl(totais.diferenca)}</span>
          </div>
        </div>
        <p className="mt-3 text-sm text-cinza-medio">Confira os valores antes de continuar.</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onVoltar}
            disabled={pending}
            className="flex-1 rounded-md border border-cinza-claro px-3 py-2.5 text-sm font-semibold text-cinza-medio hover:bg-off-white disabled:opacity-50"
          >
            Voltar e corrigir
          </button>
          <button
            type="button"
            onClick={onSalvarMesmoAssim}
            disabled={pending}
            className="flex-1 rounded-md bg-vermelho px-3 py-2.5 text-sm font-bold text-branco hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Salvando..." : "Salvar mesmo assim"}
          </button>
        </div>
      </div>
    </div>
  );
}
