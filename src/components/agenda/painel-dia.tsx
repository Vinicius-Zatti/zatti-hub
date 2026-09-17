"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  criarTarefaAction,
  editarTarefaAction,
  excluirTarefaAction,
  marcarRotinaAction,
  marcarTarefaAction,
} from "@/app/(app)/agenda/dia/actions";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { blocosDisponiveis, type DiaMontado } from "@/lib/agenda/dia";
import { diaDaSemanaIso, horaCurta, nomeDiaSemana } from "@/lib/agenda/grade";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import type { RotinaAgenda, SituacaoItem, TarefaAgenda } from "@/lib/agenda/tipos";
import { TETO_PRIORIDADES } from "@/lib/agenda/tipos";

/** As quatro seções saem na ordem da Agenda v2 do Cérebro do Gestor: Agenda,
 * Prioridades, Blocos de execução e Rotinas. Compromisso vem do Calendar,
 * rotina vem da grade publicada do vault e tarefa é digitada aqui. */

const SITUACOES: { valor: SituacaoItem; rotulo: string }[] = [
  { valor: "pendente", rotulo: "Pendente" },
  { valor: "feita", rotulo: "Feita" },
  { valor: "nao_feita", rotulo: "Não feita" },
  { valor: "adiada", rotulo: "Adiada" },
];

const COR_SITUACAO: Record<SituacaoItem, string> = {
  pendente: "text-cinza-medio",
  feita: "text-verde",
  nao_feita: "text-vermelho",
  adiada: "text-ambar",
};

function faixaDeHorario(rotina: RotinaAgenda): string {
  if (!rotina.horaInicio && !rotina.horaFim) return rotina.horarioTexto;
  if (!rotina.horaInicio) return rotina.horarioTexto;
  return rotina.horaFim ? `${horaCurta(rotina.horaInicio)}-${horaCurta(rotina.horaFim)}` : horaCurta(rotina.horaInicio);
}

/** Soma dias a uma data ISO sem passar por fuso (mesma precaução de
 * `diaDaSemanaIso`: `new Date("2026-09-15")` pode cair no dia anterior). */
function somarDias(dataIso: string, dias: number): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-cinza-claro bg-branco p-4">
      <h2 className="mb-3 font-display text-lg font-bold text-azul-noite">{titulo}</h2>
      {children}
    </section>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-cinza-medio">{children}</p>;
}

