"use client";

import { useMemo, useState } from "react";
import type { Fornecedor } from "@/lib/types";
import { GRUPO_OPCOES, nomeGrupo } from "@/lib/grupos";
import { Th } from "@/components/tabela";

export function TabelaFornecedores({ fornecedores }: { fornecedores: Fornecedor[] }) {
  const [filtroGrupos, setFiltroGrupos] = useState<string[]>([]);

  function alternarGrupo(codigo: string) {
    setFiltroGrupos((g) => (g.includes(codigo) ? g.filter((c) => c !== codigo) : [...g, codigo]));
  }

  const filtrados = useMemo(() => {
    if (filtroGrupos.length === 0) return fornecedores;
    return fornecedores.filter((f) => filtroGrupos.some((g) => f.grupos.includes(g)));
  }, [fornecedores, filtroGrupos]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setFiltroGrupos([])}
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            filtroGrupos.length === 0
              ? "border-azul-noite bg-azul-noite text-branco"
              : "border-cinza-claro text-cinza-medio hover:border-azul-noite"
          }`}
        >
          Todos
        </button>
        {GRUPO_OPCOES.map((g) => (
          <button
            key={g.codigo}
            type="button"
            onClick={() => alternarGrupo(g.codigo)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              filtroGrupos.includes(g.codigo)
                ? "border-ambar bg-ambar/10 text-ambar"
                : "border-cinza-claro text-cinza-medio hover:border-ambar"
            }`}
          >
            {g.descricao}
          </button>
        ))}
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-cinza-claro bg-branco">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>Nome Fantasia</Th>
              <Th>Grupos</Th>
              <Th>Vendedor</Th>
              <Th>WhatsApp</Th>
              <Th>Dias de Entrega</Th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((f, i) => (
              <tr
                key={f.codigo || f.nomeFantasia || i}
                className={`border-t border-cinza-claro ${i % 2 === 1 ? "bg-off-white/60" : ""}`}
              >
                <td className="px-3 py-2 font-medium text-cinza">{f.nomeFantasia || f.razaoSocial}</td>
                <td className="px-3 py-2 text-xs text-cinza-medio">
                  {f.grupos.length > 0 ? f.grupos.map(nomeGrupo).join(", ") : "—"}
                </td>
                <td className="px-3 py-2">{f.nomeVendedor || "—"}</td>
                <td className="px-3 py-2">{f.whatsapp || "—"}</td>
                <td className="px-3 py-2">{f.diasEntrega || "—"}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-cinza-medio">
                  Nenhum fornecedor encontrado com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
