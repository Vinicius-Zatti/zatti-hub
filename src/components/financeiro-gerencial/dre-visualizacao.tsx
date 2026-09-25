"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Th } from "@/components/tabela";
import {
  BotaoExpandirTudo,
  CartaoIndicador,
  COLUNAS_NUMERICAS_ANUAIS,
  formatarNumero,
  formatarPercentual,
  LinhaTabelaAnual as LinhaTabela,
} from "@/components/financeiro-gerencial/tabela-anual";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { BotaoColunasDre, useColunasVisiveis, type ColunaDre } from "@/components/financeiro-gerencial/dre-colunas-menu";
import { AlternadorVisao } from "@/components/financeiro-gerencial/fluxo-caixa-visualizacao";
import type { VisaoCaixa } from "@/lib/financeiro-gerencial/caixa";
import { DadosComplementaresDre } from "@/components/financeiro-gerencial/dados-complementares-dre";
import { SaidasSemReceitaDre } from "@/components/financeiro-gerencial/saidas-sem-receita-dre";
import { calcularIndicadoresPeriodo, MESES_ABREVIADOS, type DreAnual, type IndicadoresDre } from "@/lib/financeiro-gerencial/dre-anual";
import { avisosDre, explicacaoIndicadores, mesesConsiderados, MESES_POR_EXTENSO } from "@/lib/financeiro-gerencial/dre-avisos";
import type { EstoqueMensal, SaidaSemReceita } from "@/lib/financeiro-gerencial/tipos";

// Mesma regra de status do Fluxo de Caixa/DFC, mas no mês da competência.
const EXPLICACAO_VISAO_DRE: Record<VisaoCaixa, string> = {
  projetado: "Projetado: toda parcela não cancelada, pelo valor cheio.",
  realizado: "Realizado: só o que já foi recebido ou pago (valor das baixas, estorno desconta).",
};

function formatarPontoDeEquilibrio(v: number | "sem_margem"): string {
  return v === "sem_margem" ? "Sem margem" : formatarNumero(v);
}

/** Aviso de pendência - mesmo visual de aviso âmbar já usado no app
 * (`calculadora-cmv.tsx`, `conectar-planilha.tsx`). */
function AvisoPendenciaDre({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div role="status" className="rounded-lg border border-ambar bg-ambar/10 p-4 text-sm text-cinza">
      <p className="font-semibold text-azul-noite">{titulo}.</p>
      <p className="mt-1">{texto}</p>
    </div>
  );
}

// Média/Total + 12 meses - "Mês de Competência" (a coluna de rótulo) nunca
// entra aqui, nunca pode ser ocultada (regra do botão "Colunas").
const COLUNAS_NUMERICAS: ColunaDre[] = COLUNAS_NUMERICAS_ANUAIS;

/** Visualização anual da DRE - único seletor é o Ano (nunca mês). Cada grupo
 * principal abre a própria seta, hierarquicamente (CMC dentro de CMV, contas
 * dentro de subgrupo), e o botão Expandida/Resumida (mesmo das outras
 * tabelas anuais) abre ou recolhe tudo de uma vez (pedido de 25/09). Saídas Não
 * Operacionais e Resultado Econômico vêm na mesma tabela, não numa seção à
 * parte. */
