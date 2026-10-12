"use client";

import { useEffect, useState, useTransition } from "react";
import { listarCandidatosAction, type RespostaCandidatos } from "@/app/(app)/financeiro-gerencial/conciliacao/actions";
import { DicaCalculo } from "@/components/dica-calculo";
import { CampoNumero } from "@/components/campo-numero";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { EXPLICACAO_PONTUACAO } from "@/lib/conciliacao/candidatos";
import {
  analisarDiferenca,
  distribuirExtrato,
  paraCentavos,
  TEXTO_CASO,
  valorPadraoBaixa,
} from "@/lib/conciliacao/decisao-tela";
import type { ItemFila } from "@/lib/banco/conciliacao";
import { BotoesConfirmar, brl, brlCentavos, MensagemErro, useEnvioDecisao, type ContextoDecisao } from "./comum";

type Candidato = Extract<RespostaCandidatos, { ok: true }>["itens"][number];
type Selecao = { candidato: Candidato; valor: number | null; quitarRestante: boolean };

const EXPLICACAO_DIFERENCA =
  "Diferença = valor do extrato - soma dos valores a baixar das contas marcadas. Zero fecha a conciliação; diferente de zero pede ajuste ou baixa parcial.";

/** Aba "Sugestão / Contas em aberto": marca parcelas em aberto, valor a baixar editável. */
export function AbaContasAbertas({ movimento, contexto, aoConcluir }: { movimento: ItemFila; contexto: ContextoDecisao; aoConcluir: (t: string) => void }) {
  const [resposta, setResposta] = useState<RespostaCandidatos | null>(null);
  const [foraDaJanela, setForaDaJanela] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [buscando, iniciarBusca] = useTransition();
  const [selecao, setSelecao] = useState<Map<string, Selecao>>(new Map());
  const [ajusteCategoria, setAjusteCategoria] = useState("");
  const { enviar, pendente, erro } = useEnvioDecisao(aoConcluir);

  const extrato = paraCentavos(movimento.valor);

  function buscar(fora: boolean, p: number) {
    setForaDaJanela(fora);
    setPagina(p);
    iniciarBusca(async () => {
      setResposta(
        await listarCandidatosAction({
          movimentoId: movimento.id,
          data: movimento.data,
          valorCentavos: extrato,
          contaFinanceiraId: movimento.contaFinanceiraId,
          foraDaJanela: fora,
          pagina: p,
        }),
      );
    });
  }

  useEffect(() => {
    iniciarBusca(async () => {
      setResposta(
        await listarCandidatosAction({
          movimentoId: movimento.id,
          data: movimento.data,
          valorCentavos: Math.round(movimento.valor * 100),
          contaFinanceiraId: movimento.contaFinanceiraId,
          foraDaJanela: false,
          pagina: 1,
        }),
      );
    });
  }, [movimento]);

  const marcadas = Array.from(selecao.values());
  const selecionado = marcadas.reduce((a, s) => a + paraCentavos(s.valor), 0);
  const analise = analisarDiferenca(movimento.direcao, extrato, selecionado);
  const valoresValidos = marcadas.every((s) => {
    const v = paraCentavos(s.valor);
    return v > 0 && v <= paraCentavos(s.candidato.saldoAberto);
  });
  const temParcial = marcadas.some((s) => paraCentavos(s.valor) < paraCentavos(s.candidato.saldoAberto));
  const precisaAjuste = analise.ajusteTipo !== null;
  const podeConfirmar =
    marcadas.length > 0 && valoresValidos && analise.caso !== "pagamento_menor" && (!precisaAjuste || ajusteCategoria !== "");
  const planos = new Set(marcadas.map((s) => s.candidato.categoriaNome));
  const podeAprender = planos.size === 1;

  function alternar(c: Candidato) {
    setSelecao((atual) => {
      const nova = new Map(atual);
      if (nova.has(c.parcelaId)) {
        nova.delete(c.parcelaId);
      } else {
        const ja = Array.from(nova.values()).reduce((a, s) => a + paraCentavos(s.valor), 0);
        const v = valorPadraoBaixa(paraCentavos(c.saldoAberto), extrato - ja);
        nova.set(c.parcelaId, { candidato: c, valor: v / 100, quitarRestante: false });
      }
      return nova;
    });
  }

  function mudarValor(id: string, valor: number | null) {
    setSelecao((atual) => {
      const nova = new Map(atual);
      const s = nova.get(id);
      if (s) nova.set(id, { ...s, valor });
      return nova;
    });
  }

  function fecharComExtrato() {
    const lista = Array.from(selecao.values());
    const valores = distribuirExtrato(extrato, lista.map((s) => paraCentavos(s.candidato.saldoAberto)));
    const nova = new Map<string, Selecao>();
    lista.forEach((s, i) => {
      if (valores[i] > 0) nova.set(s.candidato.parcelaId, { ...s, valor: valores[i] / 100 });
    });
    setSelecao(nova);
  }

  function quitarRestante(marcar: boolean) {
    setSelecao((atual) => new Map(Array.from(atual.entries()).map(([id, s]) => [id, { ...s, quitarRestante: marcar }])));
  }

  function confirmar(aprender: boolean) {
    const quitar = movimento.direcao === "saida" && contexto.podeGestao;
    enviar(
      [
        {
          movimentoId: movimento.id,
          acao: "baixar_parcelas",
          parcelas: marcadas.map((s) => {
            const v = paraCentavos(s.valor);
            const parcial = v < paraCentavos(s.candidato.saldoAberto);
            return { parcelaId: s.candidato.parcelaId, valorCentavos: v, ...(quitar && parcial && s.quitarRestante ? { quitarRestante: true } : {}) };
          }),
          ajuste: precisaAjuste ? { categoriaId: ajusteCategoria, valorCentavos: analise.ajusteCentavos } : null,
          aprender,
        },
      ],
      `Conciliado: ${marcadas.length} conta(s) baixada(s) com ${brl(movimento.valor)}.`,
    );
  }

  const quitarMarcado = marcadas.length > 0 && marcadas.every((s) => s.quitarRestante);

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1 text-xs text-cinza-medio">
        {foraDaJanela ? "Todas as datas" : "Data prevista até 5 dias antes ou depois"}. Marque as contas que este movimento paga.
        <DicaCalculo texto={EXPLICACAO_PONTUACAO} rotulo="Pontos" />
      </p>
      {buscando && <p className="text-sm text-cinza-medio">Buscando...</p>}
      {resposta && !resposta.ok && <p className="text-sm text-vermelho">{resposta.mensagem}</p>}
      {resposta?.ok && resposta.itens.length === 0 && <p className="text-sm text-cinza-medio">Nenhuma conta em aberto correspondente.</p>}
      {resposta?.ok && resposta.itens.length > 0 && (
        <ul className="flex max-h-[40vh] flex-col gap-2 overflow-auto">
          {resposta.itens.map((c) => {
            const s = selecao.get(c.parcelaId);
            const semSaldo = c.saldoAberto <= 0;
            return (
              <li key={c.parcelaId} className={`rounded-md border p-2 text-sm ${s ? "border-azul-petroleo bg-azul-petroleo/5" : c.grupo === "quitada" ? "border-ambar bg-ambar/10" : "border-cinza-claro"}`}>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={!!s} disabled={semSaldo || pendente} onChange={() => alternar(c)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2">
                      <span className="truncate font-semibold" title={c.descricao}>{c.descricao}</span>
                      <span className="whitespace-nowrap text-xs">{c.pontuacao.pontos} pontos</span>
                    </span>
                    <span className="block text-xs text-cinza-medio">
                      {c.categoriaNome} · parcela {c.numero}/{c.totalParcelas} · previsto {formatarDataBr(c.dataPrevista)} · em aberto {brl(c.saldoAberto)}
                    </span>
                    <span className="block text-xs">{c.pontuacao.motivos.join(" · ")}</span>
                  </span>
                </label>
                {s && (
                  <div className="mt-1 flex items-center justify-end gap-2 text-xs">
                    <span>Valor a baixar</span>
                    <CampoNumero value={s.valor} onChange={(v) => mudarValor(c.parcelaId, v)} className="w-28" />
                    {paraCentavos(s.valor) > paraCentavos(c.saldoAberto) && <span className="text-vermelho">passa do saldo</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-3 text-xs">
        {!foraDaJanela && <button type="button" onClick={() => buscar(true, 1)} className="underline">Buscar em todas as datas</button>}
        {pagina > 1 && <button type="button" onClick={() => buscar(foraDaJanela, pagina - 1)} className="underline">Anteriores</button>}
        {resposta?.ok && resposta.temMais && <button type="button" onClick={() => buscar(foraDaJanela, pagina + 1)} className="underline">Mais resultados</button>}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-cinza-claro/40 p-2 text-sm">
        <span>Extrato <strong>{brlCentavos(extrato)}</strong></span>
        <span>|</span>
        <span>Selecionado <strong>{brlCentavos(selecionado)}</strong></span>
        <span>|</span>
        <span className={analise.diferencaCentavos === 0 ? "text-verde" : "text-vermelho"}>
          Diferença <strong>{brlCentavos(analise.diferencaCentavos)}</strong>
        </span>
        <DicaCalculo texto={EXPLICACAO_DIFERENCA} rotulo="Diferença" />
      </div>

      {marcadas.length > 0 && analise.caso !== "fecha" && (
        <div className="flex flex-col gap-2 rounded-md border border-ambar bg-ambar/10 p-3 text-sm">
          <p>{TEXTO_CASO[analise.caso]}</p>
          {precisaAjuste && (
            <label className="flex flex-col gap-1">
              <span className="font-semibold">
                Plano de Contas do ajuste de {brlCentavos(analise.ajusteCentavos)} ({analise.ajusteTipo === "receita" ? "receita" : "despesa"})
              </span>
              <SeletorComBusca
                value={ajusteCategoria}
                opcoes={analise.ajusteTipo === "receita" ? contexto.planoReceita : contexto.planoDespesa}
                onChange={setAjusteCategoria}
                placeholder="Escolha o Plano de Contas do ajuste"
              />
            </label>
          )}
          {analise.caso === "pagamento_menor" && (
            <button type="button" onClick={fecharComExtrato} className="self-start rounded-md border border-azul-petroleo px-3 py-1 text-xs font-semibold text-azul-petroleo">
              Ajustar os valores para fechar com o extrato
            </button>
          )}
        </div>
      )}

      {movimento.direcao === "saida" && marcadas.length > 0 && temParcial && analise.caso !== "pagamento_menor" && (
        <div className="rounded-md border border-cinza-claro p-3 text-sm">
          {contexto.podeGestao ? (
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={quitarMarcado} onChange={(e) => quitarRestante(e.target.checked)} />
              <span>
                Quitar o restante como desconto. Sem marcar, fica baixa parcial: o que faltou continua em aberto na conta.
              </span>
            </label>
          ) : (
            <p>Fica baixa parcial: o que faltou continua em aberto na conta. Quitar o restante como desconto é só de Gestão/master.</p>
          )}
        </div>
      )}

      <MensagemErro texto={erro} />
      <BotoesConfirmar
        pendente={pendente}
        podeConfirmar={podeConfirmar}
        podeAprender={podeAprender}
        motivoSemAprender={planos.size > 1 ? "Contas de Planos de Contas diferentes não ensinam regra." : undefined}
        aoConfirmar={confirmar}
      />
    </div>
  );
}
