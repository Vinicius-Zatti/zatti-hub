"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  importarDocumentoAction,
  listarCandidatosAction,
  reprocessarImportacaoAction,
  type RespostaCandidatos,
  type RespostaImportacao,
} from "@/app/(app)/financeiro-gerencial/conciliacao/actions";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { DicaCalculo } from "@/components/dica-calculo";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { EXPLICACAO_PONTUACAO } from "@/lib/conciliacao/candidatos";
import {
  textoMotivo,
  TEXTO_CONFERENCIA,
  TEXTO_FONTE_SUGESTAO,
  TEXTO_MOTIVO_SUGESTAO,
  TEXTO_NATUREZA,
  TEXTO_SITUACAO,
} from "@/lib/conciliacao/textos";
import type { FiltrosFila, ImportacaoResumo, ItemFila } from "@/lib/banco/conciliacao";

// Preflight de interface (AGENTS.md): tabela com Th + TabelaRolavel,
// criar/editar em ModalFlutuante, conta financeira no SeletorComBusca, data
// por formatarDataBr, todo número calculado com DicaCalculo, termo
// "Plano de Contas" (nunca "Categoria").

type Conta = { id: string; nome: string; ativo: boolean };

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataHoraBr(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

const EXPLICACAO_TOTAIS =
  "Lidas = todas as linhas do arquivo. Novos = movimentos que ainda não existiam. Possível duplicidade = parece com um movimento de outro arquivo da mesma conta (nada é descartado; fica em revisão). Mesmo identificador = o banco informou o mesmo código de transação já importado. Saldos = linhas de saldo, usadas só para conferir. Erros = linhas que não puderam ser lidas.";

export function ConciliacaoPiloto(props: {
  contas: Conta[];
  importacoes: ImportacaoResumo[];
  totalImportacoes: number;
  paginaImportacoes: number;
  importacoesPorPagina: number;
  fila: ItemFila[];
  totalFila: number;
  pagina: number;
  itensPorPagina: number;
  filtros: FiltrosFila;
  planoDeContas: Record<string, string>;
  iaDocumentos: boolean;
  ehMaster: boolean;
}) {
  const [importando, setImportando] = useState(false);
  const [errosDe, setErrosDe] = useState<ImportacaoResumo | null>(null);
  const [candidatosDe, setCandidatosDe] = useState<ItemFila | null>(null);
  const nomeConta = new Map(props.contas.map((c) => [c.id, c.nome]));

  function href(parcial: Partial<{ pagina: number; estado: string; direcao: string; importacao: string | null; pimp: number }>) {
    const p = new URLSearchParams();
    const estado = parcial.estado ?? props.filtros.estado;
    const direcao = parcial.direcao ?? props.filtros.direcao;
    const importacao = parcial.importacao === undefined ? props.filtros.importacaoId : parcial.importacao;
    if (estado !== "todos") p.set("estado", estado);
    if (direcao !== "todas") p.set("direcao", direcao);
    if (importacao) p.set("importacao", importacao);
    const pagina = parcial.pagina ?? 1;
    if (pagina > 1) p.set("pagina", String(pagina));
    const pimp = parcial.pimp ?? props.paginaImportacoes;
    if (pimp > 1) p.set("pimp", String(pimp));
    const q = p.toString();
    return `/financeiro-gerencial/conciliacao${q ? `?${q}` : ""}`;
  }

  const totalPaginas = Math.max(1, Math.ceil(props.totalFila / props.itensPorPagina));
  const totalPaginasImp = Math.max(1, Math.ceil(props.totalImportacoes / props.importacoesPorPagina));

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">Conciliação</h1>
          <p className="text-sm text-cinza-medio">Envie extratos e comprovantes. Cada movimentação entra na fila de revisão com a sugestão de Plano de Contas.</p>
        </div>
        <div className="flex items-center gap-2">
          {props.ehMaster && (
            <Link href="/financeiro-gerencial/conciliacao/uso-ia" className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-azul-noite hover:bg-cinza-claro/40">
              Uso de IA
            </Link>
          )}
          <button type="button" onClick={() => setImportando(true)} className="rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:brightness-95">
            + Importar documento
          </button>
        </div>
      </div>

      <p role="note" className="rounded-lg border border-ambar bg-ambar/10 p-3 text-sm text-azul-noite">
        Piloto: importação e revisão. Nada desta tela é gravado em Receitas, Despesas, baixas ou DRE nesta etapa.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-azul-noite">
          Importações <DicaCalculo texto={EXPLICACAO_TOTAIS} rotulo="Totais da importação" />
        </h2>
        {props.importacoes.length === 0 ? (
          <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">Nenhum documento importado ainda.</p>
        ) : (
          <TabelaRolavel className="max-h-[50vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Tabela de importações">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="bg-azul-petroleo text-branco">
                  <Th larguraFixa="120px">Enviado em</Th>
                  <Th fixo>Arquivo</Th>
                  <Th>Conta financeira</Th>
                  <Th>Situação</Th>
                  <Th align="right">Lidas</Th>
                  <Th align="right">Novos</Th>
                  <Th align="right">Possível duplicidade</Th>
                  <Th align="right">Mesmo identificador</Th>
                  <Th align="right">Saldos</Th>
                  <Th align="right">Erros</Th>
                  <Th>Leitura</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody>
                {props.importacoes.map((i) => (
                  <tr key={i.id} className="border-t border-cinza-claro align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{dataHoraBr(i.criadoEm)}</td>
                    <td className="max-w-[220px] truncate px-3 py-2" title={i.nomeOriginal}>{i.nomeOriginal}</td>
                    <td className="px-3 py-2">{nomeConta.get(i.contaFinanceiraId) ?? "-"}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold">{TEXTO_SITUACAO[i.situacao] ?? i.situacao}</span>
                      {i.motivoCodigo && <div className="text-xs text-cinza-medio">{textoMotivo(i.motivoCodigo)}</div>}
                    </td>
                    <td className="px-3 py-2 text-right">{i.linhasLidas}</td>
                    <td className="px-3 py-2 text-right">{i.movimentosNovos}</td>
                    <td className="px-3 py-2 text-right">{i.possiveisDuplicidades}</td>
                    <td className="px-3 py-2 text-right">{i.mesmoIdentificador + i.conflitosIdentificador}</td>
                    <td className="px-3 py-2 text-right">{i.linhasSaldo}</td>
                    <td className="px-3 py-2 text-right">
                      {i.linhasComErro > 0 ? (
                        <button type="button" onClick={() => setErrosDe(i)} className="font-semibold text-vermelho underline">{i.linhasComErro}</button>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {i.fonteExtracao === "ia" ? "IA (documento inteiro)" : i.fonteExtracao === "deterministica" ? "Leitura local" : "-"}
                      {i.conferenciaAritmetica && (
                        <div className="text-cinza-medio">
                          {TEXTO_CONFERENCIA[i.conferenciaAritmetica]}
                          {i.fonteExtracao === "ia" && " (consistência da própria leitura)"}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      {(i.situacao === "concluida" || i.situacao === "parcial") && (
                        <Link href={href({ importacao: i.id })} className="font-semibold text-azul-petroleo underline">Ver na fila</Link>
                      )}
                      {i.situacao === "processando" && <BotaoReprocessar importacaoId={i.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaRolavel>
        )}
        <Paginacao atual={props.paginaImportacoes} total={totalPaginasImp} link={(n) => href({ pimp: n, pagina: props.pagina })} />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-azul-noite">Fila de revisão ({props.totalFila})</h2>
          <div className="flex flex-wrap gap-1 text-xs">
            {[
              ["todos", "Todos"],
              ["pendente", "Pendentes"],
              ["revisar", "Revisar"],
            ].map(([valor, rotulo]) => (
              <Filtro key={valor} ativo={props.filtros.estado === valor} href={href({ estado: valor })}>{rotulo}</Filtro>
            ))}
            <span className="mx-1 text-cinza-medio">|</span>
            {[
              ["todas", "Entradas e saídas"],
              ["entrada", "Entradas"],
              ["saida", "Saídas"],
            ].map(([valor, rotulo]) => (
              <Filtro key={valor} ativo={props.filtros.direcao === valor} href={href({ direcao: valor })}>{rotulo}</Filtro>
            ))}
            {props.filtros.importacaoId && <Filtro ativo href={href({ importacao: null })}>Só esta importação ✕</Filtro>}
          </div>
        </div>
        {props.fila.length === 0 ? (
          <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">Nada na fila com estes filtros.</p>
        ) : (
          <TabelaRolavel ariaLabel="Fila de revisão">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="bg-azul-petroleo text-branco">
                  <Th larguraFixa="96px">Data</Th>
                  <Th fixo>Descrição</Th>
                  <Th align="right">Valor</Th>
                  <Th>Natureza</Th>
                  <Th>Situação</Th>
                  <Th>Plano de Contas sugerido</Th>
                  <Th>Confiança</Th>
                  <Th>Motivo</Th>
                  <Th>Leitura</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody>
                {props.fila.map((m) => (
                  <tr key={m.id} className="border-t border-cinza-claro align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{formatarDataBr(m.data)}</td>
                    <td className="max-w-[280px] truncate px-3 py-2" title={m.descricaoOriginal}>{m.descricaoOriginal}</td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap font-semibold ${m.direcao === "saida" ? "text-vermelho" : "text-verde"}`}>
                      {m.direcao === "saida" ? "-" : "+"} {brl(m.valor)}
                    </td>
                    <td className="px-3 py-2">{TEXTO_NATUREZA[m.natureza] ?? m.natureza}</td>
                    <td className="px-3 py-2">
                      {m.estado === "revisar" ? <span className="font-semibold text-azul-noite underline decoration-ambar decoration-2">Revisar</span> : "Pendente"}
                      {m.motivoRevisao && <div className="text-xs text-cinza-medio">{textoMotivo(m.motivoRevisao)}</div>}
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-2" title={m.sugestao?.categoriaId ? props.planoDeContas[m.sugestao.categoriaId] : ""}>
                      {m.sugestao?.categoriaId ? props.planoDeContas[m.sugestao.categoriaId] ?? "-" : "-"}
                    </td>
                    <td className="px-3 py-2">{rotuloConfianca(m.sugestao?.confianca)}</td>
                    <td className="px-3 py-2 text-xs">
                      {m.sugestao ? TEXTO_FONTE_SUGESTAO[m.sugestao.fonte] ?? m.sugestao.fonte : "-"}
                      {m.sugestao && <div className="text-cinza-medio">{TEXTO_MOTIVO_SUGESTAO[m.sugestao.motivoCodigo] ?? ""}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs">{m.fonteExtracao === "ia" ? "IA" : "Local"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      <button type="button" onClick={() => setCandidatosDe(m)} className="font-semibold text-azul-petroleo underline">
                        Contas correspondentes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaRolavel>
        )}
        <Paginacao atual={props.pagina} total={totalPaginas} link={(n) => href({ pagina: n })} />
      </section>

      <ModalFlutuante aberto={importando} onFechar={() => setImportando(false)}>
        <FormularioImportacao contas={props.contas.filter((c) => c.ativo)} iaDocumentos={props.iaDocumentos} onFechar={() => setImportando(false)} />
      </ModalFlutuante>
      <ModalFlutuante aberto={errosDe !== null} onFechar={() => setErrosDe(null)}>
        {errosDe && <ErrosImportacao importacao={errosDe} onFechar={() => setErrosDe(null)} />}
      </ModalFlutuante>
      <ModalFlutuante aberto={candidatosDe !== null} onFechar={() => setCandidatosDe(null)}>
        {candidatosDe && <Candidatos movimento={candidatosDe} onFechar={() => setCandidatosDe(null)} />}
      </ModalFlutuante>
    </div>
  );
}

function rotuloConfianca(c: string | undefined): string {
  return c === "alta" ? "Alta" : c === "media" ? "Média" : c === "baixa" ? "Baixa" : "-";
}

function Filtro({ ativo, href, children }: { ativo: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-full border px-2.5 py-1 ${ativo ? "border-azul-petroleo bg-azul-petroleo text-branco" : "border-cinza-claro text-azul-noite"}`}>
      {children}
    </Link>
  );
}

function Paginacao({ atual, total, link }: { atual: number; total: number; link: (n: number) => string }) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-xs">
      {atual > 1 && <Link href={link(atual - 1)} className="rounded border border-cinza-claro px-2 py-1">Anterior</Link>}
      <span className="text-cinza-medio">Página {atual} de {total}</span>
      {atual < total && <Link href={link(atual + 1)} className="rounded border border-cinza-claro px-2 py-1">Próxima</Link>}
    </div>
  );
}

function BotaoReprocessar({ importacaoId }: { importacaoId: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [mensagem, setMensagem] = useState<string | null>(null);
  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await reprocessarImportacaoAction(importacaoId);
            setMensagem(r.ok ? null : r.mensagem);
            router.refresh();
          })
        }
        className="font-semibold text-azul-petroleo underline disabled:opacity-50"
      >
        {pendente ? "Lendo..." : "Ler de novo"}
      </button>
      {mensagem && <span className="max-w-[160px] whitespace-normal text-vermelho">{mensagem}</span>}
    </span>
  );
}

function descreverResultado(r: RespostaImportacao): string {
  if (!r.ok) return r.mensagem;
  const x = r.resultado;
  if (x.tipo === "quarentena") return `Arquivo em quarentena: ${textoMotivo(x.motivo)}. Nada foi lido.`;
  if (x.tipo === "duplicada") return "Este arquivo já foi importado nesta conta. Nada novo foi criado.";
  const s = x.resultado;
  if (s.situacao === "falhou") return `A leitura falhou: ${textoMotivo(s.motivo)}. Nenhuma movimentação foi gravada.`;
  return `${s.situacao === "parcial" ? "Importação parcial" : "Importação concluída"}: ${s.movimentos_novos ?? 0} novos, ${s.possiveis_duplicidades ?? 0} possíveis duplicidades, ${s.linhas_com_erro ?? 0} linhas com erro.`;
}

function FormularioImportacao({ contas, iaDocumentos, onFechar }: { contas: Conta[]; iaDocumentos: boolean; onFechar: () => void }) {
  const router = useRouter();
  const [conta, setConta] = useState("");
  const [pendente, iniciar] = useTransition();
  const [mensagem, setMensagem] = useState<string | null>(null);

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    dados.set("contaFinanceiraId", conta);
    iniciar(async () => {
      const r = await importarDocumentoAction(dados);
      setMensagem(descreverResultado(r));
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Importar documento</h2>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Conta financeira</span>
        <SeletorComBusca value={conta} opcoes={contas.map((c) => ({ id: c.id, label: c.nome }))} onChange={setConta} placeholder="Escolha a conta do extrato" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Tipo de documento</span>
        <select name="tipoDocumento" defaultValue="extrato" className="rounded-md border border-cinza-claro bg-branco px-3 py-2">
          <option value="extrato">Extrato do período</option>
          <option value="comprovante">Comprovante de um pagamento</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Arquivo (OFX, CSV, PDF ou imagem, até 4 MB)</span>
        <input name="arquivo" type="file" required accept=".ofx,.csv,.pdf,.jpg,.jpeg,.png,.webp" className="text-sm" />
      </label>
      <p className="text-xs text-cinza-medio">
        O sistema lê primeiro no próprio servidor. {iaDocumentos
          ? "Se o layout não tiver leitura local (ou for imagem), o documento inteiro é enviado à IA da Anthropic, com custo registrado."
          : "A leitura por IA está desligada para esta unidade: PDF sem leitura local e imagem não são lidos."}
      </p>
      {mensagem && <p role="status" className="rounded-md bg-cinza-claro/40 p-2 text-sm">{mensagem}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onFechar} className="rounded-md px-3 py-1.5 text-sm text-cinza-medio">Fechar</button>
        <button type="submit" disabled={pendente || !conta} className="rounded-md bg-ambar px-3 py-1.5 text-sm font-bold text-azul-noite disabled:opacity-50">
          {pendente ? "Lendo o documento..." : "Importar"}
        </button>
      </div>
    </form>
  );
}

function ErrosImportacao({ importacao, onFechar }: { importacao: ImportacaoResumo; onFechar: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Linhas que não foram lidas</h2>
      <p className="text-sm text-cinza-medio">{importacao.nomeOriginal}. Posição = ordem da linha no arquivo, começando em 1.</p>
      <ul className="max-h-[50vh] overflow-auto text-sm">
        {importacao.erros.map((e) => (
          <li key={e.posicao} className="border-t border-cinza-claro py-1">
            Linha {e.posicao + 1}: {textoMotivo(e.codigo)}
          </li>
        ))}
      </ul>
      {importacao.linhasComErro > importacao.erros.length && (
        <p className="text-xs text-cinza-medio">Mostrando as primeiras {importacao.erros.length} de {importacao.linhasComErro}.</p>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={onFechar} className="rounded-md px-3 py-1.5 text-sm text-cinza-medio">Fechar</button>
      </div>
    </div>
  );
}

function Candidatos({ movimento, onFechar }: { movimento: ItemFila; onFechar: () => void }) {
  const [resposta, setResposta] = useState<RespostaCandidatos | null>(null);
  const [foraDaJanela, setForaDaJanela] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [pendente, iniciar] = useTransition();

  function buscar(fora: boolean, p: number) {
    setForaDaJanela(fora);
    setPagina(p);
    iniciar(async () => {
      setResposta(
        await listarCandidatosAction({
          movimentoId: movimento.id,
          data: movimento.data,
          valorCentavos: Math.round(movimento.valor * 100),
          contaFinanceiraId: movimento.contaFinanceiraId,
          foraDaJanela: fora,
          pagina: p,
        }),
      );
    });
  }

  // Primeira busca ao abrir (janela de 5 dias).
  useEffect(() => {
    iniciar(async () => {
      setResposta(
        await listarCandidatosAction({
          movimentoId: movimento.id,
          data: movimento.data,
          valorCentavos: Math.round(movimento.valor * 100),
          contaFinanceiraId: movimento.contaFinanceiraId,
          foraDaJanela: false,
          pagina: 1,
        }),
      );
    });
  }, [movimento]);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Contas correspondentes</h2>
      <p className="text-sm">
        {formatarDataBr(movimento.data)} · {movimento.direcao === "saida" ? "Saída" : "Entrada"} de {brl(movimento.valor)}
        <span className="block truncate text-cinza-medio" title={movimento.descricaoOriginal}>{movimento.descricaoOriginal}</span>
      </p>
      <p className="flex items-center gap-1 text-xs text-cinza-medio">
        {foraDaJanela ? "Todas as datas" : "Data prevista até 5 dias antes ou depois"}. Só consulta: nada é conciliado nesta etapa.
        <DicaCalculo texto={EXPLICACAO_PONTUACAO} rotulo="Pontos" />
      </p>
      {pendente && <p className="text-sm text-cinza-medio">Buscando...</p>}
      {resposta && !resposta.ok && <p className="text-sm text-vermelho">{resposta.mensagem}</p>}
      {resposta?.ok && resposta.itens.length === 0 && <p className="text-sm text-cinza-medio">Nenhuma conta em aberto correspondente.</p>}
      {resposta?.ok && resposta.itens.length > 0 && (
        <ul className="flex max-h-[45vh] flex-col gap-2 overflow-auto">
          {resposta.itens.map((c) => (
            <li key={c.parcelaId} className={`rounded-md border p-2 text-sm ${c.grupo === "quitada" ? "border-ambar bg-ambar/10" : "border-cinza-claro"}`}>
              <div className="flex justify-between gap-2">
                <span className="truncate font-semibold" title={c.descricao}>{c.descricao}</span>
                <span className="whitespace-nowrap">{c.pontuacao.pontos} pontos</span>
              </div>
              <div className="text-xs text-cinza-medio">
                {c.categoriaNome} · parcela {c.numero}/{c.totalParcelas} · previsto {formatarDataBr(c.dataPrevista)} · valor {brl(c.valor)} · em aberto {brl(c.saldoAberto)}
                {c.pontuacao.diferencaCentavos !== 0 && ` · diferença ${brl(c.pontuacao.diferencaCentavos / 100)}`}
              </div>
              <div className="text-xs">{c.pontuacao.motivos.join(" · ")}</div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap justify-between gap-2 text-xs">
        <div className="flex gap-2">
          {!foraDaJanela && <button type="button" onClick={() => buscar(true, 1)} className="underline">Buscar em todas as datas</button>}
          {pagina > 1 && <button type="button" onClick={() => buscar(foraDaJanela, pagina - 1)} className="underline">Anteriores</button>}
          {resposta?.ok && resposta.temMais && <button type="button" onClick={() => buscar(foraDaJanela, pagina + 1)} className="underline">Mais resultados</button>}
        </div>
        <button type="button" onClick={onFechar} className="rounded-md px-3 py-1.5 text-sm text-cinza-medio">Fechar</button>
      </div>
    </div>
  );
}
