"use client";

import { baixarArquivo } from "@/lib/baixar-arquivo";
import { gerarCsv, type RespostaPainel } from "@/lib/avaliacoes/painel";

/** Baixa as avaliações do filtro atual em CSV (abre no Excel). */
export function ExportarCsv({ respostas, nomeArquivo }: { respostas: RespostaPainel[]; nomeArquivo: string }) {
  return (
    <button
      type="button"
      disabled={respostas.length === 0}
      onClick={() => baixarArquivo(new Blob([gerarCsv(respostas)], { type: "text/csv;charset=utf-8" }), nomeArquivo)}
      className="rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10 disabled:opacity-40"
    >
      {respostas.length === 0 ? "Nada para exportar" : `Baixar ${respostas.length} ${respostas.length === 1 ? "avaliação" : "avaliações"} em CSV`}
    </button>
  );
}
