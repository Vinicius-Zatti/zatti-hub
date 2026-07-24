"use client";

import { useState } from "react";
import type { SugestaoCompra } from "@/lib/types";
import { Th } from "@/components/tabela";
import {
  gerarImagemCotacao,
  compartilharOuCopiarImagem,
  CompartilharCancelado,
  type LinhaCotacao,
} from "@/lib/canvas-tabela";

type Modo = "interno" | "fornecedor";

function formatMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function itemIncompleto(item: SugestaoCompra): boolean {
  return (
    !item.nomeCompra.trim() || !item.unidadeEmbalagemFornecedor.trim() || !item.qtdUnidadeBasePorEmbalagem
  );
}

/** Bloco de um fornecedor dentro de Criar Cotação: além de mostrar/editar
 * quantidade (igual a Conferência por Grupo), cada fornecedor tem seu
 * próprio modo de visualização e botão de Compartilhar - dois fornecedores
 * podem estar em modos diferentes ao mesmo tempo. Quantidade em si continua
 * compartilhada com o resto da página (vem de `valorAtual`/`onConfirmarValor`
 * do componente pai), só a exibição/edição em embalagem é local daqui. */
export function BlocoFornecedorCotacao({
  fornecedor,
  linhas,
  pedidoMinimo,
  legenda,
  valorAtual,
  onConfirmarValor,
}: {
  fornecedor: string;
  linhas: SugestaoCompra[];
  pedidoMinimo: number | null;
  legenda: string;
  valorAtual: (item: SugestaoCompra) => number;
  onConfirmarValor: (sku: string, valorBase: number) => void;
}) {
  const [modo, setModo] = useState<Modo>("interno");
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [compartilhando, setCompartilhando] = useState(false);

  function valorExibido(item: SugestaoCompra): number | null {
    const base = valorAtual(item);
    if (modo === "interno") return base;
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
      const base = modo === "interno" ? num : num * (item.qtdUnidadeBasePorEmbalagem ?? 1);
      onConfirmarValor(item.sku, base);
    }
    setEditando((e) => {
      const novo = { ...e };
      delete novo[item.sku];
      return novo;
    });
  }

  const subtotal = linhas.reduce((soma, item) => {
    if (item.precoUnitario === null) return soma;
    return soma + valorAtual(item) * item.precoUnitario;
  }, 0);
  const bateuMinimo = pedidoMinimo === null || subtotal >= pedidoMinimo;

  async function compartilhar() {
    const paraCompartilhar = linhas.filter((item) => valorAtual(item) > 0);
    const incompletos = modo === "fornecedor" ? paraCompartilhar.filter(itemIncompleto) : [];
    if (incompletos.length > 0) {
      setStatus(
        `Falta completar o cadastro de ${incompletos.length} ${incompletos.length === 1 ? "item" : "itens"} em Produtos > Edição de Dados antes de compartilhar.`,
      );
      return;
    }
    if (paraCompartilhar.length === 0) {
      setStatus("Nenhum item com quantidade pra compartilhar ainda.");
      return;
    }

    setCompartilhando(true);
    const dadosImagem: LinhaCotacao[] = paraCompartilhar.map((item) => ({
      item: modo === "interno" ? item.nome : item.nomeCompra,
      und: modo === "interno" ? item.unidadeBase : item.unidadeEmbalagemFornecedor,
      qtd: String(valorExibido(item) ?? ""),
    }));

    try {
      const blob = await gerarImagemCotacao(fornecedor, dadosImagem, legenda);
      const nomeArquivo = `cotacao-${fornecedor.toLowerCase().replace(/\s+/g, "-")}.png`;
      const resultado = await compartilharOuCopiarImagem(blob, nomeArquivo, `Cotação ${fornecedor}`);
      setStatus(
        resultado === "compartilhado"
          ? "Compartilhado."
          : resultado === "copiado"
            ? "Copiado - cola no WhatsApp."
            : "Esse navegador não copia/compartilha direto - baixei a imagem.",
      );
    } catch (err) {
      if (err instanceof CompartilharCancelado) {
        setStatus("");
      } else {
        setStatus((err as Error).message);
      }
    }
    setCompartilhando(false);
    setTimeout(() => setStatus(""), 6000);
  }

  return (
    <div className="rounded-lg border border-cinza-claro bg-branco">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cinza-claro bg-azul-noite px-4 py-2.5">
        <span className="truncate text-sm font-bold text-branco">{fornecedor}</span>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold ${bateuMinimo ? "text-cinza-claro" : "text-ambar"}`}>
            {formatMoeda(subtotal)}
            {pedidoMinimo !== null && ` de ${formatMoeda(pedidoMinimo)} mínimo`}
          </span>
          <button
            type="button"
            onClick={compartilhar}
            disabled={compartilhando}
            className="shrink-0 rounded-md bg-ambar px-2.5 py-1 text-[11px] font-bold text-azul-noite hover:bg-[#b07720] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {compartilhando ? "Gerando..." : "Compartilhar"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-cinza-claro px-4 py-2">
        <button
          type="button"
          onClick={() => setModo("interno")}
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
            modo === "interno"
              ? "border-azul-noite bg-azul-noite text-branco"
              : "border-cinza-claro text-cinza-medio hover:border-azul-noite"
          }`}
        >
          Nome Interno
        </button>
        <button
          type="button"
          onClick={() => setModo("fornecedor")}
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
            modo === "fornecedor"
              ? "border-azul-noite bg-azul-noite text-branco"
              : "border-cinza-claro text-cinza-medio hover:border-azul-noite"
          }`}
        >
          Nome Fornecedor
        </button>
      </div>

      {modo === "fornecedor" && linhas.some(itemIncompleto) && (
        <div className="border-b border-vermelho/30 bg-vermelho/5 px-4 py-2 text-xs text-vermelho">
          Tem item sem Nome de Compra, Und. Embalagem ou Qtd. Base/Embalagem cadastrados. Completa em{" "}
          <a href="/estoque/produtos/edicao" className="font-semibold underline">
            Produtos → Edição de Dados
          </a>{" "}
          antes de compartilhar.
        </div>
      )}

      <div className="max-h-[50vh] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-off-white text-cinza-medio">
              <Th>{modo === "interno" ? "Item" : "Nome de Compra"}</Th>
              <Th>{modo === "interno" ? "Und" : "Embalagem"}</Th>
              <Th align="right">Qtd</Th>
              <Th>Alerta</Th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((item) => {
              const emEdicao = editando[item.sku] !== undefined;
              const incompleto = modo === "fornecedor" && itemIncompleto(item);
              const qtdExibida = valorExibido(item);
              const precisa = valorAtual(item) > 0;
              const nomeExibido = modo === "interno" ? item.nome : item.nomeCompra || item.nome;
              const unidadeExibida = modo === "interno" ? item.unidadeBase : item.unidadeEmbalagemFornecedor;

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
                        {precisa ? (
                          <span className="font-bold tabular-nums text-ambar">{qtdExibida}</span>
                        ) : (
                          <span className="text-xs text-cinza-medio">não precisa comprar</span>
                        )}
                        <button
                          type="button"
                          onClick={() => iniciarEdicao(item)}
                          className="rounded-md border border-cinza-claro px-2 py-1 text-[10px] font-semibold text-cinza-medio hover:bg-off-white"
                        >
                          {precisa ? "Editar" : "Adicionar"}
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
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
      {status && <div className="border-t border-cinza-claro px-4 py-2 text-xs text-cinza-medio">{status}</div>}
    </div>
  );
}
