import { diferencaCaixa } from "@/lib/consolidado-diferenca";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Diferença do Consolidado de Vendas com sinal, cor e rótulo: "+R$ 50,00
 * Sobra" em verde ou "-R$ 233,00 Falta" em vermelho. Zero vira "—". Usado no
 * Histórico e no aviso de divergência - mesmo texto nos dois lugares. */
export function DiferencaCaixa({
  totalFormasPagamento,
  totalCanais,
  destaque = false,
}: {
  totalFormasPagamento: number;
  totalCanais: number;
  /** Fonte maior, para o aviso de divergência. */
  destaque?: boolean;
}) {
  const { valor, sentido } = diferencaCaixa(totalFormasPagamento, totalCanais);
  if (sentido === "zero") return <span className="text-cinza-medio">—</span>;
  const cor = sentido === "sobra" ? "text-verde" : "text-vermelho";
  const fundo = sentido === "sobra" ? "bg-verde/10" : "bg-vermelho/10";
  return (
    <span className={`inline-flex items-center justify-end gap-1.5 whitespace-nowrap ${cor}`}>
      <span className={`tabular-nums ${destaque ? "font-bold" : "font-semibold"}`}>
        {sentido === "sobra" ? "+" : "-"}
        {brl(Math.abs(valor))}
      </span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${fundo}`}>
        {sentido === "sobra" ? "Sobra" : "Falta"}
      </span>
    </span>
  );
}
