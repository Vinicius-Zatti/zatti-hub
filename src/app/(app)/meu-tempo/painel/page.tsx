import Link from "next/link";
import { requireMeuTempo } from "@/lib/acesso";
import { listarFrentesTempo, listarLancamentosTempo, listarMetasMensaisTempo, listarValoresHoraTempo } from "@/lib/banco/meu-tempo";
import { dataLocalBrasil, formatarHorasMinutos, montarPainelMensal, ultimoDiaCompetencia } from "@/lib/meu-tempo/tempo";
import type { LinhaPainelMensalTempo } from "@/lib/meu-tempo/tipos";

export const dynamic = "force-dynamic";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function competenciaAtual(): string {
  return dataLocalBrasil(new Date()).slice(0, 7);
}

function deslocarCompetencia(competencia: string, delta: number): string {
  const [anoStr, mesStr] = competencia.split("-");
  const totalMeses = Number(anoStr) * 12 + (Number(mesStr) - 1) + delta;
  const novoAno = Math.floor(totalMeses / 12);
  const novoMes = (totalMeses % 12) + 1;
  return `${novoAno}-${String(novoMes).padStart(2, "0")}`;
}

function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${MESES[Number(mes) - 1]}/${ano}`;
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function MeuTempoPainelPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const acesso = await requireMeuTempo();
  const params = await searchParams;
  const competencia = params.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) ? params.mes : competenciaAtual();
  const inicioMes = `${competencia}-01`;
  const fimMes = ultimoDiaCompetencia(competencia);

  const [frentes, valoresHora, metasMensais, lancamentos] = await Promise.all([
    listarFrentesTempo(acesso.userId),
    listarValoresHoraTempo(acesso.userId),
    listarMetasMensaisTempo(acesso.userId),
    listarLancamentosTempo(acesso.userId, { de: inicioMes, ate: fimMes }),
  ]);

  // Frente ativa sempre aparece; frente desativada só aparece se teve
  // lançamento no mês (nunca esconde histórico já realizado).
  const frenteIdsComLancamento = new Set(lancamentos.map((l) => l.frenteId));
  const frentesRelevantes = frentes.filter((f) => f.ativo || frenteIdsComLancamento.has(f.id));

  const linhas = montarPainelMensal({
    frentes: frentesRelevantes,
    valoresHoraDesc: valoresHora,
    metasMensaisDesc: metasMensais,
    lancamentosEncerradosDoMes: lancamentos,
    competencia,
  });

  const frentesPagas = linhas.filter((l) => l.frente.tipo === "paga");
  const frentesProprias = linhas.filter((l) => l.frente.tipo === "propria");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-azul-noite">Painel mensal</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/meu-tempo/painel?mes=${deslocarCompetencia(competencia, -1)}`}
            className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm text-cinza hover:bg-off-white"
          >
            ← Anterior
          </Link>
          <span className="min-w-[110px] text-center text-sm font-semibold text-azul-noite">{rotuloCompetencia(competencia)}</span>
          <Link
            href={`/meu-tempo/painel?mes=${deslocarCompetencia(competencia, 1)}`}
            className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm text-cinza hover:bg-off-white"
          >
            Próximo →
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-cinza-medio">Frentes pagas</h2>
        {frentesPagas.length === 0 ? (
          <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">Nenhuma frente paga cadastrada.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {frentesPagas.map((linha) => (
              <CartaoFrentePaga key={linha.frente.id} linha={linha} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-cinza-medio">Frentes próprias</h2>
        {frentesProprias.length === 0 ? (
          <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">Nenhuma frente própria cadastrada.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {frentesProprias.map((linha) => (
              <CartaoFrentePropria key={linha.frente.id} linha={linha} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CartaoFrentePaga({ linha }: { linha: LinhaPainelMensalTempo }) {
  const percentual = linha.percentualAtingido !== null ? Math.round(linha.percentualAtingido * 100) : null;
  const larguraBarra = Math.min(100, percentual ?? 0);

  return (
    <div className="rounded-lg border border-cinza-claro bg-branco p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="font-semibold text-cinza">{linha.frente.nome}</span>
        {percentual !== null && <span className="shrink-0 font-mono text-sm font-bold text-azul-noite">{percentual}%</span>}
      </div>

      {linha.metaMinutos !== null && (
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-off-white">
          <div className={`h-full rounded-full ${larguraBarra >= 100 ? "bg-verde" : "bg-ambar"}`} style={{ width: `${larguraBarra}%` }} />
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Estatistica rotulo="Meta" valor={linha.metaMinutos !== null ? formatarHorasMinutos(linha.metaMinutos) : "-"} />
        <Estatistica rotulo="Realizado" valor={formatarHorasMinutos(linha.realizadoMinutos)} destaque />
        <Estatistica rotulo="Restante" valor={linha.restanteMinutos !== null ? formatarHorasMinutos(linha.restanteMinutos) : "-"} />
        <Estatistica rotulo="Valor equivalente" valor={linha.valorEquivalente !== null ? brl(linha.valorEquivalente) : "-"} />
      </div>
      {linha.metaMinutos === null && (
        <p className="mt-2 text-xs text-cinza-medio">Sem meta mensal cadastrada pra este mês - configure em Configurações.</p>
      )}
    </div>
  );
}

function CartaoFrentePropria({ linha }: { linha: LinhaPainelMensalTempo }) {
  return (
    <div className="rounded-lg border border-cinza-claro bg-branco p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-cinza">{linha.frente.nome}</span>
        <span className="font-mono text-sm font-bold text-azul-noite">{formatarHorasMinutos(linha.realizadoMinutos)}</span>
      </div>
    </div>
  );
}

function Estatistica({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-cinza-medio">{rotulo}</div>
      <div className={`font-mono ${destaque ? "font-semibold text-azul-noite" : "text-cinza"}`}>{valor}</div>
    </div>
  );
}
