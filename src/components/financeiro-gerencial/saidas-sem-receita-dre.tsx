"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarSaidaSemReceitaAction } from "@/app/(app)/financeiro-gerencial/dre/actions";
import { CampoNumero } from "@/components/campo-numero";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { MESES_ABREVIADOS } from "@/lib/financeiro-gerencial/dre-anual";
import type { SaidaSemReceita, TipoSaidaSemReceita } from "@/lib/financeiro-gerencial/tipos";

const TIPOS: { tipo: TipoSaidaSemReceita; rotulo: string }[] = [
  { tipo: "bonificacao_cortesia", rotulo: "Bonificação / cortesia" },
  { tipo: "fidelidade", rotulo: "Fidelidade" },
  { tipo: "doacao", rotulo: "Doação" },
  { tipo: "marketing_degustacao", rotulo: "Marketing / degustação" },
  { tipo: "consumo_interno", rotulo: "Consumo interno" },
  { tipo: "perda_desperdicio", rotulo: "Perda / desperdício" },
];

function competenciaDoMes(ano: number, indiceMes: number): string {
  return `${ano}-${String(indiceMes + 1).padStart(2, "0")}`;
}

function chaveCelula(tipo: TipoSaidaSemReceita, indiceMes: number): string {
  return `${tipo}_${indiceMes}`;
}

function formatarNumero(v: number | null): string {
  if (v === null) return "-";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function arredondar2(v: number): number {
  return Math.round(v * 100) / 100;
}

type Status = "erro" | "salvo" | undefined;

/** Segunda exceção pontual e aprovada ao padrão de modal (junto com Dados
 * Complementares) - cada célula aqui é uma linha própria em
 * `fin_saidas_sem_receita` (competência + tipo), então o blur de uma célula
 * salva só ela. Dado exclusivamente gerencial: nunca soma Receita, nunca
 * altera o CMV de novo, nunca duplica custo - só explica consumo de estoque
 * sem venda associada (CMV alto com bonificação/perda alta, por exemplo). */
export function SaidasSemReceitaDre({
  ano,
  saidasSemReceitaDoAno,
  podeGerir,
}: {
  ano: number;
  saidasSemReceitaDoAno: SaidaSemReceita[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, number>>(() => {
    const inicial: Record<string, number> = {};
    for (const saida of saidasSemReceitaDoAno) {
      const indiceMes = Number(saida.competencia.slice(5, 7)) - 1;
      inicial[chaveCelula(saida.tipo, indiceMes)] = saida.valor;
    }
    return inicial;
  });
  const [statusPorCelula, setStatusPorCelula] = useState<Record<string, Status>>({});
  const [erroPorCelula, setErroPorCelula] = useState<Record<string, string>>({});

  function valorCelula(tipo: TipoSaidaSemReceita, indiceMes: number): number | null {
    const chave = chaveCelula(tipo, indiceMes);
    return chave in valores ? valores[chave] : null;
  }

  function alterarValor(tipo: TipoSaidaSemReceita, indiceMes: number, valor: number | null) {
    const chave = chaveCelula(tipo, indiceMes);
    setValores((atual) => {
      const proximo = { ...atual };
      if (valor === null) delete proximo[chave];
      else proximo[chave] = valor;
      return proximo;
    });
  }

  async function salvarCelula(tipo: TipoSaidaSemReceita, indiceMes: number) {
    const chave = chaveCelula(tipo, indiceMes);
    const valor = valorCelula(tipo, indiceMes);
    const resultado = await salvarSaidaSemReceitaAction({ competencia: competenciaDoMes(ano, indiceMes), tipo, valor: valor ?? 0 });
    if (!resultado.ok) {
      setStatusPorCelula((atual) => ({ ...atual, [chave]: "erro" }));
      setErroPorCelula((atual) => ({ ...atual, [chave]: resultado.mensagem }));
      return;
    }
    setErroPorCelula((atual) => {
      if (!(chave in atual)) return atual;
      const proximo = { ...atual };
      delete proximo[chave];
      return proximo;
    });
    setStatusPorCelula((atual) => ({ ...atual, [chave]: "salvo" }));
    router.refresh();
    setTimeout(() => setStatusPorCelula((atual) => (atual[chave] === "salvo" ? { ...atual, [chave]: undefined } : atual)), 2000);
  }

  function totalPorTipo(tipo: TipoSaidaSemReceita): number {
    let total = 0;
    for (let indiceMes = 0; indiceMes < 12; indiceMes++) total += valorCelula(tipo, indiceMes) ?? 0;
    return arredondar2(total);
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h2 className="font-display text-lg font-bold text-azul-noite">Saídas de Produtos sem Receita</h2>
        <p className="text-sm text-cinza-medio">
          Análise gerencial - não somam Receita, não alteram o CMV de novo, não duplicam custo. Explicam consumo de estoque sem venda associada.
        </p>
      </div>
      <TabelaRolavel ariaLabel="Tabela de saídas de produtos sem receita">
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th larguraFixa="200px">Mês de Competência</Th>
              {MESES_ABREVIADOS.map((mes) => (
                <Th key={mes} align="right" larguraFixa="84px">
                  {mes}
                </Th>
              ))}
              <Th align="right" larguraFixa="96px">
                Total
              </Th>
            </tr>
          </thead>
          <tbody>
            {TIPOS.map(({ tipo, rotulo }) => (
              <tr key={tipo} className="border-t border-cinza-claro">
                <td className="py-2 pr-3 pl-3 font-semibold text-cinza">
                  <span className="block min-w-0 truncate" title={rotulo}>
                    {rotulo}
                  </span>
                </td>
                {Array.from({ length: 12 }, (_, indiceMes) => {
                  const chave = chaveCelula(tipo, indiceMes);
                  const status = statusPorCelula[chave];
                  return (
                    <td key={indiceMes} className="px-2 py-1.5 text-right" onBlur={() => podeGerir && salvarCelula(tipo, indiceMes)}>
                      {podeGerir ? (
                        <div
                          className={`inline-block rounded ${status === "erro" ? "ring-2 ring-vermelho" : status === "salvo" ? "ring-2 ring-verde" : ""}`}
                          title={status === "erro" ? erroPorCelula[chave] : undefined}
                        >
                          <CampoNumero value={valorCelula(tipo, indiceMes)} onChange={(v) => alterarValor(tipo, indiceMes, v)} className="w-20" />
                        </div>
                      ) : (
                        <span className="font-mono">{formatarNumero(valorCelula(tipo, indiceMes))}</span>
                      )}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold text-azul-noite">
                  {formatarNumero(totalPorTipo(tipo))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaRolavel>
    </div>
  );
}
