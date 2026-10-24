"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  anexarEntradaAction,
  descartarEntradaAction,
  enviarArquivosAction,
  lancarEntradaAction,
  lerDeNovoAction,
  linkOriginalAction,
} from "@/app/(app)/financeiro-gerencial/caixa-entrada/actions";
import {
  listarLancamentosParaAnexarAction,
  type LancamentoParaAnexar,
} from "@/app/(app)/financeiro-gerencial/caixa-entrada/busca-actions";
import { DicaCalculo } from "@/components/dica-calculo";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { CaixaEntradaConfigurar } from "@/components/financeiro-gerencial/caixa-entrada-configurar";
import { DocumentoModal, opcoesPlanoDeContas } from "@/components/financeiro-gerencial/documento-modal";
import { FormularioTransferencia } from "@/components/financeiro-gerencial/transferencia-modal";
import {
  formatarDataHoraBr,
  rotuloTipoDocumento,
  totalLido,
  valoresIniciaisDaExtracao,
} from "@/lib/financeiro-gerencial/caixa-entrada-tela";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import type { ConfigCaixa, DestinatarioAlerta, EntradaCaixa, SituacaoEntrada } from "@/lib/banco/caixa-entrada";
import type { CategoriaFinanceira, ContaFinanceira } from "@/lib/financeiro-gerencial/tipos";
import { normalizarBusca } from "@/lib/busca";

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CANAL: Record<EntradaCaixa["canal"], string> = { upload: "Upload", whatsapp: "WhatsApp", drive: "Drive" };

const SITUACAO: Record<SituacaoEntrada, { rotulo: string; classe: string }> = {
  recebido: { rotulo: "Lendo...", classe: "bg-azul-petroleo/15 text-azul-petroleo" },
  lendo: { rotulo: "Lendo...", classe: "bg-azul-petroleo/15 text-azul-petroleo" },
  lido: { rotulo: "Lido", classe: "bg-verde/20 text-verde" },
  falhou: { rotulo: "Não consegui ler", classe: "bg-vermelho/15 text-vermelho" },
  lancado: { rotulo: "Lançado", classe: "bg-verde/20 text-verde" },
  anexado: { rotulo: "Anexado", classe: "bg-azul-petroleo/15 text-azul-petroleo" },
  descartado: { rotulo: "Descartado", classe: "bg-cinza-claro text-cinza-medio" },
};

const ACEITOS = ".pdf,.jpg,.jpeg,.png,.webp,.xml";
const EXTENSOES = /\.(pdf|jpe?g|png|webp|xml)$/i;
const MAX_ARQUIVOS = 20;
const MB = 1024 * 1024;
// Limite do corpo das Server Actions (next.config: 4.4 MB) com folga para o envelope do envio.
const LIMITE_POR_ENVIO = 4 * MB;

/** Separa os arquivos em lotes que cabem num envio (o servidor recebe até 20 por vez). */
function montarLotes(arquivos: File[]): File[][] {
  const lotes: File[][] = [];
  let atual: File[] = [];
  let tamanho = 0;
  for (const a of arquivos) {
    if (atual.length > 0 && (tamanho + a.size > LIMITE_POR_ENVIO || atual.length >= MAX_ARQUIVOS)) {
      lotes.push(atual);
      atual = [];
      tamanho = 0;
    }
    atual.push(a);
    tamanho += a.size;
  }
  if (atual.length > 0) lotes.push(atual);
  return lotes;
}

