"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  criarLancamentoManualAction,
  encerrarCronometroAction,
  iniciarCronometroAction,
  pausarCronometroAction,
  retomarCronometroAction,
} from "@/app/(app)/meu-tempo/hoje/actions";
import { CampoNumero } from "@/components/campo-numero";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { TIPO_TRABALHO_LABEL, formatarHorasMinutos } from "@/lib/meu-tempo/tempo";
import type { FrenteTempo, LancamentoTempo, TipoTrabalhoTempo } from "@/lib/meu-tempo/tipos";

function hojeInputDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Elapsed ao vivo, no navegador - só pra exibição. Quem decide a duração de
 * verdade gravada no banco é `encerrarCronometroTempo` no servidor, com o
 * relógio do servidor (ver `src/lib/banco/meu-tempo.ts`). */
function calcularElapsedSegundos(lancamento: LancamentoTempo, agoraMs: number): number {
  if (!lancamento.iniciadoEm) return 0;
  const inicioMs = new Date(lancamento.iniciadoEm).getTime();
  let pausados = lancamento.segundosPausadosAcumulados;
  if (lancamento.status === "pausado" && lancamento.pausadoDesde) {
    pausados += Math.round((agoraMs - new Date(lancamento.pausadoDesde).getTime()) / 1000);
  }
  return Math.max(0, Math.round((agoraMs - inicioMs) / 1000) - pausados);
}

