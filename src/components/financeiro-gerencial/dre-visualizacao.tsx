"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { BotaoColunasDre, useColunasVisiveis, type ColunaDre } from "@/components/financeiro-gerencial/dre-colunas-menu";
import { DadosComplementaresDre } from "@/components/financeiro-gerencial/dados-complementares-dre";
import { SaidasSemReceitaDre } from "@/components/financeiro-gerencial/saidas-sem-receita-dre";
import { MESES_ABREVIADOS, type DreAnual, type LinhaDreAnual } from "@/lib/financeiro-gerencial/dre-anual";
import type { EstoqueMensal, SaidaSemReceita } from "@/lib/financeiro-gerencial/tipos";

function formatarNumero(v: number | null): string {
  if (v === null) return "-";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarPercentual(v: number | null): string {
  if (v === null) return "-";
  return v.toLocaleString("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatarPontoDeEquilibrio(v: number | "nao_calculavel"): string {
  return v === "nao_calculavel" ? "Não calculável" : formatarNumero(v);
}

const PADDING_NIVEL: Record<0 | 1 | 2, string> = { 0: "pl-3", 1: "pl-8", 2: "pl-12" };

// Média/Total + 12 meses - "Mês de Competência" (a coluna de rótulo) nunca
// entra aqui, nunca pode ser ocultada (regra do botão "Colunas").
const COLUNAS_NUMERICAS: ColunaDre[] = [
  { id: "media", rotulo: "Média" },
  { id: "total", rotulo: "Total" },
  ...MESES_ABREVIADOS.map((mes, indice) => ({ id: `mes_${indice}`, rotulo: mes })),
];

function IconeSeta({ aberta }: { aberta: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 transition-transform ${aberta ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function LinhaTabela({
  linha,
  expandidas,
  alternar,
  visiveis,
}: {
  linha: LinhaDreAnual;
  expandidas: Set<string>;
  alternar: (id: string) => void;
  visiveis: Set<string>;
}) {
  const temFilhos = !!linha.filhos && linha.filhos.length > 0;
  const expandida = expandidas.has(linha.id);
  const pesoTexto = linha.destaque
    ? "font-bold text-azul-noite"
    : linha.percentual
      ? "italic text-cinza-medio"
      : linha.nivel === 0
        ? "font-semibold text-cinza"
        : "text-cinza";
  const formatar = (v: number | null) => (linha.percentual ? formatarPercentual(v) : formatarNumero(v));

  return (
    <>
      <tr className={linha.destaque ? "border-t-2 border-azul-petroleo bg-off-white" : "border-t border-cinza-claro"}>
        <td className={`py-2 pr-3 ${PADDING_NIVEL[linha.nivel]} ${pesoTexto}`}>
          <span className="inline-flex max-w-[190px] items-center gap-1.5">
            {temFilhos ? (
              <button
                type="button"
                onClick={() => alternar(linha.id)}
                aria-label={expandida ? `Recolher ${linha.rotulo}` : `Expandir ${linha.rotulo}`}
                className="shrink-0 text-cinza-medio hover:text-azul-petroleo"
              >
                <IconeSeta aberta={expandida} />
              </button>
            ) : (
              <span className="inline-block h-3.5 w-3.5 shrink-0" />
            )}
            <span className="min-w-0 truncate" title={linha.rotulo}>
              {linha.rotulo}
            </span>
          </span>
        </td>
        {visiveis.has("media") && <td className={`whitespace-nowrap px-3 py-2 text-right font-mono ${pesoTexto}`}>{formatar(linha.media)}</td>}
        {visiveis.has("total") && <td className={`whitespace-nowrap px-3 py-2 text-right font-mono ${pesoTexto}`}>{formatar(linha.total)}</td>}
        {linha.valoresPorMes.map(
          (valor, indice) =>
            visiveis.has(`mes_${indice}`) && (
              <td key={indice} className={`whitespace-nowrap px-3 py-2 text-right font-mono ${pesoTexto}`}>
                {formatar(valor)}
              </td>
            ),
        )}
      </tr>
      {temFilhos &&
        expandida &&
        linha.filhos!.map((filho) => <LinhaTabela key={filho.id} linha={filho} expandidas={expandidas} alternar={alternar} visiveis={visiveis} />)}
    </>
  );
}

function CartaoIndicador({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-cinza-claro bg-branco p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-cinza-medio">{titulo}</div>
      <div className="mt-1 font-mono text-lg font-bold text-azul-noite">{valor}</div>
    </div>
  );
}

/** Visualização anual da DRE - único seletor é o Ano (nunca mês), sem toggle
 * global de Resumida/Expandida: cada grupo principal abre a própria seta,
 * hierarquicamente (CMC dentro de CMV, contas dentro de subgrupo). Saídas Não
 * Operacionais e Resultado Líquido vêm na mesma tabela, não numa seção à
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
        <CartaoIndicador titulo="Resultado Líquido" valor={formatarNumero(dreAnual.indicadores.resultadoLiquido)} />
        <CartaoIndicador titulo="% Resultado Líquido" valor={formatarPercentual(dreAnual.indicadores.percentualResultadoLiquido)} />
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
