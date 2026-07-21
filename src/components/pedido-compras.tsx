"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { SugestaoCompra } from "@/lib/types";
import { GRUPO_OPCOES, nomeGrupo } from "@/lib/grupos";
import { agruparPorFornecedor, agruparPorGrupo, ordenarFornecedores, ordenarGrupos } from "@/lib/pedido";
import { Th } from "@/components/tabela";

function formatMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PedidoCompras({
  itens,
  dataUsada,
  datasDisponiveis,
  gruposSelecionados,
  gruposContadosNoDia,
}: {
  itens: SugestaoCompra[];
  dataUsada: string;
  datasDisponiveis: string[];
  gruposSelecionados: string[];
  gruposContadosNoDia: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  function atualizarUrl(novaData: string, novosGrupos: string[]) {
    const params = new URLSearchParams();
    if (novaData) params.set("data", novaData);
    if (novosGrupos.length > 0) params.set("grupos", novosGrupos.join(","));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function alternarGrupo(codigo: string) {
    const ativo = gruposSelecionados.includes(codigo);
    const novos = ativo ? gruposSelecionados.filter((g) => g !== codigo) : [...gruposSelecionados, codigo];
    atualizarUrl(dataUsada, novos);
  }

  // Correção manual da quantidade sugerida - só ajusta a tela/cotação, não
  // grava em lugar nenhum. Compartilhada entre a tabela de conferência por
  // Grupo e as tabelas por Fornecedor: o mesmo SKU pode aparecer nas duas.
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [editando, setEditando] = useState<Record<string, string>>({});

  function valorAtual(item: SugestaoCompra): number {
    return overrides[item.sku] ?? item.quantidadeSugerida;
  }

  function iniciarEdicao(item: SugestaoCompra) {
    setEditando((e) => ({ ...e, [item.sku]: String(valorAtual(item)) }));
  }

  function confirmarEdicao(sku: string) {
    const raw = (editando[sku] ?? "").trim().replace(",", ".");
    const num = Number(raw);
    if (raw !== "" && !Number.isNaN(num) && num >= 0) {
      setOverrides((o) => ({ ...o, [sku]: num }));
    }
    setEditando((e) => {
      const novo = { ...e };
      delete novo[sku];
      return novo;
    });
  }

  const porGrupo = useMemo(() => agruparPorGrupo(itens), [itens]);
  const grupos = ordenarGrupos(Object.keys(porGrupo));

  const porFornecedor = useMemo(() => agruparPorFornecedor(itens), [itens]);
  const fornecedores = ordenarFornecedores(Object.keys(porFornecedor));

  const totalGeral = itens.reduce((soma, item) => {
    if (item.precoUnitario === null) return soma;
    return soma + valorAtual(item) * item.precoUnitario;
  }, 0);

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Pedido de Compras</h1>
        <p className="text-sm text-cinza-medio">
          Todo mundo do escopo escolhido, pra conferir se o pedido foi montado certo - inclusive quem
          não precisa comprar.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-cinza-claro bg-branco p-3.5">
        <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
          Contagem base
          <select
            value={dataUsada}
            onChange={(e) => atualizarUrl(e.target.value, gruposSelecionados)}
            className="rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-sm text-cinza focus:border-ambar focus:outline-none"
          >
            {datasDisponiveis.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
          Escopo
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => atualizarUrl(dataUsada, [])}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                gruposSelecionados.length === 0
                  ? "border-azul-noite bg-azul-noite text-branco"
                  : "border-cinza-claro text-cinza-medio hover:border-azul-noite"
              }`}
            >
              Pedido completo
            </button>
            {GRUPO_OPCOES.map((g) => (
              <button
                key={g.codigo}
                type="button"
                onClick={() => alternarGrupo(g.codigo)}
                disabled={!gruposContadosNoDia.includes(g.codigo)}
                title={!gruposContadosNoDia.includes(g.codigo) ? "Não foi contado nessa data" : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-30 ${
                  gruposSelecionados.includes(g.codigo)
                    ? "border-ambar bg-ambar/10 text-ambar"
                    : "border-cinza-claro text-cinza-medio hover:border-ambar"
                }`}
              >
                {g.descricao}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto text-sm text-cinza-medio">
          Total do pedido{" "}
          <span className="font-bold text-azul-noite">{formatMoeda(totalGeral)}</span>
        </div>
      </div>

      {gruposContadosNoDia.length > 0 && (
        <p className="rounded-md border border-cinza-claro bg-off-white px-3 py-2 text-xs text-cinza-medio">
          Nessa contagem ({dataUsada}) foram contados os grupos:{" "}
          <strong className="text-cinza">{gruposContadosNoDia.map(nomeGrupo).join(", ")}</strong>. O resto
          do cadastro nem entra aqui, porque não fez parte dessa contagem.
        </p>
      )}

      {itens.length === 0 && (
        <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-cinza-medio">
          Nenhum produto ativo nesse escopo.
        </div>
      )}

      {itens.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-azul-noite">Conferência por Grupo</h2>
          </div>
          <p className="mb-3 rounded-md border border-ambar/60 bg-ambar/10 px-3 py-2 text-xs font-medium text-ambar">
            Antes de enviar as cotações para os fornecedores, lembre-se de fazer a conferência - e
            edite na coluna Comprar se for necessário.
          </p>
          <div className="flex flex-col gap-4">
            {grupos.map((grupo) => (
              <TabelaItens
                key={grupo}
                titulo={nomeGrupo(grupo)}
                linhas={porGrupo[grupo]}
                valorAtual={valorAtual}
                editando={editando}
                onIniciarEdicao={iniciarEdicao}
                onConfirmarEdicao={confirmarEdicao}
                onChangeEditando={(sku, v) => setEditando((ed) => ({ ...ed, [sku]: v }))}
              />
            ))}
          </div>
        </div>
      )}

      {itens.length > 0 && (
        <div>
          <h2 className="mb-2 font-display text-xl font-bold text-azul-noite">Por Fornecedor</h2>
          <div className="flex flex-col gap-4">
            {fornecedores.map((fornecedor) => (
              <TabelaItens
                key={fornecedor}
                titulo={fornecedor}
                linhas={porFornecedor[fornecedor]}
                valorAtual={valorAtual}
                editando={editando}
                onIniciarEdicao={iniciarEdicao}
                onConfirmarEdicao={confirmarEdicao}
                onChangeEditando={(sku, v) => setEditando((ed) => ({ ...ed, [sku]: v }))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TabelaItens({
  titulo,
  linhas,
  valorAtual,
  editando,
  onIniciarEdicao,
  onConfirmarEdicao,
  onChangeEditando,
}: {
  titulo: string;
  linhas: SugestaoCompra[];
  valorAtual: (item: SugestaoCompra) => number;
  editando: Record<string, string>;
  onIniciarEdicao: (item: SugestaoCompra) => void;
  onConfirmarEdicao: (sku: string) => void;
  onChangeEditando: (sku: string, valor: string) => void;
}) {
  const subtotal = linhas.reduce((soma, item) => {
    if (item.precoUnitario === null) return soma;
    return soma + valorAtual(item) * item.precoUnitario;
  }, 0);

  return (
    <div className="rounded-lg border border-cinza-claro bg-branco">
      <div className="flex items-center justify-between border-b border-cinza-claro bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco">
        <span>{titulo}</span>
        <span className="text-xs font-semibold text-cinza-claro">{formatMoeda(subtotal)}</span>
      </div>
      <div className="max-h-[50vh] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-off-white text-cinza-medio">
              <Th>Item</Th>
              <Th align="right">Estoque atual</Th>
              <Th align="right">Necessário</Th>
              <Th align="right">Comprar</Th>
              <Th align="right">Valor</Th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((item) => {
              const qtd = valorAtual(item);
              const emEdicao = editando[item.sku] !== undefined;
              const valor = item.precoUnitario !== null ? qtd * item.precoUnitario : null;
              const precisa = qtd > 0;

              return (
                <tr key={item.sku} className={`border-t border-cinza-claro ${precisa ? "bg-ambar/5" : ""}`}>
                  <td className={`px-3 py-2 font-medium ${precisa ? "text-cinza" : "text-cinza-medio"}`}>
                    {item.nome}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">
                    {item.estoqueAtual !== null ? `${item.estoqueAtual} ${item.unidadeBase}` : "não contado"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">
                    {item.estoqueNecessario} {item.unidadeBase}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {emEdicao ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoFocus
                          value={editando[item.sku]}
                          onChange={(e) => onChangeEditando(item.sku, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              onConfirmarEdicao(item.sku);
                            }
                          }}
                          className="w-16 rounded border border-ambar px-1.5 py-1 text-right focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => onConfirmarEdicao(item.sku)}
                          className="rounded bg-ambar px-2 py-1 text-[10px] font-bold text-azul-noite hover:bg-[#b07720]"
                        >
                          Confirmar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1.5">
                        {precisa ? (
                          <span className="font-bold tabular-nums text-ambar">
                            {qtd} {item.unidadeBase}
                          </span>
                        ) : (
                          <span className="text-xs text-cinza-medio">não precisa comprar</span>
                        )}
                        <button
                          type="button"
                          onClick={() => onIniciarEdicao(item)}
                          className="rounded-md border border-cinza-claro px-2 py-1 text-[10px] font-semibold text-cinza-medio hover:bg-off-white"
                        >
                          Editar
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">
                    {valor !== null ? formatMoeda(valor) : "a calcular"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