function formatarHms(totalSegundos: number): string {
  const h = Math.floor(totalSegundos / 3600);
  const m = Math.floor((totalSegundos % 3600) / 60);
  const s = totalSegundos % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export function CronometroHoje({
  frentes,
  lancamentoAtivo,
  lancamentosHoje,
}: {
  frentes: FrenteTempo[];
  lancamentoAtivo: LancamentoTempo | null;
  lancamentosHoje: LancamentoTempo[];
}) {
  const router = useRouter();
  const opcoesFrente = useMemo(() => frentes.map((f) => ({ id: f.id, label: f.nome })), [frentes]);

  const [frenteEscolhida, setFrenteEscolhida] = useState(lancamentoAtivo?.frenteId ?? opcoesFrente[0]?.id ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [lancando, setLancando] = useState(false);
  const [agoraMs, setAgoraMs] = useState(() => Date.now());

  useEffect(() => {
    if (lancamentoAtivo?.status !== "em_andamento") return;
    const id = setInterval(() => setAgoraMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lancamentoAtivo?.status]);

  function iniciar() {
    if (!frenteEscolhida) return;
    setErro(null);
    startTransition(async () => {
      const resultado = await iniciarCronometroAction({ frenteId: frenteEscolhida });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
    });
  }

  // Trocar de frente com o cronômetro ativo encerra automaticamente o
  // anterior (spec) - `iniciarCronometroAction` já faz isso no servidor.
  // Reselecionar a MESMA frente ativa não deve reiniciar nada (perderia o
  // elapsed acumulado à toa).
  function trocarFrente(novoId: string) {
    setFrenteEscolhida(novoId);
    if (!lancamentoAtivo || novoId === lancamentoAtivo.frenteId || !novoId) return;
    setErro(null);
    startTransition(async () => {
      const resultado = await iniciarCronometroAction({ frenteId: novoId });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
    });
  }

  function pausar() {
    if (!lancamentoAtivo) return;
    setErro(null);
    startTransition(async () => {
      const resultado = await pausarCronometroAction({ id: lancamentoAtivo.id });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
    });
  }

  function retomar() {
    if (!lancamentoAtivo) return;
    setErro(null);
    startTransition(async () => {
      const resultado = await retomarCronometroAction({ id: lancamentoAtivo.id });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
    });
  }

  function encerrar() {
    if (!lancamentoAtivo) return;
    setErro(null);
    startTransition(async () => {
      const resultado = await encerrarCronometroAction({ id: lancamentoAtivo.id });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
    });
  }

  const elapsed = lancamentoAtivo ? calcularElapsedSegundos(lancamentoAtivo, agoraMs) : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Hoje</h1>
        <p className="text-sm text-cinza-medio">Cronômetro por frente, ou lançamento manual quando preferir.</p>
      </div>

      {frentes.length === 0 ? (
        <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">
          Nenhuma frente cadastrada ainda. Cadastre em <strong>Configurações</strong> antes de usar o cronômetro.
        </p>
      ) : (
        <div className="rounded-lg border border-cinza-claro bg-branco p-4">
          <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
            Frente
            <SeletorComBusca value={frenteEscolhida} opcoes={opcoesFrente} onChange={trocarFrente} placeholder="Selecionar frente..." />
          </label>

          <div className="my-4 text-center font-mono text-4xl font-bold text-azul-noite">{formatarHms(elapsed)}</div>

          {lancamentoAtivo && (
            <p className="mb-3 text-center text-xs text-cinza-medio">
              {lancamentoAtivo.status === "pausado" ? "Pausado" : "Em andamento"}
            </p>
          )}

          {erro && <p className="mb-2 text-sm text-vermelho">{erro}</p>}

          <div className="flex gap-2">
            {!lancamentoAtivo && (
              <button
                type="button"
                onClick={iniciar}
                disabled={isPending || !frenteEscolhida}
                className="flex-1 rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50"
              >
                {isPending ? "Iniciando..." : "Iniciar"}
              </button>
            )}
            {lancamentoAtivo?.status === "em_andamento" && (
              <>
                <button
                  type="button"
                  onClick={pausar}
                  disabled={isPending}
                  className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza disabled:opacity-50"
                >
                  Pausar
                </button>
                <button
                  type="button"
                  onClick={encerrar}
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50"
                >
                  Encerrar
                </button>
              </>
            )}
            {lancamentoAtivo?.status === "pausado" && (
              <>
                <button
                  type="button"
                  onClick={retomar}
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50"
                >
                  Retomar
                </button>
                <button
                  type="button"
                  onClick={encerrar}
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50"
                >
                  Encerrar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-azul-noite">Lançamentos de hoje</h2>
        <button
          type="button"
          onClick={() => setLancando(true)}
          disabled={frentes.length === 0}
          className="shrink-0 rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:brightness-95 disabled:opacity-50"
        >
          + Lançamento manual
        </button>
      </div>

      {lancamentosHoje.length === 0 ? (
        <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">Nenhum lançamento hoje ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {lancamentosHoje.map((l) => (
            <div key={l.id} className="rounded-lg border border-cinza-claro bg-branco p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-cinza">{l.frenteNome}</span>
                <span className="font-mono text-azul-noite">{formatarHorasMinutos(l.duracaoMinutos ?? 0)}</span>
              </div>
              <div className="text-xs text-cinza-medio">
                {TIPO_TRABALHO_LABEL[l.tipoTrabalho]}
                {l.horaInicio && l.horaFim ? ` - ${l.horaInicio} às ${l.horaFim}` : ""}
                {l.origem === "cronometro" ? " - cronômetro" : ""}
              </div>
              {l.observacao && <p className="mt-1 text-xs text-cinza-medio">{l.observacao}</p>}
            </div>
          ))}
        </div>
      )}

      <ModalFlutuante aberto={lancando} onFechar={() => setLancando(false)}>
        <FormularioLancamentoManual frentes={frentes} onSalvo={() => setLancando(false)} onCancelar={() => setLancando(false)} />
      </ModalFlutuante>
    </div>
  );
}

type ModoTempo = "horario" | "duracao";

function FormularioLancamentoManual({
  frentes,
  onSalvo,
  onCancelar,
}: {
  frentes: FrenteTempo[];
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const router = useRouter();
  const opcoesFrente = useMemo(() => frentes.map((f) => ({ id: f.id, label: f.nome })), [frentes]);

  const [frenteId, setFrenteId] = useState(opcoesFrente[0]?.id ?? "");
  const [data, setData] = useState(hojeInputDate());
  const [modo, setModo] = useState<ModoTempo>("horario");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [duracaoMinutos, setDuracaoMinutos] = useState<number | null>(null);
  const [tipoTrabalho, setTipoTrabalho] = useState<TipoTrabalhoTempo>("execucao");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const tempo =
        modo === "horario"
          ? { modo: "horario" as const, horaInicio, horaFim }
          : { modo: "duracao" as const, duracaoMinutos: duracaoMinutos ?? 0 };
      const resultado = await criarLancamentoManualAction({ frenteId, data, tempo, tipoTrabalho, observacao });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
      onSalvo();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Novo lançamento manual</h2>

      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Frente
        <SeletorComBusca value={frenteId} opcoes={opcoesFrente} onChange={setFrenteId} placeholder="Selecionar frente..." />
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Data
        <input
          type="date"
          required
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>

      <div className="flex gap-3 text-xs text-cinza-medio">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={modo === "horario"} onChange={() => setModo("horario")} />
          Por horário
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={modo === "duracao"} onChange={() => setModo("duracao")} />
          Por duração
        </label>
      </div>

      {modo === "horario" ? (
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-cinza-medio">
            Hora início
            <input
              type="time"
              required
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-cinza-medio">
            Hora fim
            <input
              type="time"
              required
              value={horaFim}
              onChange={(e) => setHoraFim(e.target.value)}
              className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
            />
          </label>
        </div>
      ) : (
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Duração (minutos)
          <CampoNumero value={duracaoMinutos} onChange={setDuracaoMinutos} decimais={0} className="w-full" />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Tipo de trabalho
        <select
          value={tipoTrabalho}
          onChange={(e) => setTipoTrabalho(e.target.value as TipoTrabalhoTempo)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        >
          {(Object.keys(TIPO_TRABALHO_LABEL) as TipoTrabalhoTempo[]).map((t) => (
            <option key={t} value={t}>
              {TIPO_TRABALHO_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Observação
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>

      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={isPending || !frenteId}
          className="flex-1 rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={isPending}
          className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
