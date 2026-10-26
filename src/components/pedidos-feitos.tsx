"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Pedido, PedidoItem } from "@/lib/types";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { marcarRecebidoAction } from "@/app/(app)/estoque/pedidos/feitos/actions";
import { toNumeroBR } from "@/lib/sheets/numero";
import { formatarQuantidade } from "@/lib/unidades";
import {
  formularioDoPedido,
  pedidoMudouDesdeOFormulario,
  sincronizarFormularios,
  type FormularioRecebimento,
} from "@/lib/pedidos-feitos-formulario";
import { CampoBusca } from "@/components/campo-busca";
import { filtrarPorNomeOuSku } from "@/lib/busca-lista";

function formatMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumero(v: number): string {
  return String(v).replace(".", ",");
}

function formatData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function precoUnitarioDe(item: PedidoItem): number | null {
  return item.precoAtualizado ?? item.precoAntigo;
}

function precoTotalDe(item: PedidoItem): number | null {
  const preco = precoUnitarioDe(item);
  return preco !== null ? item.quantidadePedida * preco : null;
}

/** Histórico dos Pedidos de Compra já salvos no Editor de Espelhos. Item
 * sempre aparece pelo Nome de Compra (nunca o interno) - é o nome que bate
 * com a nota física que chega, pro funcionário conferir contra o que
 * recebeu. Gestão edita a quantidade recebida item a item (pode vir
 * diferente do pedido); Operacional só marca recebido e escreve a
 * observação - nunca mexe em quantidade, fornecedor ou preço
 * (`podeEditarQuantidade=false` some com os campos, e a Server Action por
 * trás também não aceita mais que isso). */
