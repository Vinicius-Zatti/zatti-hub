"use client";

import { useState } from "react";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { BotaoColunasDre, useColunasVisiveis, type ColunaDre } from "@/components/financeiro-gerencial/dre-colunas-menu";
import { MESES_ABREVIADOS, type LinhaDreAnual } from "@/lib/financeiro-gerencial/dre-anual";

// Tabela anual (Média | Total | jan..dez) com setas por grupo - nasceu na DRE
// e é a mesma no Fluxo de Caixa mensal, na DFC e nas Provisões.

export function formatarNumero(v: number | null): string {
  if (v === null) return "-";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatarPercentual(v: number | null): string {
  if (v === null) return "-";
  return v.toLocaleString("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const PADDING_NIVEL: Record<0 | 1 | 2, string> = { 0: "pl-3", 1: "pl-8", 2: "pl-12" };

export const COLUNAS_NUMERICAS_ANUAIS: ColunaDre[] = [
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

export function LinhaTabelaAnual({
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
        linha.filhos!.map((filho) => <LinhaTabelaAnual key={filho.id} linha={filho} expandidas={expandidas} alternar={alternar} visiveis={visiveis} />)}
    </>
  );
}

function idsComFilhos(linhas: LinhaDreAnual[]): string[] {
  return linhas.flatMap((l) => (l.filhos && l.filhos.length > 0 ? [l.id, ...idsComFilhos(l.filhos)] : []));
}

/** Bloco completo: título, botão Colunas, Expandir/Recolher tudo (visão
 * resumida = tudo recolhido, expandida = tudo aberto) e a tabela. */
export function TabelaAnualBloco({
  titulo,
  ariaLabel,
  rotuloPrimeiraColuna,
  linhas,
}: {
  titulo: string;
  ariaLabel: string;
  rotuloPrimeiraColuna: string;
  linhas: LinhaDreAnual[];
}) {
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const { visiveis, alternar: alternarColuna, mostrarTodas } = useColunasVisiveis(COLUNAS_NUMERICAS_ANUAIS);
  const todosIds = idsComFilhos(linhas);
  const tudoAberto = todosIds.length > 0 && todosIds.every((id) => expandidas.has(id));

  function alternar(id: string) {
    setExpandidas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-azul-noite">{titulo}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpandidas(tudoAberto ? new Set() : new Set(todosIds))}
            className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm text-cinza hover:border-azul-petroleo"
          >
            {tudoAberto ? "Resumida" : "Expandida"}
          </button>
          <BotaoColunasDre colunas={COLUNAS_NUMERICAS_ANUAIS} visiveis={visiveis} onAlternar={alternarColuna} onMostrarTodas={mostrarTodas} />
        </div>
      </div>
      <TabelaRolavel ariaLabel={ariaLabel}>
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th larguraFixa="240px">{rotuloPrimeiraColuna}</Th>
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
            {linhas.map((linha) => (
              <LinhaTabelaAnual key={linha.id} linha={linha} expandidas={expandidas} alternar={alternar} visiveis={visiveis} />
            ))}
          </tbody>
        </table>
      </TabelaRolavel>
    </div>
  );
}

export function CartaoIndicador({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border border-cinza-claro bg-branco p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-cinza-medio">{titulo}</div>
      <div className="mt-1 font-mono text-lg font-bold text-azul-noite">{valor}</div>
      {detalhe && <div className="mt-0.5 text-xs text-cinza-medio">{detalhe}</div>}
    </div>
  );
}

/** Seletor de ano igual ao da DRE (ano atual +1 até 5 anos atrás). */
export function anosSelecionaveis(): number[] {
  const anoAtual = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, i) => anoAtual + 1 - i);
}
