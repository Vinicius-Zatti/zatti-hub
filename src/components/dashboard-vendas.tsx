"use client";

import { useMemo, useState } from "react";
import type { ConsolidadoVenda } from "@/lib/types";
import { StatCard } from "@/components/stat-card";
import { FiltroPeriodo, type PeriodoAplicado } from "@/components/filtro-periodo";

// Segunda primeiro, domingo por último (pedido do Vinícius) - o índice de
// `Date.getDay()` (0=domingo...6=sábado) é convertido com `(getDay()+6)%7`.
const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const DIA_ABREV_MIN = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]; // indexado direto por getDay()

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(n: number): string {
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Dashboard de vendas - só Gestão/master (`requireGestao()` na página).
 * Cores restritas às 3 cores cromáticas do manual de marca oficial
 * (azul-noite, azul-petróleo, âmbar) - sem verde/vermelho aqui (esses ficam
 * reservados pro badge de status em `consolidado-tabela.tsx`) e sem cor
 * nova. Séries com várias categorias (formas de pagamento, dia da semana)
 * usam hue único + rótulo direto em vez de forçar 5-7 cores que a paleta
 * oficial não tem. */
export function DashboardVendas({ lancamentos }: { lancamentos: ConsolidadoVenda[] }) {
  const [periodo, setPeriodo] = useState<PeriodoAplicado>({ de: "", ate: "" });

  const dados = useMemo(
    () => lancamentos.filter((l) => (!periodo.de || l.data >= periodo.de) && (!periodo.ate || l.data <= periodo.ate)),
    [lancamentos, periodo]
  );

  const faturamentoTotal = dados.reduce((s, l) => s + l.totalFormasPagamento, 0);
  const mediaPorDia = dados.length > 0 ? faturamentoTotal / dados.length : 0;
  const melhorDia = dados.reduce<ConsolidadoVenda | null>(
    (melhor, l) => (!melhor || l.totalFormasPagamento > melhor.totalFormasPagamento ? l : melhor),
    null
  );
  const divergentes = dados.filter((l) => l.status === "divergente").length;

  const evolucao = useMemo(
    () => [...dados].sort((a, b) => (a.data < b.data ? -1 : 1)).map((l) => ({ data: l.data, valor: l.totalFormasPagamento })),
    [dados]
  );

  // Não é o total do período - é a média (soma ÷ quantas vezes aquele dia da
  // semana apareceu no período). A porcentagem de cada dia é sobre a soma
  // dessas 7 médias (uma "semana típica" reconstruída), não sobre o
  // faturamento total do período.
  const porDiaSemana = useMemo(() => {
    const somaPorIndice = Array.from({ length: 7 }, () => ({ soma: 0, qtd: 0 }));
    for (const l of dados) {
      const idx = (new Date(`${l.data}T00:00:00`).getDay() + 6) % 7;
      somaPorIndice[idx].soma += l.totalFormasPagamento;
      somaPorIndice[idx].qtd += 1;
    }
    const medias = somaPorIndice.map((s) => (s.qtd > 0 ? s.soma / s.qtd : 0));
    const somaMedias = medias.reduce((s, v) => s + v, 0);
    return DIAS_SEMANA.map((label, idx) => ({
      label,
      media: medias[idx],
      pctSemana: somaMedias > 0 ? (medias[idx] / somaMedias) * 100 : 0,
    }));
  }, [dados]);

  const formasPagamento = useMemo(() => {
    return [
      { label: "Crédito", valor: dados.reduce((s, l) => s + l.credito, 0) },
      { label: "Débito", valor: dados.reduce((s, l) => s + l.debito, 0) },
      { label: "Pix", valor: dados.reduce((s, l) => s + l.pix, 0) },
      { label: "Dinheiro", valor: dados.reduce((s, l) => s + l.dinheiro, 0) },
      { label: "Vale-alimentação", valor: dados.reduce((s, l) => s + l.valeAlimentacao, 0) },
    ].sort((a, b) => b.valor - a.valor);
  }, [dados]);

  const totalSalao = dados.reduce((s, l) => s + l.salao, 0);
  const totalDelivery = dados.reduce((s, l) => s + l.deliveryProprio, 0);
  const totalCanaisPeriodo = totalSalao + totalDelivery;
  const larguraSalao = totalCanaisPeriodo > 0 ? (totalSalao / totalCanaisPeriodo) * 100 : 50;
  // Porcentagem exibida é frente ao faturamento oficial (total formas de
  // pagamento), não frente à soma dos canais - pode não somar 100% exato
  // quando há divergência no período, e isso é esperado.
  const pctSalaoFaturamento = faturamentoTotal > 0 ? (totalSalao / faturamentoTotal) * 100 : 0;
  const pctDeliveryFaturamento = faturamentoTotal > 0 ? (totalDelivery / faturamentoTotal) * 100 : 0;

  const maxForma = Math.max(1, ...formasPagamento.map((f) => f.valor));
  const maxSemana = Math.max(1, ...porDiaSemana.map((d) => d.media));

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Dashboard de Vendas</h1>
        <p className="text-sm text-cinza-medio">Faturamento oficial = total das formas de pagamento.</p>
      </div>

      <FiltroPeriodo lancamentos={lancamentos} onAplicar={setPeriodo} />

      {dados.length === 0 ? (
        <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-sm text-cinza-medio">
          Nenhum lançamento no período selecionado.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Faturamento total" value={brl(faturamentoTotal)} tone="ambar" />
            <StatCard label="Média por dia" value={brl(mediaPorDia)} />
            <StatCard
              label="Melhor dia"
              value={melhorDia ? `${brl(melhorDia.totalFormasPagamento)} · ${dataBR(melhorDia.data)}` : "—"}
            />
            <StatCard
              label="Lançamentos com divergência"
              value={String(divergentes)}
              tone={divergentes > 0 ? "alerta" : "neutral"}
            />
          </div>

          {divergentes > 0 && (
            <a
              href="/financeiro/consolidado?status=divergente"
              className="-mt-2 text-sm font-semibold text-azul-noite underline"
            >
              Ver os {divergentes} lançamentos com divergência no Histórico
            </a>
          )}

          <div className="rounded-lg border border-cinza-claro bg-branco p-4">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">
              Evolução diária das vendas
            </div>
            <GraficoLinha pontos={evolucao} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-cinza-claro bg-branco p-4">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">
                Vendas por dia da semana
              </div>
              <p className="mb-3 text-xs text-cinza-medio">
                Média de faturamento por dia da semana no período (ex: soma de todas as terças ÷
                quantidade de terças). A porcentagem é sobre a soma dessas 7 médias, uma &quot;semana
                típica&quot; reconstruída a partir do período - não é o faturamento total do período.
              </p>
              <div className="flex h-32 items-end gap-2">
                {porDiaSemana.map((d) => (
                  <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-[9px] font-semibold text-cinza-medio">{pct(d.pctSemana)}</span>
                    <div
                      className="w-full rounded-t bg-azul-petroleo"
                      style={{ height: `${maxSemana > 0 ? (d.media / maxSemana) * 100 : 0}%` }}
                      title={`${d.label}: ${brl(d.media)} (${pct(d.pctSemana)})`}
                    />
                    <span className="text-[10px] font-semibold text-cinza-medio">{d.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-cinza-claro bg-branco p-4">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">
                Salão x Delivery próprio
              </div>
              <div className="flex h-6 overflow-hidden rounded-full">
                <div className="bg-azul-noite" style={{ width: `${larguraSalao}%` }} />
                <div className="w-0.5 shrink-0 bg-branco" />
                <div className="bg-ambar" style={{ width: `${100 - larguraSalao}%` }} />
              </div>
              <div className="mt-3 flex flex-col gap-1.5 text-xs text-cinza">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-azul-noite" /> Salão ·{" "}
                  <span className="font-semibold">{brl(totalSalao)}</span> ·{" "}
                  <span className="font-semibold">{pct(pctSalaoFaturamento)}</span> do faturamento
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ambar" /> Delivery próprio ·{" "}
                  <span className="font-semibold">{brl(totalDelivery)}</span> ·{" "}
                  <span className="font-semibold">{pct(pctDeliveryFaturamento)}</span> do faturamento
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-cinza-claro bg-branco p-4">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">
              Distribuição por forma de pagamento
            </div>
            <div className="flex flex-col gap-2">
              {formasPagamento.map((f) => (
                <div key={f.label} className="flex items-center gap-2 text-sm">
                  <span className="w-32 shrink-0 text-cinza-medio">{f.label}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded bg-cinza-claro/40">
                    <div className="h-full rounded bg-ambar" style={{ width: `${(f.valor / maxForma) * 100}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right font-semibold text-cinza">{brl(f.valor)}</span>
                  <span className="w-14 shrink-0 text-right text-xs text-cinza-medio">
                    {pct(faturamentoTotal > 0 ? (f.valor / faturamentoTotal) * 100 : 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function GraficoLinha({ pontos }: { pontos: { data: string; valor: number }[] }) {
  if (pontos.length === 0) return <p className="text-sm text-cinza-medio">Sem lançamentos no período.</p>;

  const W = 600;
  const H = 160;
  const PAD = 20;
  const max = Math.max(1, ...pontos.map((p) => p.valor));
  const step = pontos.length > 1 ? (W - PAD * 2) / (pontos.length - 1) : 0;
  const coords = pontos.map((p, i) => ({
    x: PAD + i * step,
    y: H - PAD - (p.valor / max) * (H - PAD * 2),
    ...p,
  }));
  const linha = coords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="stroke-cinza-claro" strokeWidth={1} />
      <polyline points={linha} fill="none" className="stroke-azul-petroleo" strokeWidth={2} />
      {coords.map((c) => (
        <circle key={c.data} cx={c.x} cy={c.y} r={3} className="fill-azul-petroleo">
          <title>{`${DIA_ABREV_MIN[new Date(`${c.data}T00:00:00`).getDay()]}; ${dataBR(c.data)}; ${brl(c.valor)}`}</title>
        </circle>
      ))}
    </svg>
  );
}
