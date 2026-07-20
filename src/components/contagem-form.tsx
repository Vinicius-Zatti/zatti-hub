"use client";

import { useMemo, useState, useTransition } from "react";
import type { Produto } from "@/lib/types";
import { registrarContagemAction } from "@/app/(app)/estoque/contagem/actions";

export function ContagemForm({ produtos }: { produtos: Produto[] }) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [isPending, startTransition] = useTransition();

  const grupos = useMemo(() => {
    const filtrados = produtos.filter(
      (p) =>
        p.ativo &&
        (busca.trim() === "" ||
          p.nome.toLowerCase().includes(busca.toLowerCase()))
    );
    const porGrupo = new Map<string, Produto[]>();
    for (const p of filtrados) {
      if (!porGrupo.has(p.grupo)) porGrupo.set(p.grupo, []);
      porGrupo.get(p.grupo)!.push(p);
    }
    return Array.from(porGrupo.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [produtos, busca]);

  const preenchidos = Object.values(valores).filter((v) => v.trim() !== "").length;

  function handleSubmit() {
    const linhas = Object.entries(valores)
      .filter(([, v]) => v.trim() !== "")
      .map(([sku, v]) => ({ sku, quantidade: Number(v.replace(",", ".")) }))
      .filter((l) => !Number.isNaN(l.quantidade));

    if (linhas.length === 0) return;

    startTransition(async () => {
      await registrarContagemAction(linhas);
      setValores({});
      setEnviado(true);
      setTimeout(() => setEnviado(false), 4000);
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <input
        type="text"
        placeholder="Buscar item..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="rounded-md border border-cinza-claro bg-branco px-3 py-2 text-sm focus:border-ambar focus:outline-none"
      />

      {grupos.map(([grupo, itens]) => (
        <div key={grupo} className="rounded-lg border border-cinza-claro bg-branco">
          <div className="border-b border-cinza-claro bg-off-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-azul-petroleo">
            {grupo}
          </div>
          <div className="divide-y divide-cinza-claro">
            {itens.map((p) => (
              <div key={p.sku} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-cinza">{p.nome}</div>
                  <div className="text-xs text-cinza-medio">{p.unidadeBase}</div>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={valores[p.sku] ?? ""}
                  onChange={(e) =>
                    setValores((v) => ({ ...v, [p.sku]: e.target.value }))
                  }
                  className="w-20 rounded-md border border-cinza-claro px-2 py-1.5 text-right text-sm tabular-nums focus:border-ambar focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="fixed bottom-0 left-0 right-0 border-t border-cinza-claro bg-branco p-3">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-1">
          {enviado && (
            <span className="text-sm font-medium text-verde">Contagem registrada ✓</span>
          )}
          <button
            onClick={handleSubmit}
            disabled={preenchidos === 0 || isPending}
            className="ml-auto rounded-md bg-azul-noite px-5 py-2.5 text-sm font-semibold text-branco disabled:opacity-40"
          >
            {isPending
              ? "Registrando..."
              : `Registrar contagem (${preenchidos} ${preenchidos === 1 ? "item" : "itens"})`}
          </button>
        </div>
      </div>
    </div>
  );
}
