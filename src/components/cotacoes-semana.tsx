"use client";

import { useState } from "react";
import type { SugestaoCompra } from "@/lib/types";
import { agruparPorFornecedor } from "@/lib/pedido";
import { Th } from "@/components/tabela";
import { gerarImagemCotacao, copiarImagemParaAreaDeTransferencia, baixarImagem } from "@/lib/canvas-tabela";

export function CotacoesSemana({ itens }: { itens: SugestaoCompra[] }) {
  const precisamComprar = itens.filter((i) => i.precisaComprar);
  const porFornecedor = agruparPorFornecedor(precisamComprar);
  const fornecedores = Object.keys(porFornecedor).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const [statusPorFornecedor, setStatusPorFornecedor] = useState<Record<string, string>>({});

  async function copiar(fornecedor: string) {
    const linhas = porFornecedor[fornecedor].map((item) => ({
      item: item.nome,
      und: item.unidadeBase,
      qtd: String(item.quantidadeSugerida),
    }));
    setStatusPorFornecedor((s) => ({ ...s, [fornecedor]: "Gerando..." }));
    try {
      const blob = await gerarImagemCotacao(fornecedor, linhas);
      try {
        await copiarImagemParaAreaDeTransferencia(blob);
        setStatusPorFornecedor((s) => ({ ...s, [fornecedor]: "Copiado - cola no WhatsApp." }));
      } catch {
        baixarImagem(blob, `cotacao-${fornecedor.toLowerCase().replace(/\s+/g, "-")}.png`);
        setStatusPorFornecedor((s) => ({
          ...s,
          [fornecedor]: "Esse navegador não copia direto - baixei a imagem.",
        }));
      }
    } catch (err) {
      setStatusPorFornecedor((s) => ({ ...s, [fornecedor]: (err as Error).message }));
    }
    setTimeout(() => setStatusPorFornecedor((s) => ({ ...s, [fornecedor]: "" })), 5000);
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Cotações da Semana</h1>
        <p className="text-sm text-cinza-medio">
          Item, unidade e quantidade pra pedir cotação - sem preço. Clica em Copiar e cola a imagem
          direto na conversa do fornecedor.
        </p>
      </div>

      {fornecedores.length === 0 && (
        <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-cinza-medio">
          Nada pra cotar agora - todo mundo está com estoque suficiente pra semana.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fornecedores.map((fornecedor) => (
          <div key={fornecedor} className="flex flex-col rounded-lg border border-cinza-claro bg-branco">
            <div className="flex items-center justify-between border-b border-cinza-claro bg-azul-noite px-3.5 py-2.5">
              <span className="truncate text-sm font-bold text-branco">{fornecedor}</span>
              <button
                type="button"
                onClick={() => copiar(fornecedor)}
                className="shrink-0 rounded-md bg-ambar px-2.5 py-1 text-[11px] font-bold text-azul-noite hover:bg-[#b07720]"
              >
                Copiar
              </button>
            </div>
            <div className="max-h-[40vh] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-off-white text-cinza-medio">
                    <Th>Item</Th>
                    <Th>Und</Th>
                    <Th align="right">Qtd</Th>
                  </tr>
                </thead>
                <tbody>
                  {porFornecedor[fornecedor].map((item) => (
                    <tr key={item.sku} className="border-t border-cinza-claro">
                      <td className="px-3 py-1.5 text-cinza">{item.nome}</td>
                      <td className="px-3 py-1.5 text-cinza-medio">{item.unidadeBase}</td>
                      <td className="px-3 py-1.5 text-right font-bold tabular-nums text-ambar">
                        {item.quantidadeSugerida}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {statusPorFornecedor[fornecedor] && (
              <div className="border-t border-cinza-claro px-3.5 py-1.5 text-[11px] text-cinza-medio">
                {statusPorFornecedor[fornecedor]}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
