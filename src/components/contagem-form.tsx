"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Produto } from "@/lib/types";
import { registrarContagemAction } from "@/app/(app)/estoque/contagem/actions";
import { GRUPO_ORDEM, GRUPO_OPCOES, nomeGrupo } from "@/lib/grupos";
import { useGuardaContagem, EVENTO_CONTINUAR_CONTAGEM } from "@/components/guarda-contagem";

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
  const [grupos, setGrupos] = useState<string[]>([]);
  const [customItens, setCustomItens] = useState<ItemCustom[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [confirmados, setConfirmados] = useState<Record<string, number>>({});
  const [addNome, setAddNome] = useState("");
  const [addUnidade, setAddUnidade] = useState("UN");
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const ativos = produtos
    .filter((p) => p.ativo)
    .filter((p) => grupos.length === 0 || grupos.includes(p.grupo))
    .sort((a, b) => {
      // Posição é a ordem física de caminhada da contagem - cruza grupo (um
      // item de Hortifrúti que fisicamente fica entre dois de Congelados
      // aparece entre eles, não puxado pra uma seção à parte). Só cai pro
      // agrupamento por grupo quando nenhum dos dois tem posição definida
      // ainda (produto novo, por exemplo).
      if (a.posicao !== null && b.posicao !== null) return a.posicao - b.posicao;
      if (a.posicao !== null) return -1;
      if (b.posicao !== null) return 1;
      const gA = GRUPO_ORDEM.indexOf(a.grupo);
      const gB = GRUPO_ORDEM.indexOf(b.grupo);
      if (gA !== gB) return (gA === -1 ? 999 : gA) - (gB === -1 ? 999 : gB);
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  const comPosicao = ativos.filter((p) => p.posicao !== null);
  const semPosicao = ativos.filter((p) => p.posicao === null);
  const gruposPresentes = [
    ...GRUPO_ORDEM.filter((g) => semPosicao.some((p) => p.grupo === g)),
    ...Array.from(new Set(semPosicao.map((p) => p.grupo))).filter((g) => !GRUPO_ORDEM.includes(g)),
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
  const escopoLabel = grupos.length === 0 ? "Contagem completa" : grupos.map(nomeGrupo).join(", ");

  const { ativar, desativar } = useGuardaContagem();

  // Enquanto o inventário está em andamento, o progresso só existe aqui na
  // memória - sair sem avisar (clicando em outra aba, por exemplo) perde
  // tudo. A guarda intercepta qualquer navegação nesse período.
  useEffect(() => {
    if (tela === "inventario" && !enviado) ativar();
    else desativar();
    return () => desativar();
  }, [tela, enviado, ativar, desativar]);

  useEffect(() => {
    function focarPrimeiroPendente() {
      for (const item of todos) {
        if (confirmados[item.sku] === undefined) {
          const el = inputRefs.current.get(item.sku);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            setTimeout(() => el.focus(), 250);
          }
          break;
        }
      }
    }
    window.addEventListener(EVENTO_CONTINUAR_CONTAGEM, focarPrimeiroPendente);
    return () => window.removeEventListener(EVENTO_CONTINUAR_CONTAGEM, focarPrimeiroPendente);
  }, [todos, confirmados]);

  function confirmarData() {
    if (!dataISO) return;
    setTela("aviso");
  }

  function alternarGrupo(codigo: string) {
    setGrupos((g) => (g.includes(codigo) ? g.filter((c) => c !== codigo) : [...g, codigo]));
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
      if (!el) return;
      el.focus();
      // Cursor no final do valor, nada selecionado - reabrir um item já
      // confirmado é sempre continuar de onde parou (completar/apagar),
      // nunca substituir do zero. `.select()` deixava o cursor no início em
      // alguns celulares, exigindo um toque a mais só pra editar.
      const posicao = el.value.length;
      el.setSelectionRange(posicao, posicao);
    }, 0);
  }

  // Só confirma quem realmente tem valor digitado - item vazio (o "0" que
  // aparece é só placeholder, nunca um valor de verdade) fica de fora e
  // continua bloqueando o envio até a pessoa preencher, do jeito que já é
  // hoje pro Enviar Inventário.
  const pendentesComValor = todos.filter(
    (item) => confirmados[item.sku] === undefined && (valores[item.sku] ?? "").trim() !== ""
  );

  function confirmarTodosPreenchidos() {
    const novosConfirmados: Record<string, number> = {};
    const novosValores: Record<string, string> = {};
    for (const item of pendentesComValor) {
      const raw = valores[item.sku].trim();
      const val = Number(raw.replace(",", "."));
      if (Number.isNaN(val) || val < 0) continue;
      const qty = Number.isInteger(val) ? val : Number(val.toFixed(3));
      novosConfirmados[item.sku] = qty;
      novosValores[item.sku] = String(qty);
    }
    if (Object.keys(novosConfirmados).length === 0) return;
    setConfirmados((c) => ({ ...c, ...novosConfirmados }));
    setValores((v) => ({ ...v, ...novosValores }));

    // Leva pro primeiro item que continua vazio - é exatamente o que falta
    // preencher pra liberar o envio.
    setTimeout(() => {
      for (const item of todos) {
        if (novosConfirmados[item.sku] !== undefined) continue;
        if (confirmados[item.sku] !== undefined) continue;
        const el = inputRefs.current.get(item.sku);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => el.focus(), 250);
        }
        break;
      }
    }, 50);
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
        <div className="mt-4 rounded-xl border border-cinza-claro bg-branco p-5 text-left">
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-cinza-medio">
            O que vamos contar hoje?
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setGrupos([])}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                grupos.length === 0
                  ? "border-azul-noite bg-azul-noite text-branco"
                  : "border-cinza-claro text-cinza-medio hover:border-azul-noite"
              }`}
            >
              Contagem completa
            </button>
            {GRUPO_OPCOES.map((g) => (
              <button
                key={g.codigo}
                type="button"
                onClick={() => alternarGrupo(g.codigo)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  grupos.includes(g.codigo)
                    ? "border-ambar bg-ambar/10 text-ambar"
                    : "border-cinza-claro text-cinza-medio hover:border-ambar"
                }`}
              >
                {g.descricao}
              </button>
            ))}
          </div>
          {grupos.length > 0 && (
            <p className="mt-2 text-xs text-cinza-medio">
              Só os grupos marcados entram nessa contagem - o resto do cadastro fica de fora.
            </p>
          )}
        </div>
        <button
          onClick={confirmarData}
          disabled={!dataISO || ativos.length === 0}
          className="mt-6 w-full rounded-lg bg-ambar px-4 py-3.5 text-sm font-bold text-azul-noite disabled:opacity-40"
        >
          Confirmar data
        </button>
        {ativos.length === 0 && (
          <p className="mt-2 text-xs text-vermelho">Nenhum produto ativo nesse grupo.</p>
        )}
      </div>
    );
  }

  // ── TELA 2: AVISO ─────────────────────────────────────────────────────
  if (tela === "aviso") {
    return (
      <div className="mx-auto max-w-md pb-10">
        <h1 className="font-display text-2xl font-bold text-azul-noite">Inventário Dom Quixote</h1>
        <p className="mt-1 text-sm text-cinza-medio capitalize">
          {mesDisplay} · {escopoLabel}
        </p>
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
      <div className="sticky top-0 z-10 -mx-3 rounded-t-lg bg-azul-noite px-3 py-3 sm:-mx-6 sm:px-6">
        <div className="text-[9px] font-bold uppercase tracking-widest text-ambar">
          Zatti Consultoria · M.E.G.A.
        </div>
        <div className="font-display text-base font-bold text-off-white">Inventário Dom Quixote</div>
        <div className="text-[11px] text-cinza-claro capitalize">
          {mesDisplay} · {escopoLabel}
        </div>
        <div className="mt-2 h-[3px] overflow-hidden rounded bg-azul-petroleo">
          <div className="h-full rounded bg-ambar transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-right text-[10px] text-cinza-claro">
          {confirmadosCount} de {totalItens} itens confirmados
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-ambar/40 bg-ambar/10 px-3 py-2.5 text-xs leading-relaxed text-cinza sm:hidden">
        <span className="font-bold text-azul-noite">Tela estreita?</span>{" "}
        Recolha o menu pela seta lateral para ver melhor os nomes. Se preferir, gire o celular.
      </div>

      <div className="mt-2 flex flex-col gap-4">
        {comPosicao.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-cinza-claro bg-branco">
            <div className="flex items-center justify-between bg-azul-petroleo px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-off-white">
              <span>Ordem de contagem</span>
              <span className="font-normal text-cinza-claro">
                {comPosicao.length} {comPosicao.length === 1 ? "item" : "itens"}
              </span>
            </div>
            <div className="divide-y divide-cinza-claro">
              {comPosicao.map((p) => (
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
        )}

        {gruposPresentes.map((g) => {
          const itens = semPosicao.filter((p) => p.grupo === g);
          if (itens.length === 0) return null;
          return (
            <div key={g} className="overflow-hidden rounded-lg border border-cinza-claro bg-branco">
              <div className="flex items-center justify-between bg-azul-petroleo px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-off-white">
                <span>
                  {nomeGrupo(g)} <span className="font-normal normal-case opacity-70">(sem posição)</span>
                </span>
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

          {!tudoConfirmado && pendentesComValor.length > 0 && (
            <button
              onClick={confirmarTodosPreenchidos}
              className="mb-2 block w-full rounded-lg border border-ambar bg-ambar/10 px-4 py-3 text-sm font-bold text-ambar hover:bg-ambar/20"
            >
              Confirmar preenchidos ({pendentesComValor.length})
            </button>
          )}

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
    <div
      data-sku={sku}
      className={`flex flex-col items-stretch gap-2.5 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-3 ${
        ok ? "bg-ambar/10" : "bg-branco"
      }`}
    >
      <div className="w-full min-w-0 flex-1">
        <div className={`break-words text-[15px] leading-snug ${ok ? "font-semibold text-azul-noite" : "font-medium text-cinza"}`}>
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
      <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
        {ok ? (
          <>
            <input
              type="text"
              value={confirmado}
              disabled
              aria-label={`Quantidade confirmada de ${nome}`}
              className="w-20 border-none bg-transparent text-right text-base font-bold text-ambar outline-none sm:w-16"
            />
            <button
              onClick={onEditar}
              className="min-h-11 flex-1 rounded-md border border-cinza-claro px-3 py-2.5 text-xs font-semibold text-cinza-medio hover:bg-off-white sm:min-h-0 sm:flex-none"
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
              aria-label={`Quantidade de ${nome}`}
              value={valor}
              onChange={(e) => onChangeValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onConfirmar();
                }
              }}
              className="w-20 rounded-md border border-cinza-claro px-2 py-2.5 text-right text-base font-bold text-cinza focus:border-ambar focus:outline-none sm:w-16"
            />
            <button
              onClick={onConfirmar}
              className="min-h-11 flex-1 rounded-md bg-ambar px-3 py-2.5 text-xs font-bold text-azul-noite hover:bg-[#b07720] sm:min-h-0 sm:flex-none"
            >
              Confirmar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
