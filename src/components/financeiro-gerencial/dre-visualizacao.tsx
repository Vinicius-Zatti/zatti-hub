"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import type { Dre } from "@/lib/financeiro-gerencial/dre";
import { montarLinhasExpandida, montarLinhasResumida, type LinhaDre } from "@/lib/financeiro-gerencial/dre-linhas";

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${NOMES_MES[Number(mes) - 1]}/${ano}`;
}

const PADDING_NIVEL: Record<0 | 1 | 2, string> = { 0: "pl-3", 1: "pl-7", 2: "pl-11" };

function LinhaTabela({ linha }: { linha: LinhaDre }) {
  const pesoTexto = linha.destaque ? "font-bold text-azul-noite" : linha.nivel === 0 ? "font-semibold text-cinza" : "text-cinza";
  return (
    <tr className={linha.destaque ? "border-t-2 border-azul-petroleo bg-off-white" : "border-t border-cinza-claro"}>
      <td className={`py-2 pr-3 ${PADDING_NIVEL[linha.nivel]} ${pesoTexto}`}>{linha.rotulo}</td>
      <td className={`whitespace-nowrap px-3 py-2 text-right font-mono ${pesoTexto}`}>
        {linha.valor === null ? <span className="font-sans text-xs font-normal text-cinza-medio">pendente</span> : brl(linha.valor)}
      </td>
    </tr>
  );
}

function BlocoDre({ titulo, linhas }: { titulo: string; linhas: LinhaDre[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-bold text-azul-noite">{titulo}</h2>
      <TabelaRolavel ariaLabel={`Tabela de ${titulo.toLowerCase()}`}>
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>Plano de Contas</Th>
              <Th align="right" larguraFixa="140px">
                Valor
              </Th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <LinhaTabela key={linha.id} linha={linha} />
            ))}
          </tbody>
        </table>
      </TabelaRolavel>
    </div>
  );
}

export function DreVisualizacao({ dre, competencia }: { dre: Dre; competencia: string }) {
  const router = useRouter();
  const [visao, setVisao] = useState<"resumida" | "expandida">("resumida");

  const secoes = useMemo(() => (visao === "resumida" ? montarLinhasResumida(dre) : montarLinhasExpandida(dre)), [dre, visao]);
  const cmvPendente = dre.cmv === null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">DRE - {rotuloCompetencia(competencia)}</h1>
          <p className="text-sm text-cinza-medio">Demonstrativo de Resultado por Data de Competência.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={competencia}
            onChange={(e) => e.target.value && router.push(`/financeiro-gerencial/dre?mes=${e.target.value}`)}
            className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm text-cinza"
          />
          <div className="flex overflow-hidden rounded-md border border-cinza-claro">
            <button
              type="button"
              onClick={() => setVisao("resumida")}
              className={`px-3 py-1.5 text-xs font-bold ${visao === "resumida" ? "bg-ambar text-azul-noite" : "bg-branco text-cinza-medio"}`}
            >
              Resumida
            </button>
            <button
              type="button"
              onClick={() => setVisao("expandida")}
              className={`px-3 py-1.5 text-xs font-bold ${visao === "expandida" ? "bg-ambar text-azul-noite" : "bg-branco text-cinza-medio"}`}
            >
              Expandida
            </button>
          </div>
        </div>
      </div>

      {cmvPendente && (
        <p className="rounded-lg border border-ambar bg-ambar/10 p-3 text-sm text-cinza">
          Estoque mensal de {rotuloCompetencia(competencia)} ainda não foi cadastrado - o CMV e tudo que depende dele (Margem de
          Contribuição, Resultado Operacional, Geração de Caixa) ficam pendentes até cadastrar em{" "}
          <a href="/financeiro-gerencial/estoque" className="font-semibold underline">
            Estoque mensal
          </a>
          .
        </p>
      )}

      <BlocoDre titulo="Resultado" linhas={secoes.principal} />
      <BlocoDre titulo="Saídas Não Operacionais (indicador, não altera o Resultado)" linhas={secoes.indicador} />
    </div>
  );
}
