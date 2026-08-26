"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarEstoqueMensalAction } from "@/app/(app)/financeiro-gerencial/dre/actions";
import { CampoNumero } from "@/components/campo-numero";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { MESES_ABREVIADOS } from "@/lib/financeiro-gerencial/dre-anual";
import type { EstoqueMensal } from "@/lib/financeiro-gerencial/tipos";

type CamposMes = {
  receitaVendasProdutos: number | null;
  estoqueInicialMercadorias: number | null;
  estoqueInicialEmbalagens: number | null;
  estoqueFinalMercadorias: number | null;
  estoqueFinalEmbalagens: number | null;
};

const LINHAS: { campo: keyof CamposMes; rotulo: string }[] = [
  { campo: "receitaVendasProdutos", rotulo: "Receita de Vendas de Produtos" },
  { campo: "estoqueInicialMercadorias", rotulo: "Estoque Inicial de Mercadorias" },
  { campo: "estoqueInicialEmbalagens", rotulo: "Estoque Inicial de Embalagens" },
  { campo: "estoqueFinalMercadorias", rotulo: "Estoque Final de Mercadorias" },
  { campo: "estoqueFinalEmbalagens", rotulo: "Estoque Final de Embalagens" },
];

function paraCampos(estoque: EstoqueMensal | null): CamposMes {
  if (!estoque) {
    return {
      receitaVendasProdutos: null,
      estoqueInicialMercadorias: null,
      estoqueInicialEmbalagens: null,
      estoqueFinalMercadorias: null,
      estoqueFinalEmbalagens: null,
    };
  }
  return {
    receitaVendasProdutos: estoque.receitaVendasProdutos,
    estoqueInicialMercadorias: estoque.estoqueInicialMercadorias,
    estoqueInicialEmbalagens: estoque.estoqueInicialEmbalagens,
    estoqueFinalMercadorias: estoque.estoqueFinalMercadorias,
    estoqueFinalEmbalagens: estoque.estoqueFinalEmbalagens,
  };
}

function competenciaDoMes(ano: number, indiceMes: number): string {
  return `${ano}-${String(indiceMes + 1).padStart(2, "0")}`;
}

function formatarNumero(v: number | null): string {
  if (v === null) return "-";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Status = "salvando" | "salvo" | "erro" | undefined;

/** Exceção pontual e aprovada ao padrão de modal: estes 5 dados mensais são
 * editados direto na grade, célula a célula, como na planilha modelo (nunca
 * generalizar isso pra outro dado do app). Cada mês é uma linha só em
 * `fin_estoque_mensal` (5 colunas) - por isso o blur de qualquer uma das 5
 * células daquele mês reenvia a linha inteira (upsert único). Receita de
 * Vendas de Produtos nunca soma na Receita Operacional Bruta nem entra no
 * CMV em R$ - só serve de denominador do % CMV. */
export function DadosComplementaresDre({
  ano,
  estoquesDoAno,
  podeGerir,
}: {
  ano: number;
  estoquesDoAno: (EstoqueMensal | null)[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<CamposMes[]>(() => estoquesDoAno.map(paraCampos));
  const [statusPorMes, setStatusPorMes] = useState<Record<number, Status>>({});
  const [erroPorMes, setErroPorMes] = useState<Record<number, string>>({});

  function alterarCampo(indiceMes: number, campo: keyof CamposMes, valor: number | null) {
    setValores((atual) => atual.map((mes, i) => (i === indiceMes ? { ...mes, [campo]: valor } : mes)));
  }

  async function salvarMes(indiceMes: number) {
    const mes = valores[indiceMes];
    setStatusPorMes((atual) => ({ ...atual, [indiceMes]: "salvando" }));
    const resultado = await salvarEstoqueMensalAction({
      competencia: competenciaDoMes(ano, indiceMes),
      receitaVendasProdutos: mes.receitaVendasProdutos ?? 0,
      estoqueInicialMercadorias: mes.estoqueInicialMercadorias ?? 0,
      estoqueInicialEmbalagens: mes.estoqueInicialEmbalagens ?? 0,
      estoqueFinalMercadorias: mes.estoqueFinalMercadorias ?? 0,
      estoqueFinalEmbalagens: mes.estoqueFinalEmbalagens ?? 0,
    });
    if (!resultado.ok) {
      setStatusPorMes((atual) => ({ ...atual, [indiceMes]: "erro" }));
      setErroPorMes((atual) => ({ ...atual, [indiceMes]: resultado.mensagem }));
      return;
    }
    setErroPorMes((atual) => {
      if (!(indiceMes in atual)) return atual;
      const proximo = { ...atual };
      delete proximo[indiceMes];
      return proximo;
    });
    setStatusPorMes((atual) => ({ ...atual, [indiceMes]: "salvo" }));
    router.refresh();
    setTimeout(() => setStatusPorMes((atual) => (atual[indiceMes] === "salvo" ? { ...atual, [indiceMes]: undefined } : atual)), 2000);
  }

  return (
    <div id="dados-complementares-da-dre" className="flex scroll-mt-20 flex-col gap-2">
      <div>
        <h2 className="font-display text-lg font-bold text-azul-noite">Dados Complementares da DRE</h2>
        <p className="text-sm text-cinza-medio">
          Receita de Vendas de Produtos e estoque mensal (Mercadorias/Embalagens) - usados só no % CMV e no CMV em R$, nunca somam na Receita
          Operacional Bruta.
        </p>
      </div>
      <TabelaRolavel ariaLabel="Tabela de dados complementares da DRE">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th larguraFixa="220px">Mês de Competência</Th>
              {MESES_ABREVIADOS.map((mes) => (
                <Th key={mes} align="right" larguraFixa="84px">
                  {mes}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LINHAS.map(({ campo, rotulo }) => (
              <tr key={campo} className="border-t border-cinza-claro">
                <td className="py-2 pr-3 pl-3 font-semibold text-cinza">
                  <span className="block min-w-0 truncate" title={rotulo}>
                    {rotulo}
                  </span>
                </td>
                {valores.map((mes, indiceMes) => {
                  const status = statusPorMes[indiceMes];
                  return (
                    <td key={indiceMes} className="px-2 py-1.5 text-right" onBlur={() => podeGerir && salvarMes(indiceMes)}>
                      {podeGerir ? (
                        <div
                          className={`inline-block rounded ${
                            status === "erro" ? "ring-2 ring-vermelho" : status === "salvo" ? "ring-2 ring-verde" : ""
                          }`}
                          title={status === "erro" ? erroPorMes[indiceMes] : undefined}
                        >
                          <CampoNumero value={mes[campo]} onChange={(v) => alterarCampo(indiceMes, campo, v)} className="w-20" />
                        </div>
                      ) : (
                        <span className="font-mono">{formatarNumero(mes[campo])}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaRolavel>
    </div>
  );
}
