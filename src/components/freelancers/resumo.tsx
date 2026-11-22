"use client";

import { DicaCalculo } from "@/components/dica-calculo";
import { DICAS, formatarReais, type ResumoDia } from "@/lib/freelancers/regras";

/** Números do dia (ou do período) com o (i) de cada cálculo. */
export function ResumoFreelancers({ resumo, periodo }: { resumo: ResumoDia; periodo: "hoje" | "periodo" }) {
  const cartoes = [
    { rotulo: "Aguardando conferência", valor: String(resumo.pendentes), dica: DICAS.pendentes },
    { rotulo: "Conferidos", valor: String(resumo.conferidos), dica: DICAS.conferidos },
    { rotulo: periodo === "hoje" ? "Diárias de hoje" : "Diárias do período", valor: formatarReais(resumo.valorConferido), dica: DICAS.valorConferido },
    { rotulo: "Pago pelo caixa", valor: formatarReais(resumo.pagoNoCaixa), dica: DICAS.pagoNoCaixa },
    { rotulo: "A pagar", valor: formatarReais(resumo.aPagar), dica: DICAS.aPagar },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-tour="freela-resumo">
      {cartoes.map((c) => (
        <div key={c.rotulo} className="rounded-lg border border-cinza-claro bg-branco p-3">
          <p className="flex items-center gap-1 text-xs text-cinza-medio">
            {c.rotulo}
            <DicaCalculo rotulo={c.rotulo} texto={c.dica} />
          </p>
          <p className="mt-1 font-display text-xl font-bold text-azul-noite">{c.valor}</p>
        </div>
      ))}
    </div>
  );
}
