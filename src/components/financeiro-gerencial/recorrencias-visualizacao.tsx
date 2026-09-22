"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { encerrarRecorrenciaAction } from "@/app/(app)/financeiro-gerencial/recorrencias/actions";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { formatarNumero } from "@/components/financeiro-gerencial/tabela-anual";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import type { RecorrenciaResumo } from "@/lib/financeiro-gerencial/tipos";

function FormularioEncerrar({ recorrencia, hoje, onFechar }: { recorrencia: RecorrenciaResumo; hoje: string; onFechar: () => void }) {
  const router = useRouter();
  const [aPartirDe, setAPartirDe] = useState(hoje);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<number | null>(null);
  const [pendente, startTransition] = useTransition();

  function encerrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await encerrarRecorrenciaAction({ id: recorrencia.id, aPartirDe });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      setResultado(r.excluidas);
      router.refresh();
    });
  }

  if (resultado !== null) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold text-azul-noite">Recorrência encerrada</h2>
        <p className="text-sm text-cinza">
          {resultado === 0 ? "Nenhuma ocorrência futura precisou ser excluída." : `${resultado} ocorrência(s) futura(s) sem baixa foram excluídas.`}
        </p>
        <button type="button" onClick={onFechar} className="rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco">
          Fechar
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={encerrar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Encerrar recorrência</h2>
      <p className="text-sm text-cinza">
        {recorrencia.descricao} - R$ {formatarNumero(recorrencia.valor)} todo dia {recorrencia.diaVencimento}
      </p>
      <p className="text-xs text-cinza-medio">
        As ocorrências com data prevista a partir da data abaixo e sem nenhuma baixa são excluídas. O que já foi pago/recebido, ou vence antes, continua.
      </p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Excluir ocorrências a partir de
        <input
          type="date"
          required
          value={aPartirDe}
          onChange={(e) => setAPartirDe(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button type="submit" disabled={pendente} className="flex-1 rounded-lg bg-vermelho px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50">
          {pendente ? "Encerrando..." : "Encerrar"}
        </button>
        <button type="button" onClick={onFechar} disabled={pendente} className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function RecorrenciasVisualizacao({ recorrencias, podeGerir, hoje }: { recorrencias: RecorrenciaResumo[]; podeGerir: boolean; hoje: string }) {
  const [encerrando, setEncerrando] = useState<RecorrenciaResumo | null>(null);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Recorrências</h1>
        <p className="text-sm text-cinza-medio">
          Para criar, use &quot;Recorrência&quot; no novo lançamento de{" "}
          <Link href="/financeiro-gerencial/lancamentos/receitas" className="font-semibold text-azul-petroleo underline">
            Receitas
          </Link>{" "}
          ou{" "}
          <Link href="/financeiro-gerencial/lancamentos/despesas" className="font-semibold text-azul-petroleo underline">
            Despesas
          </Link>
          . Dia 29, 30 ou 31 cai no último dia válido do mês.
        </p>
      </div>

      <TabelaRolavel ariaLabel="Tabela de recorrências">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>Descrição</Th>
              <Th>Plano de Contas</Th>
              <Th>Tipo</Th>
              <Th align="right">Valor</Th>
              <Th align="right">Dia</Th>
              <Th larguraFixa="95px">Início</Th>
              <Th>Fim</Th>
              <Th align="right">Ocorrências</Th>
              <Th align="right">Em aberto</Th>
              <Th>Situação</Th>
              {podeGerir && <Th larguraFixa="90px">Ação</Th>}
            </tr>
          </thead>
          <tbody>
            {recorrencias.length === 0 ? (
              <tr>
                <td colSpan={podeGerir ? 11 : 10} className="px-3 py-4 text-center text-cinza-medio">
                  Nenhuma recorrência cadastrada.
                </td>
              </tr>
            ) : (
              recorrencias.map((r) => (
                <tr key={r.id} className="border-t border-cinza-claro">
                  <td className="max-w-[220px] truncate px-3 py-2" title={r.descricao}>
                    {r.descricao}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2" title={r.categoriaNome}>
                    {r.categoriaNome}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{r.tipo === "receita" ? "Receita" : "Despesa"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatarNumero(r.valor)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{r.diaVencimento}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatarDataBr(r.dataInicio)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.dataFim ? formatarDataBr(r.dataFim) : `${r.quantidadeOcorrencias} ocorrências`}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{r.ocorrencias}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{r.ocorrenciasEmAberto}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.ativa ? "bg-verde/15 text-verde" : "bg-cinza-claro text-cinza-medio"}`}>
                      {r.ativa ? "Ativa" : "Encerrada"}
                    </span>
                  </td>
                  {podeGerir && (
                    <td className="px-3 py-2">
                      {r.ativa && (
                        <button
                          type="button"
                          onClick={() => setEncerrando(r)}
                          className="rounded-md border border-vermelho/40 px-3 py-1 text-xs font-semibold text-vermelho hover:bg-vermelho/10"
                        >
                          Encerrar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TabelaRolavel>

      <ModalFlutuante aberto={encerrando !== null} onFechar={() => setEncerrando(null)}>
        {encerrando && <FormularioEncerrar recorrencia={encerrando} hoje={hoje} onFechar={() => setEncerrando(null)} />}
      </ModalFlutuante>
    </div>
  );
}
