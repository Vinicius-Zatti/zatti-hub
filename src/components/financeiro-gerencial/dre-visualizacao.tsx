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
import type { VisaoDre } from "@/lib/financeiro-gerencial/dre";
import { DadosComplementaresDre } from "@/components/financeiro-gerencial/dados-complementares-dre";
import { SaidasSemReceitaDre } from "@/components/financeiro-gerencial/saidas-sem-receita-dre";
import { MESES_ABREVIADOS, type DreAnual } from "@/lib/financeiro-gerencial/dre-anual";
import { mesDoResumo, montarQuadrosDre, type Quadro, type ValorQuadro } from "@/lib/financeiro-gerencial/quadros-dre";
import { EXPLICACAO_CALCULO } from "@/lib/financeiro-gerencial/explicacoes-dre";
import { avisosDre, mesesConsiderados, mesesJaIniciados, MESES_POR_EXTENSO } from "@/lib/financeiro-gerencial/dre-avisos";
import type { EstoqueMensal, SaidaSemReceita } from "@/lib/financeiro-gerencial/tipos";

// Pagamento nunca define o realizado (pago/aberto/vencido é estado de caixa);
// o que separa realizado de previsto é a Data de Competência.
const EXPLICACAO_VISAO_DRE: Record<VisaoDre, string> = {
  realizada: "Realizada: lançamentos com competência até hoje, pagos ou não.",
  projetada: "Projetada: lançamentos com competência depois de hoje, ainda previstos (ex: próximas parcelas de recorrência).",
  completa: "Completa: realizada + projetada.",
};

const TITULO_VISAO: Record<VisaoDre, string> = { realizada: "Realizada", projetada: "Projetada", completa: "Completa" };

function formatarValorQuadro(v: ValorQuadro | null): string {
  if (!v) return "-";
  if (v.semMargem) return "Sem margem";
  return formatarNumero(v.valor);
}

function formatarDiferenca(atual: number | null, referencia: number | null): string {
  if (atual === null || referencia === null) return "";
  const diferenca = Math.round((atual - referencia) * 100) / 100;
  return ` (${diferenca >= 0 ? "+" : ""}${formatarNumero(diferenca)})`;
}

/** Um quadro do topo: valor e % do mês do resumo, e abaixo o comparativo com
 * o mês anterior e com a média do trimestre anterior (valor e diferença). */
