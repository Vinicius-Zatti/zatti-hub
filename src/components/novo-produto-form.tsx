"use client";

import { useState, useTransition } from "react";
import { criarProdutoAction, sugerirSkuAction } from "@/app/(app)/estoque/produtos/actions";
import { nomeGrupo } from "@/lib/grupos";

export function NovoProdutoForm({
  nomeInicial,
  unidadeInicial,
}: {
  nomeInicial?: string;
  unidadeInicial?: string;
}) {
  const [grupo, setGrupo] = useState("");
  const [nome, setNome] = useState(nomeInicial ?? "");
  const [sku, setSku] = useState("");
  const [motivo, setMotivo] = useState<string | null>(null);
  const [erroSugestao, setErroSugestao] = useState<string | null>(null);
  const [sugerindo, startTransition] = useTransition();

  function sugerirSku() {
    setErroSugestao(null);
    setMotivo(null);
    startTransition(async () => {
      const r = await sugerirSkuAction(nome);
      if ("erro" in r) {
        setErroSugestao(r.erro);
        return;
      }
      setSku(r.sku);
      setGrupo(r.grupo);
      setMotivo(r.motivo);
    });
  }

  return (
    <form action={criarProdutoAction} className="mt-4 flex flex-col gap-3">
      <div>
        <label className="text-xs font-semibold text-cinza-medio">Nome (contagem)</label>
        <div className="mt-1 flex gap-2">
          <input
            name="nome"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none"
          />
          <button
            type="button"
            onClick={sugerirSku}
            disabled={sugerindo || !nome.trim()}
            className="shrink-0 rounded-md border border-ambar px-3 py-2 text-xs font-semibold text-ambar hover:bg-ambar/10 disabled:opacity-40"
          >
            {sugerindo ? "Pensando..." : "Sugerir grupo + SKU"}
          </button>
        </div>
        {motivo && <p className="mt-1 text-xs text-cinza-medio">{motivo}</p>}
        {erroSugestao && <p className="mt-1 text-xs text-vermelho">{erroSugestao}</p>}
      </div>

      <div>
        <label className="text-xs font-semibold text-cinza-medio">Grupo</label>
        <select
          name="grupo"
          required
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
        >
          <option value="" disabled>
            {grupo ? grupo : "Use \"Sugerir\" ou escolha na mão"}
          </option>
          {["PRO", "HOR", "LAT", "MER", "CON", "BEB", "BAL", "EMB", "DES", "LIM", "OPE"].map((g) => (
            <option key={g} value={g}>
              {g} — {nomeGrupo(g)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-cinza-medio">SKU</label>
        <input
          name="sku"
          required
          placeholder="Ex: MERPBA001"
          value={sku}
          onChange={(e) => setSku(e.target.value.toUpperCase())}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 font-mono text-sm focus:border-ambar focus:outline-none"
        />
      </div>

      <Campo label="Nome de compra" name="nomeCompra" />
      <Campo label="Unidade base (KG / LT / UN)" name="unidadeBase" defaultValue={unidadeInicial || "UN"} />
      <Campo label="Preço unitário" name="precoUnitario" type="number" step="0.01" />
      <Campo label="Estoque necessário da semana" name="estoqueNecessarioSemana" type="number" step="0.01" />
      <Campo label="Estoque mínimo" name="estoqueMinimo" type="number" step="0.01" />
      <Campo
        label="Posição (ordem física de contagem)"
        name="posicao"
        type="number"
        step="1"
        placeholder="Opcional"
      />
      <div>
        <label className="text-xs font-semibold text-cinza-medio">Observações</label>
        <textarea
          name="observacoes"
          rows={2}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        className="mt-2 rounded-md bg-azul-noite px-4 py-2.5 text-sm font-semibold text-branco hover:bg-azul-petroleo"
      >
        Salvar produto
      </button>
    </form>
  );
}

function Campo({
  label,
  name,
  ...rest
}: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-xs font-semibold text-cinza-medio">{label}</label>
      <input
        name={name}
        {...rest}
        className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none"
      />
    </div>
  );
}
