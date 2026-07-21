"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ItemInventario } from "@/lib/types";
import { Th } from "@/components/tabela";
import { atualizarQuantidadeContagemAction } from "@/app/(app)/estoque/contagem/actions";

const ABREV_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type StatusLinha = { tipo: "salvando" | "ok" | "erro"; msg?: string } | undefined;

function parseDataBR(data: string): number {
  const [d, m, a] = data.split("/").map(Number);
  if (!d || !m || !a) return 0;
  return new Date(a, m - 1, d).getTime();
}

function chaveMes(data: string): string | null {
  const [, m, a] = data.split("/");
  if (!m || !a) return null;
  return `${a}-${m.padStart(2, "0")}`;
}

function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split("-").map(Number);
  return `${ABREV_MES[mes - 1]}/${String(ano).slice(2)}`;
}

function formatMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function VisualizacaoContagens({ itens }: { itens: ItemInventario[] }) {
  const router = useRouter();

  const ultimaData = useMemo(() => {
    let maior = "";
    let maiorTs = -1;
    for (const it of itens) {
      const ts = parseDataBR(it.data);
      if (ts > maiorTs) {
        maiorTs = ts;
        maior = it.data;
      }
    }
    return maior;
  }, [itens]);

  const meses = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const it of itens) {
      const chave = chaveMes(it.data);
      if (chave && !mapa.has(chave)) mapa.set(chave, parseDataBR(it.data));
    }
    return Array.from(mapa.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([chave]) => chave);
  }, [itens]);

  const [filtro, setFiltro] = useState<string>("ultima");
  const editavel = filtro === "ultima";

  // Correção da última contagem: só a quantidade, e só enquanto o filtro
  // "Última" está selecionado (contagens antigas ficam travadas).
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});
  const [statusPorSku, setStatusPorSku] = useState<Record<string, StatusLinha>>({});
  const [salvandoTodos, setSalvandoTodos] = useState(false);

  const filtrados = useMemo(() => {
    let base: ItemInventario[];
    if (filtro === "todas") base = itens;
    else if (filtro === "ultima") base = itens.filter((it) => it.data === ultimaData);
    else base = itens.filter((it) => chaveMes(it.data) === filtro);

    return [...base].sort((a, b) => {
      const dt = parseDataBR(b.data) - parseDataBR(a.data);
      if (dt !== 0) return dt;
      const g = a.grupo.localeCompare(b.grupo, "pt-BR");
      if (g !== 0) return g;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [itens, filtro, ultimaData]);

  const totalValor = filtrados.reduce((soma, it) => soma + (it.total ?? 0), 0);
  const pendentes = Object.keys(edicoes);

  async function salvarUm(sku: string): Promise<boolean> {
    const item = filtrados.find((it) => it.sku === sku);
    const valor = edicoes[sku];
    if (!item || valor === undefined) return false;

    const num = Number(valor.trim().replace(",", "."));
    if (valor.trim() === "" || Number.isNaN(num) || num < 0) {
      setStatusPorSku((s) => ({ ...s, [sku]: { tipo: "erro", msg: "Quantidade inválida" } }));
      return false;
    }

    setStatusPorSku((s) => ({ ...s, [sku]: { tipo: "salvando" } }));
    const r = await atualizarQuantidadeContagemAction(item.data, sku, num);
    if ("erro" in r) {
      setStatusPorSku((s) => ({ ...s, [sku]: { tipo: "erro", msg: r.erro } }));
      return false;
    }
    setEdicoes((e) => {
      const novo = { ...e };
      delete novo[sku];
      return novo;
    });
    setStatusPorSku((s) => ({ ...s, [sku]: { tipo: "ok" } }));
    return true;
  }

  async function onSalvarClick(sku: string) {
    const ok = await salvarUm(sku);
    if (ok) router.refresh();
  }

  async function salvarTodos() {
    setSalvandoTodos(true);
    await Promise.all(pendentes.map((sku) => salvarUm(sku)));
    setSalvandoTodos(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Visualização de Contagens</h1>
        <p className="text-sm text-cinza-medio">Histórico dos inventários já registrados.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-cinza-medio">
          Filtrar
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-sm text-cinza focus:border-ambar focus:outline-none"
          >
            <option value="ultima">
              Última {ultimaData ? `(${ultimaData})` : ""}
            </option>
            <option value="todas">Todas</option>
            {meses.map((chave) => (
              <option key={chave} value={chave}>
                {rotuloMes(chave)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          <div className="text-sm text-cinza-medio">
            {filtrados.length} {filtrados.length === 1 ? "item" : "itens"} · Total{" "}
            <span className="font-bold text-azul-noite">{formatMoeda(totalValor)}</span>
          </div>
          {editavel && (
            <button
              type="button"
              onClick={salvarTodos}
              disabled={pendentes.length === 0 || salvandoTodos}
              className="shrink-0 rounded-md bg-azul-noite px-4 py-1.5 text-sm font-bold text-branco hover:bg-azul-petroleo disabled:opacity-40"
            >
              {salvandoTodos ? "Salvando..." : `Salvar todos (${pendentes.length})`}
            </button>
          )}
        </div>
      </div>

      {editavel && (
        <p className="-mt-2 text-xs text-cinza-medio">
          Só a última contagem pode ser corrigida. Ajusta a quantidade e salva - o total recalcula
          sozinho a partir do preço já registrado.
        </p>
      )}

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-cinza-claro bg-branco">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>Data</Th>
              <Th>Grupo</Th>
              <Th>Nome</Th>
              <Th>Unidade</Th>
              <Th align="right">Quantidade</Th>
              <Th align="right">Preço Unitário</Th>
              <Th align="right">Total</Th>
              <Th>Alerta</Th>
              {editavel && <Th align="center">Ações</Th>}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((it, i) => {
              const status = statusPorSku[it.sku];
              const pending = status?.tipo === "salvando";
              const emEdicao = edicoes[it.sku] !== undefined;

              return (
                <tr
                  key={`${it.data}-${it.sku}-${i}`}
                  className={`border-t border-cinza-claro ${i % 2 === 1 ? "bg-off-white/60" : ""}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-cinza-medio">{it.data}</td>
                  <td className="px-3 py-2">{it.grupo || "—"}</td>
                  <td className="px-3 py-2 font-medium text-cinza">{it.nome}</td>
                  <td className="px-3 py-2">{it.unidadeBase}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {editavel ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={emEdicao ? edicoes[it.sku] : it.quantidade !== null ? String(it.quantidade) : ""}
                        onChange={(e) => setEdicoes((ed) => ({ ...ed, [it.sku]: e.target.value }))}
                        className="w-20 rounded border border-cinza-claro px-1.5 py-1 text-right focus:border-ambar focus:outline-none"
                      />
                    ) : it.quantidade !== null ? (
                      it.quantidade.toLocaleString("pt-BR")
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.precoUnitario !== null ? formatMoeda(it.precoUnitario) : "a calcular"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.total !== null ? formatMoeda(it.total) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {it.alerta && (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                          it.alerta === "Comprar emergencial"
                            ? "bg-vermelho/10 text-vermelho"
                            : "bg-ambar/10 text-ambar"
                        }`}
                      >
                        {it.alerta}
                      </span>
                    )}
                  </td>
                  {editavel && (
                    <td className="min-w-[90px] px-3 py-2 text-center">
                      {emEdicao && !pending && (
                        <button
                          type="button"
                          onClick={() => onSalvarClick(it.sku)}
                          className="rounded bg-azul-noite px-2 py-1 text-[10px] font-bold text-branco hover:bg-azul-petroleo"
                        >
                          Salvar
                        </button>
                      )}
                      {pending && <span className="text-[10px] text-cinza-medio">Salvando...</span>}
                      {status?.tipo === "ok" && !emEdicao && (
                        <span className="text-[10px] font-semibold text-verde">Salvo ✓</span>
                      )}
                      {status?.tipo === "erro" && (
                        <span className="block text-[10px] text-vermelho">{status.msg}</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={editavel ? 9 : 8} className="px-3 py-8 text-center text-cinza-medio">
                  Nenhuma contagem registrada com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
