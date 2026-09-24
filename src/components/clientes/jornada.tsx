"use client";

import { useState } from "react";
import { salvarEtapaAction, salvarOnboardingAction } from "@/app/(app)/escritorio/clientes/actions";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import {
  BLOCOS_ONBOARDING,
  RESPONSAVEIS,
  ROTULO_BLOCO,
  ROTULO_ETAPA,
  ROTULO_RESPONSAVEL,
  ROTULO_SITUACAO_ETAPA,
  ROTULO_SITUACAO_ONBOARDING,
  SITUACOES_ETAPA,
  SITUACOES_ONBOARDING,
  type BlocoOnboarding,
  type Etapa,
  type EtapaJornada,
  type ItemOnboarding,
  type Responsavel,
  type SituacaoEtapa,
  type SituacaoOnboarding,
} from "@/lib/clientes/tipos";
import { Campo, ModalFormulario, Secao, Selo, classeBotaoLeve, classeCampo, useAcao } from "./ui";

const TOM_ETAPA = { nao_iniciada: "neutro", em_andamento: "atencao", concluida: "bom", bloqueada: "critico" } as const;
const TOM_ONBOARDING = {
  confirmado: "bom", informado: "atencao", pendente: "neutro", nao_se_aplica: "neutro", precisa_decisao: "critico",
} as const;

function EditarEtapa({ acompanhamentoId, etapa, atual, onFechar }: {
  acompanhamentoId: string; etapa: EtapaJornada; atual: boolean; onFechar: () => void;
}) {
  const { pendente, erro, executar } = useAcao();
  const [f, setF] = useState({
    responsavel: etapa.responsavel,
    prazo: etapa.prazo ?? "",
    situacao: etapa.situacao,
    evidencia: etapa.evidencia,
    pendencia: etapa.pendencia,
    criterioConclusao: etapa.criterioConclusao,
    checklist: etapa.checklist,
    novoItem: "",
    tornarAtual: false,
  });

  const salvar = () =>
    executar(
      () =>
        salvarEtapaAction({
          acompanhamentoId,
          etapa: etapa.etapa,
          responsavel: f.responsavel,
          prazo: f.prazo || null,
          situacao: f.situacao,
          evidencia: f.evidencia,
          pendencia: f.pendencia,
          criterioConclusao: f.criterioConclusao,
          checklist: f.novoItem.trim() ? [...f.checklist, { texto: f.novoItem.trim(), feito: false }] : f.checklist,
          tornarAtual: f.tornarAtual,
        }),
      onFechar,
    );

  return (
    <ModalFormulario aberto titulo={`Etapa: ${ROTULO_ETAPA[etapa.etapa]}`} onFechar={onFechar} onSalvar={salvar} pendente={pendente} erro={erro}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Responsável">
          <select className={classeCampo} value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value as Responsavel })}>
            {RESPONSAVEIS.map((r) => <option key={r} value={r}>{ROTULO_RESPONSAVEL[r]}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Prazo">
          <input type="date" className={classeCampo} value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} />
        </Campo>
        <Campo rotulo="Situação">
          <select className={classeCampo} value={f.situacao} onChange={(e) => setF({ ...f, situacao: e.target.value as SituacaoEtapa })}>
            {SITUACOES_ETAPA.map((s) => <option key={s} value={s}>{ROTULO_SITUACAO_ETAPA[s]}</option>)}
          </select>
        </Campo>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs font-bold uppercase tracking-wide text-cinza-medio">Checklist</legend>
        {f.checklist.map((c, i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.feito} onChange={(e) => setF({ ...f, checklist: f.checklist.map((x, j) => (j === i ? { ...x, feito: e.target.checked } : x)) })} />
            {c.texto}
          </label>
        ))}
        <input className={classeCampo} placeholder="Novo item do checklist (opcional)" value={f.novoItem} onChange={(e) => setF({ ...f, novoItem: e.target.value })} />
      </fieldset>
      <Campo rotulo="Evidência"><textarea className={classeCampo} rows={2} value={f.evidencia} onChange={(e) => setF({ ...f, evidencia: e.target.value })} /></Campo>
      <Campo rotulo="Pendência"><textarea className={classeCampo} rows={2} value={f.pendencia} onChange={(e) => setF({ ...f, pendencia: e.target.value })} /></Campo>
      <Campo rotulo="Critério de conclusão"><textarea className={classeCampo} rows={2} value={f.criterioConclusao} onChange={(e) => setF({ ...f, criterioConclusao: e.target.value })} /></Campo>
      {!atual && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.tornarAtual} onChange={(e) => setF({ ...f, tornarAtual: e.target.checked })} />
          Tornar esta a fase atual do cliente
        </label>
      )}
    </ModalFormulario>
  );
}

