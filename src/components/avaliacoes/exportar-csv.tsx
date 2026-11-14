"use client";

import { baixarArquivo } from "@/lib/baixar-arquivo";
import { gerarCsv, type RespostaPainel } from "@/lib/avaliacoes/painel";
import type { PerguntaConfig } from "@/lib/avaliacoes/perguntas";

/** Baixa as avaliações do filtro atual em CSV (abre no Excel), com uma coluna por pergunta da gestão. */
export function ExportarCsv({ respostas, livres, nomeArquivo }: { respostas: RespostaPainel[]; livres: PerguntaConfig[]; nomeArquivo: string }) {
  return (
    <button
      type="button"
      disabled={respostas.length === 0}
      onClick={() => baixarArquivo(new Blob([gerarCsv(respostas, livres)], { type: "text/csv;charset=utf-8" }), nomeArquivo)}
      className="rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10 disabled:opacity-40"
    >
      {respostas.length === 0 ? "Nada para exportar" : `Baixar ${respostas.length} ${respostas.length === 1 ? "avaliação" : "avaliações"} em CSV`}
    </button>
  );
}