export function PainelDia({
  data,
  hoje,
  dia,
  rotinas,
  gradePublicadaEm,
  avisoData,
  avisoCalendario,
}: {
  data: string;
  hoje: string;
  dia: DiaMontado;
  rotinas: RotinaAgenda[];
  gradePublicadaEm: string | null;
  avisoData: string | null;
  avisoCalendario: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [emEdicao, setEmEdicao] = useState<TarefaAgenda | null>(null);
  const [criando, setCriando] = useState<{ prioridade: boolean; rotinaId: string | null } | null>(null);

  const blocos = useMemo(() => blocosDisponiveis(rotinas), [rotinas]);
  const rotuloPorRotina = useMemo(() => new Map(rotinas.map((r) => [r.id, r.rotulo])), [rotinas]);

  function irPara(novaData: string) {
    router.push(`/agenda/dia?data=${novaData}`);
  }

  function executar(acao: () => Promise<{ ok: boolean; mensagem?: string }>) {
    setErro(null);
    startTransition(async () => {
      const resultado = await acao();
      if (!resultado.ok) {
        setErro(resultado.mensagem ?? "Não deu certo.");
        return;
      }
      setCriando(null);
      setEmEdicao(null);
      router.refresh();
    });
  }

  const formularioAberto = criando !== null || emEdicao !== null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-10">
      <header className="flex flex-col gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">
            {nomeDiaSemana(diaDaSemanaIso(data))}, {formatarDataBr(data)}
          </h1>
          <p className="text-sm text-cinza-medio">
            {data === hoje ? "Hoje" : "Programação de outro dia"} - compromisso vem do Calendar, rotina vem da agenda
            semanal e tarefa você digita aqui.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => irPara(somarDias(data, -1))}
            className="rounded-lg border border-cinza-claro px-3 py-2 text-sm font-semibold text-cinza-medio"
          >
            Dia anterior
          </button>
          <input
            type="date"
            value={data}
            onChange={(e) => e.target.value && irPara(e.target.value)}
            className="rounded-lg border border-cinza-claro px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => irPara(somarDias(data, 1))}
            className="rounded-lg border border-cinza-claro px-3 py-2 text-sm font-semibold text-cinza-medio"
          >
            Próximo dia
          </button>
          {data !== hoje && (
            <button type="button" onClick={() => irPara(hoje)} className="text-sm font-semibold text-ambar underline">
              Voltar para hoje
            </button>
          )}
        </div>
      </header>

      {avisoData && <p className="rounded-lg border border-ambar bg-branco p-3 text-sm text-azul-noite">{avisoData}</p>}
      {erro && <p className="rounded-lg border border-vermelho bg-branco p-3 text-sm text-vermelho">{erro}</p>}

      <Secao titulo="Agenda">
        {avisoCalendario ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-vermelho">{avisoCalendario}</p>
            {dia.compromissosDaGrade.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm text-cinza-medio">
                {dia.compromissosDaGrade.map((rotina) => (
                  <li key={rotina.id}>
                    <span className="font-mono">{faixaDeHorario(rotina)}</span> {rotina.rotulo} (da agenda semanal)
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : dia.compromissos.length === 0 ? (
          <Vazio>Nenhum compromisso marcado nesse dia.</Vazio>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {dia.compromissos.map((evento) => (
              <li key={evento.id} className="flex gap-2">
                <span className="w-24 shrink-0 font-mono text-cinza-medio">
                  {evento.diaInteiro ? "dia inteiro" : `${evento.horaInicio}-${evento.horaFim}`}
                </span>
                <span className="text-azul-noite">{evento.titulo}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Prioridades">
        {dia.prioridades.length === 0 ? (
          <Vazio>Nenhuma prioridade definida para esse dia.</Vazio>
        ) : (
          <ol className="flex flex-col gap-2">
            {dia.prioridades.map((tarefa, indice) => (
              <li key={tarefa.id} className="flex flex-wrap items-center gap-2 border-b border-cinza-claro pb-2 last:border-0">
                <span className="font-bold text-ambar">{tarefa.prioridadePosicao ?? indice + 1}.</span>
                <span className="flex-1 text-sm text-azul-noite">
                  {tarefa.titulo}
                  {tarefa.rotinaId && (
                    <span className="block text-xs text-cinza-medio">
                      {rotuloPorRotina.has(tarefa.rotinaId)
                        ? `em ${rotuloPorRotina.get(tarefa.rotinaId)}`
                        : "em bloco que saiu da agenda semanal"}
                    </span>
                  )}
                </span>
                <select
                  value={tarefa.situacao}
                  disabled={isPending}
                  onChange={(e) =>
                    executar(() => marcarTarefaAction({ id: tarefa.id, situacao: e.target.value as SituacaoItem }))
                  }
                  className={`rounded-lg border border-cinza-claro px-2 py-1 text-xs font-semibold ${COR_SITUACAO[tarefa.situacao]}`}
                >
                  {SITUACOES.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setEmEdicao(tarefa)} className="text-xs font-semibold text-cinza-medio underline">
                  Editar
                </button>
              </li>
            ))}
          </ol>
        )}
        {dia.prioridades.length < TETO_PRIORIDADES && (
          <button
            type="button"
            onClick={() => setCriando({ prioridade: true, rotinaId: null })}
            className="mt-3 rounded-lg bg-ambar px-4 py-2 text-sm font-bold text-azul-noite"
          >
            Nova prioridade
          </button>
        )}
      </Secao>

      <Secao titulo="Blocos de execução">
        {dia.linhaDoDia.length === 0 ? (
          <Vazio>
            A grade da semana ainda não foi publicada. Rode <code>npm run agenda:publicar</code> no Zatti Hub.
          </Vazio>
        ) : (
          <ul className="flex flex-col">
            {dia.linhaDoDia.map((bloco) => (
              <li
                key={bloco.rotina.id}
                className={`flex flex-wrap items-start gap-2 border-b border-cinza-claro py-2 last:border-0 ${
                  bloco.disponivel ? "" : "opacity-60"
                }`}
              >
                <span className="w-24 shrink-0 font-mono text-xs text-cinza-medio">{faixaDeHorario(bloco.rotina)}</span>
                <div className="flex-1">
                  <p className="text-sm text-azul-noite">
                    {bloco.rotina.rotulo}
                    {bloco.espelhadoNoCalendar && (
                      <span className="ml-1 text-xs text-cinza-medio">(também no Calendar)</span>
                    )}
                  </p>
                  {bloco.tarefas.map((tarefa) => (
                    <p key={tarefa.id} className="text-xs font-semibold text-ambar">
                      {tarefa.prioridade ? "Prioridade: " : ""}
                      {tarefa.titulo}
                    </p>
                  ))}
                </div>
                {bloco.disponivel && (
                  <button
                    type="button"
                    onClick={() => setCriando({ prioridade: false, rotinaId: bloco.rotina.id })}
                    className="text-xs font-semibold text-cinza-medio underline"
                  >
                    Encaixar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Rotinas">
        {dia.rotinas.length === 0 ? (
          <Vazio>Nenhuma rotina para esse dia da semana.</Vazio>
        ) : (
          <ul className="flex flex-col gap-2">
            {dia.rotinas.map(({ rotina, situacao }) => (
              <li key={rotina.id} className="flex flex-wrap items-center gap-2 border-b border-cinza-claro pb-2 last:border-0">
                <span className="w-24 shrink-0 font-mono text-xs text-cinza-medio">{faixaDeHorario(rotina)}</span>
                <span className="flex-1 text-sm text-azul-noite">{rotina.rotulo}</span>
                <select
                  value={situacao}
                  disabled={isPending}
                  onChange={(e) =>
                    executar(() =>
                      marcarRotinaAction({ data, rotinaId: rotina.id, situacao: e.target.value as SituacaoItem })
                    )
                  }
                  className={`rounded-lg border border-cinza-claro px-2 py-1 text-xs font-semibold ${COR_SITUACAO[situacao]}`}
                >
                  {SITUACOES.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {dia.tarefasSoltas.length > 0 && (
        <Secao titulo="Outras tarefas do dia">
          <ul className="flex flex-col gap-2">
            {dia.tarefasSoltas.map((tarefa) => (
              <li key={tarefa.id} className="flex flex-wrap items-center gap-2 border-b border-cinza-claro pb-2 last:border-0">
                <span className="flex-1 text-sm text-azul-noite">{tarefa.titulo}</span>
                <select
                  value={tarefa.situacao}
                  disabled={isPending}
                  onChange={(e) =>
                    executar(() => marcarTarefaAction({ id: tarefa.id, situacao: e.target.value as SituacaoItem }))
                  }
                  className={`rounded-lg border border-cinza-claro px-2 py-1 text-xs font-semibold ${COR_SITUACAO[tarefa.situacao]}`}
                >
                  {SITUACOES.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setEmEdicao(tarefa)} className="text-xs font-semibold text-cinza-medio underline">
                  Editar
                </button>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {dia.alertas.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-ambar bg-branco p-3 text-sm text-azul-noite">
          {dia.alertas.map((alerta) => (
            <li key={alerta}>{alerta}</li>
          ))}
        </ul>
      )}

      {dia.sobreposicoes.length > 0 && (
        <div className="rounded-lg border border-ambar bg-branco p-3">
          <p className="mb-1 text-sm font-bold text-azul-noite">Horários sobrepostos</p>
          <ul className="flex flex-col gap-1 text-sm text-azul-noite">
            {dia.sobreposicoes.map((sobreposicao) => (
              <li key={sobreposicao}>{sobreposicao}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-cinza-medio">Só um aviso. Nada foi mudado no Calendar nem na agenda semanal.</p>
        </div>
      )}

      {!criando && (
        <button
          type="button"
          onClick={() => setCriando({ prioridade: false, rotinaId: null })}
          className="self-start rounded-lg border border-cinza-claro px-4 py-2 text-sm font-semibold text-cinza-medio"
        >
          Nova tarefa
        </button>
      )}

      <p className="text-xs text-cinza-medio">
        {gradePublicadaEm
          ? `Rotina publicada da agenda semanal em ${formatarDataBr(gradePublicadaEm.slice(0, 10))}.`
          : "Rotina da semana ainda não publicada."}
      </p>

      <FormularioTarefa
        aberto={formularioAberto}
        data={data}
        blocos={blocos}
        tarefa={emEdicao}
        inicial={criando}
        isPending={isPending}
        onFechar={() => {
          setCriando(null);
          setEmEdicao(null);
        }}
        onSalvar={(valores) =>
          executar(() => (emEdicao ? editarTarefaAction({ id: emEdicao.id, ...valores }) : criarTarefaAction(valores)))
        }
        onExcluir={emEdicao ? () => executar(() => excluirTarefaAction({ id: emEdicao.id })) : null}
      />
    </div>
  );
}

type ValoresTarefa = {
  data: string;
  titulo: string;
  detalhe: string;
  prioridade: boolean;
  rotinaId: string | null;
};

function FormularioTarefa({
  aberto,
  data,
  blocos,
  tarefa,
  inicial,
  isPending,
  onFechar,
  onSalvar,
  onExcluir,
}: {
  aberto: boolean;
  data: string;
  blocos: RotinaAgenda[];
  tarefa: TarefaAgenda | null;
  inicial: { prioridade: boolean; rotinaId: string | null } | null;
  isPending: boolean;
  onFechar: () => void;
  onSalvar: (valores: ValoresTarefa) => void;
  onExcluir: (() => void) | null;
}) {
  // `key` remonta o formulário a cada abertura, para o estado inicial vir do
  // item certo sem efeito de sincronização.
  const chave = tarefa?.id ?? `novo-${inicial?.rotinaId ?? "sem-bloco"}-${inicial?.prioridade ?? false}`;

  return (
    <ModalFlutuante aberto={aberto} onFechar={onFechar}>
      <CorpoFormulario
        key={chave}
        data={data}
        blocos={blocos}
        tarefa={tarefa}
        inicial={inicial}
        isPending={isPending}
        onFechar={onFechar}
        onSalvar={onSalvar}
        onExcluir={onExcluir}
      />
    </ModalFlutuante>
  );
}

function CorpoFormulario({
  data,
  blocos,
  tarefa,
  inicial,
  isPending,
  onFechar,
  onSalvar,
  onExcluir,
}: {
  data: string;
  blocos: RotinaAgenda[];
  tarefa: TarefaAgenda | null;
  inicial: { prioridade: boolean; rotinaId: string | null } | null;
  isPending: boolean;
  onFechar: () => void;
  onSalvar: (valores: ValoresTarefa) => void;
  onExcluir: (() => void) | null;
}) {
  const [titulo, setTitulo] = useState(tarefa?.titulo ?? "");
  const [detalhe, setDetalhe] = useState(tarefa?.detalhe ?? "");
  const [prioridade, setPrioridade] = useState(tarefa?.prioridade ?? inicial?.prioridade ?? false);
  // Tarefa presa a uma faixa que saiu da grade abre sem bloco: o select não
  // teria a opção, e salvar reenviaria um id que o servidor recusa.
  const rotinaInicial = tarefa?.rotinaId ?? inicial?.rotinaId ?? "";
  const [rotinaId, setRotinaId] = useState(blocos.some((bloco) => bloco.id === rotinaInicial) ? rotinaInicial : "");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!titulo.trim()) return;
        onSalvar({ data, titulo: titulo.trim(), detalhe: detalhe.trim(), prioridade, rotinaId: rotinaId || null });
      }}
    >
      <h2 className="font-display text-lg font-bold text-azul-noite">{tarefa ? "Editar" : "Nova"} tarefa</h2>

      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        O que precisa ficar pronto
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={200}
          autoFocus
          className="rounded-lg border border-cinza-claro px-3 py-2 text-sm font-normal text-azul-noite"
          placeholder="Contrato do This Burguer enviado"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Detalhe (opcional)
        <textarea
          value={detalhe}
          onChange={(e) => setDetalhe(e.target.value)}
          maxLength={2000}
          rows={2}
          className="rounded-lg border border-cinza-claro px-3 py-2 text-sm font-normal text-azul-noite"
        />
      </label>

      <label className="flex items-center gap-2 text-sm font-semibold text-cinza-medio">
        <input type="checkbox" checked={prioridade} onChange={(e) => setPrioridade(e.target.checked)} />É prioridade do
        dia (no máximo {TETO_PRIORIDADES})
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Executar em
        <select
          value={rotinaId}
          onChange={(e) => setRotinaId(e.target.value)}
          className="rounded-lg border border-cinza-claro px-3 py-2 text-sm font-normal text-azul-noite"
        >
          <option value="">Sem bloco definido</option>
          {blocos.map((bloco) => (
            <option key={bloco.id} value={bloco.id}>
              {faixaDeHorario(bloco)} - {bloco.rotulo}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || !titulo.trim()}
          className="flex-1 rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={onFechar}
          className="rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          Cancelar
        </button>
      </div>

      {onExcluir && (
        <button type="button" onClick={onExcluir} disabled={isPending} className="text-sm font-semibold text-vermelho underline">
          Excluir tarefa
        </button>
      )}
    </form>
  );
}
