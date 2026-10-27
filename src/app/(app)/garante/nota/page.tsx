import Link from "next/link";
import { requireGestaoGarante } from "@/lib/acesso";
import { DICA_NOTA, PERIODOS_NOTA, intervaloNota, lerPeriodoNota, ordenarPorNota, textoNota } from "@/lib/garante/nota";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { DicaCalculo } from "@/components/dica-calculo";
import { LinkVideoAjuda } from "@/components/videos-ajuda";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { carregarNota, type LinhaNotaTela } from "../dados";

/** Nota (gestão): Pontualidade, Execução e Qualidade de cada checklist fechado
 * no período, por pessoa e por setor. Calculada no banco (`garante_nota`,
 * fórmula versão 1), que confere a gestão da unidade. */
export default async function NotaPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const acesso = await requireGestaoGarante();
  const { periodo: periodoParam } = await searchParams;
  const periodo = lerPeriodoNota(periodoParam);
  const { de, ate } = intervaloNota(periodo);
  const { unidade, pessoas, setores } = await carregarNota(acesso, de, ate);

  const cartoes = [
    { rotulo: "Nota", valor: textoNota(unidade?.nota), dica: DICA_NOTA.nota, destaque: true },
    { rotulo: "Pontualidade (P)", valor: textoNota(unidade?.p), dica: DICA_NOTA.p },
    { rotulo: "Execução (E)", valor: textoNota(unidade?.e), dica: DICA_NOTA.e },
    { rotulo: "Qualidade (Q)", valor: textoNota(unidade?.q), dica: DICA_NOTA.q },
    { rotulo: "Adesão", valor: unidade?.adesao === null || unidade?.adesao === undefined ? "-" : `${textoNota(unidade.adesao)}%`, dica: DICA_NOTA.adesao },
    { rotulo: "Checklists fechados", valor: String(unidade?.previstas ?? 0), dica: DICA_NOTA.previstas },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">Nota do Checklist Garante</h1>
          <p className="text-sm text-cinza-medio">
            {acesso.unidadeNome} · {formatarDataBr(de)} a {formatarDataBr(ate)}
          </p>
          {/* Vídeo desta tela (27/10/2026), mesmo link discreto do Estoque. */}
          <div className="-ml-2">
            <LinkVideoAjuda id="garante-nota" pergunta="Como ler a Nota?" />
          </div>
        </div>
        <nav className="flex gap-2" aria-label="Período">
          {PERIODOS_NOTA.map((p) => (
            <Link
              key={p}
              href={`/garante/nota?periodo=${p}`}
              aria-current={p === periodo ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                p === periodo ? "bg-azul-noite text-branco" : "border border-cinza-claro bg-branco text-azul-noite hover:border-azul-petroleo"
              }`}
            >
              Últimos {p} dias
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cartoes.map((c) => (
          <div key={c.rotulo} className={`rounded-lg border bg-branco p-3 ${c.destaque ? "border-azul-petroleo" : "border-cinza-claro"}`}>
            <p className="flex items-center gap-1 text-xs font-semibold text-cinza-medio">
              {c.rotulo}
              <DicaCalculo rotulo={c.rotulo.toLowerCase()} texto={c.dica} />
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-azul-noite">{c.valor}</p>
          </div>
        ))}
      </div>

      {(unidade?.previstas ?? 0) === 0 ? (
        <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">
          Nenhum checklist fechado neste período ainda. A nota conta só checklist concluído ou com a janela vencida (fim do dia, ou a tolerância de atraso que a gestão definiu), a partir da data em que a nota começou a valer na unidade.
        </p>
      ) : (
        <>
          <TabelaNota titulo="Por pessoa" linhas={ordenarPorNota(pessoas)} rotuloNome="Pessoa" dicaNome={DICA_NOTA.pessoa} />
          <TabelaNota titulo="Por setor" linhas={ordenarPorNota(setores)} rotuloNome="Setor" />
        </>
      )}
    </div>
  );
}

function TabelaNota({ titulo, linhas, rotuloNome, dicaNome }: { titulo: string; linhas: LinhaNotaTela[]; rotuloNome: string; dicaNome?: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-bold text-azul-noite">{titulo}</h2>
      <TabelaRolavel ariaLabel={`Nota ${titulo.toLowerCase()}`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th fixo>
                <span className="inline-flex items-center gap-1">
                  {rotuloNome}
                  {dicaNome && <DicaCalculo rotulo={rotuloNome.toLowerCase()} texto={dicaNome} />}
                </span>
              </Th>
              <ThDica rotulo="Nota" dica={DICA_NOTA.nota} />
              <ThDica rotulo="P" dica={DICA_NOTA.p} />
              <ThDica rotulo="E" dica={DICA_NOTA.e} />
              <ThDica rotulo="Q" dica={DICA_NOTA.q} />
              <ThDica rotulo="Adesão" dica={DICA_NOTA.adesao} />
              <ThDica rotulo="Concluídos" dica={DICA_NOTA.concluidos} />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={`${l.nivel}-${l.chave ?? "nenhum"}`} className="border-b border-cinza-claro">
                <td className="max-w-[220px] truncate px-3 py-2 font-semibold text-azul-noite" title={l.nome}>
                  {l.nome}
                </td>
                <td className="px-3 py-2 text-right font-display font-bold text-azul-noite">{textoNota(l.nota)}</td>
                <td className="px-3 py-2 text-right">{textoNota(l.p)}</td>
                <td className="px-3 py-2 text-right">{textoNota(l.e)}</td>
                <td className="px-3 py-2 text-right">{textoNota(l.q)}</td>
                <td className="px-3 py-2 text-right">{l.adesao === null ? "-" : `${textoNota(l.adesao)}%`}</td>
                <td className="px-3 py-2 text-right text-cinza-medio">
                  {l.concluidas} de {l.previstas}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaRolavel>
    </section>
  );
}

function ThDica({ rotulo, dica }: { rotulo: string; dica: string }) {
  return (
    <Th align="right" larguraFixa="88px">
      <span className="inline-flex items-center gap-1">
        {rotulo}
        <DicaCalculo rotulo={rotulo.toLowerCase()} texto={dica} />
      </span>
    </Th>
  );
}
