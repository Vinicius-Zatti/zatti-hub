import Link from "next/link";
import { requireGestaoGarante } from "@/lib/acesso";
import { DICA_GARANTE, hojeOperacao, percentual, situacaoNaTela } from "@/lib/garante/regras";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { ESTILO_SITUACAO } from "@/components/garante/estilos";
import { DicaCalculo } from "@/components/dica-calculo";
import { LinkVideoAjuda } from "@/components/videos-ajuda";
import { carregarAgenda } from "../dados";

/** Quadro do dia (gestão): o que está pendente, atrasado e feito, com link para
 * ver cada checklist e as fotos. Datas passadas mostram o que estava programado
 * naquele dia, inclusive de checklist que depois parou de ser usado. */
export default async function QuadroPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const acesso = await requireGestaoGarante();
  const { data: dataParam } = await searchParams;
  const hoje = hojeOperacao();
  const data = dataParam && /^\d{4}-\d{2}-\d{2}$/.test(dataParam) ? dataParam : hoje;
  const agenda = await carregarAgenda(acesso, data);
  const agora = new Date();
  const linhas = agenda.map((l) => ({ ...l, tela: situacaoNaTela(l.situacao, l.prazo, agora) }));
  const conta = (s: string) => linhas.filter((l) => l.tela === s).length;
  const resumo = [
    { s: "concluida", n: conta("concluida") },
    { s: "atrasada", n: conta("atrasada") },
    { s: "em_andamento", n: conta("em_andamento") },
    { s: "pendente", n: conta("pendente") },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">Quadro do dia</h1>
          <p className="text-sm text-cinza-medio">
            {acesso.unidadeNome} · {formatarDataBr(data)}
          </p>
          {/* Vídeo desta tela (27/10/2026), mesmo link discreto do Estoque. */}
          <div className="-ml-2">
            <LinkVideoAjuda id="garante-quadro" pergunta="Como ler o Quadro do dia?" />
          </div>
        </div>
        <form className="flex items-end gap-2">
          <label className="text-xs font-semibold text-cinza-medio">
            Data
            <input type="date" name="data" defaultValue={data} max={hoje} className="mt-1 block rounded-md border border-cinza-claro px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="rounded-md bg-azul-noite px-3 py-2 text-xs font-semibold text-branco">
            Ver
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {resumo.map((r) => (
          <div key={r.s} className="rounded-lg border border-cinza-claro bg-branco p-3">
            <p className="flex items-center gap-1">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO_SITUACAO[r.s].classe}`}>{ESTILO_SITUACAO[r.s].texto}</span>
              <DicaCalculo rotulo={`checklists ${ESTILO_SITUACAO[r.s].texto.toLowerCase()}`} texto={`Quantos checklists programados nesta data estão nesta situação. ${DICA_GARANTE.situacao}`} />
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-azul-noite">{r.n}</p>
          </div>
        ))}
      </div>

      {linhas.length === 0 ? (
        <p className="text-sm text-cinza-medio">Nenhum checklist programado nesta data.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {linhas.map((l) => (
            <div key={l.publicacaoId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cinza-claro bg-branco p-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-azul-noite">{l.modeloNome}</p>
                <p className="flex flex-wrap items-center gap-1 text-xs text-cinza-medio">
                  até {l.horarioLimite} · {l.responsavelNome ?? "qualquer pessoa"} · {percentual(l.respondidos, l.totalItens)}% feito
                  <DicaCalculo rotulo="percentual feito" texto={DICA_GARANTE.progresso} />
                  {l.foraDaMeta > 0 && (
                    <>
                      <span className="font-semibold text-vermelho">· {l.foraDaMeta} fora da meta</span>
                      <DicaCalculo rotulo="fora da meta" texto={DICA_GARANTE.foraDaMeta} />
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO_SITUACAO[l.tela].classe}`}>{ESTILO_SITUACAO[l.tela].texto}</span>
                {l.execucaoId && (
                  <Link href={`/garante/execucao/${l.execucaoId}`} className="text-xs font-semibold text-azul-petroleo underline">
                    Ver
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
