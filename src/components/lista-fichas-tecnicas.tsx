"use client";

import { useState } from "react";
import Link from "next/link";
import type { CamadaFicha, FichaTecnicaResumo, StatusFicha } from "@/lib/types";
import { agruparFichasPorCategoria, CAMADA_LABEL } from "@/lib/fichas-tecnicas";

const STATUS_TONE: Record<StatusFicha, string> = {
  ativa: "bg-verde/10 text-verde",
  rascunho: "bg-ambar/10 text-ambar",
  inativa: "bg-cinza-claro text-cinza-medio",
};

const STATUS_LABEL: Record<StatusFicha, string> = {
  ativa: "Ativa",
  rascunho: "Rascunho",
  inativa: "Inativa",
};

export function ListaFichasTecnicas({ fichas }: { fichas: FichaTecnicaResumo[] }) {
  const [camada, setCamada] = useState<CamadaFicha>("PRE");
  const daCamada = fichas.filter((f) => f.camada === camada);
  const grupos = agruparFichasPorCategoria(daCamada);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(["PRE", "VEN"] as CamadaFicha[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCamada(c)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              camada === c ? "bg-azul-noite text-branco" : "border border-cinza-claro text-cinza-medio"
            }`}
          >
            {CAMADA_LABEL[c]}
          </button>
        ))}
      </div>

      {grupos.length === 0 && (
        <p className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-sm text-cinza-medio">
          Nenhuma ficha cadastrada em {CAMADA_LABEL[camada]} ainda.
        </p>
      )}

      {grupos.map((grupo) => (
        <div key={grupo.categoriaId} className="flex flex-col gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">{grupo.categoriaNome}</div>
          <div className="flex flex-col gap-2">
            {grupo.fichas.map((ficha) => (
              <Link
                key={ficha.id}
                href={`/fichas-tecnicas/${ficha.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-cinza-claro bg-branco p-4"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-azul-noite">{ficha.nome}</div>
                  <div className="text-xs text-cinza-medio">
                    {ficha.sku} · Rende {ficha.rendimentoQuantidade} {ficha.rendimentoUnidade}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[ficha.status]}`}>
                  {STATUS_LABEL[ficha.status]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
