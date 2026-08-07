"use client";

import { useMemo, useState } from "react";
import type { Produto } from "@/lib/types";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { formatarQuantidade } from "@/lib/unidades";

function formatMoeda(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Coluna = "grupo" | "nome";
type Direcao = "asc" | "desc";

function Seta({ ativa, direcao }: { ativa: boolean; direcao: Direcao }) {
  if (!ativa) return null;
  return <span className="ml-1">{direcao === "asc" ? "▲" : "▼"}</span>;
}

export function TabelaProdutos({ produtos }: { produtos: Produto[] }) {
  const [coluna, setColuna] = useState<Coluna | null>(null);
  const [direcao, setDirecao] = useState<Direcao>("asc");

  function ordenarPor(c: Coluna) {
    if (coluna === c) {
      setDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setColuna(c);
      setDirecao("asc");
    }
  }

  const linhas = useMemo(() => {
    if (!coluna) return produtos;
    const sinal = direcao === "asc" ? 1 : -1;
    return [...produtos].sort((a, b) => {
      if (coluna === "grupo") {
        return sinal * (a.grupo.localeCompare(b.grupo, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
      }
      return sinal * a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [produtos, coluna, direcao]);

  return (
    <TabelaRolavel className="max-h-[70vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Lista de produtos">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>SKU</Th>
              <Th>
                <button type="button" onClick={() => ordenarPor("grupo")} className="cursor-pointer hover:underline">
                  Grupo
                  <Seta ativa={coluna === "grupo"} direcao={direcao} />
                </button>
              </Th>
              <Th fixo>
                <button type="button" onClick={() => ordenarPor("nome")} className="cursor-pointer hover:underline">
                  Nome
                  <Seta ativa={coluna === "nome"} direcao={direcao} />
                </button>
              </Th>
              <Th>Unidade</Th>
              <Th align="right">Preço</Th>
              <Th align="right">Estoque Pra Semana</Th>
              <Th align="right">Estoque Mínimo</Th>
              <Th align="center">Status</Th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((p, i) => (
              <tr
                key={p.sku}
                className={`border-t border-cinza-claro ${i % 2 === 1 ? "bg-off-white/60" : ""}`}
              >
                <td className="px-3 py-2 font-mono text-xs text-cinza-medio">{p.sku}</td>
                <td className="px-3 py-2">{p.grupo}</td>
                <td
                  className={`sticky left-0 z-10 px-3 py-2 font-medium text-cinza ${
                    i % 2 === 1 ? "bg-off-white" : "bg-branco"
                  }`}
                >
                  {p.nome}
                </td>
                <td className="px-3 py-2">{p.unidadeBase}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoeda(p.precoUnitario)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatarQuantidade(p.estoqueNecessarioSemana, p.unidadeBase)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatarQuantidade(p.estoqueMinimo, p.unidadeBase)}
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.ativo ? "bg-verde/10 text-verde" : "bg-cinza-claro text-cinza-medio"
                    }`}
                  >
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
              </tr>
            ))}
            {produtos.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-cinza-medio">
                  Nenhum produto cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
    </TabelaRolavel>
  );
}