function QuadroResumo({
  titulo,
  quadro,
  mes,
  mesesTrimestre,
  rotuloPercentual,
  dica,
}: {
  titulo: string;
  quadro: Quadro;
  mes: string;
  mesesTrimestre: number[];
  rotuloPercentual: string;
  dica: string;
}) {
  const { atual } = quadro;
  const detalhe = atual.semMargem
    ? `${mes}: margem de contribuição zero ou negativa, sem ponto de equilíbrio.`
    : atual.valor === null
      ? `${mes}: sem lançamentos no mês.`
      : `${formatarPercentual(atual.percentual)} ${rotuloPercentual} - ${mes}`;
  const rotuloTrimestre = mesesTrimestre.length > 0 ? `Média ${mesesTrimestre.map((i) => MESES_ABREVIADOS[i]).join("/")}` : "Média do trimestre";
  return (
    <CartaoIndicador titulo={titulo} valor={formatarValorQuadro(atual)} detalhe={detalhe} dica={dica}>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-t border-cinza-claro pt-2 text-xs text-cinza-medio">
        <dt>Mês anterior</dt>
        <dd className="text-right font-mono">
          {formatarValorQuadro(quadro.mesAnterior)}
          {formatarDiferenca(atual.valor, quadro.mesAnterior?.valor ?? null)}
        </dd>
        <dt>{rotuloTrimestre}</dt>
        <dd className="text-right font-mono">
          {formatarValorQuadro(quadro.mediaTrimestre)}
          {formatarDiferenca(atual.valor, quadro.mediaTrimestre?.valor ?? null)}
        </dd>
      </dl>
    </CartaoIndicador>
  );
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
  visao: VisaoDre;
  estoquesDoAno: (EstoqueMensal | null)[];
  saidasSemReceitaDoAno: SaidaSemReceita[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const navegar = (novoAno: number, novaVisao: VisaoDre) => router.push(`/financeiro-gerencial/dre?ano=${novoAno}&visao=${novaVisao}`);
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

  // Quadros do topo (25/09): sempre o resumo de UM mês de competência (o mês
  // corrente; em outro ano, o último mês com receita), independente das
  // Colunas, com comparativo contra o mês anterior e a média do trimestre.
  const mesResumo = mesDoResumo(ano, dreAnual.linhas);
  const quadros = montarQuadrosDre(dreAnual.linhas, mesResumo);
  const nomeMesResumo = `${MESES_POR_EXTENSO[mesResumo]} de ${ano}`;
  // Inventário e Venda de Produtos só são cobrados de mês que já começou
  // (Projetada/Completa mostram meses futuros, que ainda não têm como ter);
  // o mês do resumo sempre entra.
  const mesesIniciados = mesesJaIniciados(ano);
  const mesesComInventarioCobravel = Array.from(
    new Set([...mesesConsiderados(mesesMarcados, mesesIniciados), ...(mesResumo < mesesIniciados ? [mesResumo] : [])]),
  ).sort((a, b) => a - b);
  const avisos = avisosDre({
    ano,
    meses: mesesComInventarioCobravel,
    cmvProvisorio: dreAnual.cmvProvisorioPorMes,
    semReceitaVendasProdutos: estoquesDoAno.map((e) => !e || e.receitaVendasProdutos === 0),
    caminhoCadastro: podeGerir
      ? "Dados Complementares da DRE, no fim desta página"
      : "Dados Complementares da DRE, no fim desta página (peça à Gestão)",
  });
  const avisosPorLinha: Record<string, string> = dreAnual.cmvProvisorioPorMes.some((s, i) => s && mesesComInventarioCobravel.includes(i))
    ? { cmv: "provisório" }
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
            DRE {TITULO_VISAO[visao]} - {ano}
          </h1>
          <p className="text-sm text-cinza-medio">
            Demonstrativo de Resultado por Data de Competência, ano completo, mês a mês.{" "}
            {EXPLICACAO_VISAO_DRE[visao]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AlternadorVisao
            opcoes={[
              { valor: "realizada", rotulo: "Realizada" },
              { valor: "projetada", rotulo: "Projetada" },
              { valor: "completa", rotulo: "Completa" },
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
        <QuadroResumo
          titulo="Resultado Líquido do Exercício"
          quadro={quadros.resultadoLiquido}
          mes={nomeMesResumo}
          mesesTrimestre={quadros.mesesTrimestre}
          rotuloPercentual="da Receita Operacional Bruta"
          dica={EXPLICACAO_CALCULO.quadro_resultado_liquido}
        />
        <QuadroResumo
          titulo="Resultado Econômico"
          quadro={quadros.resultadoEconomico}
          mes={nomeMesResumo}
          mesesTrimestre={quadros.mesesTrimestre}
          rotuloPercentual="da Receita Operacional Bruta"
          dica={EXPLICACAO_CALCULO.quadro_resultado_economico}
        />
        <QuadroResumo
          titulo="Ponto de Equilíbrio"
          quadro={quadros.pontoDeEquilibrio}
          mes={nomeMesResumo}
          mesesTrimestre={quadros.mesesTrimestre}
          rotuloPercentual="do ponto de equilíbrio coberto pela receita"
          dica={EXPLICACAO_CALCULO.quadro_ponto_equilibrio}
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
                <Th larguraFixa="240px" fixo>
                  Mês de Competência
                </Th>
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
                  dicas={EXPLICACAO_CALCULO}
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
