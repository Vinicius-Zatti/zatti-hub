"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ItemInventario } from "@/lib/types";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { DicaVirarCelular } from "@/components/dica-virar-celular";
import { CampoBusca } from "@/components/campo-busca";
import { filtrarPorNomeOuSku } from "@/lib/busca-lista";
import {
  atualizarQuantidadeContagemAction,
  corrigirItemContagemAction,
} from "@/app/(app)/estoque/contagem/actions";
import { CONTAGEM_POR_SETOR_ATIVA } from "@/lib/contagem/ativacao";
import { mensagemFalhaChamada } from "@/lib/erro-chamada";
import {
  avisoDeContagemParcial,
  consolidarPorSku,
  situacaoDaData,
  type AndamentoSetor,
  type EscopoSetor,
  type ModalidadeContagem,
} from "@/lib/contagem/setor";

const ABREV_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type StatusLinha = { tipo: "salvando" | "ok" | "erro"; msg?: string } | undefined;

function parseDataBR(data: string): number {
  const [d, m, a] = data.split("/").map(Number);
  if (!d || !m || !a) return 0;
  return new Date(a, m - 1, d).getTime();
}

function chaveMes(data: string): string | null {
  const [, m, a] = data.split("/");
  if (!m || !a) return null;
  return `${a}-${m.padStart(2, "0")}`;
}

function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split("-").map(Number);
  return `${ABREV_MES[mes - 1]}/${String(ano).slice(2)}`;
}

function formatMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Uma linha de contagem é identificada pelo id quando ele existe. Linha
 * legada (antes do setor) e unidade na planilha não têm id, e aí a chave cai
 * pra data + SKU, que naquele mundo era única mesmo. */
function chaveItem(item: ItemInventario): string {
  return item.id ?? `${item.data}-${item.sku}`;
}

