"use client";

import { useMemo, useState } from "react";
import type { ConsolidadoVenda } from "@/lib/types";
import { StatCard } from "@/components/stat-card";
import { FiltroPeriodo, type PeriodoAplicado } from "@/components/filtro-periodo";

// Segunda primeiro, domingo por último (pedido do Vinícius) - o índice de
// `Date.getDay()` (0=domingo...6=sábado) é convertido com `(getDay()+6)%7`.
const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const DIA_ABREV_MIN = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]; // indexado direto por getDay()
const COR_IFOOD = "#EA1D2C";
const COR_99FOOD = "#FFDD00";
const COR_DELIVERY_PROPRIO = "#C9882A";

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
 * A paleta Zatti continua nos dados próprios. iFood e 99Food são exceções
 * autorizadas: usam as cores oficiais das marcas para separar visualmente
 * receitas de marketplace que não participam da conciliação. */
export function DashboardVendas({ lancamentos }: { lancamentos: ConsolidadoVenda[] }) {
  const [periodo, setPeriodo] = useState<PeriodoAplicado>({ de: "", ate: "" });

  const dados = useMemo(
    () => lancamentos.filter((l) => (!periodo.de || l.data >= periodo.de) && (!periodo.ate || l.data <= periodo.ate)),
    [lancamentos, periodo]
  );

  const faturamentoTotal = dados.reduce((s, l) => s + l.faturamentoTotal, 0);
  const totalFormasPagamento = dados.reduce((s, l) => s + l.totalFormasPagamento, 0);
  const mediaPorDia = dados.length > 0 ? faturamentoTotal / dados.length : 0;
  const melhorDia = dados.reduce<ConsolidadoVenda | null>(
    (melhor, l) => (!melhor || l.faturamentoTotal > melhor.faturamentoTotal ? l : melhor),
    null
  );
  const divergentes = dados.filter((l) => l.status === "divergente").length;

  const evolucao = useMemo(
    () =>
      [...dados]
        .sort((a, b) => (a.data < b.data ? -1 : 1))
        .map((l) => ({
          data: l.data,
          total: l.faturamentoTotal,
          salao: l.salao,
          delivery: l.deliveryProprio,
          ifood: l.ifood,
          food99: l.food99,
        })),
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
      somaPorIndice[idx].soma += l.faturamentoTotal;
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
  const totalIfood = dados.reduce((s, l) => s + l.ifood, 0);
  const totalFood99 = dados.reduce((s, l) => s + l.food99, 0);
  const totalMarketplaces = totalIfood + totalFood99;
  const totalVendasDelivery = totalDelivery + totalMarketplaces;
  const totalCanaisPeriodo = totalSalao + totalVendasDelivery;
  const larguraSalao = totalCanaisPeriodo > 0 ? (totalSalao / totalCanaisPeriodo) * 100 : 50;
  const pctSalaoFaturamento = faturamentoTotal > 0 ? (totalSalao / faturamentoTotal) * 100 : 0;
  const pctDeliveryFaturamento = faturamentoTotal > 0 ? (totalVendasDelivery / faturamentoTotal) * 100 : 0;
  const pctDeliveryProprio = totalVendasDelivery > 0 ? (totalDelivery / totalVendasDelivery) * 100 : 0;
  const pctIfoodDelivery = totalVendasDelivery > 0 ? (totalIfood / totalVendasDelivery) * 100 : 0;
  const pctFood99Delivery = totalVendasDelivery > 0 ? (totalFood99 / totalVendasDelivery) * 100 : 0;

  const maxForma = Math.max(1, ...formasPagamento.map((f) => f.valor));
  const maxSemana = Math.max(1, ...porDiaSemana.map((d) => d.media));

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Dashboard de Vendas</h1>
        <p className="text-sm text-cinza-medio">
          Faturamento total = Salão + Delivery próprio + iFood + 99Food.
        </p>
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
              value={melhorDia ? `${brl(melhorDia.faturamentoTotal)} · ${dataBR(melhorDia.data)}` : "—"}
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
                Salão x Delivery
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
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ambar" /> Delivery total ·{" "}
                  <span className="font-semibold">{brl(totalVendasDelivery)}</span> ·{" "}
                  <span className="font-semibold">{pct(pctDeliveryFaturamento)}</span> do faturamento
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                      {pct(totalFormasPagamento > 0 ? (f.valor / totalFormasPagamento) * 100 : 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-cinza-claro bg-branco p-4">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">
                Distribuição das vendas do delivery
              </div>
              <p className="mb-3 text-xs text-cinza-medio">Participação sobre o total vendido por delivery.</p>
              <div className="flex h-6 overflow-hidden rounded-full bg-cinza-claro/40">
                <div style={{ width: `${pctDeliveryProprio}%`, backgroundColor: COR_DELIVERY_PROPRIO }} />
                <div style={{ width: `${pctIfoodDelivery}%`, backgroundColor: COR_IFOOD }} />
                <div style={{ width: `${pctFood99Delivery}%`, backgroundColor: COR_99FOOD }} />
              </div>
              <div className="mt-3 flex flex-col gap-1.5 text-xs text-cinza">
                <ItemDistribuicao cor={COR_DELIVERY_PROPRIO} label="Delivery próprio" valor={totalDelivery} porcentagem={pctDeliveryProprio} />
                <ItemDistribuicao cor={COR_IFOOD} label="iFood" valor={totalIfood} porcentagem={pctIfoodDelivery} />
                <ItemDistribuicao cor={COR_99FOOD} label="99Food" valor={totalFood99} porcentagem={pctFood99Delivery} contorno />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ItemDistribuicao({
  cor,
  label,
  valor,
  porcentagem,
  contorno = false,
}: {
  cor: string;
  label: string;
  valor: number;
  porcentagem: number;
  contorno?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${contorno ? "border border-black/10" : ""}`}
        style={{ backgroundColor: cor }}
      />
      {label} · <span className="font-semibold">{brl(valor)}</span> ·{" "}
      <span className="font-semibold">{pct(porcentagem)}</span>
    </span>
  );
}

function tooltip(serie: string, data: string, valor: number): string {
  const abrev = DIA_ABREV_MIN[new Date(`${data}T00:00:00`).getDay()];
  return `${serie}; ${abrev}; ${dataBR(data)}; ${brl(valor)}`;
}

/** Cinco linhas: faturamento total, Salão, Delivery próprio, iFood e 99Food.
 * Salão continua tracejado para não depender só da diferença pequena entre
 * os dois azuis da marca Zatti. A linha amarela da 99Food é mais espessa e
 * pontilhada para continuar legível sobre fundo branco. */
function GraficoLinha({
  pontos,
}: {
  pontos: { data: string; total: number; salao: number; delivery: number; ifood: number; food99: number }[];
}) {
  if (pontos.length === 0) return <p className="text-sm text-cinza-medio">Sem lançamentos no período.</p>;

  const W = 600;
  const H = 190;
  const PAD_ESQ = 20;
  const PAD_DIR = 20;
  const PAD_TOPO = 10;
  const PAD_BASE = 34;
  const alturaUtil = H - PAD_TOPO - PAD_BASE;
  const max = Math.max(1, ...pontos.flatMap((p) => [p.total, p.salao, p.delivery, p.ifood, p.food99]));
  const step = pontos.length > 1 ? (W - PAD_ESQ - PAD_DIR) / (pontos.length - 1) : 0;

  function y(v: number): number {
    return PAD_TOPO + alturaUtil - (v / max) * alturaUtil;
  }

  const coords = pontos.map((p, i) => ({ x: PAD_ESQ + i * step, ...p }));
  const segundas = coords.filter((c) => new Date(`${c.data}T00:00:00`).getDay() === 1);
  const linhaTotal = coords.map((c) => `${c.x},${y(c.total)}`).join(" ");
  const linhaSalao = coords.map((c) => `${c.x},${y(c.salao)}`).join(" ");
  const linhaDelivery = coords.map((c) => `${c.x},${y(c.delivery)}`).join(" ");
  const linhaIfood = coords.map((c) => `${c.x},${y(c.ifood)}`).join(" ");
  const linhaFood99 = coords.map((c) => `${c.x},${y(c.food99)}`).join(" ");

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" preserveAspectRatio="none">
        <line
          x1={PAD_ESQ}
          y1={PAD_TOPO + alturaUtil}
          x2={W - PAD_DIR}
          y2={PAD_TOPO + alturaUtil}
          className="stroke-cinza-claro"
          strokeWidth={1}
        />
        {segundas.map((c) => (
          <line
            key={`marca-${c.data}`}
            x1={c.x}
            y1={PAD_TOPO}
            x2={c.x}
            y2={PAD_TOPO + alturaUtil}
            className="stroke-cinza-claro"
            strokeWidth={1}
            strokeDasharray="2,2"
          />
        ))}

        <polyline points={linhaSalao} fill="none" className="stroke-azul-noite" strokeWidth={2} strokeDasharray="6,3" />
        <polyline points={linhaDelivery} fill="none" className="stroke-ambar" strokeWidth={2} />
        <polyline points={linhaIfood} fill="none" stroke={COR_IFOOD} strokeWidth={2.5} />
        <polyline points={linhaFood99} fill="none" stroke={COR_99FOOD} strokeWidth={3} strokeDasharray="3,2" />
        <polyline points={linhaTotal} fill="none" className="stroke-azul-petroleo" strokeWidth={2.5} />

        {coords.map((c) => (
          <g key={c.data}>
            <circle cx={c.x} cy={y(c.salao)} r={2.5} className="fill-azul-noite">
              <title>{tooltip("Salão", c.data, c.salao)}</title>
            </circle>
            <circle cx={c.x} cy={y(c.delivery)} r={2.5} className="fill-ambar">
              <title>{tooltip("Delivery próprio", c.data, c.delivery)}</title>
            </circle>
            <circle cx={c.x} cy={y(c.ifood)} r={2.5} fill={COR_IFOOD}>
              <title>{tooltip("iFood", c.data, c.ifood)}</title>
            </circle>
            <circle cx={c.x} cy={y(c.food99)} r={2.5} fill={COR_99FOOD} stroke="#0D1F2D" strokeWidth={0.5}>
              <title>{tooltip("99Food", c.data, c.food99)}</title>
            </circle>
            <circle cx={c.x} cy={y(c.total)} r={3} className="fill-azul-petroleo">
              <title>{tooltip("Faturamento total", c.data, c.total)}</title>
            </circle>
          </g>
        ))}

        {segundas.map((c) => (
          <text
            key={`data-${c.data}`}
            x={c.x}
            y={H - 8}
            textAnchor="middle"
            className="fill-cinza-medio text-[9px] font-semibold"
          >
            {dataBR(c.data)}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-4 text-xs text-cinza">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-azul-petroleo" /> Faturamento total
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed border-azul-noite" /> Salão
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-ambar" /> Delivery próprio
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ backgroundColor: COR_IFOOD }} /> iFood
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-[3px] border-dotted" style={{ borderColor: COR_99FOOD }} /> 99Food
        </span>
      </div>
    </div>
  );
}