function EditarOnboarding({ acompanhamentoId, item, bloco, onFechar }: {
  acompanhamentoId: string; item: ItemOnboarding | null; bloco: BlocoOnboarding; onFechar: () => void;
}) {
  const { pendente, erro, executar } = useAcao();
  const [f, setF] = useState({
    bloco: item?.bloco ?? bloco,
    item: item?.item ?? "",
    resposta: item?.resposta ?? "",
    situacao: item?.situacao ?? ("pendente" as SituacaoOnboarding),
  });
  const salvar = () =>
    executar(() => salvarOnboardingAction({ acompanhamentoId, id: item?.id ?? null, ...f }), onFechar);

  return (
    <ModalFormulario aberto titulo={item ? "Editar informação" : "Nova informação"} onFechar={onFechar} onSalvar={salvar} pendente={pendente} erro={erro}>
      <Campo rotulo="Bloco">
        <select className={classeCampo} value={f.bloco} onChange={(e) => setF({ ...f, bloco: e.target.value as BlocoOnboarding })}>
          {BLOCOS_ONBOARDING.map((b) => <option key={b} value={b}>{ROTULO_BLOCO[b]}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Informação"><input className={classeCampo} value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} /></Campo>
      <Campo rotulo="Situação">
        <select className={classeCampo} value={f.situacao} onChange={(e) => setF({ ...f, situacao: e.target.value as SituacaoOnboarding })}>
          {SITUACOES_ONBOARDING.map((s) => <option key={s} value={s}>{ROTULO_SITUACAO_ONBOARDING[s]}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Resumo" dica="Só o resumo necessário. Documento completo fica no Drive; nunca senha ou dado bancário.">
        <textarea className={classeCampo} rows={3} value={f.resposta} onChange={(e) => setF({ ...f, resposta: e.target.value })} />
      </Campo>
    </ModalFormulario>
  );
}

export function Jornada({ acompanhamentoId, etapaAtual, etapas, onboarding }: {
  acompanhamentoId: string; etapaAtual: Etapa; etapas: EtapaJornada[]; onboarding: ItemOnboarding[];
}) {
  const [etapaAberta, setEtapaAberta] = useState<EtapaJornada | null>(null);
  const [onb, setOnb] = useState<{ item: ItemOnboarding | null; bloco: BlocoOnboarding } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <ol className="grid gap-3 md:grid-cols-2">
        {etapas.map((e) => {
          const feitos = e.checklist.filter((c) => c.feito).length;
          return (
            <li key={e.id} className={`flex flex-col gap-2 rounded-xl border bg-branco p-4 ${e.etapa === etapaAtual ? "border-2 border-ambar" : "border-cinza-claro"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-azul-noite">
                  {e.ordem + 1}. {ROTULO_ETAPA[e.etapa]}
                  {e.etapa === etapaAtual && <span className="ml-2 text-xs text-cinza-medio">(fase atual)</span>}
                </h3>
                <Selo tom={TOM_ETAPA[e.situacao]}>{ROTULO_SITUACAO_ETAPA[e.situacao]}</Selo>
              </div>
              <p className="text-xs text-cinza-medio">
                Responsável: {ROTULO_RESPONSAVEL[e.responsavel]} · Prazo: {e.prazo ? formatarDataBr(e.prazo) : "sem prazo"} · Checklist {feitos}/{e.checklist.length}
              </p>
              <ul className="flex flex-col gap-0.5 text-sm">
                {e.checklist.map((c, i) => (
                  <li key={i} className={c.feito ? "text-cinza-medio line-through" : ""}>{c.feito ? "✓" : "○"} {c.texto}</li>
                ))}
              </ul>
              {e.pendencia && <p className="text-sm"><b>Pendência:</b> {e.pendencia}</p>}
              {e.evidencia && <p className="text-xs text-cinza"><b>Evidência:</b> {e.evidencia}</p>}
              <p className="text-xs text-cinza"><b>Critério de conclusão:</b> {e.criterioConclusao || "não definido"}</p>
              <button type="button" className={`${classeBotaoLeve} self-start`} onClick={() => setEtapaAberta(e)}>Editar etapa</button>
            </li>
          );
        })}
      </ol>

      <h2 className="font-display text-lg font-bold text-azul-noite">Onboarding</h2>
      <div className="grid gap-3 lg:grid-cols-3">
        {BLOCOS_ONBOARDING.map((b) => (
          <Secao key={b} titulo={ROTULO_BLOCO[b]} acao={<button type="button" className="text-xs font-semibold text-azul-petroleo hover:underline" onClick={() => setOnb({ item: null, bloco: b })}>+ Adicionar</button>}>
            <ul className="flex flex-col gap-2">
              {onboarding.filter((o) => o.bloco === b).map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => setOnb({ item: o, bloco: b })} className="flex w-full flex-col items-start gap-0.5 text-left">
                    <span className="flex w-full items-start justify-between gap-2 text-sm font-semibold text-azul-noite">
                      {o.item}
                      <Selo tom={TOM_ONBOARDING[o.situacao]}>{ROTULO_SITUACAO_ONBOARDING[o.situacao]}</Selo>
                    </span>
                    {o.resposta && <span className="text-xs text-cinza">{o.resposta}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </Secao>
        ))}
      </div>

      {etapaAberta && (
        <EditarEtapa acompanhamentoId={acompanhamentoId} etapa={etapaAberta} atual={etapaAberta.etapa === etapaAtual} onFechar={() => setEtapaAberta(null)} />
      )}
      {onb && <EditarOnboarding acompanhamentoId={acompanhamentoId} item={onb.item} bloco={onb.bloco} onFechar={() => setOnb(null)} />}
    </div>
  );
}
