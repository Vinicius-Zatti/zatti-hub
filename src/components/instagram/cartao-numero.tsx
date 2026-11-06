import { DicaCalculo } from "@/components/dica-calculo";
import { SEM_DADO, type Variacao } from "@/lib/instagram/painel";

/** Cartão de número do painel do Instagram, no desenho do `Indicador` da
 * Operação, aceitando texto ("sem dado") e a variação contra o período anterior. */
export function CartaoNumero({ rotulo, valor, dica, variacao }: { rotulo: string; valor: string; dica: string; variacao?: Variacao }) {
  return (
    <div className="rounded-xl border border-cinza-claro bg-branco p-3">
      <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-cinza-medio">
        {rotulo}
        <DicaCalculo rotulo={rotulo} texto={dica} />
      </p>
      <p className={`font-display font-bold ${valor === SEM_DADO ? "text-base text-cinza-medio" : "text-2xl text-azul-noite"}`}>{valor}</p>
      {variacao && (
        <p className={`text-xs font-semibold ${variacao.sobe ? "text-verde" : "text-vermelho"}`}>
          {variacao.sobe ? "▲" : "▼"} {variacao.texto} <span className="font-normal text-cinza-medio">vs. período anterior</span>
        </p>
      )}
    </div>
  );
}
