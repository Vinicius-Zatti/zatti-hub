"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { acaoLeadAction } from "@/app/(app)/escritorio/comercial/actions";
import { Campo, ModalFormulario, Secao, Selo, Vazio, classeBotao, classeBotaoLeve, classeCampo, useAcao } from "@/components/clientes/ui";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import {
  ETAPAS,
  ROTULO_DELIVERY,
  ROTULO_ETAPA,
  ROTULO_ORIGEM,
  SUGESTAO_ETAPA,
  descreverEventos,
  formatarMomentoBr,
  formatarWhatsapp,
  linkInstagram,
  linkWhatsapp,
  resumoAnuncio,
  type Etapa,
  type EventoLead,
  type Lead,
} from "@/lib/comercial/funil";
import { ROTULO_CANAL, ROTULO_FALA, falaDe, separarConversa } from "@/lib/comercial/conversa";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";

const numeroBr = (v: number | null, decimais = 0) =>
  v == null ? "-" : v.toLocaleString("pt-BR", { minimumFractionDigits: decimais, maximumFractionDigits: decimais });

const ROTULO_AUTOR: Record<EventoLead["autor"], string> = { site: "Site", vini: "Vini", sdr: "SDR", vinicius: "Vinícius" };

type Modal = "etapa" | "perdido" | "proxima" | "nota" | "cliente" | null;

/** Ficha do lead: dados, próxima ação, linha do tempo e ações de Vinícius.
 * Criar e editar sempre em modal (regra do AGENTS.md). Com `aoFechar`, a
 * ficha está aberta em modal por cima do funil: troca o "← Comercial" por
 * "Fechar" e avisa `aoAlterar` depois de cada ação salva para recarregar. */
