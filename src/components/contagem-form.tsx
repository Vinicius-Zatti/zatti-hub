"use client";

import { useRef, useState, useTransition } from "react";
import type { Produto } from "@/lib/types";
import { registrarContagemAction } from "@/app/(app)/estoque/contagem/actions";
import { GRUPO_ORDEM, nomeGrupo } from "@/lib/grupos";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const WHATSAPP_VINICIUS = "5511963898411";
const PENDENTE_PREFIX = "PENDENTE-";

type ItemCustom = {
  sku: string;
  nome: string;
  grupo: string;
  unidadeBase: string;
  precoUnitario: null;
};

function skuAvulso(nome: string): string {
  const slug = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${PENDENTE_PREFIX}${slug}-${Date.now()}`;
}

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hojeISO(): string {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
}

export function ContagemForm({ produtos }: { produtos: Produto[] }) {
  const [tela, setTela] = useState<"data" | "aviso" | "inventario">("data");
  const [dataISO, setDataISO] = useState(hojeISO());
  const [customItens, setCustomItens] = useState<ItemCustom[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [confirmados, setConfirmados] = useState<Record<string, number>>({});
  const [addNome, setAddNome] = useState("");
  const [addUnidade, setAddUnidade] = useState("UN");
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const ativos = produtos.filter((p) => p.ativo);
  const gruposPresentes = [
    ...GRUPO_ORDEM.filter((g) => ativos.some((p) => p.grupo === g)),
    ...Array.from(new Set(ativos.map((p) => p.grupo))).filter((g) => !GRUPO_ORDEM.includes(g)),
  ];
  const todos = [...ativos, ...customItens];
  const totalItens = todos.length;
  const confirmadosCount = todos.filter((i) => confirmados[i.sku] !== undefined).length;
  const pct = totalItens > 0 ? (confirmadosCount / totalItens) * 100 : 0;
  const tudoConfirmado = totalItens > 0 && confirmadosCount === totalItens;

  const totalMonetario = todos.reduce((soma, item) => {
    const qty = confirmados[item.sku];
    if (qty === undefined || item.precoUnitario === null) return soma;
    return soma + qty * item.precoUnitario;
  }, 0);

  const [ano, mesNum] = dataISO.split("-");
  const mesDisplay = dataISO ? `${MESES[Number(mesNum) - 1]} ${ano}` : "";

  function confirmarData() {
    if (!dataISO) return;
    setTela("aviso");
  }

  function focarProximo(skuAtual: string) {
    const idx = todos.findIndex((i) => i.sku === skuAtual);
    for (let j = idx + 1; j < todos.length; j++) {
      if (confirmados[todos[j].sku] === undefined) {
        const el = inputRefs.current.get(todos[j].sku);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => el.focus(), 250);
        }
        break;
      }
    }
  }

  function confirmarItem(sku: string) {
    const raw = (valores[sku] ?? "").trim();
    const val = Number(raw.replace(",", "."));
    if (raw === "" || Number.isNaN(val) || val < 0) {
      const el = inputRefs.current.get(sku);
      el?.focus();
      return;
    }
    const qty = Number.isInteger(val) ? val : Number(val.toFixed(3));
    setConfirmados((c) => ({ ...c, [sku]: qty }));
    setValores((v) => ({ ...v, [sku]: String(qty) }));
    focarProximo(sku);
  }

  function editarItem(sku: string) {
    setConfirmados((c) => {
      const novo = { ...c };
      delete novo[sku];
      return novo;
    });
    setTimeout(() => {
      const el = inputRefs.current.get(sku);
      el?.focus();
      el?.select();
    }, 0);
  }

  function adicionarItemAvulso() {
    const nome = addNome.trim();
    if (!nome) return;
    const sku = skuAvulso(nome);
    setCustomItens((c) => [
      ...c,
      { sku, nome, grupo: "CUSTOM", unidadeBase: addUnidade.trim() || "UN", precoUnitario: null },
    ]);
    setAddNome("");
    setAddUnidade("UN");
    setTimeout(() => {
      const el = inputRefs.current.get(sku);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
    }, 50);
  }

  function handleEnviar() {
    if (!tudoConfirmado) return;
    setErro(null);

    const linhasCadastradas = ativos.map((p) => ({
      sku: p.sku,
      quantidade: confirmados[p.sku],
    }));
    const linhasAvulsas = customItens.map((c) => ({
      sku: c.sku,
      quantidade: confirmados[c.sku],
      nomeAvulso: c.nome,
      unidadeAvulso: c.unidadeBase,
    }));

    startTransition(async () => {
      try {
        await registrarContagemAction([...linhasCadastradas, ...linhasAvulsas], dataISO);
        setEnviado(true);
      } catch {
        setErro("Não deu pra registrar agora. Tenta de novo em instantes.");
      }
    });
  }

  function handleWhatsApp() {
    const texto = encodeURIComponent(
      `Oi Vinícius, já fiz o inventário de ${mesDisplay} e enviei para a planilha!`
    );
    window.open(`https://wa.me/${WHATSAPP_VINICIUS}?text=${texto}`, "_blank");
  }

  function handleCSV() {
    const [a, m, d] = dataISO.split("-");
    const dataFmt = `${d}/${m}/${a}`;
    const linhas = ["Data;Mês;SKU;Grupo;Nome;Unidade Base;Quantidade;Preço Unitário;Total"];
    todos.forEach((item) => {
      const qty = confirmados[item.sku];
      const preco = item.precoUnitario !== null ? item.precoUnitario.toFixed(2).replace(".", ",") : "a calcular";
      const total = qty !== undefined && item.precoUnitario !== null
        ? (qty * item.precoUnitario).toFixed(2).replace(".", ",")
        : "";
      linhas.push(
        [dataFmt, mesDisplay, item.sku, nomeGrupo(item.grupo), item.nome, item.unidadeBase, String(qty ?? "").replace(".", ","), preco, total].join(";")
      );
    });
    const csv = "﻿" + linhas.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a2 = document.createElement("a");
    a2.href = url;
    a2.download = `inventario-domquixote-${dataISO}.csv`;
    document.body.appendChild(a2);
    a2.click();
    document.body.removeChild(a2);
    URL.revokeObjectURL(url);
  }

  // ── TELA 1: DATA ──────────────────────────────────────────────────────
  if (tela === "data") {
    return (
      <div className="mx-auto max-w-md pb-10 text-center">
        <h1 className="font-display text-2xl font-bold text-azul-noite">Contagem de Estoque</h1>
        <p className="mt-1 text-sm text-cinza-medio">Informe a data da contagem para começar.</p>
        <div className="mt-8 rounded-xl border border-cinza-claro bg-branco p-5 text-left">
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-cinza-medio">
            Data da contagem
          </label>
          <input
            type="date"
            value={dataISO}
            onChange={(e) => setDataISO(e.target.value)}
            className="w-full border-none bg-transparent text-xl font-bold text-cinza outline-none"
          />
        </div>
        <button
          onClick={confirmarData}
          disabled={!dataISO}
          className="mt-6 w-full rounded-lg bg-ambar px-4 py-3.5 text-sm font-bold text-azul-noite disabled:opacity-40"
        >
          Confirmar data
        </button>
      </div>
    );
  }

  // ── TELA 2: AVISO ─────────────────────────────────────────────────────
  if (tela === "aviso") {
    return (
      <div className="mx-auto max-w-md pb-10">
        <h1 className="font-display text-2xl font-bold text-azul-noite">Inventário Dom Quixote</h1>
        <p className="mt-1 text-sm text-cinza-medio capitalize">{mesDisplay}</p>
        <div className="mt-6 rounded-xl border border-ambar/60 bg-ambar/10 p-5">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ambar">
            Atenção antes de começar
          </div>
          <p className="mb-3 text-sm leading-relaxed text-cinza">
            Registre sempre a <strong>quantidade na unidade base</strong> do produto, independente de
            como ele veio embalado:
          </p>
          <ul className="flex flex-col gap-1.5">
            {[
              "1 fardo de Coca-Cola com 12 unidades → coloque 12",
              "1 pacote de pão com 8 unidades → coloque 8",
              "1 caixa com 75 hambúrgueres → coloque 75",
              "1 pacote de 2 kg de bacon → coloque 2",
              "Produto não tem em estoque → coloque 0",
            ].map((linha) => (
              <li key={linha} className="pl-4 text-sm leading-relaxed text-cinza relative before:absolute before:left-0 before:content-['→'] before:text-ambar">
                {linha}
              </li>
            ))}
          </ul>
        </div>
        <button
          onClick={() => setTela("inventario")}
          className="mt-6 w-full rounded-lg bg-ambar px-4 py-3.5 text-sm font-bold text-azul-noite"
        >
          Entendido, iniciar contagem
        </button>
      </div>
    );
  }

  // ── TELA 3: INVENTÁRIO ───────────────────────────────────────────────
  return (
    <div className="pb-40">
      <div className="sticky top-0 z-10 -mx-4 rounded-t-lg bg-azul-noite px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="text-[9px] font-bold uppercase tracking-widest text-ambar">
          Zatti Consultoria · M.E.G.A.
        </div>
        <div className="font-display text-base font-bold text-off-white">Inventário Dom Quixote</div>
        <div className="text-[11px] text-cinza-claro capitalize">{mesDisplay}</div>
        <div className="mt-2 h-[3px] overflow-hidden rounded bg-azul-petroleo">
          <div className="h-full rounded bg-ambar transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-right text-[10px] text-cinza-claro">
          {confirmadosCount} de {totalItens} itens confirmados
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-4">
        {gruposPresentes.map((g) => {
          const itens = ativos.filter((p) => p.grupo === g);
          if (itens.length === 0) return null;
          return (
            <div key={g} className="overflow-hidden rounded-lg border border-cinza-claro bg-branco">
              <div className="flex items-center justify-between bg-azul-petroleo px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-off-white">
                <span>{nomeGrupo(g)}</span>
                <span className="font-normal text-cinza-claro">
                  {itens.length} {itens.length === 1 ? "item" : "itens"}
                </span>
              </div>
              <div className="divide-y divide-cinza-claro">
                {itens.map((p) => (
                  <ItemRow
                    key={p.sku}
                    sku={p.sku}
                    nome={p.nome}
                    unidadeBase={p.unidadeBase}
                    precoUnitario={p.precoUnitario}
                    valor={valores[p.sku] ?? ""}
                    confirmado={confirmados[p.sku]}
                    onChangeValor={(v) => setValores((s) => ({ ...s, [p.sku]: v }))}
                    onConfirmar={() => confirmarItem(p.sku)}
                    onEditar={() => editarItem(p.sku)}
                    registerRef={(el) => {
                      if (el) inputRefs.current.set(p.sku, el);
                      else inputRefs.current.delete(p.sku);
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {customItens.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-cinza-claro bg-branco">
            <div className="bg-azul-noite px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-off-white">
              Itens Adicionados
            </div>
            <div className="divide-y divide-cinza-claro">
              {customItens.map((c) => (
                <ItemRow
                  key={c.sku}
                  sku={c.sku}
                  nome={c.nome}
                  unidadeBase={c.unidadeBase}
                  precoUnitario={c.precoUnitario}
                  valor={valores[c.sku] ?? ""}
                  confirmado={confirmados[c.sku]}
                  onChangeValor={(v) => setValores((s) => ({ ...s, [c.sku]: v }))}
                  onConfirmar={() => confirmarItem(c.sku)}
                  onEditar={() => editarItem(c.sku)}
                  registerRef={(el) => {
                    if (el) inputRefs.current.set(c.sku, el);
                    else inputRefs.current.delete(c.sku);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border-2 border-cinza-claro bg-branco">
          <div className="border-b border-cinza-claro bg-off-white px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-cinza-medio">
            Item não encontrado na lista? Adicione abaixo
          </div>
          <div className="flex flex-col gap-2 p-3.5">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nome do produto"
                value={addNome}
                onChange={(e) => setAddNome(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none"
              />
              <select
                value={addUnidade}
                onChange={(e) => setAddUnidade(e.target.value)}
                className="w-20 rounded-md border border-cinza-claro px-2 py-2 text-sm font-semibold focus:border-ambar focus:outline-none"
              >
                <option>UN</option>
                <option>KG</option>
                <option>LT</option>
              </select>
            </div>
            <button
              onClick={adicionarItemAvulso}
              className="w-full rounded-md bg-azul-noite px-4 py-2.5 text-sm font-bold text-off-white hover:bg-azul-petroleo"
            >
              + Adicionar item
            </button>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 bg-azul-noite p-3">
        <div className="mx-auto max-w-3xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wide text-cinza-claro">
              Total do inventário
            </div>
            <div className="font-display text-xl font-bold text-ambar">R$ {brl(totalMonetario)}</div>
          </div>
          <div className="mb-2 text-center text-[11px] text-cinza-claro">
            {enviado
              ? "Inventário gravado na planilha."
              : tudoConfirmado
                ? "Todos os itens confirmados. Pronto para enviar."
                : `${totalItens - confirmadosCount} ${totalItens - confirmadosCount === 1 ? "item" : "itens"} ainda não confirmado${totalItens - confirmadosCount === 1 ? "" : "s"}`}
          </div>
          {erro && <div className="mb-2 text-center text-[11px] text-red-300">{erro}</div>}

          {tudoConfirmado && !enviado && (
            <button
              onClick={handleEnviar}
              disabled={isPending}
              className="block w-full rounded-lg bg-ambar px-4 py-3.5 text-sm font-extrabold text-azul-noite disabled:opacity-60"
            >
              {isPending ? "Enviando..." : "Enviar Inventário"}
            </button>
          )}

          {enviado && (
            <button
              onClick={handleWhatsApp}
              className="mt-1 block w-full rounded-lg bg-azul-petroleo px-4 py-3 text-sm font-bold text-off-white hover:bg-[#24506e]"
            >
              Avisar Vinícius pelo WhatsApp
            </button>
          )}

          {tudoConfirmado && (
            <button
              onClick={handleCSV}
              className="mt-2 block w-full rounded-lg border border-azul-petroleo px-3 py-2 text-xs font-semibold text-cinza-claro hover:bg-azul-petroleo"
            >
              Baixar CSV (backup)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemRow({
  sku,
  nome,
  unidadeBase,
  precoUnitario,
  valor,
  confirmado,
  onChangeValor,
  onConfirmar,
  onEditar,
  registerRef,
}: {
  sku: string;
  nome: string;
  unidadeBase: string;
  precoUnitario: number | null;
  valor: string;
  confirmado: number | undefined;
  onChangeValor: (v: string) => void;
  onConfirmar: () => void;
  onEditar: () => void;
  registerRef: (el: HTMLInputElement | null) => void;
}) {
  const ok = confirmado !== undefined;
  const precoTxt = precoUnitario !== null ? `R$ ${brl(precoUnitario)}/${unidadeBase}` : "a calcular";

  return (
    <div className={`flex items-center gap-3 px-3.5 py-3 ${ok ? "bg-ambar/10" : "bg-branco"}`}>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${ok ? "font-semibold text-azul-noite" : "font-medium text-cinza"}`}>
          {nome}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${ok ? "bg-ambar text-branco" : "bg-cinza-claro text-cinza-medio"}`}>
            {unidadeBase}
          </span>
          {ok && precoUnitario !== null ? (
            <>
              <span className="text-[11px] font-bold text-ambar">R$ {brl(confirmado * precoUnitario)}</span>
              <span className="text-[11px] text-cinza-medio">· {precoTxt}</span>
            </>
          ) : (
            <span className="text-[11px] text-cinza-medio">{precoTxt}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {ok ? (
          <>
            <input
              type="text"
              value={confirmado}
              disabled
              className="w-16 border-none bg-transparent text-right text-base font-bold text-ambar outline-none"
            />
            <button
              onClick={onEditar}
              className="rounded-md border border-cinza-claro px-3 py-2.5 text-xs font-semibold text-cinza-medio hover:bg-off-white"
            >
              Editar
            </button>
          </>
        ) : (
          <>
            <input
              ref={registerRef}
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={valor}
              onChange={(e) => onChangeValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onConfirmar();
                }
              }}
              className="w-16 rounded-md border border-cinza-claro px-2 py-2.5 text-right text-base font-bold text-cinza focus:border-ambar focus:outline-none"
            />
            <button
              onClick={onConfirmar}
              className="rounded-md bg-ambar px-3 py-2.5 text-xs font-bold text-azul-noite hover:bg-[#b07720]"
            >
              Confirmar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
