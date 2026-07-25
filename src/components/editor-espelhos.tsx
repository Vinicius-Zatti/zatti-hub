"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { SugestaoCompra, Pedido } from "@/lib/types";
import { Th } from "@/components/tabela";
import { salvarPedidoAction } from "@/app/(app)/estoque/pedidos/cotacoes/actions";
import {
  gerarImagemPedido,
  compartilharOuCopiarImagem,
  CompartilharCancelado,
  type LinhaPedido,
} from "@/lib/canvas-tabela";

function formatMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Editor de Espelhos: a partir da mesma cotação calculada de Criar
 * Cotação, deixa o comprador confirmar quantidade, fornecedor vencedor
 * (quando o item é cotado com mais de um) e preço, por fornecedor. Salvar
 * grava um Pedido de verdade (ver `src/lib/pedidos.ts`) e só depois disso
 * libera Compartilhar - que agora manda "Pedido de Compra", com valor por
 * item e total, não mais só a cotação informal. */
export function EditorEspelhos({
  itensPorFornecedor,
  fornecedores,
  dataUsada,
  datasDisponiveis,
  pedidoSalvoPorFornecedor,
  pedidoMinimoPorFornecedor,
  organizacaoNome,
}: {
  itensPorFornecedor: Record<string, SugestaoCompra[]>;
  fornecedores: string[];
  dataUsada: string;
  datasDisponiveis: string[];
  pedidoSalvoPorFornecedor: Record<string, Pedido | null>;
  pedidoMinimoPorFornecedor: Record<string, number | null>;
  organizacaoNome: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function trocarData(novaData: string) {
    router.push(`${pathname}?data=${encodeURIComponent(novaData)}`);
  }

  // sku -> fornecedores que também cotam esse item - só existe disputa de
  // "fornecedor vencedor" quando o mesmo SKU aparece em mais de um bloco.
  const fornecedoresPorSku = useMemo(() => {
    const mapa: Record<string, string[]> = {};
    for (const fornecedor of fornecedores) {
      for (const item of itensPorFornecedor[fornecedor] ?? []) {
        (mapa[item.sku] ??= []).push(fornecedor);
      }
    }
    return mapa;
  }, [fornecedores, itensPorFornecedor]);

  const [vencedor, setVencedor] = useState<Record<string, string | null>>(() => {
    const inicial: Record<string, string | null> = {};
    for (const fornecedor of fornecedores) {
      for (const item of pedidoSalvoPorFornecedor[fornecedor]?.itens ?? []) {
        inicial[item.sku] = fornecedor;
      }
    }
    return inicial;
  });

  const [quantidades, setQuantidades] = useState<Record<string, number>>(() => {
    const inicial: Record<string, number> = {};
    for (const fornecedor of fornecedores) {
      for (const item of pedidoSalvoPorFornecedor[fornecedor]?.itens ?? []) {
        inicial[item.sku] = item.quantidadePedida;
      }
    }
    for (const fornecedor of fornecedores) {
      for (const item of itensPorFornecedor[fornecedor] ?? []) {
        if (!(item.sku in inicial)) inicial[item.sku] = item.quantidadeSugerida;
      }
    }
    return inicial;
  });

  const [precos, setPrecos] = useState<Record<string, number | null>>(() => {
    const inicial: Record<string, number | null> = {};
    for (const fornecedor of fornecedores) {
      for (const item of pedidoSalvoPorFornecedor[fornecedor]?.itens ?? []) {
        inicial[item.sku] = item.precoAtualizado;
      }
    }
    for (const fornecedor of fornecedores) {
      for (const item of itensPorFornecedor[fornecedor] ?? []) {
        if (!(item.sku in inicial)) inicial[item.sku] = item.precoUnitario;
      }
    }
    return inicial;
  });

  const [previsaoEntrega, setPrevisaoEntrega] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const fornecedor of fornecedores) {
      inicial[fornecedor] = pedidoSalvoPorFornecedor[fornecedor]?.previsaoEntrega ?? "";
    }
    return inicial;
  });

  const [salvo, setSalvo] = useState<Record<string, boolean>>(() => {
    const inicial: Record<string, boolean> = {};
    for (const fornecedor of fornecedores) {
      inicial[fornecedor] = pedidoSalvoPorFornecedor[fornecedor] !== null;
    }
    return inicial;
  });

  const [salvando, setSalvando] = useState<Record<string, boolean>>({});
  const [compartilhando, setCompartilhando] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, string>>({});

  function itensVisiveisDoFornecedor(fornecedor: string): SugestaoCompra[] {
    return (itensPorFornecedor[fornecedor] ?? []).filter((item) => {
      const v = vencedor[item.sku];
      return v === undefined || v === null || v === fornecedor;
    });
  }

  async function salvar(fornecedor: string) {
    const itens = itensVisiveisDoFornecedor(fornecedor).filter((item) => (quantidades[item.sku] ?? 0) > 0);
    setSalvando((s) => ({ ...s, [fornecedor]: true }));
    const resultado = await salvarPedidoAction({
      fornecedor,
      dataContagemBase: dataUsada,
      previsaoEntrega: previsaoEntrega[fornecedor] || null,
      itens: itens.map((item) => ({
        sku: item.sku,
        nome: item.nome,
        unidadeBase: item.unidadeBase,
        quantidadePedida: quantidades[item.sku] ?? 0,
        precoAntigo: item.precoUnitario,
        precoAtualizado: precos[item.sku] ?? null,
      })),
    });
    setSalvando((s) => ({ ...s, [fornecedor]: false }));
    if ("erro" in resultado) {
      setStatus((s) => ({ ...s, [fornecedor]: resultado.erro }));
      return;
    }
    // trava o fornecedor vencedor de cada item salvo, pra sumir dos outros blocos
    setVencedor((v) => {
      const novo = { ...v };
      for (const item of itens) novo[item.sku] = fornecedor;
      return novo;
    });
    setSalvo((s) => ({ ...s, [fornecedor]: true }));
    setStatus((s) => ({ ...s, [fornecedor]: "Salvo." }));
    setTimeout(() => setStatus((s) => ({ ...s, [fornecedor]: "" })), 4000);
  }

  async function compartilhar(fornecedor: string) {
    const itens = itensVisiveisDoFornecedor(fornecedor).filter((item) => (quantidades[item.sku] ?? 0) > 0);
    if (itens.length === 0) {
      setStatus((s) => ({ ...s, [fornecedor]: "Nenhum item pra compartilhar." }));
      return;
    }
    setCompartilhando((c) => ({ ...c, [fornecedor]: true }));
    const linhas: LinhaPedido[] = itens.map((item) => ({
      item: item.nome,
      und: item.unidadeBase,
      qtd: String(quantidades[item.sku] ?? 0),
      valor:
        precos[item.sku] !== null
          ? formatMoeda((quantidades[item.sku] ?? 0) * (precos[item.sku] as number))
          : "a calcular",
    }));
    const total = itens.reduce((soma, item) => {
      const preco = precos[item.sku];
      if (preco === null) return soma;
      return soma + (quantidades[item.sku] ?? 0) * preco;
    }, 0);
    try {
      const blob = await gerarImagemPedido(
        fornecedor,
        linhas,
        `${organizacaoNome} · Pedido de Compra`,
        formatMoeda(total)
      );
      const nomeArquivo = `pedido-${fornecedor.toLowerCase().replace(/\s+/g, "-")}.png`;
      const resultado = await compartilharOuCopiarImagem(blob, nomeArquivo, `Pedido de Compra ${fornecedor}`);
      setStatus((s) => ({
        ...s,
        [fornecedor]:
          resultado === "compartilhado"
            ? "Compartilhado."
            : resultado === "copiado"
              ? "Copiado - cola no WhatsApp."
              : "Esse navegador não copia/compartilha direto - baixei a imagem.",
      }));
    } catch (err) {
      if (!(err instanceof CompartilharCancelado)) {
        setStatus((s) => ({ ...s, [fornecedor]: (err as Error).message }));
      }
    }
    setCompartilhando((c) => ({ ...c, [fornecedor]: false }));
    setTimeout(() => setStatus((s) => ({ ...s, [fornecedor]: "" })), 6000);
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Editor de Espelhos de Compras</h1>
        <p className="text-sm text-cinza-medio">
          Confirma quantidade, fornecedor vencedor e preço de cada item antes de virar Pedido de
          Compra de verdade. Salva pra liberar o Compartilhar - dá pra voltar e editar depois.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-cinza-claro bg-branco p-3.5">
        <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
          Contagem base
          <select
            value={dataUsada}
            onChange={(e) => trocarData(e.target.value)}
            className="rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-sm text-cinza focus:border-ambar focus:outline-none"
          >
            {datasDisponiveis.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>

      {fornecedores.length === 0 && (
        <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-cinza-medio">
          Nenhum fornecedor com item pra pedir nessa contagem.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {fornecedores.map((fornecedor) => {
          const itens = itensVisiveisDoFornecedor(fornecedor);
          const subtotal = itens.reduce((soma, item) => {
            const preco = precos[item.sku];
            if (preco === null) return soma;
            return soma + (quantidades[item.sku] ?? 0) * preco;
          }, 0);
          const pedidoMinimo = pedidoMinimoPorFornecedor[fornecedor] ?? null;
          const bateuMinimo = pedidoMinimo === null || subtotal >= pedidoMinimo;

          return (
            <div key={fornecedor} className="rounded-lg border border-cinza-claro bg-branco">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cinza-claro bg-azul-noite px-4 py-2.5">
                <span className="truncate text-sm font-bold text-branco">{fornecedor}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-cinza-claro">
                    Previsão de entrega
                    <input
                      type="date"
                      value={previsaoEntrega[fornecedor] ?? ""}
                      onChange={(e) => setPrevisaoEntrega((p) => ({ ...p, [fornecedor]: e.target.value }))}
                      className="rounded border border-cinza-claro bg-branco px-1.5 py-0.5 text-xs text-cinza focus:outline-none"
                    />
                  </label>
                  <span className={`text-xs font-semibold ${bateuMinimo ? "text-cinza-claro" : "text-ambar"}`}>
                    {formatMoeda(subtotal)}
                    {pedidoMinimo !== null && ` de ${formatMoeda(pedidoMinimo)} mínimo`}
                  </span>
                  <button
                    type="button"
                    onClick={() => salvar(fornecedor)}
                    disabled={salvando[fornecedor]}
                    className="shrink-0 rounded-md border border-cinza-claro bg-branco px-2.5 py-1 text-[11px] font-bold text-azul-noite hover:bg-off-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {salvando[fornecedor] ? "Salvando..." : salvo[fornecedor] ? "Salvar de novo" : "Salvar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => compartilhar(fornecedor)}
                    disabled={!salvo[fornecedor] || compartilhando[fornecedor]}
                    title={!salvo[fornecedor] ? "Salva o pedido antes de compartilhar" : undefined}
                    className="shrink-0 rounded-md bg-ambar px-2.5 py-1 text-[11px] font-bold text-azul-noite hover:bg-[#b07720] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {compartilhando[fornecedor] ? "Gerando..." : "Compartilhar"}
                  </button>
                </div>
              </div>

              <div className="max-h-[55vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-off-white text-cinza-medio">
                      <Th>Item</Th>
                      <Th align="right">Qtd. pedida</Th>
                      <Th align="right">Preço antigo</Th>
                      <Th align="right">Preço atualizado</Th>
                      <Th>Fornecedor</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => {
                      const disputado = (fornecedoresPorSku[item.sku] ?? []).length > 1;
                      const jaVencido = vencedor[item.sku] === fornecedor;
                      return (
                        <tr key={item.sku} className="border-t border-cinza-claro">
                          <td className="px-3 py-2 font-medium text-cinza">{item.nome}</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={quantidades[item.sku] ?? 0}
                              onChange={(e) => {
                                const num = Number(e.target.value.replace(",", "."));
                                if (!Number.isNaN(num)) {
                                  setQuantidades((q) => ({ ...q, [item.sku]: num }));
                                }
                              }}
                              className="w-16 rounded border border-cinza-claro px-1.5 py-1 text-right focus:border-ambar focus:outline-none"
                            />{" "}
                            <span className="text-xs text-cinza-medio">{item.unidadeBase}</span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">
                            {item.precoUnitario !== null ? formatMoeda(item.precoUnitario) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={precos[item.sku] ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value.replace(",", ".");
                                const num = raw === "" ? null : Number(raw);
                                if (num === null || !Number.isNaN(num)) {
                                  setPrecos((p) => ({ ...p, [item.sku]: num }));
                                }
                              }}
                              className="w-20 rounded border border-cinza-claro px-1.5 py-1 text-right focus:border-ambar focus:outline-none"
                            />
                          </td>
                          <td className="px-3 py-2">
                            {!disputado ? (
                              <span className="text-xs text-cinza-medio">único fornecedor</span>
                            ) : jaVencido ? (
                              <span className="rounded-full bg-verde/10 px-2 py-0.5 text-xs font-semibold text-verde">
                                vencedor aqui
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setVencedor((v) => ({ ...v, [item.sku]: fornecedor }))}
                                className="rounded-md border border-ambar px-2 py-1 text-[11px] font-semibold text-ambar hover:bg-ambar/10"
                              >
                                Confirmar aqui
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {status[fornecedor] && (
                <div className="border-t border-cinza-claro px-4 py-2 text-xs text-cinza-medio">
                  {status[fornecedor]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