export function PedidosFeitos({
  pedidos,
  podeEditarQuantidade,
  dataUsada,
  datasDisponiveis,
}: {
  pedidos: Pedido[];
  podeEditarQuantidade: boolean;
  dataUsada: string;
  datasDisponiveis: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  function trocarData(novaData: string) {
    const params = new URLSearchParams();
    if (novaData) params.set("data", novaData);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // Um formulário por pedido, com a versão do pedido de quando foi carregado
  // (é ela que vai para o banco). Quantidade como texto exatamente como
  // digitado - mesmo motivo do Editor de Espelhos: campo controlado pelo
  // número redesenha e apaga a vírgula no meio da digitação.
  const [formularios, setFormularios] = useState<Record<string, FormularioRecebimento>>(() =>
    sincronizarFormularios({}, pedidos)
  );
  // Props novas (revalidação depois de salvar, outra pessoa mexeu): formulário
  // não editado recarrega; editado fica e mostra o aviso abaixo.
  const sincronizados = sincronizarFormularios(formularios, pedidos);
  if (sincronizados !== formularios) setFormularios(sincronizados);

  const [salvando, setSalvando] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, string>>({});
  // Busca (26/10/2026): só esconde linhas. As quantidades digitadas ficam em
  // `formularios`, pelo SKU, e o Salvar manda o pedido inteiro.
  const [busca, setBusca] = useState("");
  const buscando = busca.trim() !== "";
  const itensVisiveisPorPedido = new Map(
    pedidos.map((pedido) => [pedido.id, filtrarPorNomeOuSku(pedido.itens, busca, (item) => [item.nomeCompra])]),
  );
  const pedidosVisiveis = buscando
    ? pedidos.filter((pedido) => (itensVisiveisPorPedido.get(pedido.id) ?? []).length > 0)
    : pedidos;

  function editar(pedido: Pedido, mudanca: (f: FormularioRecebimento) => Partial<FormularioRecebimento>) {
    setFormularios((fs) => {
      const atual = fs[pedido.id] ?? formularioDoPedido(pedido);
      return { ...fs, [pedido.id]: { ...atual, ...mudanca(atual), editado: true } };
    });
  }

  function recarregar(pedido: Pedido) {
    setFormularios((fs) => ({ ...fs, [pedido.id]: formularioDoPedido(pedido) }));
    setStatus((s) => ({ ...s, [pedido.id]: "" }));
  }

  async function salvar(pedido: Pedido) {
    const formulario = formularios[pedido.id] ?? formularioDoPedido(pedido);
    setSalvando((s) => ({ ...s, [pedido.id]: true }));
    const resultado = await marcarRecebidoAction({
      pedidoId: pedido.id,
      recebido: formulario.recebido,
      observacaoEntrega: formulario.observacao.trim() || null,
      itensRecebidos: podeEditarQuantidade
        ? Object.entries(formulario.quantidades).map(([sku, texto]) => ({
            sku,
            quantidadeRecebida: toNumeroBR(texto),
          }))
        : [],
      versaoItens: formulario.versao,
    });
    setSalvando((s) => ({ ...s, [pedido.id]: false }));
    if ("versaoItens" in resultado) {
      // O que está na tela é o que o banco gravou, já na versão nova.
      setFormularios((fs) => {
        const atual = fs[pedido.id];
        if (!atual || atual.versao !== formulario.versao) return fs;
        // Digitou algo durante o envio: continua marcado como editado.
        return { ...fs, [pedido.id]: { ...atual, versao: resultado.versaoItens, editado: atual !== formulario } };
      });
    } else {
      // Recusa (ex.: pedido mudou): busca as props atuais para o aviso de
      // "mudou depois que você começou a editar" aparecer com o botão.
      router.refresh();
    }
    setStatus((s) => ({ ...s, [pedido.id]: "erro" in resultado ? resultado.erro : resultado.mensagem }));
    // Aviso do extrato (item sem preço ou fora do cadastro) fica mais tempo na tela.
    const demorado = "mensagem" in resultado && resultado.mensagem !== "Salvo.";
    setTimeout(() => setStatus((s) => ({ ...s, [pedido.id]: "" })), demorado ? 12000 : 4000);
  }

  const seletorData = datasDisponiveis.length > 0 && (
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
  );

  if (pedidos.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {seletorData}
        <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-cinza-medio">
          Nenhum pedido salvo ainda. Fecha um no Editor de Espelhos de Compras primeiro.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
      {seletorData}
      <div className="flex flex-col gap-1">
        <CampoBusca valor={busca} onChange={setBusca} rotulo="Buscar item nos pedidos por nome ou SKU" />
        {buscando && (
          <p className="text-xs text-cinza-medio">
            {pedidosVisiveis.length === 0
              ? `Nenhum item com "${busca.trim()}" nos pedidos desta contagem.`
              : "Mostrando só os itens encontrados. O que você digitou nos outros continua guardado, e o Salvar e os totais valem para o pedido inteiro."}
          </p>
        )}
      </div>
      {pedidosVisiveis.map((pedido) => {
        const totalVolumes = pedido.itens.reduce((soma, it) => soma + it.quantidadePedida, 0);
        const totalPedido = pedido.itens.reduce((soma, it) => soma + (precoTotalDe(it) ?? 0), 0);
        const formulario = formularios[pedido.id];
        const mudouPorFora = pedidoMudouDesdeOFormulario(formulario, pedido);

        return (
          <div key={pedido.id} className="rounded-lg border border-cinza-claro bg-branco">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cinza-claro bg-azul-noite px-4 py-2.5">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-branco">{pedido.fornecedor}</span>
                <span className="text-[11px] text-cinza-claro">
                  Contagem base {pedido.dataContagemBase}
                  {pedido.previsaoEntrega && ` · entrega prevista ${formatData(pedido.previsaoEntrega)}`}
                </span>
              </div>
            </div>

            <TabelaRolavel className="max-h-[45vh]" ariaLabel={`Itens do pedido ${pedido.id}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-off-white text-cinza-medio">
                    <Th>Item</Th>
                    <Th align="right">Qtd. pedida</Th>
                    <Th align="right">Qtd. recebida</Th>
                    <Th align="right">Preço unitário</Th>
                    <Th align="right">Preço total</Th>
                  </tr>
                </thead>
                <tbody>
                  {(itensVisiveisPorPedido.get(pedido.id) ?? pedido.itens).map((item) => {
                    const precoTotal = precoTotalDe(item);
                    return (
                      <tr key={item.sku} className="border-t border-cinza-claro">
                        <td className="px-3 py-2 font-medium text-cinza">{item.nomeCompra || item.nome}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">
                          {formatarQuantidade(item.quantidadePedida, item.unidadeBase)} {item.unidadeBase}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {podeEditarQuantidade ? (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={formulario?.quantidades[item.sku] ?? ""}
                              onChange={(e) => {
                                const texto = e.target.value;
                                editar(pedido, (f) => ({ quantidades: { ...f.quantidades, [item.sku]: texto } }));
                              }}
                              className="w-16 rounded border border-cinza-claro px-1.5 py-1 text-right focus:border-ambar focus:outline-none"
                            />
                          ) : (
                            <span className="tabular-nums text-cinza-medio">
                              {item.quantidadeRecebida !== null
                                ? formatarQuantidade(item.quantidadeRecebida, item.unidadeBase)
                                : "—"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">
                          {precoUnitarioDe(item) !== null ? formatMoeda(precoUnitarioDe(item) as number) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-azul-noite">
                          {precoTotal !== null ? formatMoeda(precoTotal) : "a calcular"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-azul-noite bg-off-white font-semibold text-cinza">
                    <td className="px-3 py-2">{pedido.itens.length} itens</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumero(Math.round(totalVolumes * 100) / 100)} volumes
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right text-xs text-cinza-medio">Valor total do pedido</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ambar">{formatMoeda(totalPedido)}</td>
                  </tr>
                </tfoot>
              </table>
            </TabelaRolavel>

            <div className="flex flex-wrap items-end gap-3 border-t border-cinza-claro px-4 py-3">
              <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-cinza-medio">
                Observação da entrega
                <textarea
                  value={formulario?.observacao ?? ""}
                  onChange={(e) => {
                    const texto = e.target.value;
                    editar(pedido, () => ({ observacao: texto }));
                  }}
                  rows={2}
                  className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza focus:border-ambar focus:outline-none"
                  placeholder="Ex: faltou 1 caixa de coca, fornecedor repõe na quinta"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-cinza-medio">
                <input
                  type="checkbox"
                  checked={formulario?.recebido ?? false}
                  onChange={(e) => {
                    const marcado = e.target.checked;
                    editar(pedido, () => ({ recebido: marcado }));
                  }}
                />
                Pedido recebido
              </label>
              <button
                type="button"
                onClick={() => salvar(pedido)}
                disabled={salvando[pedido.id]}
                className="shrink-0 rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:bg-[#b07720] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {salvando[pedido.id] ? "Salvando..." : "Salvar"}
              </button>
            </div>
            {mudouPorFora && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cinza-claro bg-off-white px-4 py-2 text-xs text-cinza">
                <span>
                  Este pedido mudou depois que você começou a editar (outra pessoa alterou itens ou o recebimento).
                  Salvar será recusado. Recarregue para ver a versão atual - o que você digitou aqui será descartado.
                </span>
                <button
                  type="button"
                  onClick={() => recarregar(pedido)}
                  className="shrink-0 rounded-md border border-ambar px-3 py-1 text-xs font-bold text-azul-noite hover:bg-ambar"
                >
                  Recarregar pedido
                </button>
              </div>
            )}
            {status[pedido.id] && (
              <div className="border-t border-cinza-claro px-4 py-2 text-xs text-cinza-medio">
                {status[pedido.id]}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
