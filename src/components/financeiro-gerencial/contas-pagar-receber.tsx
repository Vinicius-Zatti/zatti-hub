"use client";

import { Fragment, useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { registrarBaixaAction } from "@/app/(app)/financeiro-gerencial/lancamentos/actions";
import {
  baixarVencimentoDocumentoAction,
  corrigirPagamentoAction,
  criarContraparteAction,
  editarDocumentoAction,
  linkArquivoDocumentoAction,
  obterDocumentoParaEdicaoAction,
  obterLancamentoAction,
  listarContrapartesAction,
  trocarContraparteAction,
} from "@/app/(app)/financeiro-gerencial/lancamentos/documentos-actions";
import { useRouter } from "next/navigation";
import type { Contraparte, DocumentoParaEdicao } from "@/lib/banco/financeiro-documentos";
import { CampoNumero } from "@/components/campo-numero";
import { DicaCalculo } from "@/components/dica-calculo";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { DocumentoModal, FormularioDocumento } from "@/components/financeiro-gerencial/documento-modal";
import { EdicaoLancamento } from "@/components/financeiro-gerencial/lancamentos-gerenciador";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { rotuloContaComGrupo } from "@/lib/financeiro-gerencial/categorias";
import {
  ABAS_TITULO,
  agruparTitulos,
  calcularEnvelhecimento,
  classificarAba,
  FAIXAS_ENVELHECIMENTO,
  filtrarGrupos,
  gerarCsvTitulos,
  resumirAbas,
  rotuloSituacao,
  SEM_CONTRAPARTE,
  type AbaTitulo,
  type GrupoTitulo,
} from "@/lib/financeiro-gerencial/contas-pagar-receber";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { paraCentavos } from "@/lib/financeiro-gerencial/rateio";
import type { Titulo } from "@/lib/banco/financeiro-documentos";
import { contasQuePagam } from "@/lib/financeiro-gerencial/cartao";
import type { CategoriaFinanceira, ContaFinanceira, Lancamento, TipoLancamento } from "@/lib/financeiro-gerencial/tipos";

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rotuloAba(aba: AbaTitulo, tipo: TipoLancamento): string {
  if (aba === "vencidos") return "Vencidos";
  if (aba === "hoje") return "Vence hoje";
  if (aba === "a_vencer") return "A vencer";
  return tipo === "receita" ? "Recebidos" : "Pagos";
}

const CLASSE_ABA: Record<AbaTitulo, string> = {
  vencidos: "text-vermelho",
  hoje: "text-ambar",
  a_vencer: "text-azul-petroleo",
  quitados: "text-verde",
};

const CLASSE_SITUACAO: Record<AbaTitulo, string> = {
  vencidos: "bg-vermelho/15 text-vermelho",
  hoje: "bg-ambar/20 text-azul-noite",
  a_vencer: "bg-azul-petroleo/15 text-azul-petroleo",
  quitados: "bg-verde/20 text-verde",
};

type ResultadoBaixaGrupo = { ok: true } | { ok: false; mensagem: string };

/** Baixa um grupo: título simples pela baixa comum (reais), grupo de documento pela RPC do
 * documento (centavos), que distribui o valor pelas linhas no banco. */
async function baixarGrupo(
  grupo: GrupoTitulo,
  dados: { contaFinanceiraId: string; data: string; valor: number; observacao: string; chave: string },
): Promise<ResultadoBaixaGrupo> {
  if (grupo.documentoId && grupo.vencimentoDocumento !== null) {
    return baixarVencimentoDocumentoAction({
      documentoId: grupo.documentoId,
      vencimento: grupo.vencimentoDocumento,
      contaFinanceiraId: dados.contaFinanceiraId,
      data: dados.data,
      valorCentavos: paraCentavos(dados.valor),
      observacao: dados.observacao,
      // Mesma chave no reenvio = o banco não baixa duas vezes (idempotência pedida pelo Codex).
      chave: `${dados.chave}-${grupo.documentoId.slice(0, 8)}-${grupo.vencimentoDocumento}`,
    });
  }
  const r = await registrarBaixaAction({
    parcelaId: grupo.parcelaId,
    contaFinanceiraId: dados.contaFinanceiraId,
    valor: dados.valor,
    data: dados.data,
    observacao: dados.observacao,
  });
  return r.ok ? { ok: true } : { ok: false, mensagem: r.mensagem };
}

export function ContasPagarReceber({
  aPagar,
  aReceber,
  categorias,
  contas,
  hoje,
  podeTrocarContraparte = false,
}: {
  aPagar: Titulo[];
  aReceber: Titulo[];
  categorias: CategoriaFinanceira[];
  contas: ContaFinanceira[];
  hoje: string;
  /** Gestão/master troca o fornecedor/cliente de conta já lançada (23/11/2026). */
  podeTrocarContraparte?: boolean;
}) {
  const [tipo, setTipo] = useState<TipoLancamento>("despesa");
  const [aba, setAba] = useState<AbaTitulo>("vencidos");
  const [busca, setBusca] = useState("");
  const [vencimentoDe, setVencimentoDe] = useState("");
  const [vencimentoAte, setVencimentoAte] = useState("");
  const [contraparteId, setContraparteId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [baixandoLote, setBaixandoLote] = useState(false);
  const [baixandoGrupo, setBaixandoGrupo] = useState<GrupoTitulo | null>(null);
  const [criandoDocumento, setCriandoDocumento] = useState(false);
  const [trocandoContraparte, setTrocandoContraparte] = useState<GrupoTitulo | null>(null);
  const [editandoConta, setEditandoConta] = useState<GrupoTitulo | null>(null);
  const nomeConta = useMemo(() => new Map(contas.map((c) => [c.id, c.nome])), [contas]);

  const verbo = tipo === "receita" ? "Receber" : "Pagar";
  const rotuloContraparte = tipo === "receita" ? "Cliente" : "Fornecedor";
  const rotuloBaixado = tipo === "receita" ? "Recebido" : "Pago";

  const grupos = useMemo(() => agruparTitulos(tipo === "despesa" ? aPagar : aReceber), [tipo, aPagar, aReceber]);

  const opcoesContraparte = useMemo(() => {
    const mapa = new Map<string, string>();
    let temSem = false;
    for (const g of grupos) {
      if (g.contraparteId) mapa.set(g.contraparteId, g.contraparteNome ?? "");
      else temSem = true;
    }
    const lista = [...mapa.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    return temSem ? [{ id: SEM_CONTRAPARTE, label: `Sem ${rotuloContraparte.toLowerCase()}` }, ...lista] : lista;
  }, [grupos, rotuloContraparte]);

  const opcoesCategoria = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const g of grupos) for (const c of g.categorias) mapa.set(c.id, rotuloContaComGrupo(c.id, categorias) || c.nome);
    return [...mapa.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [grupos, categorias]);

  const filtrados = useMemo(
    () => filtrarGrupos(grupos, { vencimentoDe, vencimentoAte, contraparteId, categoriaId, busca }),
    [grupos, vencimentoDe, vencimentoAte, contraparteId, categoriaId, busca],
  );
  const resumo = useMemo(() => resumirAbas(filtrados, hoje), [filtrados, hoje]);
  const daAba = useMemo(() => {
    const lista = filtrados.filter((g) => classificarAba(g, hoje) === aba);
    // Pagos/Recebidos: mais recentes primeiro; abertos: mais antigos primeiro.
    return aba === "quitados" ? [...lista].reverse() : lista;
  }, [filtrados, aba, hoje]);
  const envelhecimento = useMemo(() => calcularEnvelhecimento(filtrados, hoje), [filtrados, hoje]);

  const totais = useMemo(() => {
    let valor = 0;
    let baixado = 0;
    let saldo = 0;
    for (const g of daAba) {
      valor += paraCentavos(g.valor);
      baixado += paraCentavos(g.valorBaixado);
      saldo += paraCentavos(g.saldo);
    }
    return { valor: valor / 100, baixado: baixado / 100, saldo: saldo / 100 };
  }, [daAba]);

  const selecionaveis = aba === "quitados" ? [] : daAba.filter((g) => g.saldo > 0);
  const gruposSelecionados = selecionaveis.filter((g) => selecionados.has(g.chave));
  const totalSelecionado = gruposSelecionados.reduce((a, g) => a + paraCentavos(g.saldo), 0) / 100;
  const todosMarcados = selecionaveis.length > 0 && gruposSelecionados.length === selecionaveis.length;

  const filtrosAtivos = busca !== "" || vencimentoDe !== "" || vencimentoAte !== "" || contraparteId !== "" || categoriaId !== "";

  function trocarTipo(novo: TipoLancamento) {
    setTipo(novo);
    setContraparteId("");
    setCategoriaId("");
    setSelecionados(new Set());
  }

  function trocarAba(nova: AbaTitulo) {
    setAba(nova);
    setSelecionados(new Set());
  }

  function limparFiltros() {
    setBusca("");
    setVencimentoDe("");
    setVencimentoAte("");
    setContraparteId("");
    setCategoriaId("");
  }

  function alternar(conjunto: Set<string>, chave: string): Set<string> {
    const novo = new Set(conjunto);
    if (novo.has(chave)) novo.delete(chave);
    else novo.add(chave);
    return novo;
  }

  function exportarCsv() {
    const csv = gerarCsvTitulos(daAba, tipo, hoje);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `contas-a-${tipo === "receita" ? "receber" : "pagar"}-${rotuloAba(aba, tipo).toLowerCase().replace(/\s+/g, "-")}-${hoje}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-azul-noite">Contas a pagar e receber</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportarCsv}
            disabled={daAba.length === 0}
            className="rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-xs font-semibold text-cinza-medio hover:bg-off-white disabled:opacity-50"
          >
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={() => setCriandoDocumento(true)}
            className="rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:brightness-95"
          >
            + Nota com vários Plano de Contas
          </button>
        </div>
      </div>

      <div className="inline-flex self-start rounded-lg border border-cinza-claro bg-branco p-1" role="group" aria-label="A pagar ou a receber">
        {(["despesa", "receita"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => trocarTipo(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold ${tipo === t ? "bg-azul-noite text-branco" : "text-cinza-medio hover:bg-off-white"}`}
          >
            {t === "despesa" ? "A pagar" : "A receber"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="tablist">
        {ABAS_TITULO.map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={aba === a}
            onClick={() => trocarAba(a)}
            className={`flex flex-col items-start rounded-lg border bg-branco px-3 py-2 text-left ${
              aba === a ? "border-azul-noite ring-2 ring-azul-noite/20" : "border-cinza-claro hover:border-azul-petroleo/50"
            }`}
          >
            <span className="flex items-center gap-1 text-xs font-semibold text-cinza-medio">
              {rotuloAba(a, tipo)} ({resumo[a].quantidade})
              <DicaCalculo
                rotulo={`Total de ${rotuloAba(a, tipo)}`}
                texto={
                  a === "quitados"
                    ? `Soma do que já foi ${rotuloBaixado.toLowerCase()} nos títulos sem saldo, dentro dos filtros.`
                    : `Soma do saldo em aberto (valor menos o que já foi ${rotuloBaixado.toLowerCase()}) dos títulos ${
                        a === "vencidos" ? "com data antes de hoje" : a === "hoje" ? "com data de hoje" : "com data depois de hoje"
                      }, dentro dos filtros. Hoje segue o fuso de São Paulo.`
                }
              />
            </span>
            <span className={`font-display text-lg font-bold ${CLASSE_ABA[a]}`}>R$ {formatarMoeda(resumo[a].total)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-cinza-claro bg-branco p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-semibold text-cinza-medio">
            Buscar
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={`Descrição, ${rotuloContraparte.toLowerCase()}, número da nota...`}
              className="w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza focus:border-ambar focus:outline-none"
            />
          </label>
          <label className="flex min-w-[200px] flex-col gap-1 text-xs font-semibold text-cinza-medio">
            {rotuloContraparte}
            <SeletorComBusca value={contraparteId} opcoes={opcoesContraparte} onChange={setContraparteId} vazioLabel="Todos" placeholder="Todos" />
          </label>
          <label className="flex min-w-[220px] flex-col gap-1 text-xs font-semibold text-cinza-medio">
            Plano de Contas
            <SeletorComBusca value={categoriaId} opcoes={opcoesCategoria} onChange={setCategoriaId} vazioLabel="Todos" placeholder="Todos" />
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
            Vencimento de
            <input type="date" value={vencimentoDe} onChange={(e) => setVencimentoDe(e.target.value)} className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
            até
            <input type="date" value={vencimentoAte} onChange={(e) => setVencimentoAte(e.target.value)} className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza" />
          </label>
          {filtrosAtivos && (
            <button
              type="button"
              onClick={limparFiltros}
              className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio hover:bg-off-white"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {gruposSelecionados.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ambar bg-ambar/10 px-3 py-2 text-sm">
          <span className="text-azul-noite">
            {gruposSelecionados.length} {gruposSelecionados.length === 1 ? "título selecionado" : "títulos selecionados"} - saldo R${" "}
            {formatarMoeda(totalSelecionado)}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSelecionados(new Set())} className="text-xs font-semibold text-cinza-medio">
              Limpar seleção
            </button>
            <button
              type="button"
              onClick={() => setBaixandoLote(true)}
              className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-bold text-branco"
            >
              {verbo} selecionados
            </button>
          </div>
        </div>
      )}

      <TabelaRolavel className="max-h-[70vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel={`Contas a ${tipo === "receita" ? "receber" : "pagar"}`}>
        <table className="w-full min-w-[1300px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th align="center" larguraFixa="40px">
                {aba !== "quitados" && (
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos"
                    checked={todosMarcados}
                    disabled={selecionaveis.length === 0}
                    onChange={() => setSelecionados(todosMarcados ? new Set() : new Set(selecionaveis.map((g) => g.chave)))}
                  />
                )}
              </Th>
              <Th larguraFixa="96px">Vencimento</Th>
              <Th>{rotuloContraparte}</Th>
              <Th>Descrição</Th>
              <Th>Plano de Contas</Th>
              <Th align="right" larguraFixa="104px">
                Valor
              </Th>
              <Th align="right" larguraFixa="104px">
                {rotuloBaixado}
              </Th>
              <Th align="right" larguraFixa="104px">
                <span className="inline-flex items-center gap-1">
                  Saldo
                  <DicaCalculo rotulo="Saldo" texto={`Valor do título menos o que já foi ${rotuloBaixado.toLowerCase()} (descontados os estornos).`} />
                </span>
              </Th>
              <Th larguraFixa="96px">{tipo === "receita" ? "Recebido em" : "Pago em"}</Th>
              <Th larguraFixa="140px">Conta</Th>
              <Th align="center" larguraFixa="120px">
                Situação
              </Th>
              <Th align="center" larguraFixa="88px">
                Ação
              </Th>
            </tr>
          </thead>
          <tbody>
            {daAba.map((g) => {
              const situacaoAba = classificarAba(g, hoje);
              const varios = g.categorias.length > 1;
              const aberto = expandidos.has(g.chave);
              return (
                <Fragment key={g.chave}>
                  <tr className="border-t border-cinza-claro hover:bg-off-white/60">
                    <td className="px-3 py-2 text-center">
                      {aba !== "quitados" && g.saldo > 0 && (
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${g.descricao}`}
                          checked={selecionados.has(g.chave)}
                          onChange={() => setSelecionados((s) => alternar(s, g.chave))}
                        />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatarDataBr(g.dataPrevista)}</td>
                    <td className="max-w-[200px] truncate px-3 py-2" title={g.contraparteNome ?? ""}>
                      {podeTrocarContraparte ? (
                        <button
                          type="button"
                          onClick={() => setTrocandoContraparte(g)}
                          title={`Trocar ${rotuloContraparte.toLowerCase()} desta conta`}
                          className="max-w-full truncate text-left hover:underline"
                        >
                          {g.contraparteNome ?? <span className="font-semibold text-azul-petroleo">+ {rotuloContraparte}</span>}
                        </button>
                      ) : (
                        (g.contraparteNome ?? <span className="text-cinza-medio">-</span>)
                      )}
                    </td>
                    <td className="max-w-[260px] truncate px-3 py-2" title={g.descricao}>
                      {podeTrocarContraparte ? (
                        <button
                          type="button"
                          onClick={() => setEditandoConta(g)}
                          title="Editar esta conta: fornecedor, dados do lançamento e pagamento"
                          className="max-w-full truncate text-left font-semibold text-azul-petroleo hover:underline"
                        >
                          {g.descricao}
                        </button>
                      ) : (
                        g.descricao
                      )}
                      {g.documentoNumero && <span className="ml-1 text-xs text-cinza-medio">nº {g.documentoNumero}</span>}
                      {g.totalParcelas > 1 && (
                        <span className="ml-1 text-xs text-cinza-medio">
                          {g.numero}/{g.totalParcelas}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-2" title={g.categorias.map((c) => c.nome).join(", ")}>
                      {varios ? (
                        <button
                          type="button"
                          onClick={() => setExpandidos((s) => alternar(s, g.chave))}
                          aria-expanded={aberto}
                          className="text-xs font-semibold text-azul-petroleo hover:underline"
                        >
                          {aberto ? "▾" : "▸"} {g.categorias.length} Plano de Contas
                        </button>
                      ) : (
                        g.categorias[0]?.nome
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">R$ {formatarMoeda(g.valor)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">R$ {formatarMoeda(g.valorBaixado)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">R$ {formatarMoeda(g.saldo)}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {g.pagamentos.length > 0 ? formatarDataBr(g.pagamentos[0].data) : <span className="text-cinza-medio">-</span>}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2" title={[...new Set(g.pagamentos.map((p) => nomeConta.get(p.contaFinanceiraId) ?? ""))].join(", ")}>
                      {g.pagamentos.length > 0 ? (
                        [...new Set(g.pagamentos.map((p) => nomeConta.get(p.contaFinanceiraId) ?? "Conta"))].join(", ")
                      ) : (
                        <span className="text-cinza-medio">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${CLASSE_SITUACAO[situacaoAba]}`}>
                        {rotuloSituacao(g, hoje, tipo)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {g.saldo > 0 && (
                        <button
                          type="button"
                          onClick={() => setBaixandoGrupo(g)}
                          className="rounded-md border border-azul-noite px-2 py-1 text-xs font-semibold text-azul-noite hover:bg-azul-noite hover:text-branco"
                        >
                          {verbo}
                        </button>
                      )}
                    </td>
                  </tr>
                  {varios && aberto &&
                    g.titulos.map((t) => (
                      <tr key={t.parcelaId} className="bg-off-white/70 text-xs text-cinza-medio">
                        <td colSpan={4}></td>
                        <td className="max-w-[240px] truncate px-3 py-1.5" title={t.categoriaNome}>
                          {t.categoriaNome}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right">R$ {formatarMoeda(t.valor)}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right">R$ {formatarMoeda(t.valorBaixado)}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right">R$ {formatarMoeda(t.saldo)}</td>
                        <td colSpan={4}></td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
            {daAba.length === 0 && (
              <tr>
                <td colSpan={12} className="p-4 text-center text-sm text-cinza-medio">
                  Nenhum título em {rotuloAba(aba, tipo).toLowerCase()}
                  {filtrosAtivos ? " com esses filtros" : ""}.
                </td>
              </tr>
            )}
          </tbody>
          {daAba.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-azul-petroleo bg-off-white font-semibold text-cinza">
                <td colSpan={5} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-cinza-medio">
                  <span className="inline-flex items-center gap-1">
                    Total ({daAba.length} {daAba.length === 1 ? "título" : "títulos"})
                    <DicaCalculo rotulo="Total da lista" texto="Soma das colunas Valor, Pago/Recebido e Saldo de todos os títulos listados nesta aba." />
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">R$ {formatarMoeda(totais.valor)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">R$ {formatarMoeda(totais.baixado)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">R$ {formatarMoeda(totais.saldo)}</td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </TabelaRolavel>

      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1 font-display text-lg font-bold text-azul-noite">
          Envelhecimento
          <DicaCalculo
            rotulo="Envelhecimento"
            texto={`Saldo vencido (valor menos o que já foi ${rotuloBaixado.toLowerCase()}) agrupado por ${rotuloContraparte.toLowerCase()} e por dias de atraso: dias = hoje menos a data de vencimento. Faixas: 1 a 30, 31 a 60, 61 a 90 e mais de 90 dias. Usa os filtros acima, em todas as abas.`}
          />
        </h2>
        <TabelaRolavel className="max-h-[50vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Envelhecimento do saldo vencido">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th>{rotuloContraparte}</Th>
                {FAIXAS_ENVELHECIMENTO.map((f) => (
                  <Th key={f} align="right" larguraFixa="112px">
                    {f}
                  </Th>
                ))}
                <Th align="right" larguraFixa="112px">
                  Total vencido
                </Th>
              </tr>
            </thead>
            <tbody>
              {envelhecimento.linhas.map((l) => (
                <tr key={l.contraparteId ?? SEM_CONTRAPARTE} className="border-t border-cinza-claro">
                  <td className="max-w-[260px] truncate px-3 py-2" title={l.nome}>
                    {l.nome}
                  </td>
                  {l.faixas.map((v, i) => (
                    <td key={i} className={`whitespace-nowrap px-3 py-2 text-right ${v > 0 ? "" : "text-cinza-medio"}`}>
                      R$ {formatarMoeda(v)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">R$ {formatarMoeda(l.total)}</td>
                </tr>
              ))}
              {envelhecimento.linhas.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-sm text-cinza-medio">
                    Nenhum saldo vencido.
                  </td>
                </tr>
              )}
            </tbody>
            {envelhecimento.linhas.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-azul-petroleo bg-off-white font-semibold text-cinza">
                  <td className="px-3 py-2 text-xs uppercase tracking-wide text-cinza-medio">Total</td>
                  {envelhecimento.totais.map((v, i) => (
                    <td key={i} className="whitespace-nowrap px-3 py-2 text-right">
                      R$ {formatarMoeda(v)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-right">R$ {formatarMoeda(envelhecimento.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </TabelaRolavel>
      </section>

      <ModalFlutuante aberto={baixandoLote} onFechar={() => setBaixandoLote(false)}>
        {baixandoLote && (
          <BaixaEmLote
            grupos={gruposSelecionados}
            tipo={tipo}
            contas={contas}
            hoje={hoje}
            onConcluido={() => setSelecionados(new Set())}
            onFechar={() => setBaixandoLote(false)}
          />
        )}
      </ModalFlutuante>

      <ModalFlutuante aberto={baixandoGrupo !== null} onFechar={() => setBaixandoGrupo(null)}>
        {baixandoGrupo && <BaixaIndividual grupo={baixandoGrupo} tipo={tipo} contas={contas} hoje={hoje} onFechar={() => setBaixandoGrupo(null)} />}
      </ModalFlutuante>

      <ModalFlutuante aberto={editandoConta !== null} onFechar={() => setEditandoConta(null)} larga>
        {editandoConta && (
          <EditarConta
            grupo={editandoConta}
            tipo={tipo}
            categorias={categorias}
            contas={contas}
            onTrocarContraparte={() => {
              setTrocandoContraparte(editandoConta);
              setEditandoConta(null);
            }}
            onFechar={() => setEditandoConta(null)}
          />
        )}
      </ModalFlutuante>

      <ModalFlutuante aberto={trocandoContraparte !== null} onFechar={() => setTrocandoContraparte(null)}>
        {trocandoContraparte && (
          <TrocarContraparte
            grupo={trocandoContraparte}
            tipo={tipo}
            onFechar={() => setTrocandoContraparte(null)}
          />
        )}
      </ModalFlutuante>

      <DocumentoModal
        aberto={criandoDocumento}
        onFechar={() => setCriandoDocumento(false)}
        categorias={categorias}
        contas={contas}
        valoresIniciais={{ tipo }}
      />
    </div>
  );
}

function contaPadrao(grupos: GrupoTitulo[], contas: ContaFinanceira[]): string {
  const sugerida = grupos[0]?.titulos.find((t) => t.contaFinanceiraId)?.contaFinanceiraId;
  const pagadoras = contasQuePagam(contas);
  if (sugerida && pagadoras.some((c) => c.id === sugerida)) return sugerida;
  return pagadoras[0]?.id ?? "";
}

function BaixaEmLote({
  grupos,
  tipo,
  contas,
  hoje,
  onConcluido,
  onFechar,
}: {
  grupos: GrupoTitulo[];
  tipo: TipoLancamento;
  contas: ContaFinanceira[];
  hoje: string;
  onConcluido: () => void;
  onFechar: () => void;
}) {
  // Baixa nunca sai do cartão: a compra no cartão é paga pela fatura (tela Cartões).
  const opcoesConta = useMemo(() => contasQuePagam(contas).map((c) => ({ id: c.id, label: c.nome })), [contas]);
  // Congela a lista ao abrir: o refresh da página no meio do lote não muda o que está sendo baixado.
  const [lista] = useState(grupos);
  const [chave] = useState(() => crypto.randomUUID().replace(/-/g, ""));
  const [contaFinanceiraId, setContaFinanceiraId] = useState(() => contaPadrao(grupos, contas));
  const [data, setData] = useState(hoje);
  const [progresso, setProgresso] = useState<{ feitos: number; erros: { descricao: string; mensagem: string }[] } | null>(null);
  const [isPending, startTransition] = useTransition();
  const total = lista.reduce((a, g) => a + paraCentavos(g.saldo), 0) / 100;
  const verbo = tipo === "receita" ? "Receber" : "Pagar";
  const concluido = progresso !== null && !isPending;

  function confirmar(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const erros: { descricao: string; mensagem: string }[] = [];
      let feitos = 0;
      for (const g of lista) {
        const r = await baixarGrupo(g, { contaFinanceiraId, data, valor: g.saldo, observacao: "", chave });
        if (r.ok) feitos++;
        else erros.push({ descricao: `${formatarDataBr(g.dataPrevista)} - ${g.descricao}`, mensagem: r.mensagem });
        setProgresso({ feitos, erros: [...erros] });
      }
      setProgresso({ feitos, erros });
      onConcluido();
    });
  }

  return (
    <form onSubmit={confirmar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">{verbo} selecionados</h2>
      <div className="rounded-lg bg-branco p-3 text-sm text-azul-noite">
        <div className="flex items-center gap-1">
          {lista.length} {lista.length === 1 ? "título" : "títulos"} - total R$ {formatarMoeda(total)}
          <DicaCalculo
            rotulo="Total da baixa em lote"
            texto="Soma do saldo em aberto de cada título selecionado. Cada título é baixado pelo próprio saldo, na mesma conta e data."
          />
        </div>
        <ul className="mt-2 max-h-40 overflow-auto text-xs text-cinza-medio">
          {lista.map((g) => (
            <li key={g.chave} className="flex justify-between gap-2">
              <span className="truncate" title={g.descricao}>
                {formatarDataBr(g.dataPrevista)} - {g.descricao}
              </span>
              <span className="whitespace-nowrap">R$ {formatarMoeda(g.saldo)}</span>
            </li>
          ))}
        </ul>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Conta financeira
        <SeletorComBusca value={contaFinanceiraId} opcoes={opcoesConta} onChange={setContaFinanceiraId} placeholder="Selecionar conta..." />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        {tipo === "receita" ? "Data de Recebimento" : "Data de Pagamento"}
        <input
          type="date"
          required
          value={data}
          onChange={(e) => setData(e.target.value)}
          disabled={progresso !== null}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      {progresso && (
        <div className="rounded-lg border border-cinza-claro bg-branco p-3 text-sm">
          <p className="text-azul-noite">
            {progresso.feitos} de {lista.length} {tipo === "receita" ? "recebidos" : "pagos"}
            {isPending ? "..." : "."}
          </p>
          {progresso.erros.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs text-vermelho">
              {progresso.erros.map((e, i) => (
                <li key={i}>
                  {e.descricao}: {e.mensagem}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-1 flex gap-2">
        {!concluido && (
          <button
            type="submit"
            disabled={isPending || !contaFinanceiraId || !data || lista.length === 0}
            className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50"
          >
            {isPending ? "Registrando..." : `Confirmar ${lista.length} ${lista.length === 1 ? "baixa" : "baixas"}`}
          </button>
        )}
        <button
          type="button"
          onClick={onFechar}
          disabled={isPending}
          className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          {concluido ? "Fechar" : "Cancelar"}
        </button>
      </div>
    </form>
  );
}

function BaixaIndividual({
  grupo,
  tipo,
  contas,
  hoje,
  onFechar,
}: {
  grupo: GrupoTitulo;
  tipo: TipoLancamento;
  contas: ContaFinanceira[];
  hoje: string;
  onFechar: () => void;
}) {
  // Baixa nunca sai do cartão: a compra no cartão é paga pela fatura (tela Cartões).
  const opcoesConta = useMemo(() => contasQuePagam(contas).map((c) => ({ id: c.id, label: c.nome })), [contas]);
  const [contaFinanceiraId, setContaFinanceiraId] = useState(() => contaPadrao([grupo], contas));
  const [valor, setValor] = useState<number | null>(grupo.saldo);
  const [data, setData] = useState(hoje);
  const [observacao, setObservacao] = useState("");
  const [chave] = useState(() => crypto.randomUUID().replace(/-/g, ""));
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const valorC = paraCentavos(valor ?? 0);
  const saldoC = paraCentavos(grupo.saldo);
  const valorInvalido = valorC <= 0 || valorC > saldoC;

  function confirmar(e: FormEvent) {
    e.preventDefault();
    if (valorInvalido) return;
    setErro(null);
    startTransition(async () => {
      const r = await baixarGrupo(grupo, { contaFinanceiraId, data, valor: valorC / 100, observacao, chave });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      onFechar();
    });
  }

  return (
    <form onSubmit={confirmar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">{tipo === "receita" ? "Registrar recebimento" : "Registrar pagamento"}</h2>
      <p className="text-xs text-cinza-medio">
        {grupo.descricao}
        {grupo.contraparteNome ? ` - ${grupo.contraparteNome}` : ""} - vencimento {formatarDataBr(grupo.dataPrevista)} - saldo em aberto R${" "}
        {formatarMoeda(grupo.saldo)}
        {grupo.categorias.length > 1 ? ` (distribuído entre ${grupo.categorias.length} Plano de Contas)` : ""}
      </p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Conta financeira
        <SeletorComBusca value={contaFinanceiraId} opcoes={opcoesConta} onChange={setContaFinanceiraId} placeholder="Selecionar conta..." />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Valor
        <CampoNumero value={valor} onChange={setValor} className="w-full" />
        {valorC > saldoC && <span className="text-xs font-normal text-vermelho">O valor passa do saldo em aberto.</span>}
        {valorC > 0 && valorC < saldoC && (
          <span className="text-xs font-normal text-cinza-medio">Baixa parcial: fica R$ {formatarMoeda((saldoC - valorC) / 100)} em aberto.</span>
        )}
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        {tipo === "receita" ? "Data de Recebimento" : "Data de Pagamento"}
        <input
          type="date"
          required
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Observação
        <input
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          maxLength={2000}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={isPending || !contaFinanceiraId || !data || valorInvalido}
          className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={onFechar}
          disabled={isPending}
          className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Trocar o fornecedor/cliente de uma conta já lançada (23/11/2026). Conta de nota troca a nota
 * inteira, em todos os vencimentos; valores, datas e baixas não mudam. */
function TrocarContraparte({ grupo, tipo, onFechar }: { grupo: GrupoTitulo; tipo: TipoLancamento; onFechar: () => void }) {
  const router = useRouter();
  const rotulo = tipo === "receita" ? "Cliente" : "Fornecedor";
  const [lista, setLista] = useState<Contraparte[] | null>(null);
  const [escolhido, setEscolhido] = useState(grupo.contraparteId ?? "");
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoDocumento, setNovoDocumento] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let ativo = true;
    listarContrapartesAction()
      .then((l) => {
        if (ativo) setLista(l);
      })
      .catch(() => {
        if (ativo) setErro(`Não foi possível carregar a lista de ${rotulo.toLowerCase()}s.`);
      });
    return () => {
      ativo = false;
    };
  }, [rotulo]);

  const opcoes = useMemo(
    () =>
      (lista ?? [])
        .filter((c) => c.tipo === "ambos" || c.tipo === (tipo === "receita" ? "cliente" : "fornecedor") || c.id === escolhido)
        .map((c) => ({ id: c.id, label: c.documento ? `${c.nome} (${c.documento})` : c.nome })),
    [lista, tipo, escolhido],
  );

  function salvarNovo() {
    setErro(null);
    startTransition(async () => {
      const r = await criarContraparteAction({ nome: novoNome, documento: novoDocumento, tipo: tipo === "receita" ? "cliente" : "fornecedor" });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      setLista((atual) => (atual && !atual.some((c) => c.id === r.contraparte.id) ? [...atual, r.contraparte] : atual));
      setEscolhido(r.contraparte.id);
      setCriando(false);
    });
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    const lancamentoId = grupo.titulos[0]?.lancamentoId;
    if (!lancamentoId) return;
    setErro(null);
    startTransition(async () => {
      const r = await trocarContraparteAction({ lancamentoId, contraparteId: escolhido || null });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      router.refresh();
      onFechar();
    });
  }

  const campo = "w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza";
  return (
    <form onSubmit={salvar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">{rotulo} desta conta</h2>
      <p className="text-xs text-cinza-medio">
        {grupo.descricao}
        {grupo.documentoId ? ". É uma nota: o " + rotulo.toLowerCase() + " muda na nota inteira, em todos os vencimentos." : "."} Valores, datas e
        baixas não mudam.
      </p>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SeletorComBusca
            value={escolhido}
            opcoes={opcoes}
            onChange={setEscolhido}
            placeholder={lista === null ? "Carregando..." : "Selecionar..."}
            vazioLabel={`Sem ${rotulo.toLowerCase()}`}
          />
        </div>
        {!criando && (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="shrink-0 rounded-md border border-cinza-claro px-2 py-2 text-xs font-semibold text-azul-petroleo hover:bg-off-white"
          >
            Salvar novo {rotulo.toLowerCase()}
          </button>
        )}
      </div>
      {criando && (
        <div className="flex flex-col gap-2 rounded-lg border border-ambar/60 bg-ambar/5 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
              Nome
              <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} maxLength={160} className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
              CPF/CNPJ (opcional)
              <input value={novoDocumento} onChange={(e) => setNovoDocumento(e.target.value)} maxLength={18} inputMode="numeric" className={campo} />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={salvarNovo}
              disabled={isPending || novoNome.trim() === ""}
              className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-bold text-branco disabled:opacity-50"
            >
              Salvar {rotulo.toLowerCase()}
            </button>
            <button
              type="button"
              onClick={() => setCriando(false)}
              className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || lista === null || escolhido === (grupo.contraparteId ?? "")}
          className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={onFechar}
          disabled={isPending}
          className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Editar conta (23/11/2026): tudo de uma conta lançada num lugar só - fornecedor, dados de cada
 * lançamento (mesmo formulário da tela Lançamentos) e data/conta de cada pagamento. */
function EditarConta({
  grupo,
  tipo,
  categorias,
  contas,
  onTrocarContraparte,
  onFechar,
}: {
  grupo: GrupoTitulo;
  tipo: TipoLancamento;
  categorias: CategoriaFinanceira[];
  contas: ContaFinanceira[];
  onTrocarContraparte: () => void;
  onFechar: () => void;
}) {
  const router = useRouter();
  const rotulo = tipo === "receita" ? "Cliente" : "Fornecedor";
  const verboPassado = tipo === "receita" ? "Recebido" : "Pago";
  const [lancamento, setLancamento] = useState<Lancamento | null>(null);
  const [corrigindo, setCorrigindo] = useState<number | null>(null);
  const [data, setData] = useState("");
  const [contaId, setContaId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Nota (24/11/2026): a conta de uma nota abre a nota inteira, com os arquivos dela.
  const [nota, setNota] = useState<DocumentoParaEdicao | null>(null);
  const [erroNota, setErroNota] = useState<string | null>(null);
  const [editandoNota, setEditandoNota] = useState(false);
  const documentoId = grupo.documentoId;
  useEffect(() => {
    if (!documentoId) return;
    let ativo = true;
    obterDocumentoParaEdicaoAction(documentoId).then((r) => {
      if (!ativo) return;
      if (r.ok) setNota(r.documento);
      else setErroNota(r.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, [documentoId]);
  const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
  const opcoesConta = contas.filter((c) => c.ativo && c.tipo !== "cartao_credito").map((c) => ({ id: c.id, label: c.nome }));
  // Uma linha por lançamento (nota com vários Plano de Contas tem um lançamento por linha).
  const lancamentos = [...new Map(grupo.titulos.map((t) => [t.lancamentoId, t])).values()];

  function abrirArquivo(entradaId: string) {
    setErro(null);
    const janela = window.open("", "_blank");
    startTransition(async () => {
      const r = await linkArquivoDocumentoAction(entradaId);
      if (!r.ok) {
        janela?.close();
        setErro(r.mensagem);
        return;
      }
      if (janela) janela.location.href = r.url;
      else window.open(r.url, "_blank", "noopener");
    });
  }

  const listaArquivos = nota && (
    <div className="flex flex-col gap-1">
      {nota.arquivos.length === 0 && <p className="text-xs text-cinza-medio">Nenhum arquivo ligado a esta nota.</p>}
      {nota.arquivos.map((a) => (
        <div key={a.entradaId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-cinza-claro bg-branco px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate" title={a.nome}>
            {a.nome}
          </span>
          <button
            type="button"
            onClick={() => abrirArquivo(a.entradaId)}
            disabled={isPending}
            className="rounded-md border border-azul-petroleo px-2 py-1 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10 disabled:opacity-50"
          >
            Abrir
          </button>
        </div>
      ))}
    </div>
  );

  if (nota && editandoNota) {
    return (
      <FormularioDocumento
        titulo="Editar nota"
        categorias={categorias}
        contas={contas}
        tipoFixo
        valoresIniciais={{
          tipo: nota.tipo,
          contraparteId: nota.contraparteId,
          numero: nota.numero,
          descricao: nota.descricao,
          dataEmissao: nota.dataEmissao,
          dataCompetencia: nota.dataCompetencia,
          contaFinanceiraId: nota.contaFinanceiraId,
          observacao: nota.observacao,
          linhas: nota.linhas,
          vencimentos: nota.vencimentos,
        }}
        cabecalho={
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Arquivos da nota</div>
            {listaArquivos}
            {nota.travado && (
              <p className="rounded-md bg-ambar/10 px-3 py-2 text-xs text-cinza">
                Esta nota já tem {tipo === "receita" ? "recebimento" : "pagamento"}: dá para mudar {rotulo.toLowerCase()}, dados e Plano de Contas,
                mas valores e vencimentos ficam como estão.
              </p>
            )}
            {erro && <p className="text-sm text-vermelho">{erro}</p>}
          </div>
        }
        aoSalvar={(documento) => editarDocumentoAction({ documentoId: nota.documentoId, documento })}
        onCancelar={() => setEditandoNota(false)}
        onSalvo={() => onFechar()}
      />
    );
  }

  if (lancamento) {
    return (
      <EdicaoLancamento
        lancamento={lancamento}
        categorias={categorias}
        contas={contas}
        onFechar={() => {
          setLancamento(null);
          router.refresh();
          onFechar();
        }}
      />
    );
  }

  function abrirLancamento(id: string) {
    setErro(null);
    startTransition(async () => {
      const r = await obterLancamentoAction(id);
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      setLancamento(r.lancamento);
    });
  }

  function salvarPagamento(i: number) {
    const p = grupo.pagamentos[i];
    setErro(null);
    startTransition(async () => {
      const r = await corrigirPagamentoAction({ baixaIds: p.baixaIds, data, contaFinanceiraId: contaId });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      router.refresh();
      onFechar();
    });
  }

  const linha = "flex flex-wrap items-center justify-between gap-2 rounded-md border border-cinza-claro bg-branco px-3 py-2 text-sm";
  const botao = "rounded-md border border-azul-petroleo px-2 py-1 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10 disabled:opacity-50";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-bold text-azul-noite">Editar conta</h2>
        <p className="text-xs text-cinza-medio">
          {grupo.descricao} - vencimento {formatarDataBr(grupo.dataPrevista)} - R$ {formatarMoeda(grupo.valor)}
        </p>
      </div>

      {documentoId && (
        <section className="flex flex-col gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Nota</div>
          <p className="text-xs text-cinza-medio">
            Abre a nota no mesmo formulário da Caixa de Entrada: {rotulo.toLowerCase()}, número, datas, Plano de Contas, valores e vencimentos.
          </p>
          <button
            type="button"
            onClick={() => setEditandoNota(true)}
            disabled={!nota}
            className="rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50"
          >
            {nota ? "Editar nota inteira" : erroNota ? "Não abriu" : "Abrindo a nota..."}
          </button>
          {erroNota && <p className="text-sm text-vermelho">{erroNota}</p>}
          {nota && (
            <>
              <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Arquivos da nota</div>
              {listaArquivos}
            </>
          )}
        </section>
      )}

      {!documentoId && (
        <>
      <section className="flex flex-col gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">{rotulo}</div>
        <div className={linha}>
          <span>{grupo.contraparteNome ?? <span className="text-cinza-medio">Sem {rotulo.toLowerCase()}</span>}</span>
          <button type="button" onClick={onTrocarContraparte} className={botao}>
            Trocar {rotulo.toLowerCase()}
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Dados do lançamento</div>
        <p className="text-xs text-cinza-medio">Descrição, Plano de Contas, competência, valor, vencimento e conta prevista.</p>
        {lancamentos.map((t) => (
          <div key={t.lancamentoId} className={linha}>
            <span className="min-w-0 flex-1 truncate" title={t.descricao}>
              {t.categoriaNome} - {t.descricao}
            </span>
            <button type="button" onClick={() => abrirLancamento(t.lancamentoId)} disabled={isPending} className={botao}>
              Editar
            </button>
          </div>
        ))}
      </section>
        </>
      )}

      <section className="flex flex-col gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">{tipo === "receita" ? "Recebimento" : "Pagamento"}</div>
        {grupo.pagamentos.length === 0 && <p className="text-xs text-cinza-medio">Ainda não {tipo === "receita" ? "recebido" : "pago"}.</p>}
        {grupo.pagamentos.map((p, i) => (
          <div key={`${p.data}-${p.contaFinanceiraId}`} className="flex flex-col gap-2 rounded-md border border-cinza-claro bg-branco px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {verboPassado} em <strong>{formatarDataBr(p.data)}</strong> - {nomeConta.get(p.contaFinanceiraId) ?? "Conta"} - R$ {formatarMoeda(p.valor)}
              </span>
              {corrigindo !== i && (
                <button
                  type="button"
                  onClick={() => {
                    setCorrigindo(i);
                    setData(p.data);
                    setContaId(p.contaFinanceiraId);
                    setErro(null);
                  }}
                  className={botao}
                >
                  Corrigir data ou conta
                </button>
              )}
            </div>
            {corrigindo === i && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
                  Data
                  <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza" />
                </label>
                <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-semibold text-cinza-medio">
                  Conta
                  <SeletorComBusca value={contaId} opcoes={opcoesConta} onChange={setContaId} placeholder="Selecionar conta..." />
                </label>
                <button
                  type="button"
                  onClick={() => salvarPagamento(i)}
                  disabled={isPending || !data || !contaId || (data === p.data && contaId === p.contaFinanceiraId)}
                  className="rounded-md bg-azul-noite px-3 py-2 text-xs font-bold text-branco disabled:opacity-50"
                >
                  {isPending ? "Salvando..." : "Salvar"}
                </button>
                <button type="button" onClick={() => setCorrigindo(null)} className="rounded-md border border-cinza-claro px-3 py-2 text-xs font-semibold text-cinza-medio">
                  Cancelar
                </button>
                <p className="w-full text-xs text-cinza-medio">
                  O valor não muda. O pagamento antigo fica no histórico como estornado e o certo é gravado no lugar.
                </p>
              </div>
            )}
          </div>
        ))}
      </section>

      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <button type="button" onClick={onFechar} className="rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio">
        Fechar
      </button>
    </div>
  );
}
