"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { salvarFechamentoAction } from "@/app/(app)/financeiro-gerencial/fechamento/actions";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { MESES_EXTENSO } from "@/components/financeiro-gerencial/fluxo-caixa-visualizacao";
import { anosSelecionaveis } from "@/components/financeiro-gerencial/tabela-anual";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import type { FechamentoMensal, RegistroAuditoria } from "@/lib/financeiro-gerencial/tipos";

const NOME_ENTIDADE: Record<string, string> = {
  fin_lancamentos: "Lançamento",
  fin_parcelas: "Parcela",
  fin_baixas: "Baixa",
  fin_recorrencias: "Recorrência",
  fin_categorias: "Plano de Contas",
  fin_contas_financeiras: "Conta financeira",
  fin_estoque_mensal: "Dados complementares da DRE",
  fin_saidas_sem_receita: "Saída sem receita",
  fin_provisoes_parametros: "Parâmetros de provisão",
  fin_provisoes_reversoes: "Reversão de provisão",
  fin_fechamentos: "Fechamento mensal",
};

const NOME_ACAO: Record<string, string> = { insert: "Criou", update: "Alterou", delete: "Excluiu" };

// Campos que ajudam a reconhecer o registro na trilha (o resto fica no banco).
const CAMPOS_RESUMO: [string, string][] = [
  ["descricao", "Descrição"],
  ["nome", "Nome"],
  ["valor", "Valor"],
  ["data_competencia", "Competência"],
  ["competencia", "Competência"],
  ["data_prevista", "Data prevista"],
  ["data", "Data"],
  ["fechado", "Fechado"],
  ["motivo_reabertura", "Motivo"],
  ["motivo", "Motivo"],
  ["ativa", "Ativa"],
];

function formatarValorCampo(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatarDataBr(v);
  return String(v);
}

function resumo(r: RegistroAuditoria): string {
  const novo = r.dadosNovos ?? {};
  const antigo = r.dadosAntigos ?? {};
  const partes: string[] = [];
  for (const [campo, rotulo] of CAMPOS_RESUMO) {
    const temNovo = campo in novo;
    const temAntigo = campo in antigo;
    if (!temNovo && !temAntigo) continue;
    if (r.acao === "update" && temNovo && temAntigo) {
      if (JSON.stringify(novo[campo]) === JSON.stringify(antigo[campo])) continue;
      partes.push(`${rotulo}: ${formatarValorCampo(antigo[campo])} → ${formatarValorCampo(novo[campo])}`);
    } else {
      partes.push(`${rotulo}: ${formatarValorCampo(temNovo ? novo[campo] : antigo[campo])}`);
    }
  }
  return partes.join(" | ") || "-";
}

