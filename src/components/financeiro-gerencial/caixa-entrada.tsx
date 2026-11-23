"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  anexarEntradaAction,
  descartarEntradaAction,
  enviarArquivosAction,
  lancarEntradaAction,
  lancarEntradaComoRecorrenteAction,
  lerDeNovoAction,
  linkOriginalAction,
  mandarParaConciliacaoAction,
} from "@/app/(app)/financeiro-gerencial/caixa-entrada/actions";
import {
  listarLancamentosParaAnexarAction,
  type LancamentoParaAnexar,
} from "@/app/(app)/financeiro-gerencial/caixa-entrada/busca-actions";
import { CampoNumero } from "@/components/campo-numero";
import { DicaCalculo } from "@/components/dica-calculo";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { CaixaEntradaConfigurar } from "@/components/financeiro-gerencial/caixa-entrada-configurar";
import { DocumentoModal, opcoesPlanoDeContas } from "@/components/financeiro-gerencial/documento-modal";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { FormularioTransferencia } from "@/components/financeiro-gerencial/transferencia-modal";
import {
  descricaoSugerida,
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

const CANAL: Record<EntradaCaixa["canal"], string> = { upload: "Upload", whatsapp: "WhatsApp", drive: "Drive", sefaz: "SEFAZ" };

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
  // Vincular comprovante a pagamento já agendado: a mesma tela de anexar, só com contas em aberto.
  const [vinculando, setVinculando] = useState(false);
  const [recorrendo, setRecorrendo] = useState<EntradaCaixa | null>(null);
  const [conciliando, setConciliando] = useState<EntradaCaixa | null>(null);
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
                    {(e.situacao === "falhou" || e.situacao === "lido") && (
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
                    {ex?.observacao && /^(Possível nota repetida|Nota cancelada)/.test(ex.observacao) && (
                      <span className="block truncate text-xs font-semibold text-vermelho" title={ex.observacao}>
                        {ex.observacao.startsWith("Nota cancelada") ? "Nota cancelada na SEFAZ" : "Possível nota repetida"}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{ex ? `R$ ${formatarMoeda(totalLido(ex))}` : "-"}</td>
                  <td className="px-3 py-2">
                    {aba === "pendentes" ? (
                      <div className="flex flex-wrap justify-center gap-1">
                        {ex?.tipoDocumento === "extrato" && (
                          <button
                            type="button"
                            onClick={() => setConciliando(e)}
                            title="Extrato bancário não se lança aqui: ele vai para a Conciliação, linha a linha."
                            className="rounded-md bg-ambar px-2 py-1 text-xs font-bold text-azul-noite hover:brightness-95"
                          >
                            Mandar para Conciliação
                          </button>
                        )}
                        {(e.situacao === "lido" || e.situacao === "falhou") && ex?.tipoDocumento !== "extrato" && (
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
          cabecalho={
            <CabecalhoRevisao
              entrada={revisando}
              onVincular={() => {
                setVinculando(true);
                setAnexando(revisando);
                setRevisando(null);
              }}
              onRecorrente={() => {
                setRecorrendo(revisando);
                setRevisando(null);
              }}
            />
          }
          aoSalvar={(documento) => lancarEntradaAction({ entradaId: revisando.id, documento })}
        />
      )}

      <ModalFlutuante
        aberto={anexando !== null}
        onFechar={() => {
          setAnexando(null);
          setVinculando(false);
        }}
        larga
      >
        {anexando && (
          <AnexarLancamento
            entrada={anexando}
            vincular={vinculando}
            onFechar={() => {
              setAnexando(null);
              setVinculando(false);
            }}
            onFeito={(mensagem) => {
              setAnexando(null);
              setVinculando(false);
              setAviso({ ok: true, mensagem });
            }}
          />
        )}
      </ModalFlutuante>

      <ModalFlutuante aberto={conciliando !== null} onFechar={() => setConciliando(null)}>
        {conciliando && (
          <MandarParaConciliacao
            entrada={conciliando}
            contas={contas.filter((c) => c.ativo && c.tipo !== "cartao_credito")}
            onFechar={() => setConciliando(null)}
            onFeito={(mensagem) => {
              setConciliando(null);
              setAviso({ ok: true, mensagem });
            }}
          />
        )}
      </ModalFlutuante>

      <ModalFlutuante aberto={recorrendo !== null} onFechar={() => setRecorrendo(null)} larga>
        {recorrendo && (
          <CadastrarRecorrente
            entrada={recorrendo}
            categorias={categorias}
            hoje={hoje}
            onFechar={() => setRecorrendo(null)}
            onFeito={(mensagem) => {
              setRecorrendo(null);
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

function CabecalhoRevisao({ entrada, onVincular, onRecorrente }: { entrada: EntradaCaixa; onVincular: () => void; onRecorrente: () => void }) {
  const ex = entrada.extracao;
  // Comprovante de conta que se repete: em vez de lançar avulso, vincula ao pagamento já agendado
  // ou cadastra a conta recorrente (23/11/2026).
  const atalhos = (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onVincular}
        title="Para comprovante de uma conta já cadastrada (recorrente ou agendada). O arquivo fica guardado junto dela."
        className="rounded-md border border-azul-petroleo px-2 py-1 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10"
      >
        Vincular a pagamento já agendado
      </button>
      <button
        type="button"
        onClick={onRecorrente}
        title="Para conta que se repete todo mês e ainda não foi cadastrada. Cria a conta recorrente e guarda este arquivo na 1ª."
        className="rounded-md border border-azul-petroleo px-2 py-1 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10"
      >
        Cadastrar como conta recorrente
      </button>
    </div>
  );
  if (!ex) {
    return (
      <div className="flex flex-col gap-2">
        {atalhos}
        <p className="rounded-md bg-ambar/10 p-2 text-xs text-azul-noite">Não consegui ler este documento. Preencha à mão olhando o original.</p>
      </div>
    );
  }
  const diferenca = ex.sugestao.diferencaCentavos;
  return (
    <div className="flex flex-col gap-2">
      {atalhos}
      <p className="text-xs text-cinza-medio">
        {ex.fonte === "xml_nfe" ? "Lido do XML da NF-e." : "Lido pela IA a partir da imagem ou PDF. Confira os valores."} Cada item da nota aparece
        abaixo com o seu Plano de Contas; o que estiver em branco precisa ser escolhido.
      </p>
      {diferenca !== 0 && (
        <p className="rounded-md bg-ambar/15 p-2 text-xs font-semibold text-azul-noite">
          Os itens não fecham com o total da nota, confira (diferença de R$ {formatarMoeda(diferenca / 100)}).
        </p>
      )}
    </div>
  );
}

function AnexarLancamento({
  entrada,
  vincular = false,
  onFechar,
  onFeito,
}: {
  entrada: EntradaCaixa;
  /** Só contas a pagar ainda em aberto, a de valor mais perto do documento primeiro. */
  vincular?: boolean;
  onFechar: () => void;
  onFeito: (mensagem: string) => void;
}) {
  const [lancamentos, setLancamentos] = useState<LancamentoParaAnexar[] | null>(null);
  const [busca, setBusca] = useState(vincular ? "" : (entrada.extracao?.contraparteNome ?? ""));
  const alvo = entrada.extracao ? totalLido(entrada.extracao) : 0;
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
    const base = lancamentos ?? [];
    const todos = vincular
      ? base
          .filter((l) => l.tipo === "despesa" && !l.quitado)
          .sort((a, b) => Math.abs(a.valor - alvo) - Math.abs(b.valor - alvo) || a.primeiraData.localeCompare(b.primeiraData))
      : base;
    const lista = termo
      ? todos.filter((l) =>
          normalizarBusca([l.descricao, l.contraparteNome ?? "", l.categoriaNome, l.documentoNumero ?? "", formatarMoeda(l.valor)].join(" ")).includes(termo),
        )
      : todos;
    return lista.slice(0, 50);
  }, [lancamentos, busca, vincular, alvo]);

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
      <h2 className="font-display text-lg font-bold text-azul-noite">{vincular ? "Vincular a pagamento já agendado" : "Anexar a lançamento existente"}</h2>
      <p className="text-xs text-cinza-medio">
        {vincular
          ? `Contas a pagar em aberto, a de valor mais perto de R$ ${formatarMoeda(alvo)} primeiro. O arquivo ${entrada.nomeArquivo} fica guardado junto da conta escolhida. A baixa do pagamento continua em Contas a Pagar e Receber.`
          : `Use para comprovante ou nota de algo que já foi lançado. O arquivo ${entrada.nomeArquivo} fica guardado junto do lançamento.`}
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
          {isPending ? (vincular ? "Vinculando..." : "Anexando...") : vincular ? "Vincular" : "Anexar"}
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

/** Extrato bancário lido na Caixa de Entrada (23/11/2026): escolhe a conta e manda o arquivo para
 * a Conciliação, onde cada movimentação é conciliada. */
function MandarParaConciliacao({
  entrada,
  contas,
  onFechar,
  onFeito,
}: {
  entrada: EntradaCaixa;
  contas: ContaFinanceira[];
  onFechar: () => void;
  onFeito: (mensagem: string) => void;
}) {
  const [contaId, setContaId] = useState(contas.length === 1 ? contas[0].id : "");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const opcoes = useMemo(() => contas.map((c) => ({ id: c.id, label: c.nome })), [contas]);

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!contaId) return;
    setErro(null);
    startTransition(async () => {
      const r = await mandarParaConciliacaoAction({ entradaId: entrada.id, contaFinanceiraId: contaId });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      onFeito(r.mensagem);
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Mandar para Conciliação</h2>
      <p className="text-xs text-cinza-medio">
        {entrada.nomeArquivo} foi lido como extrato bancário. Extrato não vira despesa nem receita: ele vai para a Conciliação, onde cada
        movimentação é conciliada. Escolha de qual conta é o extrato.
      </p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Conta do extrato
        <SeletorComBusca value={contaId} opcoes={opcoes} onChange={setContaId} placeholder="Selecionar conta..." />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || !contaId}
          className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50"
        >
          {isPending ? "Enviando..." : "Mandar para Conciliação"}
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

/** Comprovante de conta que se repete e ainda não foi cadastrada: cria a conta recorrente (mesma
 * regra da tela de Despesas) e guarda o arquivo na 1ª ocorrência. */
function CadastrarRecorrente({
  entrada,
  categorias,
  hoje,
  onFechar,
  onFeito,
}: {
  entrada: EntradaCaixa;
  categorias: CategoriaFinanceira[];
  hoje: string;
  onFechar: () => void;
  onFeito: (mensagem: string) => void;
}) {
  const ex = entrada.extracao;
  const opcoes = useMemo(() => opcoesPlanoDeContas(categorias, "despesa"), [categorias]);
  const sugerida = ex?.sugestao.linhas.find((l) => l.planoContasCodigo && opcoes.some((o) => o.id === l.planoContasCodigo))?.planoContasCodigo ?? "";
  const [categoriaId, setCategoriaId] = useState(sugerida);
  const [descricao, setDescricao] = useState(ex ? descricaoSugerida(ex) : entrada.nomeArquivo.slice(0, 200));
  const [valor, setValor] = useState<number | null>(ex ? totalLido(ex) || null : null);
  const [dataPagamento, setDataPagamento] = useState(ex?.sugestao.vencimentos[0]?.data ?? ex?.dataEmissao ?? hoje);
  const [dataCompetencia, setDataCompetencia] = useState(ex?.dataEmissao ?? hoje);
  const [modoFim, setModoFim] = useState<"data" | "quantidade">("quantidade");
  const [quantidade, setQuantidade] = useState(12);
  const [dataFim, setDataFim] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pode = !isPending && categoriaId !== "" && descricao.trim() !== "" && (valor ?? 0) > 0 && dataPagamento !== "" && (modoFim === "quantidade" || dataFim !== "");

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!pode) return;
    setErro(null);
    startTransition(async () => {
      const r = await lancarEntradaComoRecorrenteAction({
        entradaId: entrada.id,
        recorrencia: {
          tipo: "despesa",
          categoriaId,
          descricao,
          valor: valor ?? 0,
          diaVencimento: Number(dataPagamento.slice(8, 10)),
          dataInicio: dataPagamento,
          dataCompetencia,
          fim: modoFim === "data" ? { modo: "data", dataFim } : { modo: "quantidade", quantidadeOcorrencias: quantidade },
        },
      });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      onFeito(r.mensagem);
    });
  }

  const campo = "w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza";
  const rotulo = "flex flex-col gap-1 text-sm font-semibold text-cinza-medio";
  return (
    <form onSubmit={salvar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Cadastrar como conta recorrente</h2>
      <p className="text-xs text-cinza-medio">
        Cria a conta que se repete todo mês a partir deste documento. A 1ª ocorrência é a deste comprovante e o arquivo {entrada.nomeArquivo} fica
        guardado nela. As próximas aparecem em Contas a Pagar e Receber.
      </p>
      <label className={rotulo}>
        Plano de Contas
        <SeletorComBusca value={categoriaId} opcoes={opcoes} onChange={setCategoriaId} placeholder="Selecionar conta..." />
      </label>
      <label className={rotulo}>
        Descrição
        <input required value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} className={campo} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={rotulo}>
          Valor de cada mês
          <CampoNumero value={valor} onChange={setValor} className="w-full" />
        </label>
        <label className={rotulo}>
          Data de Pagamento (1ª)
          <input type="date" required value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} className={campo} />
        </label>
        <label className={rotulo}>
          Data de Competência (1ª)
          <input type="date" required value={dataCompetencia} onChange={(e) => setDataCompetencia(e.target.value)} className={campo} />
        </label>
      </div>
      <div className="flex flex-col gap-1.5 rounded-lg border border-cinza-claro p-3">
        <div className="text-xs font-semibold text-cinza-medio">Até quando</div>
        <div className="flex gap-3 text-xs text-cinza-medio">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={modoFim === "quantidade"} onChange={() => setModoFim("quantidade")} />
            Número de meses
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={modoFim === "data"} onChange={() => setModoFim("data")} />
            Data final
          </label>
        </div>
        {modoFim === "quantidade" ? (
          <input
            type="number"
            min={1}
            max={360}
            value={quantidade}
            onChange={(e) => setQuantidade(Math.max(1, Math.min(360, Number(e.target.value) || 1)))}
            className="w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
          />
        ) : (
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza" />
        )}
      </div>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={!pode} className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50">
          {isPending ? "Salvando..." : "Cadastrar conta recorrente"}
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