export function FichaLead({
  lead,
  eventos,
  organizacoes,
  aoFechar,
  aoAlterar,
}: {
  lead: Lead;
  eventos: EventoLead[];
  organizacoes: { id: string; nome: string }[];
  aoFechar?: () => void;
  aoAlterar?: () => void;
}) {
  const { pendente, erro, setErro, executar } = useAcao();
  const [modal, setModal] = useState<Modal>(null);
  const [paraEtapa, setParaEtapa] = useState<Etapa>(lead.etapa === "perdido" ? "preencheu_formulario" : lead.etapa);
  const [motivo, setMotivo] = useState("");
  const [proxima, setProxima] = useState(lead.proximaAcao || SUGESTAO_ETAPA[lead.etapa]);
  const [proximaEm, setProximaEm] = useState(lead.proximaAcaoEm ?? "");
  const [nota, setNota] = useState("");
  const [orgId, setOrgId] = useState(lead.organizacaoId ?? "");

  const abrir = (m: Modal) => {
    setErro(null);
    setModal(m);
  };
  const fechar = () => setModal(null);
  const salvar = (entrada: Record<string, unknown>) =>
    executar(() => acaoLeadAction({ leadId: lead.id, ...entrada }), () => {
      setModal(null);
      aoAlterar?.();
    });

  // Mensagens do SDR ficam na seção "Conversa"; a linha do tempo segue só com o funil.
  const { conversa, linhaDoTempo } = separarConversa(eventos);
  const linhas = descreverEventos(linhaDoTempo).reverse();
  // Conversa abre na mensagem mais recente (embaixo), como no WhatsApp.
  const fimConversa = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (fimConversa.current) fimConversa.current.scrollTop = fimConversa.current.scrollHeight;
  }, [conversa.length]);
  const orgNome = organizacoes.find((o) => o.id === lead.organizacaoId)?.nome;

  return (
    <div className={`flex flex-col gap-4 ${aoFechar ? "" : "pb-10"}`}>
      <div className="flex flex-col gap-1">
        {aoFechar ? (
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-2xl font-bold text-azul-noite">{lead.nome}</h2>
            <button type="button" onClick={aoFechar} className={classeBotaoLeve}>Fechar</button>
          </div>
        ) : (
          <>
            <Link href="/escritorio/comercial" className="text-sm font-semibold text-azul-petroleo hover:underline">
              ← Comercial
            </Link>
            <h1 className="font-display text-2xl font-bold text-azul-noite">{lead.nome}</h1>
          </>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Selo tom={lead.etapa === "perdido" ? "critico" : "atencao"}>{ROTULO_ETAPA[lead.etapa]}</Selo>
          <Selo>{ROTULO_ORIGEM[lead.origem]}</Selo>
          {orgNome && <Selo tom="bom">Cliente: {orgNome}</Selo>}
        </div>
      </div>
      {erro && !modal && <p className="rounded-md bg-vermelho/10 px-3 py-2 text-sm text-vermelho">{erro}</p>}

      <div className="flex flex-wrap gap-2">
        {lead.instagram && (
          <a href={linkInstagram(lead.instagram)} target="_blank" rel="noopener noreferrer" className={classeBotao}>
            Abrir Instagram
          </a>
        )}
        {lead.whatsapp && (
          <a href={linkWhatsapp(lead.whatsapp)} target="_blank" rel="noopener" className={classeBotao}>
            Abrir WhatsApp
          </a>
        )}
        <button type="button" className={classeBotaoLeve} onClick={() => abrir("etapa")}>Mudar etapa</button>
        <button type="button" className={classeBotaoLeve} onClick={() => abrir("proxima")}>Próxima ação</button>
        <button type="button" className={classeBotaoLeve} onClick={() => abrir("nota")}>Nota</button>
        <button type="button" className={classeBotaoLeve} onClick={() => abrir("cliente")}>Virou cliente</button>
        {lead.etapa !== "perdido" && (
          <button type="button" className={classeBotaoLeve} onClick={() => abrir("perdido")}>Marcar perdido</button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Secao titulo="Dados">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-cinza-medio">Instagram</dt>
            <dd>
              {lead.instagram ? (
                <a href={linkInstagram(lead.instagram)} target="_blank" rel="noopener noreferrer"
                  className="font-semibold text-azul-petroleo hover:underline">
                  @{lead.instagram}
                </a>
              ) : "-"}
            </dd>
            <dt className="text-cinza-medio">WhatsApp</dt>
            <dd>{lead.whatsapp ? formatarWhatsapp(lead.whatsapp) : "-"}</dd>
            <dt className="text-cinza-medio">Negócio</dt>
            <dd>{lead.negocio || "-"}</dd>
            <dt className="text-cinza-medio">Cidade / bairro</dt>
            <dd>{lead.cidadeBairro || "-"}</dd>
            <dt className="text-cinza-medio">Seguidores</dt>
            <dd>{numeroBr(lead.seguidores)}</dd>
            <dt className="text-cinza-medio">Último post</dt>
            <dd>{lead.ultimoPostEm ? formatarDataBr(lead.ultimoPostEm) : "-"}</dd>
            <dt className="text-cinza-medio">Google</dt>
            <dd>
              {lead.notaGoogle == null && lead.avaliacoesGoogle == null
                ? "-"
                : `${numeroBr(lead.notaGoogle, 1)} (${numeroBr(lead.avaliacoesGoogle)} avaliações)`}
            </dd>
            <dt className="text-cinza-medio">Delivery</dt>
            <dd>{lead.vendeDelivery ? ROTULO_DELIVERY[lead.vendeDelivery] : "-"}</dd>
            <dt className="text-cinza-medio">Interesse</dt>
            <dd>{lead.produtoInteresse || "-"}</dd>
            <dt className="text-cinza-medio">Fatura hoje</dt>
            <dd>{lead.faturamentoAtual || "-"}</dd>
            <dt className="text-cinza-medio">Quer chegar a</dt>
            <dd>{lead.faturamentoDesejado || "-"}</dd>
            <dt className="text-cinza-medio">Dificuldade</dt>
            <dd>{lead.dificuldade || "-"}</dd>
            {resumoAnuncio(lead.anuncio) && (
              <>
                <dt className="text-cinza-medio">Anúncio</dt>
                <dd className="truncate" title={lead.anuncio?.pagina_url ?? resumoAnuncio(lead.anuncio)}>
                  {resumoAnuncio(lead.anuncio)}
                </dd>
              </>
            )}
            <dt className="text-cinza-medio">Entrou em</dt>
            <dd>{formatarMomentoBr(lead.criadoEm)}</dd>
            {lead.etapa === "perdido" && (
              <>
                <dt className="text-cinza-medio">Motivo da perda</dt>
                <dd>{lead.motivoPerda}</dd>
              </>
            )}
          </dl>
        </Secao>
        <Secao titulo="Próxima ação">
          {lead.proximaAcao ? (
            <p className="text-sm">
              {lead.proximaAcaoEm && <strong>{formatarDataBr(lead.proximaAcaoEm)}: </strong>}
              {lead.proximaAcao}
            </p>
          ) : (
            <Vazio>Sem próxima ação. Sugestão: {SUGESTAO_ETAPA[lead.etapa]}.</Vazio>
          )}
        </Secao>
      </div>

      {conversa.length > 0 && (
        <Secao titulo={`Conversa (${conversa.length})`}>
          <ol ref={fimConversa} className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
            {conversa.map((ev) => {
              const de = falaDe(ev);
              const doLead = de === "lead";
              return (
                <li key={ev.id} className={`flex flex-col text-sm ${doLead ? "items-start" : "items-end"}`}>
                  <p
                    className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 ${
                      doLead ? "bg-off-white text-azul-noite" : "border border-ambar bg-branco text-azul-noite"
                    }`}
                  >
                    {ev.texto || <span className="italic text-cinza-medio">(sem texto)</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-cinza-medio">
                    <strong className="font-semibold">{ROTULO_FALA[de]}</strong> · {formatarMomentoBr(ev.em)}
                    {ev.mensagem && ` · ${ROTULO_CANAL[ev.mensagem.canal]}`}
                  </p>
                </li>
              );
            })}
          </ol>
        </Secao>
      )}

      <Secao titulo="Linha do tempo">
        {linhas.length === 0 ? (
          <Vazio>Sem eventos.</Vazio>
        ) : (
          <ol className="flex flex-col gap-2">
            {linhas.map(({ evento, titulo, detalhe }) => (
              <li key={evento.id} className="border-l-2 border-ambar pl-3 text-sm">
                <p className="font-semibold text-azul-noite">{titulo}</p>
                <p className="text-xs text-cinza-medio">
                  {formatarMomentoBr(evento.em)} · {ROTULO_AUTOR[evento.autor]}
                </p>
                {detalhe && <p className="text-cinza">{detalhe}</p>}
              </li>
            ))}
          </ol>
        )}
      </Secao>

      <ModalFormulario aberto={modal === "etapa"} titulo="Mudar etapa" onFechar={fechar} pendente={pendente} erro={erro}
        onSalvar={() => salvar({ acao: "etapa", paraEtapa })}>
        <Campo rotulo="Etapa">
          <select className={classeCampo} value={paraEtapa} onChange={(e) => setParaEtapa(e.target.value as Etapa)}>
            {ETAPAS.filter((e) => e !== "perdido").map((e) => (
              <option key={e} value={e}>{ROTULO_ETAPA[e]}</option>
            ))}
          </select>
        </Campo>
      </ModalFormulario>

      <ModalFormulario aberto={modal === "perdido"} titulo="Marcar como perdido" onFechar={fechar} pendente={pendente} erro={erro}
        onSalvar={() => salvar({ acao: "perdido", motivo })} rotuloSalvar="Marcar perdido">
        <Campo rotulo="Motivo (obrigatório)">
          <textarea className={classeCampo} rows={3} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
      </ModalFormulario>

      <ModalFormulario aberto={modal === "proxima"} titulo="Próxima ação" onFechar={fechar} pendente={pendente} erro={erro}
        onSalvar={() => salvar({ acao: "proxima_acao", texto: proxima, data: proximaEm || null })}>
        <Campo rotulo="O que fazer" dica={`Sugestão da etapa: ${SUGESTAO_ETAPA[lead.etapa]}`}>
          <input className={classeCampo} maxLength={300} value={proxima} onChange={(e) => setProxima(e.target.value)} />
        </Campo>
        <Campo rotulo="Quando">
          <input type="date" className={classeCampo} value={proximaEm} onChange={(e) => setProximaEm(e.target.value)} />
        </Campo>
      </ModalFormulario>

      <ModalFormulario aberto={modal === "nota"} titulo="Nota" onFechar={fechar} pendente={pendente} erro={erro}
        onSalvar={() => salvar({ acao: "nota", texto: nota })}>
        <Campo rotulo="Nota">
          <textarea className={classeCampo} rows={4} maxLength={1000} value={nota} onChange={(e) => setNota(e.target.value)} />
        </Campo>
      </ModalFormulario>

      <ModalFormulario aberto={modal === "cliente"} titulo="Virou cliente" onFechar={fechar} pendente={pendente} erro={erro}
        onSalvar={() => salvar({ acao: "virou_cliente", organizacaoId: orgId })} rotuloSalvar="Vincular">
        <Campo rotulo="Cliente" dica="Cliente que ainda não existe: cadastre primeiro no Painel de Acessos (Novo cliente) e volte aqui.">
          <SeletorComBusca
            value={orgId}
            opcoes={organizacoes.map((o) => ({ id: o.id, label: o.nome }))}
            onChange={setOrgId}
            placeholder="Buscar cliente..."
          />
        </Campo>
        <p className="text-xs text-cinza-medio">
          Cliente de consultoria ou híbrido: depois de vincular, inicie o acompanhamento em{" "}
          <Link href="/escritorio/clientes" className="font-semibold text-azul-petroleo hover:underline">Clientes</Link>.
        </p>
      </ModalFormulario>
    </div>
  );
}
