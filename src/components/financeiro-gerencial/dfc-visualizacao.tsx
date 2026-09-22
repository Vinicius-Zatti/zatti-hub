"use client";

import { useRouter } from "next/navigation";
import { AlternadorVisao, EXPLICACAO_VISAO } from "@/components/financeiro-gerencial/fluxo-caixa-visualizacao";
import { anosSelecionaveis, CartaoIndicador, formatarNumero, TabelaAnualBloco } from "@/components/financeiro-gerencial/tabela-anual";
import type { VisaoCaixa } from "@/lib/financeiro-gerencial/caixa";
import type { LinhaDreAnual } from "@/lib/financeiro-gerencial/dre-anual";

/** DFC pelo método direto: operacional, investimento e financiamento, com
 * saldo inicial e final, Projetada ou Realizada (nunca as duas juntas).
 * Resumida = só os grupos (setas fechadas); Expandida abre tudo. */
export function DfcVisualizacao({
  ano,
  visao,
  linhas,
  conciliacao,
}: {
  ano: number;
  visao: VisaoCaixa;
  linhas: LinhaDreAnual[];
  conciliacao: LinhaDreAnual[];
}) {
  const router = useRouter();
  const navegar = (novoAno: number, novaVisao: VisaoCaixa) => router.push(`/financeiro-gerencial/dfc?ano=${novoAno}&visao=${novaVisao}`);
  const valor = (id: string) => linhas.find((l) => l.id === id)?.total ?? null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">
            DFC {visao === "projetado" ? "Projetada" : "Realizada"} - {ano}
          </h1>
          <p className="text-sm text-cinza-medio">Demonstração do Fluxo de Caixa pelo método direto. {EXPLICACAO_VISAO[visao]}</p>
        </div>
        <div className="flex items-center gap-2">
          <AlternadorVisao
            opcoes={[
              { valor: "projetado", rotulo: "Projetada" },
              { valor: "realizado", rotulo: "Realizada" },
            ]}
            valor={visao}
            onMudar={(v) => navegar(ano, v)}
          />
          <select value={ano} onChange={(e) => navegar(Number(e.target.value), visao)} className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm text-cinza">
            {anosSelecionaveis().map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <CartaoIndicador titulo="Saldo inicial do ano" valor={formatarNumero(valor("saldo_inicial"))} />
        <CartaoIndicador titulo="Caixa operacional" valor={formatarNumero(valor("caixa_operacional"))} />
        <CartaoIndicador titulo="Geração após Saídas Não Op." valor={formatarNumero(valor("geracao_caixa"))} />
        <CartaoIndicador titulo="Saldo final do ano" valor={formatarNumero(valor("saldo_final"))} />
      </div>

      <TabelaAnualBloco titulo="Fluxo de caixa por atividade" ariaLabel="Tabela da DFC" rotuloPrimeiraColuna="Mês" linhas={linhas} />

      <div className="flex flex-col gap-1">
        <TabelaAnualBloco titulo="Conciliação - ajustes sem efeito caixa" ariaLabel="Tabela de conciliação das provisões" rotuloPrimeiraColuna="Mês de Competência" linhas={conciliacao} />
        <p className="text-xs text-cinza-medio">
          Informativo: provisões trabalhistas entram na DRE por competência mas não movimentam o caixa. O caixa só anda quando a guia (liquidação) é paga.
        </p>
      </div>
    </div>
  );
}
