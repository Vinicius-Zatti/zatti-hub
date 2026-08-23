"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Th } from "@/components/tabela";
import { CampoNumero } from "@/components/campo-numero";
import { ControlesTabela } from "@/components/tabela-rolavel";
import { useArrastarParaRolar } from "@/components/use-arrastar-para-rolar";
import { useTabelaExpansivel } from "@/components/use-tabela-expansivel";
import { useGuardaEdicao } from "@/components/guarda-edicao";
import { salvarConversaoProdutoAction, salvarConversoesProdutoAction } from "@/app/(app)/fichas-tecnicas/actions";

type Linha = {
  sku: string;
  nome: string;
  grupo: string;
  unidadeBase: string;
  precoUnitario: number | null;
  conversao: { unidadeSaida: string; fatorPorUnidadeBase: number; fatorCorrecao: number; descricao: string } | null;
};

type UnidadePadrao = "KG" | "LT" | "UN";
type Valor = { unidadeSaida: UnidadePadrao; qtdFicha: number; fatorCorrecao: number; descricao: string };
type Status = "salvando" | "erro" | "salvo";

const UNIDADES_PADRAO: UnidadePadrao[] = ["KG", "LT", "UN"];

function unidadeValida(unidade: string): UnidadePadrao {
  return (UNIDADES_PADRAO as string[]).includes(unidade) ? (unidade as UnidadePadrao) : "UN";
}

