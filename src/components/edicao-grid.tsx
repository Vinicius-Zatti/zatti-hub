"use client";

import { useState, useTransition } from "react";
import type { ItemPendente, Produto } from "@/lib/types";
import { salvarProdutoAction, sugerirSkuAction } from "@/app/(app)/estoque/produtos/actions";
import { GRUPO_ORDEM } from "@/lib/grupos";

const VAZIO_CLASSE = "border-ambar bg-ambar/10";
const NORMAL_CLASSE = "border-cinza-claro bg-branco";

export function EdicaoGrid({
  produtos,
  pendentes,
}: {
  produtos: Produto[];
  pendentes: ItemPendente[];
}) {
  return (
    <div className="flex flex-col gap-8 pb-10">
      {pendentes.length > 0 && (
        <div>
          <h2 className="mb-1 font-display text-xl font-bold text-azul-noite">
            Pendências da Contagem ({pendentes.length})
          </h2>
          <p className="mb-3 text-xs text-cinza-medio">
            Itens adicionados na Contagem sem cadastro. Completa os dados e salva pra virarem
            produto de verdade.
          </p>
          <div className="flex flex-col gap-3">
            {pendentes.map((p) => (
              <LinhaPendencia key={p.nome} pendente={p} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-1 font-display text-xl font-bold text-azul-noite">
          Cadastro completo ({produtos.length})
        </h2>
        <p className="mb-3 text-xs text-cinza-medio">
          Células em destaque estão vazias. Edita e clica em Salvar na linha.
        </p>
        <div className="overflow-x-auto rounded-lg border border-cinza-claro bg-branco">
          <table className="w-full min-w-[1150px] text-xs">
            <thead className="bg-azul-petroleo text-branco">
              <tr>
                <th className="px-2 py-2 text-left font-semibold">SKU</th>
                <th className="px-2 py-2 text-left font-semibold">Grupo</th>
                <th className="px-2 py-2 text-left font-semibold">Nome</th>
                <th className="px-2 py-2 text-left font-semibold">Unidade</th>
                <th className="px-2 py-2 text-right font-semibold">Preço</th>
                <th className="px-2 py-2 text-right font-semibold">Estoque p/ semana</th>
                <th className="px-2 py-2 text-right font-semibold">Estoque mínimo</th>
                <th className="px-2 py-2 text-right font-semibold">Posição</th>
                <th className="px-2 py-2 text-center font-semibold">Ativo</th>
                <th className="px-2 py-2 text-center font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => (
                <LinhaProduto key={p.sku} produto={p} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LinhaPendencia({ pendente }: { pendente: ItemPendente }) {
  const [grupo, setGrupo] = useState("");
  const [sku, setSku] = useState("");
  const [motivo, setMotivo] = useState<string | null>(null);
  const [preco, setPreco] = useState("");
  const [estNecessario, setEstNecessario] = useState("");
  const [estMinimo, setEstMinimo] = useState("");
  const [posicao, setPosicao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pending, startTransition] = useTransition();

  function sugerir() {
    setErro(null);
    startTransition(async () => {
      const r = await sugerirSkuAction(pendente.nome);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setSku(r.sku);
      setGrupo(r.grupo);
      setMotivo(r.motivo);
    });
  }

  function salvar() {
    if (!grupo || !sku.trim()) {
      setErro("Escolhe o grupo e o SKU antes de salvar.");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const r = await salvarProdutoAction({
        sku: sku.toUpperCase().trim(),
        grupo,
        nome: pendente.nome,
        nomeCompra: pendente.nome,
        unidadeBase: pendente.unidadeBase,
        precoUnitario: preco ? Number(preco.replace(",", ".")) : null,
        precoFornecedor: null,
        estoqueNecessarioSemana: estNecessario ? Number(estNecessario.replace(",", ".")) : null,
        estoqueMinimo: estMinimo ? Number(estMinimo.replace(",", ".")) : null,
        fornecedor1: "",
        fornecedor2: "",
        fornecedor3: "",
        fornecedor4: "",
        observacoes: "",
        ativo: true,
        posicao: posicao ? Number(posicao) : null,
      });
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setSalvo(true);
    });
  }

  if (salvo) {
    return (
      <div className="rounded-lg border border-verde/40 bg-verde/5 px-4 py-3 text-sm text-verde">
        {pendente.nome} cadastrado como {sku}.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ambar/60 bg-ambar/5 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-cinza">{pendente.nome}</div>
          <div className="text-xs text-cinza-medio">
            {pendente.unidadeBase} · última contagem {pendente.ultimaContagem}
          </div>
        </div>
        <button
          type="button"
          onClick={sugerir}
          disabled={pending}
          className="rounded-md border border-ambar px-3 py-1.5 text-xs font-semibold text-ambar hover:bg-ambar/10 disabled:opacity-40"
        >
          {pending ? "Pensando..." : "Sugerir grupo + SKU"}
        </button>
      </div>
      {motivo && <p className="mt-2 text-xs text-cinza-medio">{motivo}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
        <div>
          <label className="text-[10px] font-semibold text-cinza-medio">Grupo</label>
          <select
            value={grupo}
            onChange={(e) => setGrupo(e.target.value)}
            className="mt-0.5 w-full rounded border border-cinza-claro px-1.5 py-1.5 text-sm"
          >
            <option value="" disabled>
              —
            </option>
            {GRUPO_ORDEM.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-cinza-medio">SKU</label>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value.toUpperCase())}
            className="mt-0.5 w-full rounded border border-cinza-claro px-1.5 py-1.5 font-mono text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-cinza-medio">Preço</label>
          <input
            type="text"
            inputMode="decimal"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            className="mt-0.5 w-full rounded border border-cinza-claro px-1.5 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-cinza-medio">Estoque p/ semana</label>
          <input
            type="text"
            inputMode="decimal"
            value={estNecessario}
            onChange={(e) => setEstNecessario(e.target.value)}
            className="mt-0.5 w-full rounded border border-cinza-claro px-1.5 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-cinza-medio">Estoque mínimo</label>
          <input
            type="text"
            inputMode="decimal"
            value={estMinimo}
            onChange={(e) => setEstMinimo(e.target.value)}
            className="mt-0.5 w-full rounded border border-cinza-claro px-1.5 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-cinza-medio">Posição</label>
          <input
            type="text"
            inputMode="numeric"
            value={posicao}
            onChange={(e) => setPosicao(e.target.value)}
            className="mt-0.5 w-full rounded border border-cinza-claro px-1.5 py-1.5 text-sm"
          />
        </div>
      </div>
      {erro && <p className="mt-2 text-xs text-vermelho">{erro}</p>}
      <button
        type="button"
        onClick={salvar}
        disabled={pending}
        className="mt-3 rounded-md bg-azul-noite px-4 py-2 text-xs font-bold text-branco hover:bg-azul-petroleo disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar como produto"}
      </button>
    </div>
  );
}

function LinhaProduto({ produto }: { produto: Produto }) {
  const [editado, setEditado] = useState(produto);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [salvoOk, setSalvoOk] = useState(false);

  const mudou = JSON.stringify(editado) !== JSON.stringify(produto);

  function campo<K extends keyof Produto>(key: K, value: Produto[K]) {
    setEditado((e) => ({ ...e, [key]: value }));
    setSalvoOk(false);
  }

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const r = await salvarProdutoAction(editado);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setSalvoOk(true);
    });
  }

  return (
    <tr className="border-t border-cinza-claro">
      <td className="px-2 py-1.5 font-mono text-cinza-medio">{produto.sku}</td>
      <td className="px-2 py-1.5">
        <select
          value={editado.grupo}
          onChange={(e) => campo("grupo", e.target.value)}
          className="w-20 rounded border border-cinza-claro px-1 py-1"
        >
          {GRUPO_ORDEM.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          value={editado.nome}
          onChange={(e) => campo("nome", e.target.value)}
          className="w-40 rounded border border-cinza-claro px-1.5 py-1"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={editado.unidadeBase}
          onChange={(e) => campo("unidadeBase", e.target.value)}
          className="w-14 rounded border border-cinza-claro px-1.5 py-1"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          step="0.01"
          value={editado.precoUnitario ?? ""}
          onChange={(e) =>
            campo("precoUnitario", e.target.value === "" ? null : Number(e.target.value))
          }
          className={`w-20 rounded border px-1.5 py-1 text-right ${editado.precoUnitario === null ? VAZIO_CLASSE : NORMAL_CLASSE}`}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          step="0.01"
          value={editado.estoqueNecessarioSemana ?? ""}
          onChange={(e) =>
            campo(
              "estoqueNecessarioSemana",
              e.target.value === "" ? null : Number(e.target.value)
            )
          }
          className={`w-20 rounded border px-1.5 py-1 text-right ${editado.estoqueNecessarioSemana === null ? VAZIO_CLASSE : NORMAL_CLASSE}`}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          step="0.01"
          value={editado.estoqueMinimo ?? ""}
          onChange={(e) =>
            campo("estoqueMinimo", e.target.value === "" ? null : Number(e.target.value))
          }
          className={`w-20 rounded border px-1.5 py-1 text-right ${editado.estoqueMinimo === null ? VAZIO_CLASSE : NORMAL_CLASSE}`}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          step="1"
          value={editado.posicao ?? ""}
          onChange={(e) => campo("posicao", e.target.value === "" ? null : Number(e.target.value))}
          className={`w-16 rounded border px-1.5 py-1 text-right ${editado.posicao === null ? VAZIO_CLASSE : NORMAL_CLASSE}`}
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={editado.ativo}
          onChange={(e) => campo("ativo", e.target.checked)}
        />
      </td>
      <td className="min-w-[80px] px-2 py-1.5 text-center">
        {mudou && !pending && (
          <button
            type="button"
            onClick={salvar}
            className="rounded bg-azul-noite px-2 py-1 text-[10px] font-bold text-branco hover:bg-azul-petroleo"
          >
            Salvar
          </button>
        )}
        {pending && <span className="text-[10px] text-cinza-medio">Salvando...</span>}
        {salvoOk && !mudou && <span className="text-[10px] font-semibold text-verde">Salvo ✓</span>}
        {erro && <span className="block text-[10px] text-vermelho">{erro}</span>}
      </td>
    </tr>
  );
}
