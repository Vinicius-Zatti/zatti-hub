"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { SugestaoCompra, Pedido } from "@/lib/types";
import { Th } from "@/components/tabela";
import { CodigoSelect } from "@/components/codigo-select";
import {
  confirmarItemAction,
  confirmarVencedorAction,
  desfazerVencedorAction,
  atualizarPrevisaoEntregaAction,
} from "@/app/(app)/estoque/pedidos/cotacoes/actions";
import {
  gerarImagemPedido,
  compartilharOuCopiarImagem,
  CompartilharCancelado,
  type LinhaPedido,
} from "@/lib/canvas-tabela";
import { toNumeroBR } from "@/lib/sheets/numero";
import { textoEdicaoQuantidade } from "@/lib/unidades";

function formatMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumero(v: number): string {
  return String(v).replace(".", ",");
}

// Preço é sempre por fornecedor (cada um cota o próprio valor pro mesmo
// item) - toda chave de estado de preço usa fornecedor+sku, nunca só sku.
// Quantidade continua só por sku: é a mesma necessidade, não muda conforme
// quem acaba fornecendo.
function chave(fornecedor: string, sku: string): string {
  return `${fornecedor}::${sku}`;
}

/** Editor de Espelhos: a partir da mesma cotação calculada de Criar
 * Cotação, deixa o comprador confirmar quantidade, fornecedor vencedor
 * (quando o item é cotado com mais de um) e preço, por fornecedor. Cada
 * Confirmar grava na hora - não existe mais botão Salvar. Compartilhar
 * manda "Pedido de Compra", com valor por item e total. */
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

  // Só considera um vencedor já decidido quando EXATAMENTE um dos
  // fornecedores que disputam o item tem ele salvo no próprio Pedido. Criar
  // Cotação não sabe de vencedor - confirmar um item disputado grava o mesmo
  // item pra todos os fornecedores concorrentes ao mesmo tempo (a decisão de
  // quem fornece é só daqui). Se dois ou mais concorrentes têm o item
  // salvo, ninguém escolheu de verdade ainda - continua aparecendo em
  // todos, esperando "Confirmar aqui".
  const [vencedor, setVencedor] = useState<Record<string, string | null>>(() => {
    const salvoEm: Record<string, string[]> = {};
    for (const fornecedor of fornecedores) {
      for (const item of pedidoSalvoPorFornecedor[fornecedor]?.itens ?? []) {
        (salvoEm[item.sku] ??= []).push(fornecedor);
      }
    }
    const inicial: Record<string, string | null> = {};
    for (const [sku, lista] of Object.entries(salvoEm)) {
      if (lista.length === 1) inicial[sku] = lista[0];
    }
    return inicial;
  });

  // Última quantidade/preço confirmados - o que a tela mostra fora do modo
  // de edição. Quantidade é global por SKU (mesma necessidade em qualquer
  // fornecedor); preço é por fornecedor+SKU (cada um cota o próprio valor).
  const [quantidadesTexto, setQuantidadesTexto] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const fornecedor of fornecedores) {
      for (const item of pedidoSalvoPorFornecedor[fornecedor]?.itens ?? []) {
        inicial[item.sku] = textoEdicaoQuantidade(item.quantidadePedida, item.unidadeBase);
      }
    }
    for (const fornecedor of fornecedores) {
      for (const item of itensPorFornecedor[fornecedor] ?? []) {
        if (!(item.sku in inicial)) inicial[item.sku] = textoEdicaoQuantidade(item.quantidadeSugerida, item.unidadeBase);
      }
    }
    return inicial;
  });

  const [precosTexto, setPrecosTexto] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const fornecedor of fornecedores) {
      for (const item of pedidoSalvoPorFornecedor[fornecedor]?.itens ?? []) {
        inicial[chave(fornecedor, item.sku)] =
          item.precoAtualizado !== null ? formatNumero(item.precoAtualizado) : "";
      }
    }
    for (const fornecedor of fornecedores) {
      for (const item of itensPorFornecedor[fornecedor] ?? []) {
        const k = chave(fornecedor, item.sku);
        if (!(k in inicial)) {
          inicial[k] = item.precoUnitario !== null ? formatNumero(item.precoUnitario) : "";
        }
      }
    }
    return inicial;
  });

  function quantidadeDe(sku: string): number {
    return toNumeroBR(quantidadesTexto[sku]) ?? 0;
  }

  function precoDe(fornecedor: string, sku: string): number | null {
    return toNumeroBR(precosTexto[chave(fornecedor, sku)]);
  }

  // Enquanto um item disputado ainda não tem vencedor escolhido, o mesmo SKU
  // aparece em mais de um bloco com preço cotado diferente em cada um - essa
  // conta acha, entre os que já têm preço digitado, qual é o menor. Só entra
  // em jogo com 2+ preços digitados (com só 1, não tem o que comparar ainda).
  const melhorPrecoPorSku = useMemo(() => {
    const resultado: Record<string, number> = {};
    for (const [sku, concorrentes] of Object.entries(fornecedoresPorSku)) {
      if (concorrentes.length < 2) continue;
      const precos = concorrentes
        .map((f) => toNumeroBR(precosTexto[chave(f, sku)]))
        .filter((p): p is number => p !== null);
      if (precos.length < 2) continue;
      resultado[sku] = Math.min(...precos);
    }
    return resultado;
  }, [fornecedoresPorSku, precosTexto]);

  // Texto em modo "Nome Fornecedor" (embalagem) - derivado do texto em
  // unidade base pra exibição; convertido de volta na hora de confirmar.
  const [quantidadesTextoEmbalagem, setQuantidadesTextoEmbalagem] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const fornecedor of fornecedores) {
      for (const item of itensPorFornecedor[fornecedor] ?? []) {
        if (item.sku in inicial) continue;
        const base = toNumeroBR(quantidadesTexto[item.sku]) ?? 0;
        inicial[item.sku] = item.qtdUnidadeBasePorEmbalagem
          ? formatNumero(Math.ceil(base / item.qtdUnidadeBasePorEmbalagem))
          : "";
      }
    }
    return inicial;
  });

  const [precosTextoEmbalagem, setPrecosTextoEmbalagem] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const fornecedor of fornecedores) {
      for (const item of itensPorFornecedor[fornecedor] ?? []) {
        const k = chave(fornecedor, item.sku);
        const precoBase = toNumeroBR(precosTexto[k]);
        inicial[k] =
          precoBase !== null && item.qtdUnidadeBasePorEmbalagem
            ? formatNumero(precoBase * item.qtdUnidadeBasePorEmbalagem)
            : "";
      }
    }
    return inicial;
  });

  function itemSemEmbalagem(item: SugestaoCompra): boolean {
    return !item.nomeCompra.trim() || !item.unidadeEmbalagemFornecedor.trim() || !item.qtdUnidadeBasePorEmbalagem;
  }

  const [previsaoEntrega, setPrevisaoEntrega] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const fornecedor of fornecedores) {
      inicial[fornecedor] = pedidoSalvoPorFornecedor[fornecedor]?.previsaoEntrega ?? "";
    }
    return inicial;
  });

  const [compartilhando, setCompartilhando] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, string>>({});
  const [modo, setModo] = useState<Record<string, "interno" | "fornecedor">>({});

  // Item com quantidade zerada (não precisa comprar desse fornecedor) fica
  // fora da tabela por padrão - só o "+ Adicionar item" traz ele de volta,
  // por fornecedor (o mesmo item pode ficar revelado em vários blocos ao
  // mesmo tempo, útil enquanto ainda tá comparando preço de item disputado).
  const [revelados, setRevelados] = useState<Record<string, boolean>>({});

  // Campo em edição: presença na chave = editando. Quantidade é por SKU
  // (mesmo valor em qualquer bloco); preço é por fornecedor+SKU.
  const [editandoQtd, setEditandoQtd] = useState<Record<string, string>>({});
  const [editandoPreco, setEditandoPreco] = useState<Record<string, string>>({});
  const [confirmandoVencedor, setConfirmandoVencedor] = useState<Record<string, boolean>>({});

  // Clicar em "vencedor aqui" pede confirmação antes de desfazer - trocar
  // sem querer faz o item sumir desse bloco e reaparecer pra escolher de
  // novo em todos os fornecedores concorrentes.
  const [confirmarTroca, setConfirmarTroca] = useState<{ sku: string; fornecedor: string } | null>(null);
  const [desfazendoTroca, setDesfazendoTroca] = useState(false);

  function itensVisiveisDoFornecedor(fornecedor: string): SugestaoCompra[] {
    return (itensPorFornecedor[fornecedor] ?? []).filter((item) => {
      const v = vencedor[item.sku];
      return v === undefined || v === null || v === fornecedor;
    });
  }

  /** Grava um item (quantidade + preço) no fornecedor informado - a
   * quantidade sincroniza sozinha com qualquer outro fornecedor que já
   * dispute esse SKU (feito no servidor, ver `confirmarItem` em
   * `lib/pedidos.ts`). Usada tanto pelo confirmar de quantidade quanto pelo
   * de preço - cada um manda o valor atual do outro campo, pra não apagar
   * o que já estava lá. */
  async function persistirItem(fornecedor: string, item: SugestaoCompra, quantidadeBase: number, precoBase: number | null) {
    const resultado = await confirmarItemAction({
      fornecedor,
      dataContagemBase: dataUsada,
      item: {
        sku: item.sku,
        nome: item.nome,
        nomeCompra: item.nomeCompra,
        unidadeBase: item.unidadeBase,
        quantidadePedida: quantidadeBase,
        precoAntigo: item.precoUnitario,
        precoAtualizado: precoBase,
      },
    });
    if ("erro" in resultado) {
      setStatus((s) => ({ ...s, [fornecedor]: resultado.erro }));
    }
  }

  function iniciarEdicaoQtd(fornecedor: string, item: SugestaoCompra) {
    const modoAtual = modo[fornecedor] ?? "interno";
    setEditandoQtd((q) => ({
      ...q,
      [item.sku]: modoAtual === "interno" ? (quantidadesTexto[item.sku] ?? "") : (quantidadesTextoEmbalagem[item.sku] ?? ""),
    }));
  }

  async function confirmarEdicaoQtd(fornecedor: string, item: SugestaoCompra) {
    const raw = (editandoQtd[item.sku] ?? "").trim().replace(",", ".");
    const num = Number(raw);
    setEditandoQtd((q) => {
      const novo = { ...q };
      delete novo[item.sku];
      return novo;
    });
    if (raw === "" || Number.isNaN(num) || num < 0) return;

    const modoAtual = modo[fornecedor] ?? "interno";
    const novaQtdBase = modoAtual === "interno" ? num : num * (item.qtdUnidadeBasePorEmbalagem ?? 1);
    setQuantidadesTexto((q) => ({ ...q, [item.sku]: formatNumero(novaQtdBase) }));
    if (item.qtdUnidadeBasePorEmbalagem) {
      setQuantidadesTextoEmbalagem((q) => ({
        ...q,
        [item.sku]: formatNumero(Math.ceil(novaQtdBase / (item.qtdUnidadeBasePorEmbalagem as number))),
      }));
    }
    await persistirItem(fornecedor, item, novaQtdBase, precoDe(fornecedor, item.sku));
  }

  function iniciarEdicaoPreco(fornecedor: string, item: SugestaoCompra) {
    const k = chave(fornecedor, item.sku);
    const modoAtual = modo[fornecedor] ?? "interno";
    setEditandoPreco((p) => ({
      ...p,
      [k]: modoAtual === "interno" ? (precosTexto[k] ?? "") : (precosTextoEmbalagem[k] ?? ""),
    }));
  }

  async function confirmarEdicaoPreco(fornecedor: string, item: SugestaoCompra) {
    const k = chave(fornecedor, item.sku);
    const raw = (editandoPreco[k] ?? "").trim().replace(",", ".");
    const num = Number(raw);
    setEditandoPreco((p) => {
      const novo = { ...p };
      delete novo[k];
      return novo;
    });
    if (raw === "" || Number.isNaN(num) || num < 0) return;

    const modoAtual = modo[fornecedor] ?? "interno";
    const novoPrecoBase =
      modoAtual === "interno" ? num : item.qtdUnidadeBasePorEmbalagem ? num / item.qtdUnidadeBasePorEmbalagem : num;
    setPrecosTexto((p) => ({ ...p, [k]: formatNumero(novoPrecoBase) }));
    if (item.qtdUnidadeBasePorEmbalagem) {
      setPrecosTextoEmbalagem((p) => ({ ...p, [k]: formatNumero(novoPrecoBase * (item.qtdUnidadeBasePorEmbalagem as number)) }));
    }
    await persistirItem(fornecedor, item, quantidadeDe(item.sku), novoPrecoBase);
  }

  async function confirmarVencedorClick(fornecedor: string, item: SugestaoCompra) {
    setConfirmandoVencedor((c) => ({ ...c, [item.sku]: true }));
    const outros = (fornecedoresPorSku[item.sku] ?? []).filter((f) => f !== fornecedor);
    const resultado = await confirmarVencedorAction({
      dataContagemBase: dataUsada,
      fornecedorVencedor: fornecedor,
      outrosFornecedores: outros,
      item: {
        sku: item.sku,
        nome: item.nome,
        nomeCompra: item.nomeCompra,
        unidadeBase: item.unidadeBase,
        quantidadePedida: quantidadeDe(item.sku),
        precoAntigo: item.precoUnitario,
        precoAtualizado: precoDe(fornecedor, item.sku),
      },
    });
    setConfirmandoVencedor((c) => ({ ...c, [item.sku]: false }));
    if ("erro" in resultado) {
      setStatus((s) => ({ ...s, [fornecedor]: resultado.erro }));
      return;
    }
    setVencedor((v) => ({ ...v, [item.sku]: fornecedor }));
  }

  async function desfazerVencedorClick() {
    if (!confirmarTroca) return;
    const { sku, fornecedor } = confirmarTroca;
    const item = (itensPorFornecedor[fornecedor] ?? []).find((i) => i.sku === sku);
    if (!item) {
      setConfirmarTroca(null);
      return;
    }
    setDesfazendoTroca(true);
    const outros = (fornecedoresPorSku[sku] ?? []).filter((f) => f !== fornecedor);
    const resultado = await desfazerVencedorAction({
      dataContagemBase: dataUsada,
      fornecedoresParaRecriar: outros,
      item: {
        sku: item.sku,
        nome: item.nome,
        nomeCompra: item.nomeCompra,
        unidadeBase: item.unidadeBase,
        quantidadePedida: quantidadeDe(sku),
        precoAntigo: item.precoUnitario,
      },
    });
    setDesfazendoTroca(false);
    if ("erro" in resultado) {
      setStatus((s) => ({ ...s, [fornecedor]: resultado.erro }));
      setConfirmarTroca(null);
      return;
    }
    setVencedor((v) => {
      const novo = { ...v };
      delete novo[sku];
      return novo;
    });
    // preço concorrente volta em branco (recriado sem preço) - limpa aqui
    // também pra tela bater com o banco.
    setPrecosTexto((p) => {
      const novo = { ...p };
      for (const f of outros) delete novo[chave(f, sku)];
      return novo;
    });
    setConfirmarTroca(null);
  }

  async function atualizarPrevisao(fornecedor: string, novaData: string) {
    setPrevisaoEntrega((p) => ({ ...p, [fornecedor]: novaData }));
    const resultado = await atualizarPrevisaoEntregaAction({
      fornecedor,
      dataContagemBase: dataUsada,
      previsaoEntrega: novaData || null,
    });
    if ("erro" in resultado) {
      setStatus((s) => ({ ...s, [fornecedor]: resultado.erro }));
    }
  }

  async function compartilhar(fornecedor: string) {
    const itens = itensVisiveisDoFornecedor(fornecedor).filter((item) => quantidadeDe(item.sku) > 0);
    if (itens.length === 0) {
      setStatus((s) => ({ ...s, [fornecedor]: "Nenhum item pra compartilhar." }));
      return;
    }
    setCompartilhando((c) => ({ ...c, [fornecedor]: true }));
    const modoCompartilhar = modo[fornecedor] ?? "interno";
    const linhas: LinhaPedido[] = itens.map((item) => {
      const preco = precoDe(fornecedor, item.sku);
      const valorTotal = preco !== null ? formatMoeda(quantidadeDe(item.sku) * preco) : "a calcular";
      if (modoCompartilhar === "interno" || itemSemEmbalagem(item)) {
        return {
          item: item.nome,
          und: item.unidadeBase,
          qtd: formatNumero(quantidadeDe(item.sku)),
          valor: valorTotal,
        };
      }
      return {
        item: item.nomeCompra || item.nome,
        und: item.unidadeEmbalagemFornecedor,
        qtd: quantidadesTextoEmbalagem[item.sku] ?? "",
        valor: valorTotal,
      };
    });
    const total = itens.reduce((soma, item) => {
      const preco = precoDe(fornecedor, item.sku);
      if (preco === null) return soma;
      return soma + quantidadeDe(item.sku) * preco;
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
          Confirma quantidade, fornecedor vencedor e preço de cada item - cada confirmação já grava na
          hora. Compartilha quando estiver pronto.
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
          const todosItens = itensVisiveisDoFornecedor(fornecedor);
          const itensExibidos = todosItens.filter(
            (item) => quantidadeDe(item.sku) > 0 || revelados[chave(fornecedor, item.sku)]
          );
          const itensOcultos = todosItens.filter(
            (item) => !(quantidadeDe(item.sku) > 0 || revelados[chave(fornecedor, item.sku)])
          );
          const subtotal = itensExibidos.reduce((soma, item) => {
            const preco = precoDe(fornecedor, item.sku);
            if (preco === null) return soma;
            return soma + quantidadeDe(item.sku) * preco;
          }, 0);
          const pedidoMinimo = pedidoMinimoPorFornecedor[fornecedor] ?? null;
          const bateuMinimo = pedidoMinimo === null || subtotal >= pedidoMinimo;

          const modoAtual = modo[fornecedor] ?? "interno";
          const totalVolumes = itensExibidos.reduce((soma, item) => soma + quantidadeDe(item.sku), 0);

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
                      onChange={(e) => atualizarPrevisao(fornecedor, e.target.value)}
                      className="rounded border border-cinza-claro bg-branco px-1.5 py-0.5 text-xs text-cinza focus:outline-none"
                    />
                  </label>
                  {!bateuMinimo && (
                    <span className="text-xs font-semibold text-ambar">
                      abaixo do pedido mínimo ({formatMoeda(pedidoMinimo as number)})
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => compartilhar(fornecedor)}
                    disabled={compartilhando[fornecedor]}
                    className="shrink-0 rounded-md bg-ambar px-2.5 py-1 text-[11px] font-bold text-azul-noite hover:bg-[#b07720] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {compartilhando[fornecedor] ? "Gerando..." : "Compartilhar"}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 border-b border-cinza-claro px-4 py-2">
                <button
                  type="button"
                  onClick={() => setModo((m) => ({ ...m, [fornecedor]: "interno" }))}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                    modoAtual === "interno"
                      ? "border-azul-noite bg-azul-noite text-branco"
                      : "border-cinza-claro text-cinza-medio hover:border-azul-noite"
                  }`}
                >
                  Nome Interno
                </button>
                <button
                  type="button"
                  onClick={() => setModo((m) => ({ ...m, [fornecedor]: "fornecedor" }))}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                    modoAtual === "fornecedor"
                      ? "border-azul-noite bg-azul-noite text-branco"
                      : "border-cinza-claro text-cinza-medio hover:border-azul-noite"
                  }`}
                >
                  Nome Fornecedor
                </button>
              </div>

              {modoAtual === "fornecedor" && itensExibidos.some(itemSemEmbalagem) && (
                <div className="border-b border-vermelho/30 bg-vermelho/5 px-4 py-2 text-xs text-vermelho">
                  Tem item sem Nome de Compra, Und. Embalagem ou Qtd. Base/Embalagem cadastrados. Completa em{" "}
                  <a href="/estoque/produtos/edicao" className="font-semibold underline">
                    Produtos → Edição de Dados
                  </a>{" "}
                  pra editar quantidade/preço dele nesse modo.
                </div>
              )}

              <div className="max-h-[55vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-off-white text-cinza-medio">
                      <Th>{modoAtual === "interno" ? "Item" : "Nome de Compra"}</Th>
                      <Th align="right">Qtd. pedida</Th>
                      <Th align="right">Preço antigo</Th>
                      <Th align="right">Preço atualizado</Th>
                      <Th align="right">Preço total</Th>
                      <Th>Fornecedor</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensExibidos.map((item) => {
                      const disputado = (fornecedoresPorSku[item.sku] ?? []).length > 1;
                      const jaVencido = vencedor[item.sku] === fornecedor;
                      const preco = precoDe(fornecedor, item.sku);
                      const precoTotal = preco !== null ? quantidadeDe(item.sku) * preco : null;
                      const ehMelhorPreco =
                        disputado &&
                        preco !== null &&
                        melhorPrecoPorSku[item.sku] !== undefined &&
                        Math.abs(preco - melhorPrecoPorSku[item.sku]) < 0.001;
                      const nomeExibido = modoAtual === "interno" ? item.nome : item.nomeCompra || item.nome;
                      const unidadeExibida = modoAtual === "interno" ? item.unidadeBase : item.unidadeEmbalagemFornecedor;
                      const semEmbalagem = modoAtual === "fornecedor" && itemSemEmbalagem(item);
                      const precoAntigoExibido =
                        modoAtual === "interno" || !item.qtdUnidadeBasePorEmbalagem
                          ? item.precoUnitario
                          : item.precoUnitario !== null
                            ? item.precoUnitario * item.qtdUnidadeBasePorEmbalagem
                            : null;
                      const kPreco = chave(fornecedor, item.sku);

                      return (
                        <tr key={item.sku} className={`border-t border-cinza-claro ${semEmbalagem ? "bg-vermelho/5" : ""}`}>
                          <td className={`px-3 py-2 font-medium ${semEmbalagem ? "text-vermelho" : "text-cinza"}`}>
                            {nomeExibido}
                            {semEmbalagem && (
                              <span className="ml-1 text-[10px] font-bold">(cadastro incompleto)</span>
                            )}
                          </td>
                          {semEmbalagem ? (
                            <>
                              <td className="px-3 py-2 text-right text-xs font-semibold text-vermelho">
                                sem embalagem
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">—</td>
                              <td className="px-3 py-2 text-right text-xs font-semibold text-vermelho">
                                sem embalagem
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2 text-right">
                                {editandoQtd[item.sku] !== undefined ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      autoFocus
                                      value={editandoQtd[item.sku]}
                                      onChange={(e) => setEditandoQtd((q) => ({ ...q, [item.sku]: e.target.value }))}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          confirmarEdicaoQtd(fornecedor, item);
                                        }
                                      }}
                                      className="w-16 rounded border border-ambar px-1.5 py-1 text-right focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => confirmarEdicaoQtd(fornecedor, item)}
                                      className="rounded bg-ambar px-2 py-1 text-[10px] font-bold text-azul-noite hover:bg-[#b07720]"
                                    >
                                      Confirmar
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className="tabular-nums text-cinza">
                                      {modoAtual === "interno"
                                        ? (quantidadesTexto[item.sku] ?? "")
                                        : (quantidadesTextoEmbalagem[item.sku] ?? "")}
                                    </span>
                                    <span className="text-xs text-cinza-medio">{unidadeExibida}</span>
                                    <button
                                      type="button"
                                      onClick={() => iniciarEdicaoQtd(fornecedor, item)}
                                      className="rounded-md border border-cinza-claro px-1.5 py-0.5 text-[10px] font-semibold text-cinza-medio hover:bg-off-white"
                                    >
                                      Editar
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">
                                {precoAntigoExibido !== null ? formatMoeda(precoAntigoExibido) : "—"}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {editandoPreco[kPreco] !== undefined ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      autoFocus
                                      value={editandoPreco[kPreco]}
                                      onChange={(e) => setEditandoPreco((p) => ({ ...p, [kPreco]: e.target.value }))}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          confirmarEdicaoPreco(fornecedor, item);
                                        }
                                      }}
                                      className="w-20 rounded border border-ambar px-1.5 py-1 text-right focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => confirmarEdicaoPreco(fornecedor, item)}
                                      className="rounded bg-ambar px-2 py-1 text-[10px] font-bold text-azul-noite hover:bg-[#b07720]"
                                    >
                                      Confirmar
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className="tabular-nums text-cinza">
                                      {modoAtual === "interno"
                                        ? (precosTexto[kPreco] ?? "")
                                        : (precosTextoEmbalagem[kPreco] ?? "")}
                                    </span>
                                    {ehMelhorPreco && (
                                      <span className="shrink-0 rounded-full bg-verde/10 px-1.5 py-0.5 text-[10px] font-bold text-verde">
                                        Melhor preço
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => iniciarEdicaoPreco(fornecedor, item)}
                                      className="rounded-md border border-cinza-claro px-1.5 py-0.5 text-[10px] font-semibold text-cinza-medio hover:bg-off-white"
                                    >
                                      Editar
                                    </button>
                                  </div>
                                )}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-azul-noite">
                            {precoTotal !== null ? formatMoeda(precoTotal) : "a calcular"}
                          </td>
                          <td className="px-3 py-2">
                            {!disputado ? (
                              <span className="text-xs text-cinza-medio">único fornecedor</span>
                            ) : jaVencido ? (
                              <button
                                type="button"
                                onClick={() => setConfirmarTroca({ sku: item.sku, fornecedor })}
                                title="Clica pra trocar o vencedor"
                                className="rounded-full bg-verde/10 px-2 py-0.5 text-xs font-semibold text-verde hover:bg-verde/20"
                              >
                                vencedor aqui
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => confirmarVencedorClick(fornecedor, item)}
                                disabled={confirmandoVencedor[item.sku]}
                                className="rounded-md border border-ambar px-2 py-1 text-[11px] font-semibold text-ambar hover:bg-ambar/10 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {confirmandoVencedor[item.sku] ? "Confirmando..." : "Confirmar aqui"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-azul-noite bg-off-white font-semibold text-cinza">
                      <td className="px-3 py-2">{itensExibidos.length} itens</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumero(Math.round(totalVolumes * 100) / 100)} volumes
                      </td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right text-xs text-cinza-medio">Valor total do pedido</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ambar">{formatMoeda(subtotal)}</td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {itensOcultos.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-cinza-claro px-4 py-2">
                  <span className="text-xs text-cinza-medio">Precisa comprar mais alguma coisa desse fornecedor?</span>
                  <CodigoSelect
                    value=""
                    placeholder="+ Adicionar item"
                    opcoes={itensOcultos.map((item) => ({
                      codigo: item.sku,
                      descricao: modoAtual === "interno" ? item.nome : item.nomeCompra || item.nome,
                    }))}
                    onChange={(sku) => setRevelados((r) => ({ ...r, [chave(fornecedor, sku)]: true }))}
                    className="w-64"
                  />
                </div>
              )}

              {status[fornecedor] && (
                <div className="border-t border-cinza-claro px-4 py-2 text-xs text-cinza-medio">
                  {status[fornecedor]}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {confirmarTroca && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-azul-noite/70 p-4">
          <div className="w-full max-w-sm rounded-xl bg-branco p-5 shadow-xl">
            <h2 className="font-display text-lg font-bold text-azul-noite">Trocar o vencedor?</h2>
            <p className="mt-2 text-sm leading-relaxed text-cinza">
              Esse item volta a aparecer pra escolher de novo em todos os fornecedores que também
              cotam ele. O preço deles volta em branco, pra reconferir.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={desfazerVencedorClick}
                disabled={desfazendoTroca}
                className="flex-1 rounded-md bg-azul-noite px-3 py-2.5 text-sm font-bold text-branco hover:bg-azul-petroleo disabled:cursor-not-allowed disabled:opacity-50"
              >
                {desfazendoTroca ? "Trocando..." : "Sim, trocar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmarTroca(null)}
                disabled={desfazendoTroca}
                className="flex-1 rounded-md border border-cinza-claro px-3 py-2.5 text-sm font-semibold text-cinza-medio hover:bg-off-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
