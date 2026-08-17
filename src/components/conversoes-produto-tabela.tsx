"use client";

import { useState, useTransition } from "react";
import { Th } from "@/components/tabela";
import { CampoNumero } from "@/components/campo-numero";
import { salvarConversaoProdutoAction } from "@/app/(app)/fichas-tecnicas/actions";

type Linha = {
  sku: string;
  nome: string;
  unidadeBase: string;
  conversao: { unidadeSaida: string; fatorPorUnidadeBase: number; descricao: string } | null;
};

export function ConversoesProdutoTabela({ linhas }: { linhas: Linha[] }) {
  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border border-cinza-claro">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="bg-azul-petroleo text-branco">
            <Th fixo>Produto</Th>
            <Th align="center">Und. Estoque</Th>
            <Th align="center">Und. na Ficha</Th>
            <Th align="right">Fator (und. ficha por und. Estoque)</Th>
            <Th>Descrição</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <LinhaConversao key={linha.sku} linha={linha} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinhaConversao({ linha }: { linha: Linha }) {
  const [unidadeSaida, setUnidadeSaida] = useState(linha.conversao?.unidadeSaida ?? linha.unidadeBase);
  const [fator, setFator] = useState<number | null>(linha.conversao?.fatorPorUnidadeBase ?? null);
  const [descricao, setDescricao] = useState(linha.conversao?.descricao ?? "");
  const [salvando, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  function salvar() {
    setErro(null);
    setSalvo(false);
    startTransition(async () => {
      const resultado = await salvarConversaoProdutoAction({
        produtoSku: linha.sku,
        unidadeSaida,
        fatorPorUnidadeBase: fator ?? 1,
        descricao,
      });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setSalvo(true);
    });
  }

  return (
    <tr className="border-b border-cinza-claro last:border-0">
      <td className="sticky left-0 z-10 whitespace-nowrap bg-branco px-3 py-2 font-medium text-cinza">{linha.nome}</td>
      <td className="px-3 py-2 text-center text-cinza-medio">{linha.unidadeBase}</td>
      <td className="px-2 py-2">
        <input
          value={unidadeSaida}
          onChange={(e) => {
            setUnidadeSaida(e.target.value.toUpperCase());
            setSalvo(false);
          }}
          className="w-20 rounded border border-cinza-claro px-2 py-1 text-center text-sm uppercase text-cinza"
        />
      </td>
      <td className="px-2 py-2">
        <CampoNumero
          value={fator}
          onChange={(v) => {
            setFator(v);
            setSalvo(false);
          }}
          decimais={2}
          className="w-24"
        />
      </td>
      <td className="px-2 py-2">
        <input
          value={descricao}
          onChange={(e) => {
            setDescricao(e.target.value);
            setSalvo(false);
          }}
          placeholder="ex: garrafa de 900ml"
          className="w-full min-w-[160px] rounded border border-cinza-claro px-2 py-1 text-sm text-cinza"
        />
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando || !unidadeSaida || fator === null}
            className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco disabled:opacity-50"
          >
            {salvando ? "..." : "Salvar"}
          </button>
          {salvo && <span className="text-xs font-semibold text-verde">Salvo</span>}
        </div>
        {erro && <p className="mt-1 text-xs text-vermelho">{erro}</p>}
      </td>
    </tr>
  );
}