function dataHoraBr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function FormularioReabrir({ competencia, onFechar }: { competencia: string; onFechar: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await salvarFechamentoAction({ competencia, fechado: false, motivo });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
      onFechar();
    });
  }

  const [ano, mes] = competencia.split("-");
  return (
    <form onSubmit={salvar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">
        Reabrir {MESES_EXTENSO[Number(mes) - 1]} de {ano}
      </h2>
      <p className="text-xs text-cinza-medio">O motivo fica registrado no histórico de auditoria.</p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Motivo da reabertura
        <input
          required
          minLength={3}
          maxLength={300}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button type="submit" disabled={pendente} className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50">
          {pendente ? "Salvando..." : "Reabrir mês"}
        </button>
        <button type="button" onClick={onFechar} disabled={pendente} className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Fechamento mensal (Gestão/master): mês fechado trava Operacional em
 * lançamento, parcela e baixa daquele mês (gatilho no banco); Gestão/master
 * continuam alterando, sempre com trilha de auditoria abaixo. */
export function FechamentoVisualizacao({ ano, fechamentos, auditoria }: { ano: number; fechamentos: FechamentoMensal[]; auditoria: RegistroAuditoria[] }) {
  const router = useRouter();
  const [reabrindo, setReabrindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const porCompetencia = new Map(fechamentos.map((f) => [f.competencia.slice(0, 7), f]));

  function fechar(competencia: string) {
    setErro(null);
    startTransition(async () => {
      const resultado = await salvarFechamentoAction({ competencia, fechado: true, motivo: "" });
      if (!resultado.ok) setErro(resultado.mensagem);
      else router.refresh();
    });
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">Fechamento mensal - {ano}</h1>
          <p className="text-sm text-cinza-medio">
            Mês fechado: o perfil Operacional não cria, altera nem baixa nada com data nesse mês. Gestão/master continuam podendo corrigir, com registro abaixo.
          </p>
        </div>
        <select
          value={ano}
          onChange={(e) => router.push(`/financeiro-gerencial/fechamento?ano=${e.target.value}`)}
          className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm text-cinza"
        >
          {anosSelecionaveis().map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {erro && <p className="text-sm text-vermelho">{erro}</p>}

      <TabelaRolavel ariaLabel="Meses do ano">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>Mês</Th>
              <Th>Situação</Th>
              <Th>Última alteração</Th>
              <Th>Motivo da última reabertura</Th>
              <Th larguraFixa="110px">Ação</Th>
            </tr>
          </thead>
          <tbody>
            {MESES_EXTENSO.map((nome, i) => {
              const competencia = `${ano}-${String(i + 1).padStart(2, "0")}`;
              const f = porCompetencia.get(competencia);
              const fechado = f?.fechado ?? false;
              return (
                <tr key={competencia} className="border-t border-cinza-claro">
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-cinza">{nome}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${fechado ? "bg-azul-noite text-branco" : "bg-verde/15 text-verde"}`}>
                      {fechado ? "Fechado" : "Aberto"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-cinza-medio">{f ? `${f.atualizadoPorNome} em ${dataHoraBr(f.atualizadoEm)}` : "-"}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-cinza-medio" title={f?.motivoReabertura}>
                    {f?.motivoReabertura || "-"}
                  </td>
                  <td className="px-3 py-2">
                    {fechado ? (
                      <button type="button" onClick={() => setReabrindo(competencia)} className="rounded-md border border-azul-petroleo px-3 py-1 text-xs font-bold text-azul-petroleo">
                        Reabrir
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={pendente}
                        onClick={() => fechar(competencia)}
                        className="rounded-md bg-azul-noite px-3 py-1 text-xs font-bold text-branco disabled:opacity-50"
                      >
                        Fechar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TabelaRolavel>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-bold text-azul-noite">Histórico de auditoria</h2>
        <p className="text-xs text-cinza-medio">Últimas 300 alterações do Financeiro nesta unidade: quem, quando, o quê, antes e depois.</p>
        <TabelaRolavel ariaLabel="Histórico de auditoria do Financeiro">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th larguraFixa="130px">Quando</Th>
                <Th>Quem</Th>
                <Th>O quê</Th>
                <Th>Ação</Th>
                <Th>Detalhe</Th>
              </tr>
            </thead>
            <tbody>
              {auditoria.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-cinza-medio">
                    Nenhuma alteração registrada.
                  </td>
                </tr>
              ) : (
                auditoria.map((r) => {
                  const detalhe = resumo(r);
                  return (
                    <tr key={r.id} className="border-t border-cinza-claro">
                      <td className="whitespace-nowrap px-3 py-1.5 text-cinza-medio">{dataHoraBr(r.criadoEm)}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">{r.autor}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">{NOME_ENTIDADE[r.entidade] ?? r.entidade}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">{NOME_ACAO[r.acao] ?? r.acao}</td>
                      <td className="max-w-[420px] truncate px-3 py-1.5 text-cinza-medio" title={detalhe}>
                        {detalhe}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TabelaRolavel>
      </div>

      <ModalFlutuante aberto={reabrindo !== null} onFechar={() => setReabrindo(null)}>
        {reabrindo && <FormularioReabrir competencia={reabrindo} onFechar={() => setReabrindo(null)} />}
      </ModalFlutuante>
    </div>
  );
}