export function VisualizacaoContagens({
  itens,
  andamentoPorData = new Map(),
  modalidadePorData = new Map(),
  escopoUltimaData = [],
}: {
  itens: ItemInventario[];
  /** Andamento por setor de cada data. Vazio = unidade sem setor. */
  andamentoPorData?: Map<string, AndamentoSetor[]>;
  /** Modalidade do cabeçalho de cada data (vazio = unidade na planilha). */
  modalidadePorData?: Map<string, ModalidadeContagem>;
  /** Snapshot do escopo só da última data - é nela que a conferência atua.
   * Datas antigas somam normalmente, mas sem a marca de "não contou". */
  escopoUltimaData?: EscopoSetor[];
}) {
  const router = useRouter();

  const ultimaData = useMemo(() => {
    let maior = "";
    let maiorTs = -1;
    for (const it of itens) {
      const ts = parseDataBR(it.data);
      if (ts > maiorTs) {
        maiorTs = ts;
        maior = it.data;
      }
    }
    return maior;
  }, [itens]);

  const meses = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const it of itens) {
      const chave = chaveMes(it.data);
      if (chave && !mapa.has(chave)) mapa.set(chave, parseDataBR(it.data));
    }
    return Array.from(mapa.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([chave]) => chave);
  }, [itens]);

  const [filtro, setFiltro] = useState<string>("ultima");
  const [visao, setVisao] = useState<"setor" | "consolidada">("setor");
  const editavel = filtro === "ultima";
  const temSetor = itens.some((it) => Boolean(it.setorId));

  // Correção da última contagem: só a quantidade, e só enquanto o filtro
  // "Última" está selecionado (contagens antigas ficam travadas).
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});
  const [statusPorItem, setStatusPorItem] = useState<Record<string, StatusLinha>>({});
  const [salvandoTodos, setSalvandoTodos] = useState(false);

  const filtrados = useMemo(() => {
    let base: ItemInventario[];
    if (filtro === "todas") base = itens;
    else if (filtro === "ultima") base = itens.filter((it) => it.data === ultimaData);
    else base = itens.filter((it) => chaveMes(it.data) === filtro);

    return [...base].sort((a, b) => {
      const dt = parseDataBR(b.data) - parseDataBR(a.data);
      if (dt !== 0) return dt;
      const g = a.grupo.localeCompare(b.grupo, "pt-BR");
      if (g !== 0) return g;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [itens, filtro, ultimaData]);

  const totalValor = filtrados.reduce((soma, it) => soma + (it.total ?? 0), 0);
  // Busca (26/10/2026): só esconde linhas. Correções digitadas ficam em
  // `edicoes`, pela chave do item; total e "Salvar todos" valem para o filtro inteiro.
  const [busca, setBusca] = useState("");
  const buscando = busca.trim() !== "";
  const linhasNaTela = filtrarPorNomeOuSku(filtrados, busca);

  // Consolidada = soma por SKU DENTRO de cada data. Somar datas diferentes
  // seria juntar contagens de semanas distintas no mesmo número.
  const consolidados = useMemo(() => {
    const porData = new Map<string, ItemInventario[]>();
    for (const item of filtrados) {
      const lista = porData.get(item.data) ?? [];
      lista.push(item);
      porData.set(item.data, lista);
    }
    return Array.from(porData.entries())
      .sort((a, b) => parseDataBR(b[0]) - parseDataBR(a[0]))
      .flatMap(([data, itensDaData]) =>
        consolidarPorSku(itensDaData, data === ultimaData ? escopoUltimaData : []).map(
          (consolidado) => ({ ...consolidado, data }),
        ),
      )
      .sort((a, b) => {
        const dt = parseDataBR(b.data) - parseDataBR(a.data);
        if (dt !== 0) return dt;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
  }, [filtrados, ultimaData, escopoUltimaData]);
  const consolidadosNaTela = filtrarPorNomeOuSku(consolidados, busca);

  const andamentoUltima = andamentoPorData.get(ultimaData) ?? [];
  const modalidadeUltima = modalidadePorData.get(ultimaData);
  const situacaoUltima = situacaoDaData(andamentoUltima, modalidadeUltima);
  const avisoUltima = avisoDeContagemParcial(andamentoUltima, modalidadeUltima);
  const pendentes = Object.keys(edicoes);
  // Correção de contagem por setor guarda o porquê no histórico do banco.
  const [motivo, setMotivo] = useState("");
  const pendenteComSetor = pendentes.some(
    (chave) => filtrados.find((it) => chaveItem(it) === chave)?.setorId,
  );

  // Versão de cada setor por data. A correção manda a versão que viu; cada
  // correção salva sobe a versão, então a próxima usa o número devolvido pelo
  // banco (ref, não estado: o "Salvar todos" corrige em sequência).
  const versoesLocais = useRef<Record<string, number>>({});
  function versaoDoSetor(item: ItemInventario): number | null {
    if (!item.setorId) return null;
    const chave = `${item.data}|${item.setorId}`;
    const doServidor =
      andamentoPorData.get(item.data)?.find((s) => s.setorId === item.setorId)?.versao ?? 0;
    return Math.max(doServidor, versoesLocais.current[chave] ?? 0);
  }

  async function salvarUm(chave: string): Promise<boolean> {
    const item = filtrados.find((it) => chaveItem(it) === chave);
    const valor = edicoes[chave];
    if (!item || valor === undefined) return false;

    const num = Number(valor.trim().replace(",", "."));
    if (valor.trim() === "" || Number.isNaN(num) || num < 0) {
      setStatusPorItem((s) => ({ ...s, [chave]: { tipo: "erro", msg: "Quantidade inválida" } }));
      return false;
    }

    if (CONTAGEM_POR_SETOR_ATIVA && item.setorId && motivo.trim().length < 3) {
      setStatusPorItem((s) => ({ ...s, [chave]: { tipo: "erro", msg: "Informe o motivo da correção" } }));
      return false;
    }

    setStatusPorItem((s) => ({ ...s, [chave]: { tipo: "salvando" } }));
    // Com a contagem por setor ativa, corrige a linha daquele setor pelo id.
    // Enquanto ela não está ativa, segue o caminho de sempre (data + SKU), que
    // é único porque nenhuma linha tem setor.
    let r: { erro: string } | { ok: true; versao?: number | null };
    try {
      r =
        CONTAGEM_POR_SETOR_ATIVA && item.id
          ? await corrigirItemContagemAction(item.id, num, versaoDoSetor(item), motivo.trim() || undefined)
          : await atualizarQuantidadeContagemAction(item.data, item.sku, num);
    } catch (falha) {
      // Sem isto a linha ficava presa em "salvando" (ex.: app atualizado com a tela aberta).
      r = { erro: mensagemFalhaChamada(falha, "Não deu pra salvar agora. Tente de novo em instantes.") };
    }
    if ("erro" in r) {
      setStatusPorItem((s) => ({ ...s, [chave]: { tipo: "erro", msg: r.erro } }));
      return false;
    }
    if ("versao" in r && typeof r.versao === "number" && item.setorId) {
      versoesLocais.current[`${item.data}|${item.setorId}`] = r.versao;
    }
    setEdicoes((e) => {
      const novo = { ...e };
      delete novo[chave];
      return novo;
    });
    setStatusPorItem((s) => ({ ...s, [chave]: { tipo: "ok" } }));
    return true;
  }

  async function onSalvarClick(chave: string) {
    // A action já revalida /estoque/contagem/visualizacao: um refresh aqui
    // renderizaria a página duas vezes.
    await salvarUm(chave);
  }

  async function salvarTodos() {
    setSalvandoTodos(true);
    // Em sequência: correções do mesmo setor dependem da versão da anterior.
    for (const chave of pendentes) {
      await salvarUm(chave);
    }
    setSalvandoTodos(false);
    router.refresh();
  }

  return (
    // `data-tabela-larga`: com o celular deitado o shell solta cabeçalho e barra inferior.
    <div className="flex flex-col gap-4 pb-10" data-tabela-larga>
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Conferência de Contagem</h1>
        <p className="text-sm text-cinza-medio">Histórico dos inventários já registrados.</p>
      </div>

      {temSetor && (andamentoUltima.length > 0 || modalidadeUltima === "setor") && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            situacaoUltima === "completa"
              ? "border-verde bg-verde/5"
              : "border-ambar bg-ambar/10"
          }`}
        >
          <p className="font-semibold text-cinza">
            Contagem de {ultimaData}:{" "}
            {situacaoUltima === "completa" ? "completa" : "parcial"}
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-cinza-medio">
            {andamentoUltima.map((setor) => (
              <li key={setor.setorId}>
                <span className="font-semibold text-cinza">{setor.setorNome}:</span>{" "}
                {setor.situacao === "concluido" ? "concluído" : "pendente"}
                {setor.enviadoEm && (
                  <span className="text-xs">
                    {" "}
                    ({new Date(setor.enviadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })})
                  </span>
                )}
              </li>
            ))}
          </ul>
          {avisoUltima && (
            <p className="mt-1 font-semibold text-ambar">
              {avisoUltima}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <CampoBusca valor={busca} onChange={setBusca} rotulo="Buscar item das contagens por nome ou SKU" />
        <label className="flex items-center gap-2 text-sm font-semibold text-cinza-medio">
          Filtrar
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-sm text-cinza focus:border-ambar focus:outline-none"
          >
            <option value="ultima">
              Última {ultimaData ? `(${ultimaData})` : ""}
            </option>
            <option value="todas">Todas</option>
            {meses.map((chave) => (
              <option key={chave} value={chave}>
                {rotuloMes(chave)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          {temSetor && (
            <div className="flex overflow-hidden rounded-md border border-cinza-claro text-xs font-semibold">
              <button
                type="button"
                onClick={() => setVisao("setor")}
                className={`px-3 py-1.5 ${visao === "setor" ? "bg-azul-noite text-branco" : "text-cinza-medio"}`}
              >
                Por setor
              </button>
              <button
                type="button"
                onClick={() => setVisao("consolidada")}
                className={`px-3 py-1.5 ${visao === "consolidada" ? "bg-azul-noite text-branco" : "text-cinza-medio"}`}
              >
                Consolidada
              </button>
            </div>
          )}
          <div className="text-sm text-cinza-medio">
            {buscando && `${linhasNaTela.length} de `}
            {filtrados.length} {filtrados.length === 1 ? "item" : "itens"} · Total{" "}
            <span className="font-bold text-azul-noite">{formatMoeda(totalValor)}</span>
          </div>
          {editavel && (
            <button
              type="button"
              onClick={salvarTodos}
              disabled={pendentes.length === 0 || salvandoTodos}
              className="shrink-0 rounded-md bg-azul-noite px-4 py-1.5 text-sm font-bold text-branco hover:bg-azul-petroleo disabled:opacity-40"
            >
              {salvandoTodos ? "Salvando..." : `Salvar todos (${pendentes.length})`}
            </button>
          )}
        </div>
      </div>

      {editavel && pendenteComSetor && (
        <label className="-mt-2 block text-xs text-cinza-medio">
          Motivo da correção (fica no histórico do setor)
          <input
            type="text"
            value={motivo}
            maxLength={300}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: contei a caixa fechada errado"
            className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-1.5 text-sm text-cinza"
          />
        </label>
      )}

      {editavel && (
        <p className="-mt-2 text-xs text-cinza-medio">
          Só a última contagem pode ser corrigida. Ajusta a quantidade e salva - o total recalcula
          sozinho a partir do preço já registrado.
        </p>
      )}

      <DicaVirarCelular />

      {visao === "setor" && (
      <TabelaRolavel className="max-h-[70vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Conferência de contagens">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>Data</Th>
              {temSetor && <Th>Setor</Th>}
              <Th>Grupo</Th>
              <Th>Nome</Th>
              <Th>Unidade</Th>
              <Th align="right">Quantidade</Th>
              <Th align="right">Preço Unitário</Th>
              <Th align="right">Total</Th>
              <Th>Alerta</Th>
              {editavel && <Th align="center">Ações</Th>}
            </tr>
          </thead>
          <tbody>
            {linhasNaTela.map((it, i) => {
              const chave = chaveItem(it);
              const status = statusPorItem[chave];
              const pending = status?.tipo === "salvando";
              const emEdicao = edicoes[chave] !== undefined;

              return (
                <tr
                  key={`${chave}-${i}`}
                  className={`border-t border-cinza-claro ${i % 2 === 1 ? "bg-off-white/60" : ""}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-cinza-medio">{it.data}</td>
                  {temSetor && (
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      {it.setorNome || <span className="text-cinza-medio">sem setor</span>}
                    </td>
                  )}
                  <td className="px-3 py-2">{it.grupo || "—"}</td>
                  <td className="px-3 py-2 font-medium text-cinza">{it.nome}</td>
                  <td className="px-3 py-2">{it.unidadeBase}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {editavel ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={emEdicao ? edicoes[chave] : it.quantidade !== null ? String(it.quantidade) : ""}
                        onChange={(e) => setEdicoes((ed) => ({ ...ed, [chave]: e.target.value }))}
                        className="w-20 rounded border border-cinza-claro px-1.5 py-1 text-right focus:border-ambar focus:outline-none"
                      />
                    ) : it.quantidade !== null ? (
                      it.quantidade.toLocaleString("pt-BR")
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.precoUnitario !== null ? formatMoeda(it.precoUnitario) : "a calcular"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.total !== null ? formatMoeda(it.total) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {it.alerta && (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                          it.alerta === "Comprar emergencial"
                            ? "bg-vermelho/10 text-vermelho"
                            : "bg-ambar/10 text-ambar"
                        }`}
                      >
                        {it.alerta}
                      </span>
                    )}
                  </td>
                  {editavel && (
                    <td className="min-w-[90px] px-3 py-2 text-center">
                      {emEdicao && !pending && (
                        <button
                          type="button"
                          onClick={() => onSalvarClick(chave)}
                          className="rounded bg-azul-noite px-2 py-1 text-[10px] font-bold text-branco hover:bg-azul-petroleo"
                        >
                          Salvar
                        </button>
                      )}
                      {pending && <span className="text-[10px] text-cinza-medio">Salvando...</span>}
                      {status?.tipo === "ok" && !emEdicao && (
                        <span className="text-[10px] font-semibold text-verde">Salvo ✓</span>
                      )}
                      {status?.tipo === "erro" && (
                        <span className="block text-[10px] text-vermelho">{status.msg}</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {linhasNaTela.length === 0 && (
              <tr>
                <td colSpan={(editavel ? 9 : 8) + (temSetor ? 1 : 0)} className="px-3 py-8 text-center text-cinza-medio">
                  {buscando && filtrados.length > 0
                    ? `Nenhum item com "${busca.trim()}" nesta seleção de contagens.`
                    : "Nenhuma contagem registrada com esse filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TabelaRolavel>
      )}

      {visao === "consolidada" && (
        <TabelaRolavel
          className="max-h-[70vh] rounded-lg border border-cinza-claro bg-branco"
          ariaLabel="Conferência consolidada por produto"
        >
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th>Data</Th>
                <Th>Nome</Th>
                <Th>Unidade</Th>
                <Th align="right">Total contado</Th>
                <Th>Abertura por setor</Th>
                <Th align="right">Valor</Th>
              </tr>
            </thead>
            <tbody>
              {consolidadosNaTela.map((item, i) => (
                <tr
                  key={`${item.data}-${item.sku}`}
                  className={`border-t border-cinza-claro ${i % 2 === 1 ? "bg-off-white/60" : ""}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-cinza-medio">
                    {item.data}
                  </td>
                  <td className="px-3 py-2 font-medium text-cinza">{item.nome}</td>
                  <td className="px-3 py-2">{item.unidadeBase}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {item.total !== null ? item.total.toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-cinza-medio">
                    {item.porSetor
                      .map(
                        (parte) =>
                          `${parte.setorNome || "sem setor"} ${
                            parte.quantidade !== null
                              ? parte.quantidade.toLocaleString("pt-BR")
                              : "—"
                          }`,
                      )
                      .join(" · ")}
                    {item.parcial && (
                      <span className="ml-2 rounded-full bg-ambar/10 px-2 py-0.5 font-semibold text-ambar">
                        não contou: {item.setoresQueNaoContaram.join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {item.valorTotal !== null ? formatMoeda(item.valorTotal) : "—"}
                  </td>
                </tr>
              ))}
              {consolidadosNaTela.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-cinza-medio">
                    {buscando && consolidados.length > 0
                      ? `Nenhum item com "${busca.trim()}" nesta seleção de contagens.`
                      : "Nenhuma contagem registrada com esse filtro."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TabelaRolavel>
      )}
    </div>
  );
}
