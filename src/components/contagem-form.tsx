"use client";

import { useMemo, useState, useTransition } from "react";
import type { Produto } from "@/lib/types";
import {
  registrarContagemAction,
  type LinhaAvulsa,
} from "@/app/(app)/estoque/contagem/actions";

const PENDENTE_PREFIX = "PENDENTE-";

function skuAvulso(nome: string): string {
  const slug = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${PENDENTE_PREFIX}${slug}-${Date.now()}`;
}

export function ContagemForm({ produtos }: { produtos: Produto[] }) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [avulsos, setAvulsos] = useState<LinhaAvulsa[]>([]);
  const [novoNome, setNovoNome] = useState("");
  const [novaUnidade, setNovaUnidade] = useState("UN");
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

  const preenchidos =
    Object.values(valores).filter((v) => v.trim() !== "").length +
    avulsos.filter((a) => a.quantidade.trim() !== "").length;

  function adicionarAvulso() {
    const nome = novoNome.trim();
    if (nome === "") return;
    setAvulsos((prev) => [
      ...prev,
      { sku: skuAvulso(nome), nome, unidadeBase: novaUnidade.trim() || "UN", quantidade: "" },
    ]);
    setNovoNome("");
    setNovaUnidade("UN");
  }

  function removerAvulso(sku: string) {
    setAvulsos((prev) => prev.filter((a) => a.sku !== sku));
  }

  function handleSubmit() {
    const linhasCadastradas = Object.entries(valores)
      .filter(([, v]) => v.trim() !== "")
      .map(([sku, v]) => ({ sku, quantidade: Number(v.replace(",", ".")) }))
      .filter((l) => !Number.isNaN(l.quantidade));

    const linhasAvulsas = avulsos
      .filter((a) => a.quantidade.trim() !== "")
      .map((a) => ({
        sku: a.sku,
        quantidade: Number(a.quantidade.replace(",", ".")),
        nomeAvulso: a.nome,
        unidadeAvulso: a.unidadeBase,
      }))
      .filter((l) => !Number.isNaN(l.quantidade));

    const linhas = [...linhasCadastradas, ...linhasAvulsas];
    if (linhas.length === 0) return;

    startTransition(async () => {
      await registrarContagemAction(linhas);
      setValores({});
      setAvulsos([]);
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

      <div className="rounded-lg border border-dashed border-ambar/60 bg-ambar/5">
        <div className="border-b border-dashed border-ambar/60 px-3 py-2 text-xs font-bold uppercase tracking-wide text-ambar">
          Item avulso (fora do cadastro)
        </div>
        {avulsos.length > 0 && (
          <div className="divide-y divide-cinza-claro">
            {avulsos.map((a) => (
              <div key={a.sku} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-cinza">{a.nome}</div>
                  <div className="text-xs text-cinza-medio">{a.unidadeBase} · sem SKU ainda</div>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={a.quantidade}
                  onChange={(e) =>
                    setAvulsos((prev) =>
                      prev.map((x) =>
                        x.sku === a.sku ? { ...x, quantidade: e.target.value } : x
                      )
                    )
                  }
                  className="w-20 rounded-md border border-cinza-claro px-2 py-1.5 text-right text-sm tabular-nums focus:border-ambar focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removerAvulso(a.sku)}
                  className="text-xs font-medium text-vermelho hover:underline"
                >
                  remover
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <input
            type="text"
            placeholder="Nome do item que não tá no cadastro"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-cinza-claro px-2 py-1.5 text-sm focus:border-ambar focus:outline-none"
          />
          <input
            type="text"
            placeholder="UN"
            value={novaUnidade}
            onChange={(e) => setNovaUnidade(e.target.value)}
            className="w-16 rounded-md border border-cinza-claro px-2 py-1.5 text-sm focus:border-ambar focus:outline-none"
          />
          <button
            type="button"
            onClick={adicionarAvulso}
            className="rounded-md border border-ambar px-3 py-1.5 text-xs font-semibold text-ambar hover:bg-ambar/10"
          >
            + Adicionar
          </button>
        </div>
        <div className="px-3 pb-2.5 text-xs text-cinza-medio">
          Fica registrado como pendente até você criar o cadastro dele em Produtos.
        </div>
      </div>

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
