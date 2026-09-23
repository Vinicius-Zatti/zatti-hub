"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Th } from "@/components/tabela";
import { CartaoIndicador, COLUNAS_NUMERICAS_ANUAIS, formatarNumero, formatarPercentual, LinhaTabelaAnual as LinhaTabela } from "@/components/financeiro-gerencial/tabela-anual";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { BotaoColunasDre, useColunasVisiveis, type ColunaDre } from "@/components/financeiro-gerencial/dre-colunas-menu";
import { DadosComplementaresDre } from "@/components/financeiro-gerencial/dados-complementares-dre";
import { SaidasSemReceitaDre } from "@/components/financeiro-gerencial/saidas-sem-receita-dre";
import { MESES_ABREVIADOS, type DreAnual } from "@/lib/financeiro-gerencial/dre-anual";
import type { EstoqueMensal, SaidaSemReceita } from "@/lib/financeiro-gerencial/tipos";

function formatarPontoDeEquilibrio(v: number | "nao_calculavel"): string {
  return v === "nao_calculavel" ? "Não calculável" : formatarNumero(v);
}

// Média/Total + 12 meses - "Mês de Competência" (a coluna de rótulo) nunca
// entra aqui, nunca pode ser ocultada (regra do botão "Colunas").
const COLUNAS_NUMERICAS: ColunaDre[] = COLUNAS_NUMERICAS_ANUAIS;

/** Visualização anual da DRE - único seletor é o Ano (nunca mês), sem toggle
 * global de Resumida/Expandida: cada grupo principal abre a própria seta,
 * hierarquicamente (CMC dentro de CMV, contas dentro de subgrupo). Saídas Não
 * Operacionais e Resultado Econômico vêm na mesma tabela, não numa seção à
 * parte. */
export function DreVisualizacao({
  dreAnual,
  ano,
  estoquesDoAno,
  saidasSemReceitaDoAno,
  podeGerir,
}: {
  dreAnual: DreAnual;
  ano: number;
  estoquesDoAno: (EstoqueMensal | null)[];
  saidasSemReceitaDoAno: SaidaSemReceita[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const { visiveis, alternar: alternarColuna, mostrarTodas } = useColunasVisiveis(COLUNAS_NUMERICAS);

  function alternar(id: string) {
    setExpandidas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 7 }, (_, i) => anoAtual + 1 - i);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">DRE - {ano}</h1>
          <p className="text-sm text-cinza-medio">Demonstrativo de Resultado por Data de Competência, ano completo, mês a mês.</p>
        </div>
        <select
          value={ano}
          onChange={(e) => router.push(`/financeiro-gerencial/dre?ano=${e.target.value}`)}
          className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm text-cinza"
        >
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CartaoIndicador titulo="Resultado Econômico" valor={formatarNumero(dreAnual.indicadores.resultadoEconomico)} />
        <CartaoIndicador titulo="% Resultado Econômico" valor={formatarPercentual(dreAnual.indicadores.percentualResultadoEconomico)} />
        <CartaoIndicador titulo="Ponto de Equilíbrio" valor={formatarPontoDeEquilibrio(dreAnual.indicadores.pontoDeEquilibrio)} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-azul-noite">Resultado</h2>
          <BotaoColunasDre colunas={COLUNAS_NUMERICAS} visiveis={visiveis} onAlternar={alternarColuna} onMostrarTodas={mostrarTodas} />
        </div>
        <TabelaRolavel ariaLabel="Tabela de resultado da DRE">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th larguraFixa="240px">Mês de Competência</Th>
                {visiveis.has("media") && (
                  <Th align="right" larguraFixa="100px">
                    Média
                  </Th>
                )}
                {visiveis.has("total") && (
                  <Th align="right" larguraFixa="100px">
                    Total
                  </Th>
                )}
                {MESES_ABREVIADOS.map(
                  (mes, indice) =>
                    visiveis.has(`mes_${indice}`) && (
                      <Th key={mes} align="right" larguraFixa="88px">
                        {mes}
                      </Th>
                    ),
                )}
              </tr>
            </thead>
            <tbody>
              {dreAnual.linhas.map((linha) => (
                <LinhaTabela key={linha.id} linha={linha} expandidas={expandidas} alternar={alternar} visiveis={visiveis} />
              ))}
            </tbody>
          </table>
        </TabelaRolavel>
      </div>

      <DadosComplementaresDre ano={ano} estoquesDoAno={estoquesDoAno} podeGerir={podeGerir} />
      <SaidasSemReceitaDre ano={ano} saidasSemReceitaDoAno={saidasSemReceitaDoAno} podeGerir={podeGerir} />
    </div>
  );
}
