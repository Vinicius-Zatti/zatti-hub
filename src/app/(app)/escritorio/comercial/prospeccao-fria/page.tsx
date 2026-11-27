import Link from "next/link";
import { DicaCalculo } from "@/components/dica-calculo";
import { TabelaProspeccaoFria } from "@/components/comercial/tabela-prospeccao-fria";
import { requireEscritorio } from "@/lib/acesso";
import { carregarProspeccaoFria } from "@/lib/banco/comercial";
import {
  ETAPAS_PAINEL,
  PERIODOS_PROSPECCAO,
  ROTULO_PERIODO_PROSPECCAO,
  inicioPeriodoProspeccao,
  lerPeriodoProspeccao,
  resumirProspeccao,
} from "@/lib/comercial/prospeccao-fria";
import { formatarDataBr, hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";

export const dynamic = "force-dynamic";

const PILULA = "rounded-md px-3 py-1.5 text-xs font-semibold";
const BASE = "/escritorio/comercial/prospeccao-fria";
const fmtPct = (v: number | null) => (v == null ? "-" : `${v.toLocaleString("pt-BR")}%`);

/** Painel da prospecção fria (16/11/2026): quantas lojas foram contatadas,
 * quantas responderam e até onde chegaram. Link estável para o relatório
 * diário: /escritorio/comercial/prospeccao-fria?periodo=hoje|7|30. */
export default async function ProspeccaoFriaPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await requireEscritorio();
  const periodo = lerPeriodoProspeccao((await searchParams).periodo);
  const hoje = hojeIsoBrasil();
  const desde = inicioPeriodoProspeccao(periodo, hoje);
  const r = resumirProspeccao(await carregarProspeccaoFria(), desde);

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Prospecção fria</h1>
        <p className="text-sm text-cinza">
          Só as lojas abordadas a frio pelo SDR (origem Prospecção fria no Comercial). Os leads que chegaram sozinhos ficam fora.
          {periodo === "hoje" ? " Contatadas hoje" : ` Contatadas de ${formatarDataBr(desde)} a ${formatarDataBr(hoje)}`}.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Período">
        {PERIODOS_PROSPECCAO.map((p) => (
          <Link
            key={p}
            href={`${BASE}?periodo=${p}`}
            aria-current={p === periodo ? "page" : undefined}
            className={p === periodo ? `${PILULA} bg-azul-noite text-branco` : `${PILULA} border border-cinza-claro bg-branco text-azul-noite hover:border-azul-petroleo`}
          >
            {ROTULO_PERIODO_PROSPECCAO[p]}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {ETAPAS_PAINEL.map((e, i) => (
          <div key={e.chave} className="rounded-xl border border-cinza-claro bg-branco p-3">
            <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-cinza-medio">
              {e.rotulo}
              <DicaCalculo rotulo={e.rotulo} texto={e.dica} />
            </p>
            <p className="font-display text-2xl font-bold text-azul-noite">{r.totais[e.chave]}</p>
            <p className="flex items-center gap-1 text-xs text-cinza-medio">
              {i === 0 ? `Etapa ${e.etapaCrm}` : `${fmtPct(r.taxas[e.chave])} de ${ETAPAS_PAINEL[i - 1].rotulo.toLowerCase()}`}
              {i > 0 && (
                <DicaCalculo
                  rotulo={`Taxa de ${e.rotulo.toLowerCase()}`}
                  texto={`${e.rotulo} ÷ ${ETAPAS_PAINEL[i - 1].rotulo} × 100, sobre as lojas contatadas no período.`}
                />
              )}
            </p>
          </div>
        ))}
        <div className="rounded-xl border border-cinza-claro bg-branco p-3">
          <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-cinza-medio">
            Perdidas
            <DicaCalculo rotulo="Perdidas" texto="Das contatadas no período, as que estão hoje em Perdido no Comercial." />
          </p>
          <p className="font-display text-2xl font-bold text-azul-noite">{r.perdidas}</p>
          <p className="flex items-center gap-1 text-xs text-cinza-medio">
            {fmtPct(r.taxaPerdidas)} das contatadas
            <DicaCalculo rotulo="Taxa de perdidas" texto="Perdidas ÷ Contatadas × 100, sobre as lojas contatadas no período." />
          </p>
        </div>
      </div>

      {r.lojas.length === 0 ? (
        <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">Nenhuma loja contatada neste período.</p>
      ) : (
        <TabelaProspeccaoFria lojas={r.lojas} hoje={hoje} />
      )}
    </div>
  );
}
