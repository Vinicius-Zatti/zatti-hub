"use client";

import { useMemo, useState, useTransition } from "react";
import { Th } from "@/components/tabela";
import { CampoNumero } from "@/components/campo-numero";
import { ControlesTabela } from "@/components/tabela-rolavel";
import { useArrastarParaRolar } from "@/components/use-arrastar-para-rolar";
import { useTabelaExpansivel } from "@/components/use-tabela-expansivel";
import { salvarConversaoProdutoAction } from "@/app/(app)/fichas-tecnicas/actions";

type Linha = {
  sku: string;
  nome: string;
  unidadeBase: string;
  precoUnitario: number | null;
  conversao: { unidadeSaida: string; fatorPorUnidadeBase: number; fatorCorrecao: number; descricao: string } | null;
};

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ConversoesProdutoTabela({ linhas }: { linhas: Linha[] }) {
  const [busca, setBusca] = useState("");
  const { expandido, alternar } = useTabelaExpansivel();
  const { scrollRef, handlers, arrastando } = useArrastarParaRolar<HTMLDivElement>();

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return linhas;
    return linhas.filter((l) => l.nome.toLowerCase().includes(termo) || l.sku.toLowerCase().includes(termo));
  }, [linhas, busca]);

  return (
    <div className={expandido ? "fixed inset-0 z-40 flex flex-col gap-2 bg-branco p-3" : "flex flex-col gap-2"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-azul-noite">
          {filtradas.length}
          {filtradas.length !== linhas.length ? ` de ${linhas.length}` : ""} produtos
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Buscar por nome ou SKU..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full max-w-xs rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-sm focus:border-ambar focus:outline-none"
          />
          <ControlesTabela scrollRef={scrollRef} expandido={expandido} onAlternarExpandir={alternar} />
        </div>
      </div>
      <div
        ref={scrollRef}
        {...handlers}
        className={`${expandido ? "min-h-0 flex-1" : "max-h-[70vh]"} overflow-auto rounded-lg border border-cinza-claro bg-branco select-none ${
          arrastando ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th fixo>Produto</Th>
              <Th align="center">Und. Estoque</Th>
              <Th align="right">Preço Estoque</Th>
              <Th align="center">Und. na Ficha</Th>
              <Th align="right">Qtd Ficha</Th>
              <Th align="right">Fator Correção</Th>
              <Th align="right">Preço Ficha</Th>
              <Th>Descrição</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((linha) => (
              <LinhaConversao key={linha.sku} linha={linha} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LinhaConversao({ linha }: { linha: Linha }) {
  const [unidadeSaida, setUnidadeSaida] = useState(linha.conversao?.unidadeSaida ?? linha.unidadeBase);
  const [qtdFicha, setQtdFicha] = useState<number | null>(linha.conversao?.fatorPorUnidadeBase ?? 1);
  const [fatorCorrecao, setFatorCorrecao] = useState<number | null>(linha.conversao?.fatorCorrecao ?? 1);
  const [descricao, setDescricao] = useState(linha.conversao?.descricao ?? "");
  const [salvando, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const precoFicha =
    linha.precoUnitario !== null && qtdFicha && qtdFicha > 0
      ? (linha.precoUnitario / qtdFicha) * (fatorCorrecao ?? 1)
      : null;

  function marcarAlterado() {
    setSalvo(false);
  }

  function salvar() {
    setErro(null);
    setSalvo(false);
    startTransition(async () => {
      const resultado = await salvarConversaoProdutoAction({
        produtoSku: linha.sku,
        unidadeSaida,
        fatorPorUnidadeBase: qtdFicha ?? 1,
        fatorCorrecao: fatorCorrecao ?? 1,
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
      <td className="px-3 py-2 text-right text-cinza-medio">
        {linha.precoUnitario !== null ? brl(linha.precoUnitario) : "-"}
      </td>
      <td className="px-2 py-2">
        <input
          value={unidadeSaida}
          onChange={(e) => {
            setUnidadeSaida(e.target.value.toUpperCase());
            marcarAlterado();
          }}
          className="w-20 rounded border border-cinza-claro px-2 py-1 text-center text-sm uppercase text-cinza"
        />
      </td>
      <td className="px-2 py-2">
        <CampoNumero
          value={qtdFicha}
          onChange={(v) => {
            setQtdFicha(v);
            marcarAlterado();
          }}
          decimais={3}
          className="w-24"
        />
      </td>
      <td className="px-2 py-2">
        <CampoNumero
          value={fatorCorrecao}
          onChange={(v) => {
            setFatorCorrecao(v);
            marcarAlterado();
          }}
          decimais={3}
          className="w-24"
        />
      </td>
      <td className="px-3 py-2 text-right font-semibold text-azul-noite">{precoFicha !== null ? brl(precoFicha) : "-"}</td>
      <td className="px-2 py-2">
        <input
          value={descricao}
          onChange={(e) => {
            setDescricao(e.target.value);
            marcarAlterado();
          }}
          placeholder="opcional"
          className="w-full min-w-[140px] rounded border border-cinza-claro px-2 py-1 text-sm text-cinza"
        />
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando || !unidadeSaida || !qtdFicha}
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
