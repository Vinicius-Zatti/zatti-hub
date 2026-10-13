"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { salvarMetaUnidadeAction } from "@/app/(app)/financeiro-gerencial/painel-mega/actions";
import { CampoNumero } from "@/components/campo-numero";
import { DicaCalculo } from "@/components/dica-calculo";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { formatarNumero, formatarPercentual } from "@/components/financeiro-gerencial/tabela-anual";
import { MESES_POR_EXTENSO } from "@/lib/financeiro-gerencial/dre-avisos";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { EXPLICACAO_CALCULO } from "@/lib/financeiro-gerencial/explicacoes-dre";
import type { Farol, MetaUnidade, PainelMega } from "@/lib/financeiro-gerencial/painel-mega";

const ESTILO_FAROL: Record<Farol, string> = {
  cumpre: "border-verde bg-verde/10",
  nao_cumpre: "border-vermelho bg-vermelho/10",
  sem_meta: "border-cinza-claro bg-branco",
  sem_valor: "border-cinza-claro bg-branco",
  provisorio: "border-cinza-claro bg-branco",
};

function nomeDoMes(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  return `${MESES_POR_EXTENSO[mes - 1]} de ${ano}`;
}

function formatarMoeda(v: number | null): string {
  return v === null ? "-" : `R$ ${formatarNumero(v)}`;
}

/** Texto do farol: a cor nunca é a única informação. */
function TextoFarol({ farol, meta, formatar, onDefinirMeta }: { farol: Farol; meta: number | null; formatar: (v: number | null) => string; onDefinirMeta: (() => void) | null }) {
  if (farol === "sem_meta") {
    return onDefinirMeta ? (
      <button type="button" onClick={onDefinirMeta} className="text-xs font-semibold text-azul-petroleo underline">
        definir meta
      </button>
    ) : (
      <span className="text-xs text-cinza-medio">Sem meta cadastrada</span>
    );
  }
  const textoMeta = `meta ${formatar(meta)}`;
  if (farol === "cumpre") return <span className="text-xs font-semibold text-verde">Cumpre a meta ({textoMeta})</span>;
  if (farol === "nao_cumpre") return <span className="text-xs font-semibold text-vermelho">Não cumpre a meta ({textoMeta})</span>;
  if (farol === "provisorio") return <span className="text-xs text-cinza-medio">CMV ainda provisório no mês, sem farol ({textoMeta})</span>;
  return <span className="text-xs text-cinza-medio">Sem número no mês ({textoMeta})</span>;
}

function Cartao({
  titulo,
  valor,
  detalhe,
  dica,
  farol = "sem_valor",
  rodape,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  dica: string;
  farol?: Farol;
  rodape?: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-lg border p-3 ${ESTILO_FAROL[farol]}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-cinza-medio">
        {titulo}
        <DicaCalculo texto={dica} rotulo={titulo} />
      </div>
      <div className="font-mono text-lg font-bold text-azul-noite">{valor}</div>
      {detalhe && <div className="text-xs text-cinza-medio">{detalhe}</div>}
      {rodape}
    </div>
  );
}

function paraPercentualTela(fracao: number | null): number | null {
  return fracao === null ? null : Math.round(fracao * 10000) / 100;
}

function deTelaParaFracao(percentual: number | null): number | null {
  return percentual === null ? null : Math.round(percentual * 100) / 10000;
}