export function CaixaEntrada({
  pendentes,
  tratadas,
  categorias,
  contas,
  hoje,
  config,
  alertas,
}: {
  pendentes: EntradaCaixa[];
  tratadas: EntradaCaixa[];
  categorias: CategoriaFinanceira[];
  contas: ContaFinanceira[];
  hoje: string;
  /** null = sem Gestão/master (não mostra Configurar). */
  config: ConfigCaixa | null;
  alertas: DestinatarioAlerta[] | null;
}) {
  const router = useRouter();
  const [aba, setAba] = useState<"pendentes" | "tratadas">("pendentes");
  const [aviso, setAviso] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [revisando, setRevisando] = useState<EntradaCaixa | null>(null);
  const [anexando, setAnexando] = useState<EntradaCaixa | null>(null);
  const [descartando, setDescartando] = useState<EntradaCaixa | null>(null);
  const [transferindo, setTransferindo] = useState<EntradaCaixa | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Atualiza a cada 30 s enquanto algum documento ainda está sendo lido.
  const lendo = pendentes.some((e) => e.situacao === "recebido" || e.situacao === "lendo");
  useEffect(() => {
    if (!lendo) return;
    const id = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(id);
  }, [lendo, router]);

  const idsPlanoDespesa = useMemo(() => new Set(opcoesPlanoDeContas(categorias, "despesa").map((o) => o.id)), [categorias]);
  const lista = aba === "pendentes" ? pendentes : tratadas;

  function verOriginal(entrada: EntradaCaixa) {
    // Abre a aba já no clique (bloqueador de pop-up) e troca o endereço quando o link chega.
    const janela = window.open("", "_blank");
    startTransition(async () => {
      const r = await linkOriginalAction(entrada.id);
      if (!r.ok) {
        janela?.close();
        setAviso({ ok: false, mensagem: r.mensagem });
        return;
      }
      if (janela) janela.location.href = r.url;
      else window.open(r.url, "_blank", "noopener");
    });
  }

  function lerDeNovo(entrada: EntradaCaixa) {
    setOcupado(entrada.id);
    setAviso(null);
    startTransition(async () => {
      const r = await lerDeNovoAction(entrada.id);
      setAviso(r);
      setOcupado(null);
      // Sucesso já vem revalidado pela action; só a falha busca a lista de novo.
      if (!r.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Caixa de Entrada</h1>
        {/* 20/10/2026: extrato enviado aqui era lido como um documento só, sem as linhas do banco. */}
        <p className="text-sm text-cinza-medio">
          Notas, boletos e recibos. Extrato do banco não vai aqui: ele entra pela tela Conciliação, linha a linha.
        </p>
      </div>

      <AreaEnvio onResultado={setAviso} />

      {aviso && (
        <div
          role="status"
          className={`flex items-start justify-between gap-2 rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-verde/10 text-verde" : "bg-vermelho/10 text-vermelho"}`}
        >
          <span>{aviso.mensagem}</span>
          <button type="button" onClick={() => setAviso(null)} className="text-xs font-semibold">
            Fechar
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-cinza-claro bg-branco p-1" role="tablist">
          {(
            [
              ["pendentes", `Para lançar (${pendentes.length})`],
              ["tratadas", `Já tratados (${tratadas.length})`],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={aba === valor}
              onClick={() => setAba(valor)}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold ${aba === valor ? "bg-azul-noite text-branco" : "text-cinza-medio hover:bg-off-white"}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        {lendo && <span className="text-xs text-cinza-medio">Lendo documentos, a lista se atualiza sozinha a cada 10 segundos.</span>}
      </div>

      <TabelaRolavel className="max-h-[70vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Documentos da Caixa de Entrada">
        <table className="w-full min-w-[1040px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th larguraFixa="104px">Chegada</Th>
              <Th larguraFixa="140px">Canal</Th>
              <Th>Arquivo</Th>
              <Th align="center" larguraFixa="136px">
                Situação
              </Th>
              <Th>Fornecedor lido</Th>
              <Th align="right" larguraFixa="120px">
                <span className="inline-flex items-center gap-1">
                  Total lido
                  <DicaCalculo
                    rotulo="Total lido"
                    texto="Soma dos vencimentos lidos do documento. Se o documento não traz vencimento, é o valor total impresso. Leitura automática: confira antes de lançar."
                  />
                </span>
              </Th>
              <Th align="center" larguraFixa={aba === "pendentes" ? "220px" : "200px"}>
                {aba === "pendentes" ? "Ações" : "Resultado"}
              </Th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => {
              const situacao = SITUACAO[e.situacao];
              const ex = e.extracao;
              return (
                <tr key={e.id} className="border-t border-cinza-claro align-top hover:bg-off-white/60">
                  <td className="whitespace-nowrap px-3 py-2">{formatarDataHoraBr(e.recebidoEm)}</td>
                  <td className="px-3 py-2">
                    <div>{CANAL[e.canal]}</div>
                    {e.remetente && (
                      <div className="max-w-[140px] truncate text-xs text-cinza-medio" title={e.remetente}>
                        {e.remetente}
                      </div>
                    )}
                  </td>
                  <td className="max-w-[240px] px-3 py-2">
                    <button
                      type="button"
                      onClick={() => verOriginal(e)}
                      className="block max-w-full truncate text-left font-semibold text-azul-petroleo hover:underline"
                      title={`Ver original: ${e.nomeArquivo}`}
                    >
                      {e.nomeArquivo}
                    </button>
                    {ex && (
                      <div className="text-xs text-cinza-medio">
                        {rotuloTipoDocumento(ex.tipoDocumento)}
                        {ex.numero ? ` nº ${ex.numero}` : ""}
                        {ex.dataEmissao ? ` - ${formatarDataBr(ex.dataEmissao)}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${situacao.classe}`}>
                      {situacao.rotulo}
                    </span>
                    {e.situacao === "falhou" && (
                      <button
                        type="button"
                        onClick={() => lerDeNovo(e)}
                        disabled={ocupado === e.id}
                        className="mt-1 block w-full text-xs font-semibold text-azul-petroleo hover:underline disabled:opacity-50"
                      >
                        {ocupado === e.id ? "Lendo..." : "Ler de novo"}
                      </button>
                    )}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2" title={ex?.contraparteNome ?? ""}>
                    {ex?.contraparteNome ?? <span className="text-cinza-medio">-</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{ex ? `R$ ${formatarMoeda(totalLido(ex))}` : "-"}</td>
                  <td className="px-3 py-2">
                    {aba === "pendentes" ? (
                      <div className="flex flex-wrap justify-center gap-1">
                        {(e.situacao === "lido" || e.situacao === "falhou") && (
                          <button
                            type="button"
                            onClick={() => setRevisando(e)}
                            className="rounded-md bg-ambar px-2 py-1 text-xs font-bold text-azul-noite hover:brightness-95"
                          >
                            {e.situacao === "lido" ? "Revisar e lançar" : "Lançar à mão"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setTransferindo(e)}
                          title="Pix ou TED entre duas contas da própria empresa. Não entra na DRE."
                          className="rounded-md border border-azul-petroleo px-2 py-1 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10"
                        >
                          Transferência
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnexando(e)}
                          className="rounded-md border border-cinza-claro px-2 py-1 text-xs font-semibold text-cinza-medio hover:bg-off-white"
                        >
                          Anexar
                        </button>
                        <button
                          type="button"
                          onClick={() => setDescartando(e)}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-vermelho hover:bg-vermelho/10"
                        >
                          Descartar
                        </button>
                      </div>
                    ) : (
                      <div className="text-center text-xs">
                        <span className={`inline-block rounded-full px-2 py-0.5 font-semibold ${situacao.classe}`}>{situacao.rotulo}</span>
                        {e.descarteMotivo && (
                          <div className="mt-1 truncate text-cinza-medio" title={e.descarteMotivo}>
                            {e.descarteMotivo}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-sm text-cinza-medio">
                  {aba === "pendentes" ? "Nada para lançar. Documentos novos aparecem aqui." : "Nenhum documento tratado ainda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TabelaRolavel>

      {config && alertas && <CaixaEntradaConfigurar config={config} alertas={alertas} />}

      {revisando && (
        <DocumentoModal
          aberto
          onFechar={() => setRevisando(null)}
          onSalvo={() => setAviso({ ok: true, mensagem: "Documento lançado." })}
          categorias={categorias}
          contas={contas}
          titulo={revisando.situacao === "lido" ? "Revisar e lançar" : "Lançar à mão"}
          valoresIniciais={revisando.extracao ? valoresIniciaisDaExtracao(revisando.extracao, hoje, idsPlanoDespesa) : { tipo: "despesa" }}
          cabecalho={<CabecalhoRevisao entrada={revisando} />}
          aoSalvar={(documento) => lancarEntradaAction({ entradaId: revisando.id, documento })}
        />
      )}

      <ModalFlutuante aberto={anexando !== null} onFechar={() => setAnexando(null)} larga>
        {anexando && (
          <AnexarLancamento
            entrada={anexando}
            onFechar={() => setAnexando(null)}
            onFeito={(mensagem) => {
              setAnexando(null);
              setAviso({ ok: true, mensagem });
            }}
          />
        )}
      </ModalFlutuante>

      <ModalFlutuante aberto={transferindo !== null} onFechar={() => setTransferindo(null)}>
        {transferindo && (
          <FormularioTransferencia
            contas={contas.filter((c) => c.ativo && c.tipo !== "cartao_credito")}
            onFechar={() => setTransferindo(null)}
            inicial={{
              valor: transferindo.extracao ? totalLido(transferindo.extracao) || null : null,
              data: transferindo.extracao?.dataEmissao ?? hoje,
              descricao: transferindo.nomeArquivo.slice(0, 200),
            }}
            onSalvo={async () => {
              // A transferência já foi gravada; o documento sai de "Para lançar" com o motivo.
              const r = await descartarEntradaAction({ entradaId: transferindo.id, motivo: "Lançado como transferência entre contas" });
              setAviso({ ok: true, mensagem: r.ok ? "Transferência registrada." : "Transferência registrada. Descarte o documento da lista à mão." });
            }}
          />
        )}
      </ModalFlutuante>

      <ModalFlutuante aberto={descartando !== null} onFechar={() => setDescartando(null)}>
        {descartando && (
          <Descartar
            entrada={descartando}
            onFechar={() => setDescartando(null)}
            onFeito={(mensagem) => {
              setDescartando(null);
              setAviso({ ok: true, mensagem });
            }}
          />
        )}
      </ModalFlutuante>
    </div>
  );
}

function AreaEnvio({ onResultado }: { onResultado: (r: { ok: boolean; mensagem: string }) => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function enviar(arquivos: File[]) {
    if (arquivos.length === 0) return;
    const invalidos = arquivos.filter((a) => !EXTENSOES.test(a.name));
    if (invalidos.length > 0) {
      onResultado({ ok: false, mensagem: `Formato não aceito: ${invalidos.map((a) => a.name).join(", ")}. Envie PDF, JPG, PNG, WEBP ou XML da NF-e.` });
      return;
    }
    const grandes = arquivos.filter((a) => a.size > LIMITE_POR_ENVIO);
    if (grandes.length > 0) {
      onResultado({
        ok: false,
        mensagem: `${grandes.map((a) => a.name).join(", ")} passa de 4 MB pelo navegador. Mande pelo WhatsApp ou pela pasta do Drive, ou reduza o arquivo.`,
      });
      return;
    }
    const lotes = montarLotes(arquivos);
    startTransition(async () => {
      const mensagens: string[] = [];
      let algumErro = false;
      for (let i = 0; i < lotes.length; i++) {
        setProgresso(lotes.length > 1 ? `Enviando parte ${i + 1} de ${lotes.length}...` : "Enviando...");
        const dados = new FormData();
        for (const a of lotes[i]) dados.append("arquivos", a);
        const r = await enviarArquivosAction(dados);
        if (!r.ok) algumErro = true;
        mensagens.push(r.mensagem);
      }
      setProgresso(null);
      onResultado({ ok: !algumErro, mensagem: mensagens.join(" ") });
      // Cada parte enviada com sucesso já revalida a página; só a falha busca de novo.
      if (algumErro) router.refresh();
    });
  }

  function aoSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    if (!isPending) enviar(Array.from(e.dataTransfer.files));
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={aoSoltar}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center ${
          arrastando ? "border-ambar bg-ambar/10" : "border-cinza-claro bg-branco"
        }`}
      >
        <p className="text-sm font-semibold text-azul-noite">Arraste notas, boletos e recibos para cá</p>
        <p className="text-xs text-cinza-medio">PDF, JPG, PNG, WEBP ou XML da NF-e. Vários de uma vez.</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACEITOS}
          className="hidden"
          onChange={(e) => {
            enviar(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isPending}
          className="rounded-md bg-ambar px-4 py-2 text-sm font-bold text-azul-noite hover:brightness-95 disabled:opacity-50"
        >
          {isPending ? (progresso ?? "Enviando...") : "Escolher arquivos"}
        </button>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza">
        <p className="font-semibold text-azul-noite">Outras formas de mandar</p>
        <p>
          <span className="font-semibold">WhatsApp:</span> quem tem o número cadastrado manda a foto, o PDF ou o XML da nota para o WhatsApp
          do Vinícius (Vini). O documento cai aqui já lido.
        </p>
        <p>
          <span className="font-semibold">Pasta do Drive:</span> solte o arquivo na pasta da unidade. A cada poucos minutos ele aparece aqui.
        </p>
        <p className="text-xs text-cinza-medio">A leitura é automática e só sugere. Nada vira lançamento sem você revisar e confirmar.</p>
      </div>
    </div>
  );
}

function CabecalhoRevisao({ entrada }: { entrada: EntradaCaixa }) {
  const ex = entrada.extracao;
  if (!ex) {
    return <p className="rounded-md bg-ambar/10 p-2 text-xs text-azul-noite">Não consegui ler este documento. Preencha à mão olhando o original.</p>;
  }
  const diferenca = ex.sugestao.diferencaCentavos;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-cinza-medio">
        {ex.fonte === "xml_nfe" ? "Lido do XML da NF-e." : "Lido pela IA a partir da imagem ou PDF. Confira os valores."} Plano de Contas em branco
        precisa ser escolhido.
      </p>
      {diferenca !== 0 && (
        <p className="rounded-md bg-ambar/15 p-2 text-xs font-semibold text-azul-noite">
          Os itens não fecham com o total da nota, confira (diferença de R$ {formatarMoeda(diferenca / 100)}).
        </p>
      )}
      {ex.itens.length > 0 && (
        <details className="rounded-md border border-cinza-claro bg-branco p-2 text-xs">
          <summary className="cursor-pointer font-semibold text-azul-petroleo">Itens lidos ({ex.itens.length})</summary>
          <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-auto">
            {ex.itens.map((item, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate" title={item.descricao}>
                  {item.descricao}
                </span>
                <span className="whitespace-nowrap">R$ {formatarMoeda(item.valorCentavos / 100)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function AnexarLancamento({ entrada, onFechar, onFeito }: { entrada: EntradaCaixa; onFechar: () => void; onFeito: (mensagem: string) => void }) {
  const [lancamentos, setLancamentos] = useState<LancamentoParaAnexar[] | null>(null);
  const [busca, setBusca] = useState(entrada.extracao?.contraparteNome ?? "");
  const [escolhido, setEscolhido] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let ativo = true;
    listarLancamentosParaAnexarAction()
      .then((l) => {
        if (ativo) setLancamentos(l);
      })
      .catch(() => {
        if (ativo) setErro("Não foi possível carregar os lançamentos.");
      });
    return () => {
      ativo = false;
    };
  }, []);

  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca);
    const todos = lancamentos ?? [];
    const lista = termo
      ? todos.filter((l) =>
          normalizarBusca([l.descricao, l.contraparteNome ?? "", l.categoriaNome, l.documentoNumero ?? "", formatarMoeda(l.valor)].join(" ")).includes(termo),
        )
      : todos;
    return lista.slice(0, 50);
  }, [lancamentos, busca]);

  function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!escolhido) return;
    setErro(null);
    startTransition(async () => {
      const r = await anexarEntradaAction({ entradaId: entrada.id, lancamentoId: escolhido });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      onFeito(r.mensagem);
    });
  }

  return (
    <form onSubmit={confirmar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Anexar a lançamento existente</h2>
      <p className="text-xs text-cinza-medio">
        Use para comprovante ou nota de algo que já foi lançado. O arquivo {entrada.nomeArquivo} fica guardado junto do lançamento.
      </p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Buscar lançamento
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Descrição, fornecedor, Plano de Contas, valor..."
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      <div className="max-h-[45vh] overflow-auto rounded-lg border border-cinza-claro bg-branco">
        {lancamentos === null && !erro && <p className="p-3 text-sm text-cinza-medio">Carregando...</p>}
        {lancamentos !== null && filtrados.length === 0 && <p className="p-3 text-sm text-cinza-medio">Nenhum lançamento encontrado.</p>}
        <ul>
          {filtrados.map((l) => (
            <li key={l.lancamentoId} className="border-b border-cinza-claro last:border-b-0">
              <label className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${escolhido === l.lancamentoId ? "bg-ambar/10" : "hover:bg-off-white"}`}>
                <input type="radio" name="lancamento" checked={escolhido === l.lancamentoId} onChange={() => setEscolhido(l.lancamentoId)} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold text-azul-noite" title={l.descricao}>
                    {l.descricao}
                  </span>
                  <span className="truncate text-xs text-cinza-medio">
                    {l.tipo === "receita" ? "Receita" : "Despesa"} - {formatarDataBr(l.primeiraData)}
                    {l.contraparteNome ? ` - ${l.contraparteNome}` : ""} - {l.categoriaNome}
                    {l.quitado ? (l.tipo === "receita" ? " - recebido" : " - pago") : ""}
                  </span>
                </span>
                <span className="whitespace-nowrap font-semibold">R$ {formatarMoeda(l.valor)}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      {lancamentos !== null && lancamentos.length > 50 && (
        <p className="text-xs text-cinza-medio">Mostrando até 50 resultados. Refine a busca para achar outros.</p>
      )}
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || !escolhido}
          className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50"
        >
          {isPending ? "Anexando..." : "Anexar"}
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

function Descartar({ entrada, onFechar, onFeito }: { entrada: EntradaCaixa; onFechar: () => void; onFeito: (mensagem: string) => void }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await descartarEntradaAction({ entradaId: entrada.id, motivo: motivo.trim() });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      onFeito(r.mensagem);
    });
  }

  return (
    <form onSubmit={confirmar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Descartar documento</h2>
      <p className="text-xs text-cinza-medio">{entrada.nomeArquivo} sai da lista Para lançar e fica em Já tratados com o motivo.</p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Motivo
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="Ex.: duplicado, não é da empresa, foto errada"
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || motivo.trim().length < 3}
          className="flex-1 rounded-lg bg-vermelho px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50"
        >
          {isPending ? "Descartando..." : "Descartar"}
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
