"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Fornecedor, SugestaoCompra } from "@/lib/types";
import { GRUPO_OPCOES, nomeGrupo } from "@/lib/grupos";
import { agruparPorFornecedor, agruparPorGrupo, ordenarFornecedores, ordenarGrupos, SEM_FORNECEDOR } from "@/lib/pedido";
import { Th } from "@/components/tabela";
import { BlocoFornecedorCotacao } from "@/components/bloco-fornecedor-cotacao";
import { formatarQuantidade, textoEdicaoQuantidade } from "@/lib/unidades";
import { confirmarItemAction } from "@/app/(app)/estoque/pedidos/cotacoes/actions";

function formatMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PedidoCompras({
  itens,
  dataUsada,
  datasDisponiveis,
  gruposSelecionados,
  gruposContadosNoDia,
  organizacaoNome,
  pedidoMinimoPorFornecedor,
  podeEditar,
  fornecedoresCadastro,
  quantidadesSalvas,
}: {
  itens: SugestaoCompra[];
  dataUsada: string;
  datasDisponiveis: string[];
  gruposSelecionados: string[];
  gruposContadosNoDia: string[];
  organizacaoNome: string;
  pedidoMinimoPorFornecedor: Record<string, number | null>;
  podeEditar: boolean;
  fornecedoresCadastro: Fornecedor[];
  quantidadesSalvas: Record<string, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const legenda = `${organizacaoNome} · Pedido de Cotação`;

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

  // Correção manual da quantidade sugerida - compartilhada entre a tabela de
  // conferência por Grupo e os blocos por Fornecedor: o mesmo SKU pode
  // aparecer nas duas. Começa pré-carregada com o que já foi confirmado pra
  // essa contagem base (sem isso, toda vez que a página recarrega ela volta
  // a mostrar a sugestão crua calculada em cima do estoque).
  const [overrides, setOverrides] = useState<Record<string, number>>(() => ({ ...quantidadesSalvas }));
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [confirmando, setConfirmando] = useState<Record<string, boolean>>({});
  const [erroConfirmar, setErroConfirmar] = useState<Record<string, string>>({});

  function valorAtual(item: SugestaoCompra): number {
    return overrides[item.sku] ?? item.quantidadeSugerida;
  }

  // Confirmar já grava na hora - não existe mais botão Salvar/Salvar tudo.
  // Um item pode ser vendido por mais de um fornecedor (Fornecedor 1-4 do
  // Cadastro); a quantidade confirmada vale igual pra todos eles, então
  // grava em cada um. Item sem fornecedor cadastrado nenhum entra no bloco
  // avulso "Sem fornecedor cadastrado" (mesmo comportamento de sempre).
  async function confirmarValor(item: SugestaoCompra, valorBase: number) {
    setOverrides((o) => ({ ...o, [item.sku]: valorBase }));
    if (!podeEditar) return;

    setConfirmando((c) => ({ ...c, [item.sku]: true }));
    setErroConfirmar((e) => ({ ...e, [item.sku]: "" }));

    const fornecedoresDoItem = item.fornecedores.length ? item.fornecedores : valorBase > 0 ? [SEM_FORNECEDOR] : [];
    const resultados = await Promise.all(
      fornecedoresDoItem.map((fornecedor) =>
        confirmarItemAction({
          fornecedor,
          dataContagemBase: dataUsada,
          item: {
            sku: item.sku,
            nome: item.nome,
            nomeCompra: item.nomeCompra,
            unidadeBase: item.unidadeBase,
            quantidadePedida: valorBase,
            precoAntigo: item.precoNaContagem,
            precoAtualizado: item.precoUnitario,
            precoConfirmado: false,
          },
          atualizarPreco: false,
        })
      )
    );
    setConfirmando((c) => ({ ...c, [item.sku]: false }));
    const comErro = resultados.find((r) => "erro" in r);
    setErroConfirmar((e) => ({ ...e, [item.sku]: comErro && "erro" in comErro ? comErro.erro : "" }));
  }

  function iniciarEdicao(item: SugestaoCompra) {
    setEditando((e) => ({ ...e, [item.sku]: textoEdicaoQuantidade(valorAtual(item), item.unidadeBase) }));
  }

  function confirmarEdicaoGrupo(item: SugestaoCompra) {
    const raw = (editando[item.sku] ?? "").trim().replace(",", ".");
    const num = Number(raw);
    if (raw !== "" && !Number.isNaN(num) && num >= 0) {
      confirmarValor(item, num);
    }
    setEditando((e) => {
      const novo = { ...e };
      delete novo[item.sku];
      return novo;
    });
  }

  // Atribuir um Fornecedor 1 pra item "Sem fornecedor cadastrado" (feito
  // dentro do próprio bloco por fornecedor) precisa recalcular os grupos na
  // hora, sem esperar reload - sobrepõe o fornecedor escolhido em cima do
  // item antes de agrupar, então ele já cai no bloco certo.
  const [fornecedorOverrides, setFornecedorOverrides] = useState<Record<string, string>>({});

  const itensEfetivos = useMemo(
    () =>
      itens.map((item) => {
        const fornecedorOverride = fornecedorOverrides[item.sku];
        const quantidadeOverride = overrides[item.sku];
        return {
          ...item,
          ...(fornecedorOverride ? { fornecedores: [fornecedorOverride] } : {}),
          ...(quantidadeOverride !== undefined ? { precisaComprar: quantidadeOverride > 0 } : {}),
        };
      }),
    [itens, fornecedorOverrides, overrides]
  );

  const porGrupo = useMemo(() => agruparPorGrupo(itensEfetivos), [itensEfetivos]);
  const grupos = ordenarGrupos(Object.keys(porGrupo));

  const porFornecedor = useMemo(() => agruparPorFornecedor(itensEfetivos), [itensEfetivos]);
  const fornecedores = ordenarFornecedores(Object.keys(porFornecedor));

  const totalGeral = itens.reduce((soma, item) => {
    if (item.precoUnitario === null) return soma;
    return soma + valorAtual(item) * item.precoUnitario;
  }, 0);

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Criar Cotação</h1>
        <p className="text-sm text-cinza-medio">
          Todo mundo do escopo escolhido, pra conferir se o pedido foi montado certo - inclusive quem
          não precisa comprar. Confirmar já grava na hora. Depois, compartilha a cotação de cada
          fornecedor lá embaixo.
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
          <h2 className="mb-2 font-display text-xl font-bold text-azul-noite">Conferência por Grupo</h2>
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
                confirmando={confirmando}
                erroConfirmar={erroConfirmar}
                podeEditar={podeEditar}
                onIniciarEdicao={iniciarEdicao}
                onConfirmarEdicao={confirmarEdicaoGrupo}
                onChangeEditando={(sku, v) => setEditando((ed) => ({ ...ed, [sku]: v }))}
              />
            ))}
          </div>
        </div>
      )}

      {itens.length > 0 && (
        <div>
          <h2 className="mb-2 font-display text-xl font-bold text-azul-noite">
            Por Fornecedor - cotação e compartilhamento
          </h2>
          <div className="flex flex-col gap-4">
            {fornecedores.map((fornecedor) => (
              <BlocoFornecedorCotacao
                key={fornecedor}
                fornecedor={fornecedor}
                linhas={porFornecedor[fornecedor]}
                pedidoMinimo={pedidoMinimoPorFornecedor[fornecedor] ?? null}
                legenda={legenda}
                valorAtual={valorAtual}
                onConfirmarValor={confirmarValor}
                podeEditar={podeEditar}
                fornecedoresCadastro={fornecedoresCadastro}
                onFornecedorAtribuido={(sku, nome) =>
                  setFornecedorOverrides((f) => ({ ...f, [sku]: nome }))
                }
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
  confirmando,
  erroConfirmar,
  podeEditar,
  onIniciarEdicao,
  onConfirmarEdicao,
  onChangeEditando,
}: {
  titulo: string;
  linhas: SugestaoCompra[];
  valorAtual: (item: SugestaoCompra) => number;
  editando: Record<string, string>;
  confirmando: Record<string, boolean>;
  erroConfirmar: Record<string, string>;
  podeEditar: boolean;
  onIniciarEdicao: (item: SugestaoCompra) => void;
  onConfirmarEdicao: (item: SugestaoCompra) => void;
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
              <Th>Alerta</Th>
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
                    {item.estoqueAtual !== null
                      ? `${formatarQuantidade(item.estoqueAtual, item.unidadeBase)} ${item.unidadeBase}`
                      : "não contado"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">
                    {formatarQuantidade(item.estoqueNecessario, item.unidadeBase)} {item.unidadeBase}
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
                              onConfirmarEdicao(item);
                            }
                          }}
                          className="w-16 rounded border border-ambar px-1.5 py-1 text-right focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => onConfirmarEdicao(item)}
                          className="rounded bg-ambar px-2 py-1 text-[10px] font-bold text-azul-noite hover:bg-[#b07720]"
                        >
                          Confirmar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {confirmando[item.sku] ? (
                            <span className="text-xs text-cinza-medio">salvando...</span>
                          ) : precisa ? (
                            <span className="font-bold tabular-nums text-ambar">
                              {formatarQuantidade(qtd, item.unidadeBase)} {item.unidadeBase}
                            </span>
                          ) : (
                            <span className="text-xs text-cinza-medio">não precisa comprar</span>
                          )}
                          {podeEditar && (
                            <button
                              type="button"
                              onClick={() => onIniciarEdicao(item)}
                              className="rounded-md border border-cinza-claro px-2 py-1 text-[10px] font-semibold text-cinza-medio hover:bg-off-white"
                            >
                              {precisa ? "Editar" : "Adicionar"}
                            </button>
                          )}
                        </div>
                        {erroConfirmar[item.sku] && (
                          <span className="text-[10px] text-vermelho">{erroConfirmar[item.sku]}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">
                    {valor !== null ? formatMoeda(valor) : "a calcular"}
                  </td>
                  <td className="px-3 py-2">
                    {item.alerta && (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                          item.alerta === "Comprar emergencial"
                            ? "bg-vermelho/10 text-vermelho"
                            : "bg-ambar/10 text-ambar"
                        }`}
                      >
                        {item.alerta}
                      </span>
                    )}
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
