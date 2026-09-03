"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { editarLancamentoTempoAction, excluirLancamentoTempoAction } from "@/app/(app)/meu-tempo/historico/actions";
import { CampoNumero } from "@/components/campo-numero";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { TIPO_TRABALHO_LABEL, formatarHorasMinutos, somarMinutos } from "@/lib/meu-tempo/tempo";
import type { FrenteTempo, LancamentoTempo, TipoTrabalhoTempo } from "@/lib/meu-tempo/tipos";

function IconeEditar({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconeExcluir({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function HistoricoGerenciador({ lancamentos, frentes }: { lancamentos: LancamentoTempo[]; frentes: FrenteTempo[] }) {
  const opcoesFrente = useMemo(() => frentes.map((f) => ({ id: f.id, label: f.nome })), [frentes]);

  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [frenteId, setFrenteId] = useState("");
  const [tipoTrabalho, setTipoTrabalho] = useState<TipoTrabalhoTempo | "">("");
  const [editando, setEditando] = useState<LancamentoTempo | null>(null);
  const [excluindo, setExcluindo] = useState<LancamentoTempo | null>(null);

  const filtrosAtivos = de !== "" || ate !== "" || frenteId !== "" || tipoTrabalho !== "";

  function limparFiltros() {
    setDe("");
    setAte("");
    setFrenteId("");
    setTipoTrabalho("");
  }

  const linhasFiltradas = useMemo(() => {
    return lancamentos.filter((l) => {
      if (de && l.data < de) return false;
      if (ate && l.data > ate) return false;
      if (frenteId && l.frenteId !== frenteId) return false;
      if (tipoTrabalho && l.tipoTrabalho !== tipoTrabalho) return false;
      return true;
    });
  }, [lancamentos, de, ate, frenteId, tipoTrabalho]);

  const totalMinutos = useMemo(() => somarMinutos(linhasFiltradas), [linhasFiltradas]);

  return (
    <div className="flex flex-col gap-5 pb-10">
      <h1 className="font-display text-2xl font-bold text-azul-noite">Histórico</h1>

      <div className="flex flex-col gap-2 rounded-lg border border-cinza-claro bg-branco p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
            De
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
            Até
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza" />
          </label>
          <label className="flex min-w-[200px] flex-col gap-1 text-xs font-semibold text-cinza-medio">
            Frente
            <SeletorComBusca value={frenteId} opcoes={opcoesFrente} onChange={setFrenteId} placeholder="Todas" vazioLabel="Todas" />
          </label>
          <label className="flex min-w-[160px] flex-col gap-1 text-xs font-semibold text-cinza-medio">
            Tipo de trabalho
            <select
              value={tipoTrabalho}
              onChange={(e) => setTipoTrabalho(e.target.value as TipoTrabalhoTempo | "")}
              className="w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
            >
              <option value="">Todos</option>
              {(Object.keys(TIPO_TRABALHO_LABEL) as TipoTrabalhoTempo[]).map((t) => (
                <option key={t} value={t}>
                  {TIPO_TRABALHO_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          {filtrosAtivos && (
            <button type="button" onClick={limparFiltros} className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio hover:bg-off-white">
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      <TabelaRolavel className="max-h-[70vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Tabela de lançamentos de tempo">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th larguraFixa="96px">Data</Th>
              <Th>Frente</Th>
              <Th larguraFixa="110px">Tipo</Th>
              <Th larguraFixa="110px">Horário</Th>
              <Th align="right" larguraFixa="80px">
                Duração
              </Th>
              <Th>Observação</Th>
              <Th align="center" larguraFixa="90px">
                Ação
              </Th>
            </tr>
          </thead>
          <tbody>
            {linhasFiltradas.map((l) => (
              <tr key={l.id} className="border-b border-cinza-claro">
                <td className="whitespace-nowrap px-3 py-2">{formatarDataBr(l.data)}</td>
                <td className="max-w-[180px] truncate px-3 py-2" title={l.frenteNome}>
                  {l.frenteNome}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{TIPO_TRABALHO_LABEL[l.tipoTrabalho]}</td>
                <td className="whitespace-nowrap px-3 py-2">{l.horaInicio && l.horaFim ? `${l.horaInicio} - ${l.horaFim}` : "-"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatarHorasMinutos(l.duracaoMinutos ?? 0)}</td>
                <td className="max-w-[220px] truncate px-3 py-2" title={l.observacao}>
                  {l.observacao || "-"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-center">
                  <div className="flex justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditando(l)}
                      title="Editar lançamento"
                      aria-label="Editar lançamento"
                      className="rounded-md p-1.5 text-azul-petroleo hover:bg-azul-petroleo/10"
                    >
                      <IconeEditar />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcluindo(l)}
                      title="Excluir lançamento"
                      aria-label="Excluir lançamento"
                      className="rounded-md p-1.5 text-vermelho hover:bg-vermelho/10"
                    >
                      <IconeExcluir />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {lancamentos.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-sm text-cinza-medio">
                  Nenhum lançamento ainda.
                </td>
              </tr>
            )}
            {lancamentos.length > 0 && linhasFiltradas.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-sm text-cinza-medio">
                  Nenhum lançamento encontrado com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
          {linhasFiltradas.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-azul-petroleo bg-off-white font-semibold text-cinza">
                <td colSpan={4} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-cinza-medio">
                  Total ({linhasFiltradas.length} {linhasFiltradas.length === 1 ? "lançamento" : "lançamentos"})
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatarHorasMinutos(totalMinutos)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </TabelaRolavel>

      <ModalFlutuante aberto={editando !== null} onFechar={() => setEditando(null)}>
        {editando && <FormularioEditarLancamento frentes={frentes} lancamento={editando} onSalvo={() => setEditando(null)} onCancelar={() => setEditando(null)} />}
      </ModalFlutuante>

      <ModalFlutuante aberto={excluindo !== null} onFechar={() => setExcluindo(null)}>
        {excluindo && <ConfirmarExclusao lancamento={excluindo} onExcluido={() => setExcluindo(null)} onCancelar={() => setExcluindo(null)} />}
      </ModalFlutuante>
    </div>
  );
}

type ModoTempo = "horario" | "duracao";

function FormularioEditarLancamento({
  frentes,
  lancamento,
  onSalvo,
  onCancelar,
}: {
  frentes: FrenteTempo[];
  lancamento: LancamentoTempo;
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const router = useRouter();
  const opcoesFrente = useMemo(() => frentes.map((f) => ({ id: f.id, label: f.nome })), [frentes]);

  const [frenteId, setFrenteId] = useState(lancamento.frenteId);
  const [data, setData] = useState(lancamento.data);
  const [modo, setModo] = useState<ModoTempo>(lancamento.horaInicio && lancamento.horaFim ? "horario" : "duracao");
  const [horaInicio, setHoraInicio] = useState(lancamento.horaInicio ?? "");
  const [horaFim, setHoraFim] = useState(lancamento.horaFim ?? "");
  const [duracaoMinutos, setDuracaoMinutos] = useState<number | null>(lancamento.duracaoMinutos);
  const [tipoTrabalho, setTipoTrabalho] = useState<TipoTrabalhoTempo>(lancamento.tipoTrabalho);
  const [observacao, setObservacao] = useState(lancamento.observacao);
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
      const resultado = await editarLancamentoTempoAction({ id: lancamento.id, frenteId, data, tempo, tipoTrabalho, observacao });
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
      <h2 className="font-display text-lg font-bold text-azul-noite">Editar lançamento</h2>

      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Frente
        <SeletorComBusca value={frenteId} opcoes={opcoesFrente} onChange={setFrenteId} placeholder="Selecionar frente..." />
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Data
        <input type="date" required value={data} onChange={(e) => setData(e.target.value)} className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza" />
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
        <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza" />
      </label>

      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button type="submit" disabled={isPending} className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50">
          {isPending ? "Salvando..." : "Salvar"}
        </button>
        <button type="button" onClick={onCancelar} disabled={isPending} className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ConfirmarExclusao({ lancamento, onExcluido, onCancelar }: { lancamento: LancamentoTempo; onExcluido: () => void; onCancelar: () => void }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmar() {
    setErro(null);
    startTransition(async () => {
      const resultado = await excluirLancamentoTempoAction({ id: lancamento.id });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
      onExcluido();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Excluir lançamento</h2>
      <p className="text-sm text-cinza">
        Tem certeza que deseja excluir o lançamento de <strong>{lancamento.frenteNome}</strong> em{" "}
        <strong>{formatarDataBr(lancamento.data)}</strong> ({formatarHorasMinutos(lancamento.duracaoMinutos ?? 0)})? Essa ação não pode ser desfeita.
      </p>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button type="button" onClick={confirmar} disabled={isPending} className="flex-1 rounded-lg bg-vermelho px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50">
          {isPending ? "Excluindo..." : "Confirmar exclusão"}
        </button>
        <button type="button" onClick={onCancelar} disabled={isPending} className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio">
          Cancelar
        </button>
      </div>
    </div>
  );
}