function valorInicial(linha: Linha): Valor {
  return {
    unidadeSaida: unidadeValida(linha.conversao?.unidadeSaida ?? linha.unidadeBase),
    qtdFicha: linha.conversao?.fatorPorUnidadeBase ?? 1,
    fatorCorrecao: linha.conversao?.fatorCorrecao ?? 1,
    descricao: linha.conversao?.descricao ?? "",
  };
}

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ConversoesProdutoTabela({ linhas }: { linhas: Linha[] }) {
  const [busca, setBusca] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const { ativar, desativar } = useGuardaEdicao();
  const { expandido, alternar } = useTabelaExpansivel();
  const { scrollRef, handlers, arrastando } = useArrastarParaRolar<HTMLDivElement>();

  const [baseline, setBaseline] = useState<Record<string, Valor>>(() =>
    Object.fromEntries(linhas.map((l) => [l.sku, valorInicial(l)])),
  );
  const [estado, setEstado] = useState<Record<string, Valor>>(() =>
    Object.fromEntries(linhas.map((l) => [l.sku, valorInicial(l)])),
  );
  const [statusPorSku, setStatusPorSku] = useState<Record<string, Status>>({});
  const [erroPorSku, setErroPorSku] = useState<Record<string, string>>({});
  const [salvandoTodos, setSalvandoTodos] = useState(false);

  const alterados = useMemo(
    () => Object.keys(estado).filter((sku) => JSON.stringify(estado[sku]) !== JSON.stringify(baseline[sku])),
    [estado, baseline],
  );

  // Ref sempre com a versão mais nova de `salvarTodos` (redefinida a cada
  // render, closando sobre o `estado` atual) - o aviso de sair guarda essa
  // ref, não a função direto, senão "Salvar e sair" clicado bem depois do
  // aviso abrir salvaria um estado velho.
  const salvarTodosRef = useRef<() => Promise<boolean>>(async () => true);

  useEffect(() => {
    if (alterados.length > 0) {
      ativar("Você tem conversões não salvas. Se sair agora, elas se perdem.", () => salvarTodosRef.current());
    } else {
      desativar();
    }
  }, [alterados.length, ativar, desativar]);

  const grupos = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.grupo))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [linhas],
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (filtroGrupo && l.grupo !== filtroGrupo) return false;
      if (termo && !l.nome.toLowerCase().includes(termo) && !l.sku.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [linhas, busca, filtroGrupo]);

  function atualizar(sku: string, valor: Valor) {
    setEstado((atual) => ({ ...atual, [sku]: valor }));
    setStatusPorSku((atual) => {
      if (!(sku in atual)) return atual;
      const resto = { ...atual };
      delete resto[sku];
      return resto;
    });
  }

  function entradaDe(sku: string, valor: Valor) {
    return {
      produtoSku: sku,
      unidadeSaida: valor.unidadeSaida,
      fatorPorUnidadeBase: valor.qtdFicha,
      fatorCorrecao: valor.fatorCorrecao,
      descricao: valor.descricao,
    };
  }

  async function salvar(sku: string) {
    setStatusPorSku((atual) => ({ ...atual, [sku]: "salvando" }));
    const resultado = await salvarConversaoProdutoAction(entradaDe(sku, estado[sku]));
    if (!resultado.ok) {
      setStatusPorSku((atual) => ({ ...atual, [sku]: "erro" }));
      setErroPorSku((atual) => ({ ...atual, [sku]: resultado.mensagem }));
      return;
    }
    setBaseline((atual) => ({ ...atual, [sku]: estado[sku] }));
    setStatusPorSku((atual) => ({ ...atual, [sku]: "salvo" }));
  }

  async function salvarTodos(): Promise<boolean> {
    const skus = alterados;
    if (skus.length === 0) return true;
    setSalvandoTodos(true);
    setStatusPorSku((atual) => {
      const novo = { ...atual };
      for (const sku of skus) novo[sku] = "salvando";
      return novo;
    });

    const resultado = await salvarConversoesProdutoAction(skus.map((sku) => entradaDe(sku, estado[sku])));
    setSalvandoTodos(false);

    if (!resultado.ok) {
      setStatusPorSku((atual) => {
        const novo = { ...atual };
        for (const sku of skus) novo[sku] = "erro";
        return novo;
      });
      setErroPorSku((atual) => {
        const novo = { ...atual };
        for (const sku of skus) novo[sku] = resultado.mensagem;
        return novo;
      });
      return false;
    }

    setBaseline((atual) => {
      const novo = { ...atual };
      for (const sku of skus) novo[sku] = estado[sku];
      return novo;
    });
    setStatusPorSku((atual) => {
      const novo = { ...atual };
      for (const sku of skus) novo[sku] = "salvo";
      return novo;
    });
    return true;
  }
  useEffect(() => {
    salvarTodosRef.current = salvarTodos;
  });

  return (
    <div className={expandido ? "fixed inset-0 z-40 flex flex-col gap-2 bg-branco p-3" : "flex flex-col gap-2"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-azul-noite">
          {filtradas.length}
          {filtradas.length !== linhas.length ? ` de ${linhas.length}` : ""} produtos
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filtroGrupo}
            onChange={(e) => setFiltroGrupo(e.target.value)}
            className="rounded-md border border-cinza-claro bg-branco px-2 py-1.5 text-xs text-cinza focus:border-ambar focus:outline-none"
          >
            <option value="">Todos os grupos</option>
            {grupos.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Buscar por nome ou SKU..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full max-w-[180px] rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-xs focus:border-ambar focus:outline-none"
          />
          <button
            type="button"
            onClick={salvarTodos}
            disabled={alterados.length === 0 || salvandoTodos}
            className="shrink-0 rounded-md bg-azul-noite px-3 py-1.5 text-xs font-bold text-branco hover:bg-azul-petroleo disabled:opacity-40"
          >
            {salvandoTodos ? "Salvando..." : `Salvar todos (${alterados.length})`}
          </button>
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
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th fixo>Produto</Th>
              <Th align="center">Und.</Th>
              <Th align="right">Preço Estoque</Th>
              <Th align="center">Und. Ficha</Th>
              <Th align="right">Qtd Ficha</Th>
              <Th align="right">F. Correção</Th>
              <Th align="right">Preço Ficha</Th>
              <Th>Descrição</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((linha) => (
              <LinhaConversao
                key={linha.sku}
                linha={linha}
                valor={estado[linha.sku] ?? valorInicial(linha)}
                mudou={alterados.includes(linha.sku)}
                status={statusPorSku[linha.sku]}
                erro={erroPorSku[linha.sku]}
                onChange={(v) => atualizar(linha.sku, v)}
                onSalvar={() => salvar(linha.sku)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LinhaConversao({
  linha,
  valor,
  mudou,
  status,
  erro,
  onChange,
  onSalvar,
}: {
  linha: Linha;
  valor: Valor;
  mudou: boolean;
  status: Status | undefined;
  erro: string | undefined;
  onChange: (v: Valor) => void;
  onSalvar: () => void;
}) {
  const precoFicha =
    linha.precoUnitario !== null && valor.qtdFicha > 0 ? (linha.precoUnitario / valor.qtdFicha) * valor.fatorCorrecao : null;

  return (
    <tr className={`border-b border-cinza-claro last:border-0 ${mudou ? "bg-ambar/5" : ""}`}>
      <td className="sticky left-0 z-10 whitespace-nowrap bg-branco px-2 py-1.5 font-medium text-cinza">{linha.nome}</td>
      <td className="px-2 py-1.5 text-center text-cinza-medio">{linha.unidadeBase}</td>
      <td className="px-2 py-1.5 text-right">
        {linha.precoUnitario !== null ? (
          <span className="text-cinza-medio">{brl(linha.precoUnitario)}</span>
        ) : (
          <span className="text-ambar">Sem preço</span>
        )}
      </td>
      <td className="px-1.5 py-1.5">
        <select
          value={valor.unidadeSaida}
          onChange={(e) => onChange({ ...valor, unidadeSaida: e.target.value as UnidadePadrao })}
          className="w-16 rounded border border-cinza-claro px-1 py-1 text-center text-xs text-cinza"
        >
          {UNIDADES_PADRAO.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </td>
      <td className="px-1.5 py-1.5">
        <CampoNumero value={valor.qtdFicha} onChange={(v) => onChange({ ...valor, qtdFicha: v ?? 1 })} decimais={3} className="w-16" />
      </td>
      <td className="px-1.5 py-1.5">
        <CampoNumero
          value={valor.fatorCorrecao}
          onChange={(v) => onChange({ ...valor, fatorCorrecao: v ?? 1 })}
          decimais={3}
          className="w-16"
        />
      </td>
      <td className="px-2 py-1.5 text-right font-semibold text-azul-noite">{precoFicha !== null ? brl(precoFicha) : "-"}</td>
      <td className="px-1.5 py-1.5">
        <input
          value={valor.descricao}
          onChange={(e) => onChange({ ...valor, descricao: e.target.value })}
          className="w-full min-w-[110px] rounded border border-cinza-claro px-1.5 py-1 text-xs text-cinza"
        />
      </td>
      <td className="px-1.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSalvar}
            disabled={status === "salvando" || !mudou}
            className="rounded-md bg-azul-noite px-2 py-1 text-xs font-semibold text-branco disabled:opacity-40"
          >
            {status === "salvando" ? "..." : "Salvar"}
          </button>
          {status === "salvo" && <span className="text-xs font-semibold text-verde">✓</span>}
        </div>
        {status === "erro" && erro && <p className="mt-1 max-w-[140px] text-xs text-vermelho">{erro}</p>}
      </td>
    </tr>
  );
}
