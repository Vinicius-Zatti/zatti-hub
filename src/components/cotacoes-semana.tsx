"use client";

import { useState } from "react";
import type { SugestaoCompra } from "@/lib/types";
import { agruparPorFornecedor, ordenarFornecedores } from "@/lib/pedido";
import { Th } from "@/components/tabela";
import {
  gerarImagemCotacao,
  compartilharOuCopiarImagem,
  CompartilharCancelado,
  type LinhaCotacao,
} from "@/lib/canvas-tabela";

type Modo = "padrao" | "nomeCompra";

function itemIncompleto(item: SugestaoCompra): boolean {
  return !item.nomeCompra.trim() || !item.unidadeEmbalagemFornecedor.trim() || !item.qtdUnidadeBasePorEmbalagem;
}

export function CotacoesSemana({
  itens,
  organizacaoNome,
}: {
  itens: SugestaoCompra[];
  organizacaoNome: string;
}) {
  const legenda = `${organizacaoNome} · Pedido de Cotação`;
  const precisamComprar = itens.filter((i) => i.precisaComprar);
  const porFornecedor = agruparPorFornecedor(precisamComprar);
  const fornecedores = ordenarFornecedores(Object.keys(porFornecedor));

  const [modo, setModo] = useState<Modo>("padrao");

  // Correção manual da quantidade sugerida - só ajusta a tela/imagem
  // compartilhada, não grava em lugar nenhum. Sempre em unidade base; no
  // modo "Nome de Compra" converte pra embalagem só na exibição/edição.
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [statusPorFornecedor, setStatusPorFornecedor] = useState<Record<string, string>>({});
  const [compartilhandoFornecedor, setCompartilhandoFornecedor] = useState<string | null>(null);

  function valorAtual(item: SugestaoCompra): number {
    return overrides[item.sku] ?? item.quantidadeSugerida;
  }

  function valorExibido(item: SugestaoCompra): number | null {
    const base = valorAtual(item);
    if (modo === "padrao") return base;
    if (!item.qtdUnidadeBasePorEmbalagem) return null;
    return Math.ceil(base / item.qtdUnidadeBasePorEmbalagem);
  }

  function iniciarEdicao(item: SugestaoCompra) {
    const exibido = valorExibido(item);
    setEditando((e) => ({ ...e, [item.sku]: exibido !== null ? String(exibido) : "" }));
  }

  function confirmarEdicao(item: SugestaoCompra) {
    const raw = (editando[item.sku] ?? "").trim().replace(",", ".");
    const num = Number(raw);
    if (raw !== "" && !Number.isNaN(num) && num >= 0) {
      const base = modo === "padrao" ? num : num * (item.qtdUnidadeBasePorEmbalagem ?? 1);
      setOverrides((o) => ({ ...o, [item.sku]: base }));
    }
    setEditando((e) => {
      const novo = { ...e };
      delete novo[item.sku];
      return novo;
    });
  }

  async function compartilhar(fornecedor: string) {
    const linhas = porFornecedor[fornecedor];
    const incompletos = modo === "nomeCompra" ? linhas.filter(itemIncompleto) : [];
    if (incompletos.length > 0) {
      setStatusPorFornecedor((s) => ({
        ...s,
        [fornecedor]: `Falta completar o cadastro de ${incompletos.length} ${incompletos.length === 1 ? "item" : "itens"} em Produtos > Edição de Dados antes de compartilhar.`,
      }));
      return;
    }

    setCompartilhandoFornecedor(fornecedor);
    const dadosImagem: LinhaCotacao[] = linhas.map((item) => ({
      item: modo === "padrao" ? item.nome : item.nomeCompra,
      und: modo === "padrao" ? item.unidadeBase : item.unidadeEmbalagemFornecedor,
      qtd: String(valorExibido(item) ?? ""),
    }));

    try {
      const blob = await gerarImagemCotacao(fornecedor, dadosImagem, legenda);
      const nomeArquivo = `cotacao-${fornecedor.toLowerCase().replace(/\s+/g, "-")}.png`;
      const resultado = await compartilharOuCopiarImagem(blob, nomeArquivo, `Cotação ${fornecedor}`);
      setStatusPorFornecedor((s) => ({
        ...s,
        [fornecedor]:
          resultado === "compartilhado"
            ? "Compartilhado."
            : resultado === "copiado"
              ? "Copiado - cola no WhatsApp."
              : "Esse navegador não copia/compartilha direto - baixei a imagem.",
      }));
    } catch (err) {
      if (err instanceof CompartilharCancelado) {
        setStatusPorFornecedor((s) => ({ ...s, [fornecedor]: "" }));
      } else {
        setStatusPorFornecedor((s) => ({ ...s, [fornecedor]: (err as Error).message }));
      }
    }
    setCompartilhandoFornecedor(null);
    setTimeout(() => setStatusPorFornecedor((s) => ({ ...s, [fornecedor]: "" })), 6000);
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-azul-noite">Cotações da Semana</h1>
          <p className="text-sm text-cinza-medio">
            Pra pedir cotação ou fechar o pedido - ajusta a quantidade se precisar e compartilha
            direto com o fornecedor.
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setModo("padrao")}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              modo === "padrao"
                ? "border-azul-noite bg-azul-noite text-branco"
                : "border-cinza-claro text-cinza-medio hover:border-azul-noite"
            }`}
          >
            Visualização padrão
          </button>
          <button
            type="button"
            onClick={() => setModo("nomeCompra")}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              modo === "nomeCompra"
                ? "border-azul-noite bg-azul-noite text-branco"
                : "border-cinza-claro text-cinza-medio hover:border-azul-noite"
            }`}
          >
            Nome de compra + embalagem
          </button>
        </div>
      </div>

      {fornecedores.length === 0 && (
        <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-cinza-medio">
          Nada pra cotar agora - todo mundo está com estoque suficiente pra semana.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {fornecedores.map((fornecedor) => {
          const linhas = porFornecedor[fornecedor];
          const incompletos = modo === "nomeCompra" ? linhas.filter(itemIncompleto) : [];
          const podeCompartilhar = incompletos.length === 0;
          const compartilhando = compartilhandoFornecedor === fornecedor;

          return (
            <div key={fornecedor} className="rounded-lg border border-cinza-claro bg-branco">
              <div className="flex items-center justify-between gap-2 border-b border-cinza-claro bg-azul-noite px-4 py-2.5">
                <span className="truncate text-sm font-bold text-branco">{fornecedor}</span>
                <button
                  type="button"
                  onClick={() => compartilhar(fornecedor)}
                  disabled={compartilhando || !podeCompartilhar}
                  title={!podeCompartilhar ? "Cadastro incompleto - não dá pra compartilhar" : undefined}
                  className="shrink-0 rounded-md bg-ambar px-2.5 py-1 text-[11px] font-bold text-azul-noite hover:bg-[#b07720] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {compartilhando ? "Gerando..." : "Compartilhar"}
                </button>
              </div>
              {modo === "nomeCompra" && incompletos.length > 0 && (
                <div className="border-b border-vermelho/30 bg-vermelho/5 px-4 py-2 text-xs text-vermelho">
                  {incompletos.length} {incompletos.length === 1 ? "item está" : "itens estão"} sem Nome de
                  Compra, Und. Embalagem ou Qtd. Base/Embalagem cadastrados. Completa em{" "}
                  <a href="/estoque/produtos/edicao" className="font-semibold underline">
                    Produtos → Edição de Dados
                  </a>{" "}
                  antes de compartilhar essa lista.
                </div>
              )}
              <div className="max-h-[50vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-off-white text-cinza-medio">
                      <Th>{modo === "nomeCompra" ? "Nome de Compra" : "Item"}</Th>
                      <Th>{modo === "nomeCompra" ? "Embalagem" : "Und"}</Th>
                      <Th align="right">Qtd</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((item) => {
                      const emEdicao = editando[item.sku] !== undefined;
                      const incompleto = modo === "nomeCompra" && itemIncompleto(item);
                      const qtdExibida = valorExibido(item);
                      const nomeExibido = modo === "nomeCompra" ? item.nomeCompra || item.nome : item.nome;
                      const unidadeExibida = modo === "nomeCompra" ? item.unidadeEmbalagemFornecedor : item.unidadeBase;

                      return (
                        <tr
                          key={item.sku}
                          className={`border-t border-cinza-claro ${incompleto ? "bg-vermelho/5" : ""}`}
                        >
                          <td className={`px-3 py-1.5 ${incompleto ? "text-vermelho" : "text-cinza"}`}>
                            {nomeExibido}
                            {incompleto && <span className="ml-1 text-[10px] font-bold">(cadastro incompleto)</span>}
                          </td>
                          <td className="px-3 py-1.5 text-cinza-medio">{unidadeExibida || "—"}</td>
                          <td className="px-3 py-1.5 text-right">
                            {incompleto ? (
                              <span className="text-xs font-semibold text-vermelho">sem embalagem</span>
                            ) : emEdicao ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  autoFocus
                                  value={editando[item.sku]}
                                  onChange={(e) =>
                                    setEditando((ed) => ({ ...ed, [item.sku]: e.target.value }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      confirmarEdicao(item);
                                    }
                                  }}
                                  className="w-14 rounded border border-ambar px-1.5 py-1 text-right focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => confirmarEdicao(item)}
                                  className="rounded bg-ambar px-2 py-1 text-[10px] font-bold text-azul-noite hover:bg-[#b07720]"
                                >
                                  Confirmar
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1.5">
                                <span className="font-bold tabular-nums text-ambar">{qtdExibida}</span>
                                <button
                                  type="button"
                                  onClick={() => iniciarEdicao(item)}
                                  className="rounded-md border border-cinza-claro px-2 py-1 text-[10px] font-semibold text-cinza-medio hover:bg-off-white"
                                >
                                  Editar
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {statusPorFornecedor[fornecedor] && (
                <div className="border-t border-cinza-claro px-4 py-2 text-xs text-cinza-medio">
                  {statusPorFornecedor[fornecedor]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