export function DreVisualizacao({
  dreAnual,
  ano,
  visao,
  estoquesDoAno,
  saidasSemReceitaDoAno,
  podeGerir,
}: {
  dreAnual: DreAnual;
  ano: number;
  visao: VisaoCaixa;
  estoquesDoAno: (EstoqueMensal | null)[];
  saidasSemReceitaDoAno: SaidaSemReceita[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const navegar = (novoAno: number, novaVisao: VisaoCaixa) => router.push(`/financeiro-gerencial/dre?ano=${novoAno}&visao=${novaVisao}`);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const { visiveis, alternar: alternarColuna, mostrarTodas, desmarcarTodas } = useColunasVisiveis(COLUNAS_NUMERICAS);

  function alternar(id: string) {
    setExpandidas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  // Com um mês só (ou nenhum) selecionado nas Colunas sobra espaço - o nome
  // da linha aparece inteiro, sem reticências (pedido de 25/09).
  const mesesMarcados = MESES_ABREVIADOS.map((_, indice) => indice).filter((indice) => visiveis.has(`mes_${indice}`));
  const nomeCompleto = mesesMarcados.length <= 1;

  // Indicadores do topo e avisos seguem os meses marcados em Colunas que já
  // começaram (25/09): um mês = aquele mês, vários = a soma do período.
  const meses = mesesConsiderados(mesesMarcados, dreAnual.divisorMedia ?? 0);
  const indicadores: IndicadoresDre =
    meses.length > 0
      ? calcularIndicadoresPeriodo(dreAnual.linhas, meses)
      : { resultadoEconomico: null, percentualResultadoEconomico: null, pontoDeEquilibrio: "sem_margem" };
  const explicacoes = explicacaoIndicadores(indicadores, meses);
  const rotuloPeriodo =
    meses.length === 0
      ? "Nenhum mês marcado já começou"
      : meses.length === 1
        ? `${MESES_POR_EXTENSO[meses[0]]} de ${ano}`
        : `Soma de ${meses.length} meses (${meses.map((i) => MESES_ABREVIADOS[i]).join(", ")})`;
  const avisos = avisosDre({
    ano,
    meses,
    semInventario: dreAnual.semInventarioPorMes,
    semReceitaVendasProdutos: estoquesDoAno.map((e) => !e || e.receitaVendasProdutos === 0),
    caminhoCadastro: podeGerir
      ? "Dados Complementares da DRE, no fim desta página"
      : "Dados Complementares da DRE, no fim desta página (peça à Gestão)",
  });
  const avisosPorLinha: Record<string, string> = dreAnual.semInventarioPorMes.some((s, i) => s && meses.includes(i))
    ? { cmv: "sem inventário" }
    : {};

  // "% Linha" aparece logo abaixo da própria linha (antes das contas-filhas
  // quando ela está expandida) - pedido de 25/09.
  const percentualPorId = new Map(dreAnual.linhas.filter((l) => l.percentual).map((l) => [l.id, l]));
  const linhasPrincipais = dreAnual.linhas.filter((l) => !l.percentual);

  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 7 }, (_, i) => anoAtual + 1 - i);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">
            DRE {visao === "projetado" ? "Projetada" : "Realizada"} - {ano}
          </h1>
          <p className="text-sm text-cinza-medio">
            Demonstrativo de Resultado por Data de Competência, ano completo, mês a mês.{" "}
            {EXPLICACAO_VISAO_DRE[visao]}
          </p>
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
          <select
            value={ano}
            onChange={(e) => navegar(Number(e.target.value), visao)}
            className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm text-cinza"
          >
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {avisos.map((aviso) => (
        <AvisoPendenciaDre key={aviso.id} titulo={aviso.titulo} texto={aviso.texto} />
      ))}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CartaoIndicador
          titulo="Resultado Econômico"
          valor={formatarNumero(indicadores.resultadoEconomico)}
          detalhe={explicacoes.resultadoEconomico ?? rotuloPeriodo}
        />
        <CartaoIndicador
          titulo="% Resultado Econômico"
          valor={formatarPercentual(indicadores.percentualResultadoEconomico)}
          detalhe={explicacoes.percentual ?? rotuloPeriodo}
        />
        <CartaoIndicador
          titulo="Ponto de Equilíbrio"
          valor={formatarPontoDeEquilibrio(indicadores.pontoDeEquilibrio)}
          detalhe={explicacoes.pontoDeEquilibrio ?? rotuloPeriodo}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-azul-noite">Resultado</h2>
          <div className="flex items-center gap-2">
            <BotaoExpandirTudo linhas={dreAnual.linhas} expandidas={expandidas} onDefinir={setExpandidas} />
            <BotaoColunasDre colunas={COLUNAS_NUMERICAS} visiveis={visiveis} onAlternar={alternarColuna} onMostrarTodas={mostrarTodas} onDesmarcarTodas={desmarcarTodas} />
          </div>
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
              {linhasPrincipais.map((linha) => (
                <LinhaTabela
                  key={linha.id}
                  linha={linha}
                  linhaPercentual={percentualPorId.get(`${linha.id}_percentual`)}
                  expandidas={expandidas}
                  alternar={alternar}
                  visiveis={visiveis}
                  nomeCompleto={nomeCompleto}
                  avisos={avisosPorLinha}
                />
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