/** Modal da meta (Gestão/master): grava a vigência a partir do mês escolhido. Campo vazio = sem meta. */
function FormularioMeta({ competenciaInicial, metaAtual, onFechar }: { competenciaInicial: string; metaAtual: MetaUnidade | null; onFechar: () => void }) {
  const router = useRouter();
  const [vigenteDesde, setVigenteDesde] = useState(competenciaInicial);
  const [faturamento, setFaturamento] = useState<number | null>(metaAtual?.faturamento ?? null);
  const [cmv, setCmv] = useState<number | null>(paraPercentualTela(metaAtual?.cmvPercentual ?? null));
  const [custoFixo, setCustoFixo] = useState<number | null>(paraPercentualTela(metaAtual?.custoFixoPercentual ?? null));
  const [resultado, setResultado] = useState<number | null>(metaAtual?.resultado ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await salvarMetaUnidadeAction({
        vigenteDesde,
        faturamento,
        cmvPercentual: deTelaParaFracao(cmv),
        custoFixoPercentual: deTelaParaFracao(custoFixo),
        resultado,
      });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      router.refresh();
      onFechar();
    });
  }

  const rotulo = "flex flex-1 flex-col gap-1 text-sm font-semibold text-cinza-medio";
  return (
    <form onSubmit={confirmar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Metas da unidade</h2>
      <p className="text-sm text-cinza-medio">
        As metas valem a partir do mês escolhido até a próxima mudança. Os meses anteriores continuam com a meta que tinham. Campo vazio = sem
        meta nesse indicador (o número aparece sem cor).
      </p>
      <label className={rotulo}>
        Vale a partir de
        <input
          type="month"
          required
          value={vigenteDesde}
          onChange={(e) => setVigenteDesde(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      <div className="flex gap-3">
        <label className={rotulo}>
          Faturamento mínimo (R$)
          <CampoNumero value={faturamento} onChange={setFaturamento} className="w-full" />
        </label>
        <label className={rotulo}>
          Resultado mínimo (R$)
          <CampoNumero value={resultado} onChange={setResultado} className="w-full" />
        </label>
      </div>
      <div className="flex gap-3">
        <label className={rotulo}>
          % CMV máximo
          <CampoNumero value={cmv} onChange={setCmv} className="w-full" />
        </label>
        <label className={rotulo}>
          % Custos Fixos máximo
          <CampoNumero value={custoFixo} onChange={setCustoFixo} className="w-full" />
        </label>
      </div>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button type="submit" disabled={isPending || !vigenteDesde} className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50">
          {isPending ? "Salvando..." : "Salvar metas"}
        </button>
        <button
          type="button"
          onClick={onFechar}
          disabled={isPending}
          className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          Voltar
        </button>
      </div>
    </form>
  );
}

/** Painel M.E.G.A. (Fase 3, item 3): os números da DRE do mês escolhido, com
 * farol só onde há meta cadastrada. Nenhum número é recalculado aqui. */
export function PainelMegaVisualizacao({
  painel,
  metaDoMes,
  metas,
  podeGerir,
}: {
  painel: PainelMega;
  metaDoMes: MetaUnidade | null;
  metas: MetaUnidade[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [modalAberto, setModalAberto] = useState(false);
  const definirMeta = podeGerir ? () => setModalAberto(true) : null;
  const { faturamento, cmvPercentual, margemContribuicao, custoFixoPercentual, pontoDeEquilibrio, resultado, caixaProjetado30Dias } = painel;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">Painel M.E.G.A. - {nomeDoMes(painel.competencia)}</h1>
          <p className="text-sm text-cinza-medio">
            Os números da DRE do mês de competência, com farol onde a unidade tem meta.
            {painel.previsao && " Mês ainda não começado: previsão com o que já está lançado."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            aria-label="Mês do painel"
            value={painel.competencia}
            onChange={(e) => e.target.value && router.push(`/financeiro-gerencial/painel-mega?mes=${e.target.value}`)}
            className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm text-cinza"
          />
          {podeGerir && (
            <button type="button" onClick={() => setModalAberto(true)} className="rounded-lg bg-azul-noite px-3 py-1.5 text-sm font-bold text-branco">
              Definir metas
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Cartao
          titulo="Faturamento"
          valor={formatarMoeda(faturamento.valor)}
          dica={`${EXPLICACAO_CALCULO.painel_faturamento} ${EXPLICACAO_CALCULO.painel_farol}`}
          farol={faturamento.farol}
          rodape={<TextoFarol farol={faturamento.farol} meta={faturamento.meta} formatar={formatarMoeda} onDefinirMeta={definirMeta} />}
        />
        <Cartao
          titulo={cmvPercentual.percentualCmvFechado ? "% CMV" : "% CMC (provisório)"}
          valor={formatarPercentual(cmvPercentual.valor)}
          detalhe={cmvPercentual.percentualCmvFechado ? undefined : "Falta estoque final ou Venda de Produtos do mês na DRE."}
          dica={`${EXPLICACAO_CALCULO.painel_cmv_percentual} ${EXPLICACAO_CALCULO.painel_farol}`}
          farol={cmvPercentual.farol}
          rodape={<TextoFarol farol={cmvPercentual.farol} meta={cmvPercentual.meta} formatar={formatarPercentual} onDefinirMeta={definirMeta} />}
        />
        <Cartao
          titulo="Margem de Contribuição"
          valor={formatarMoeda(margemContribuicao.valor)}
          detalhe={`${formatarPercentual(margemContribuicao.percentual)} da Receita Operacional Bruta`}
          dica={EXPLICACAO_CALCULO.painel_margem}
        />
        <Cartao
          titulo="% Custos Fixos"
          valor={formatarPercentual(custoFixoPercentual.valor)}
          detalhe={`Custos Fixos: ${formatarMoeda(custoFixoPercentual.custosFixos)}`}
          dica={`${EXPLICACAO_CALCULO.painel_custo_fixo} ${EXPLICACAO_CALCULO.painel_farol}`}
          farol={custoFixoPercentual.farol}
          rodape={<TextoFarol farol={custoFixoPercentual.farol} meta={custoFixoPercentual.meta} formatar={formatarPercentual} onDefinirMeta={definirMeta} />}
        />
        <Cartao
          titulo="Ponto de Equilíbrio"
          valor={pontoDeEquilibrio.semMargem ? "Sem margem" : formatarMoeda(pontoDeEquilibrio.valor)}
          detalhe={
            pontoDeEquilibrio.semMargem
              ? "Margem de contribuição zero ou negativa: não existe ponto de equilíbrio."
              : `${formatarPercentual(pontoDeEquilibrio.percentual)} do ponto de equilíbrio coberto pela receita`
          }
          dica={EXPLICACAO_CALCULO.painel_ponto_equilibrio}
        />
        <Cartao
          titulo="Resultado"
          valor={formatarMoeda(resultado.valor)}
          detalhe={`Resultado Líquido do Exercício: ${formatarPercentual(resultado.percentual)} da Receita Operacional Bruta`}
          dica={`${EXPLICACAO_CALCULO.painel_resultado} ${EXPLICACAO_CALCULO.painel_farol}`}
          farol={resultado.farol}
          rodape={<TextoFarol farol={resultado.farol} meta={resultado.meta} formatar={formatarMoeda} onDefinirMeta={definirMeta} />}
        />
        <Cartao
          titulo="Caixa projetado em 30 dias"
          valor={formatarMoeda(caixaProjetado30Dias.saldo)}
          detalhe={`Saldo projetado em ${formatarDataBr(caixaProjetado30Dias.data)}, todas as contas.`}
          dica={EXPLICACAO_CALCULO.painel_caixa_30}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-bold text-azul-noite">Metas da unidade</h2>
        {metas.length === 0 ? (
          <p className="text-sm text-cinza-medio">
            Nenhuma meta cadastrada. Sem meta, os números aparecem sem cor{podeGerir ? "." : " (quem define é a Gestão)."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-cinza-claro bg-branco">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-azul-petroleo text-left text-branco">
                  <th className="px-3 py-2">Vale a partir de</th>
                  <th className="px-3 py-2 text-right">Faturamento</th>
                  <th className="px-3 py-2 text-right">% CMV</th>
                  <th className="px-3 py-2 text-right">% Custos Fixos</th>
                  <th className="px-3 py-2 text-right">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {metas.map((m) => (
                  <tr key={m.vigenteDesde} className={`border-t border-cinza-claro ${m.vigenteDesde === metaDoMes?.vigenteDesde ? "font-semibold" : ""}`}>
                    <td className="px-3 py-2">
                      {nomeDoMes(m.vigenteDesde.slice(0, 7))}
                      {m.vigenteDesde === metaDoMes?.vigenteDesde && <span className="ml-1 text-xs text-cinza-medio">(vale no mês do painel)</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatarMoeda(m.faturamento)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatarPercentual(m.cmvPercentual)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatarPercentual(m.custoFixoPercentual)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatarMoeda(m.resultado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModalFlutuante aberto={modalAberto} onFechar={() => setModalAberto(false)}>
        <FormularioMeta competenciaInicial={painel.competencia} metaAtual={metaDoMes} onFechar={() => setModalAberto(false)} />
      </ModalFlutuante>
    </div>
  );
}
