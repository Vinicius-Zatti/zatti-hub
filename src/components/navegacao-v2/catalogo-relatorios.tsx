"use client";

import { useState } from "react";
import { BlocosModulo } from "@/components/navegacao-v2/blocos-modulo";
import { IconeNavegacao } from "@/components/icones-navegacao";
import { agruparPorArea, buscarPorNome, type EntradaRelatorio } from "@/lib/navegacao/catalogos";

/** Catálogo de Relatórios (piloto): busca pelo nome no topo e os relatórios
 * agrupados por área. A lista já chega filtrada por papel e flags. */
export function CatalogoRelatorios({ relatorios }: { relatorios: EntradaRelatorio[] }) {
  const [busca, setBusca] = useState("");
  const grupos = agruparPorArea(buscarPorNome(relatorios, busca));

  return (
    <div className="flex flex-col gap-5">
      <div className="relative max-w-md">
        <IconeNavegacao
          nome="buscar"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cinza-medio"
        />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setBusca("")}
          placeholder="Buscar relatório pelo nome"
          aria-label="Buscar relatório pelo nome"
          autoComplete="off"
          spellCheck={false}
          className="min-h-11 w-full rounded-lg border border-cinza-claro bg-branco py-2 pl-9 pr-3 text-base text-azul-noite placeholder:text-cinza-medio focus:border-ambar focus:outline-none focus-visible:ring-1 focus-visible:ring-ambar lg:min-h-10 lg:text-sm"
        />
      </div>

      {grupos.length === 0 && <p className="text-sm text-cinza-medio">Nenhum relatório com esse nome.</p>}

      {grupos.map((grupo) => (
        <section key={grupo.area} className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-cinza-medio">{grupo.area}</h2>
          <BlocosModulo blocos={grupo.itens} rotulo={`Relatórios de ${grupo.area}`} />
        </section>
      ))}
    </div>
  );
}
