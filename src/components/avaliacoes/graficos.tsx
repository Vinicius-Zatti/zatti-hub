import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { textoMedia, type ItemDistribuicao, type MediaPergunta, type PontoDia, type calcularNps } from "@/lib/avaliacoes/painel";

// Gráficos do painel das Avaliações (14/11/2026, pedido do Vinícius: "algo mais dinâmico, um gráfico,
// não só os quadrados"). SVG e barras em HTML, sem biblioteca; passar o mouse mostra o número.
// Cores pelos tokens do app (o modo escuro já troca): azul para volume, vermelho só para nota baixa
// e detrator, verde só para promotor, sempre com o nome escrito ao lado.

const DIA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function curta(dia: string): string {
  return formatarDataBr(dia).slice(0, 5);
}

/** Avaliações por dia, em colunas; a parte vermelha de cada coluna são as notas baixas do dia. */
export function GraficoDiario({ dias }: { dias: PontoDia[] }) {
  const W = 600;
  const H = 170;
  const BASE = 24;
  const TOPO = 14;
  const util = H - BASE - TOPO;
  const max = Math.max(1, ...dias.map((d) => d.total));
  const passo = W / dias.length;
  const largura = Math.max(2, Math.min(28, passo - 2));
  const y = (v: number) => (v / max) * util;
  // Marca de data: toda segunda-feira no período longo, a cada dia no de 7 dias.
  const comData = (d: string, i: number) => dias.length <= 7 || new Date(`${d}T12:00:00Z`).getUTCDay() === 1 || i === 0;
  const pico = dias.reduce((a, d) => (d.total > a.total ? d : a), dias[0]);

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label={`Avaliações por dia; pico de ${pico?.total ?? 0} em ${pico ? curta(pico.dia) : "-"}`}>
        <line x1={0} y1={H - BASE} x2={W} y2={H - BASE} className="stroke-cinza-claro" strokeWidth={1} />
        <text x={0} y={10} className="fill-cinza-medio text-[10px]">
          {max}
        </text>
        <line x1={18} y1={TOPO} x2={W} y2={TOPO} className="stroke-cinza-claro" strokeWidth={1} strokeDasharray="2,3" />
        {dias.map((d, i) => {
          const x = i * passo + (passo - largura) / 2;
          const hTotal = y(d.total);
          const hBaixa = y(d.notasBaixas);
          const semana = DIA_SEMANA[new Date(`${d.dia}T12:00:00Z`).getUTCDay()];
          return (
            <g key={d.dia}>
              <title>{`${semana} ${curta(d.dia)}: ${d.total} ${d.total === 1 ? "avaliação" : "avaliações"}${d.notasBaixas ? `, ${d.notasBaixas} com nota baixa` : ""}`}</title>
              {/* Área de toque maior que a coluna, para o número aparecer fácil. */}
              <rect x={i * passo} y={TOPO} width={passo} height={util} fill="transparent" />
              {d.total > 0 && <rect x={x} y={H - BASE - hTotal} width={largura} height={hTotal} rx={Math.min(3, largura / 2)} className="fill-azul-petroleo" />}
              {d.notasBaixas > 0 && <rect x={x} y={H - BASE - hBaixa} width={largura} height={hBaixa} className="fill-vermelho" />}
              {comData(d.dia, i) && (
                <text x={i * passo + passo / 2} y={H - 8} textAnchor="middle" className="fill-cinza-medio text-[10px]">
                  {dias.length <= 7 ? `${semana} ${curta(d.dia)}` : curta(d.dia)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-4 text-xs text-cinza">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-azul-petroleo" /> Avaliações
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-vermelho" /> Com nota baixa
        </span>
      </div>
    </div>
  );
}

/** NPS numa barra só: promotores, neutros e detratores, com o número de cada um escrito. */
export function BarraNps({ nps }: { nps: ReturnType<typeof calcularNps> }) {
  if (nps.total === 0) return <p className="text-sm text-cinza-medio">Ninguém respondeu a nota de indicação no período.</p>;
  const partes = [
    { rotulo: "Promotores (9 e 10)", n: nps.promotores, cor: "bg-verde" },
    { rotulo: "Neutros (7 e 8)", n: nps.neutros, cor: "bg-cinza-medio" },
    { rotulo: "Detratores (0 a 6)", n: nps.detratores, cor: "bg-vermelho" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="font-display text-4xl font-bold text-azul-noite">
        {nps.nps}
        <span className="ml-2 text-sm font-normal text-cinza-medio">de -100 a 100</span>
      </p>
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={partes.map((p) => `${p.rotulo}: ${p.n}`).join("; ")}>
        {partes.map((p) =>
          p.n > 0 ? (
            <div key={p.rotulo} className={p.cor} style={{ width: `${(p.n / nps.total) * 100}%` }} title={`${p.rotulo}: ${p.n} (${Math.round((p.n / nps.total) * 100)}%)`} />
          ) : null,
        )}
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {partes.map((p) => (
          <li key={p.rotulo} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-cinza">
              <span className={`h-2.5 w-2.5 rounded-sm ${p.cor}`} />
              {p.rotulo}
            </span>
            <span className="tabular-nums text-azul-noite">
              {p.n} <span className="text-cinza-medio">({Math.round((p.n / nps.total) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Média de cada pergunta de estrelas em barras de 0 a 5, da melhor para a pior. */
export function BarrasNotas({ medias }: { medias: MediaPergunta[] }) {
  const com = medias.filter((m) => m.media !== null).sort((a, b) => (b.media as number) - (a.media as number));
  if (com.length === 0) return <p className="text-sm text-cinza-medio">Nenhuma nota de estrelas no período.</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {com.map((m) => (
        <li key={m.chave} className="flex flex-col gap-1" title={`${m.nome}: média ${textoMedia(m.media)} de 5, ${m.respostas} notas`}>
          <span className="flex justify-between gap-2 text-sm">
            <span className="text-azul-noite">{m.nome}</span>
            <span className="tabular-nums font-semibold text-azul-noite">
              {textoMedia(m.media)} <span className="text-xs font-normal text-cinza-medio">· {m.respostas}</span>
            </span>
          </span>
          <span className="h-2.5 w-full rounded-full bg-cinza-claro/60">
            <span className={`block h-full rounded-full ${(m.media as number) < 3 ? "bg-vermelho" : "bg-azul-petroleo"}`} style={{ width: `${((m.media as number) / 5) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Quantas pessoas escolheram cada opção, em barras deitadas (maior primeiro). */
export function BarrasDistribuicao({ itens, vazio = "Ninguém respondeu no período." }: { itens: ItemDistribuicao[]; vazio?: string }) {
  const total = itens.reduce((a, i) => a + i.quantidade, 0);
  if (total === 0) return <p className="text-sm text-cinza-medio">{vazio}</p>;
  const max = Math.max(...itens.map((i) => i.quantidade));
  const ordem = [...itens].sort((a, b) => b.quantidade - a.quantidade);
  return (
    <ul className="flex flex-col gap-2">
      {ordem.map((i) => (
        <li key={i.valor} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-sm" title={`${i.rotulo}: ${i.quantidade} (${i.percentual}%)`}>
          <span className="truncate text-cinza">{i.rotulo}</span>
          <span className="h-2.5 rounded-full bg-cinza-claro/60">
            {i.quantidade > 0 && <span className="block h-full rounded-full bg-azul-petroleo" style={{ width: `${(i.quantidade / max) * 100}%` }} />}
          </span>
          <span className="w-16 text-right tabular-nums text-azul-noite">
            {i.quantidade} <span className="text-xs text-cinza-medio">{i.percentual}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
