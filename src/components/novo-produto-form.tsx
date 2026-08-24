"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { criarProdutoAction, sugerirSkuAction } from "@/app/(app)/estoque/produtos/actions";
import { nomeGrupo } from "@/lib/grupos";
import type { Produto } from "@/lib/types";

export function NovoProdutoForm({
  nomeInicial,
  unidadeInicial,
  onSalvo,
  onCancelar,
}: {
  nomeInicial?: string;
  unidadeInicial?: string;
  /** Quando informado, o form vira "in-place" (usado dentro de uma janela sobreposta) -
   * em vez de navegar pra `/estoque/produtos`, avisa o componente pai que salvou. */
  onSalvo?: (produto: Produto) => void;
  onCancelar?: () => void;
}) {
  const router = useRouter();
  const [grupo, setGrupo] = useState("");
  const [nome, setNome] = useState(nomeInicial ?? "");
  const [sku, setSku] = useState("");
  const [motivo, setMotivo] = useState<string | null>(null);
  const [erroSugestao, setErroSugestao] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sugerindo, startTransitionSugestao] = useTransition();
  const [salvando, startTransitionSalvar] = useTransition();

  function sugerirSku() {
    setErroSugestao(null);
    setMotivo(null);
    startTransitionSugestao(async () => {
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

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const dados = new FormData(e.currentTarget);
    startTransitionSalvar(async () => {
      const resultado = await criarProdutoAction(dados);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      if (onSalvo) {
        onSalvo(resultado.produto);
      } else {
        router.push("/estoque/produtos");
        router.refresh();
      }
    });
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-azul-noite">Novo produto</h1>
      {nomeInicial && (
        <p className="mt-1 text-xs text-cinza-medio">Preenchido a partir de um item contado como avulso.</p>
      )}
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
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

        {erro && <p className="text-sm text-vermelho">{erro}</p>}

        <div className="mt-2 flex gap-2">
          {onCancelar && (
            <button
              type="button"
              onClick={onCancelar}
              disabled={salvando}
              className="rounded-md border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={salvando}
            className="flex-1 rounded-md bg-azul-noite px-4 py-2.5 text-sm font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar produto"}
          </button>
        </div>
      </form>
    </div>
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
