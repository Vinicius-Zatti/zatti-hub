import Link from "next/link";
import { temPermissao } from "@/lib/acesso";
import { requireAvaliacoes } from "@/lib/avaliacoes/acesso";
import { carregarPesquisa, carregarRespostas, LIMITE_RESPOSTAS_PAINEL } from "@/lib/avaliacoes/servidor";
import {
  DICAS,
  comComentario,
  contatosComConsentimento,
  dataHoraBr,
  filtrarPorOrigem,
  formatarWhatsapp,
  intervaloPeriodo,
  lerFiltroOrigem,
  lerPeriodo,
  PERIODOS,
  resumir,
  textoMedia,
  textoNps,
  type FiltroOrigem,
  type ItemDistribuicao,
  type RespostaPainel,
} from "@/lib/avaliacoes/painel";
import { ROTULO_ORIGEM, rotuloOpcao } from "@/lib/avaliacoes/perguntas";
import { notasDoAlerta } from "@/lib/avaliacoes/alertas";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { DicaCalculo } from "@/components/dica-calculo";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { CriarPesquisa } from "@/components/avaliacoes/criar-pesquisa";
import { ExportarCsv } from "@/components/avaliacoes/exportar-csv";

const ORIGENS_FILTRO: { valor: FiltroOrigem; rotulo: string }[] = [
  { valor: "todas", rotulo: "Salão e delivery" },
  { valor: "salao", rotulo: "Salão" },
  { valor: "delivery", rotulo: "Delivery" },
];

const PILULA = "rounded-md px-3 py-1.5 text-xs font-semibold";
const PILULA_ATIVA = `${PILULA} bg-azul-noite text-branco`;
const PILULA_LIVRE = `${PILULA} border border-cinza-claro bg-branco text-azul-noite hover:border-azul-petroleo`;

/** Painel das Avaliações (gestão): médias, NPS, tempo de espera, como conheceu, comentários e
 * contatos que autorizaram, no período e na origem escolhidos. Lido pela sessão (RLS). */
export default async function PainelAvaliacoesPage({ searchParams }: { searchParams: Promise<{ periodo?: string; origem?: string }> }) {
  const acesso = await requireAvaliacoes();
  const sp = await searchParams;
  const periodo = lerPeriodo(sp.periodo);
  const origem = lerFiltroOrigem(sp.origem);
  const pesquisa = await carregarPesquisa(acesso);
  const podeEditar = temPermissao(acesso, "avaliacoes", "editar");

  if (!pesquisa) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-2xl font-bold text-azul-noite">Avaliações</h1>
        <CriarPesquisa unidadeNome={acesso.unidadeNome} podeEditar={podeEditar} />
      </div>
    );
  }

  const { de, ate, desdeIso } = intervaloPeriodo(periodo);
  const { respostas: todas, cortado } = await carregarRespostas(acesso, desdeIso);
  const respostas = filtrarPorOrigem(todas, origem);
  const r = resumir(respostas);
  const comentarios = comComentario(respostas);
  const contatos = contatosComConsentimento(respostas);
  const link = (p: string, o: FiltroOrigem) => `/avaliacoes?periodo=${p}${o === "todas" ? "" : `&origem=${o}`}`;

  const cartoes = [
    { rotulo: "Avaliações", valor: String(r.total), dica: DICAS.total, extra: `${r.porOrigem.salao} salão · ${r.porOrigem.delivery} delivery` },
    { rotulo: "Atendimento", valor: textoMedia(r.mediaAtendimento), dica: DICAS.atendimento, extra: `de 5 · ${r.respostasAtendimento} notas` },
    { rotulo: "Comida", valor: textoMedia(r.mediaComida), dica: DICAS.comida, extra: `de 5 · ${r.respostasComida} notas` },
    {
      rotulo: "NPS",
      valor: textoNps(r.nps.nps),
      dica: DICAS.nps,
      extra: `${r.nps.promotores} promotores · ${r.nps.neutros} neutros · ${r.nps.detratores} detratores`,
      destaque: true,
    },
    { rotulo: "Notas baixas", valor: String(r.notasBaixas), dica: DICAS.notasBaixas, extra: "viram alerta no WhatsApp" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">Avaliações</h1>
          <p className="text-sm text-cinza-medio">
            {pesquisa.nomeExibido} · {formatarDataBr(de)} a {formatarDataBr(ate)}
            {!pesquisa.ativa && <span className="ml-2 rounded-full bg-ambar/15 px-2 py-0.5 text-xs font-semibold text-ambar">pesquisa pausada</span>}
          </p>
        </div>
        <ExportarCsv respostas={respostas} nomeArquivo={`avaliacoes-${pesquisa.slug}-${de}-a-${ate}.csv`} />
      </div>

      <div className="flex flex-wrap gap-4">
        <nav className="flex flex-wrap gap-2" aria-label="Período">
          {PERIODOS.map((p) => (
            <Link key={p} href={link(p, origem)} aria-current={p === periodo ? "page" : undefined} className={p === periodo ? PILULA_ATIVA : PILULA_LIVRE}>
              Últimos {p} dias
            </Link>
          ))}
        </nav>
        <nav className="flex flex-wrap gap-2" aria-label="Origem">
          {ORIGENS_FILTRO.map((o) => (
            <Link key={o.valor} href={link(periodo, o.valor)} aria-current={o.valor === origem ? "page" : undefined} className={o.valor === origem ? PILULA_ATIVA : PILULA_LIVRE}>
              {o.rotulo}
            </Link>
          ))}
        </nav>
      </div>

      {cortado && (
        <p className="rounded-lg border border-ambar bg-ambar/10 p-3 text-sm text-azul-noite">
          O período tem mais de {LIMITE_RESPOSTAS_PAINEL.toLocaleString("pt-BR")} avaliações: os números usam as {LIMITE_RESPOSTAS_PAINEL.toLocaleString("pt-BR")} mais recentes. Escolha um período menor.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {cartoes.map((c) => (
          <div key={c.rotulo} className={`rounded-lg border bg-branco p-3 ${c.destaque ? "border-azul-petroleo" : "border-cinza-claro"}`}>
            <p className="flex items-center gap-1 text-xs font-semibold text-cinza-medio">
              {c.rotulo}
              <DicaCalculo rotulo={c.rotulo.toLowerCase()} texto={c.dica} />
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-azul-noite">{c.valor}</p>
            <p className="text-xs text-cinza-medio">{c.extra}</p>
          </div>
        ))}
      </div>

      {r.total === 0 ? (
        <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">
          Nenhuma avaliação neste período ainda. Imprima a arte do QR (aba Arte do QR) e deixe nas mesas e nos pedidos de delivery.
        </p>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <TabelaDistribuicao titulo="Tempo de espera" dica={DICAS.espera} itens={r.espera} />
            <TabelaDistribuicao titulo="Como conheceu" dica={DICAS.conheceu} itens={r.conheceu} />
          </div>
          {r.conheceuOutros.length > 0 && (
            <p className="text-sm text-cinza">
              <span className="font-semibold text-azul-noite">Outros lugares citados: </span>
              {r.conheceuOutros.slice(0, 20).join(" · ")}
            </p>
          )}
          <TabelaComentarios linhas={comentarios} />
          <TabelaContatos linhas={contatos} />
        </>
      )}
    </div>
  );
}

function TabelaDistribuicao({ titulo, dica, itens }: { titulo: string; dica: string; itens: ItemDistribuicao[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-bold text-azul-noite">{titulo}</h2>
      <TabelaRolavel ariaLabel={titulo}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>Resposta</Th>
              <Th align="right" larguraFixa="96px">
                Pessoas
              </Th>
              <Th align="right" larguraFixa="88px">
                <span className="inline-flex items-center gap-1">
                  %
                  <DicaCalculo rotulo={`porcentagem de ${titulo.toLowerCase()}`} texto={dica} />
                </span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.valor} className="border-b border-cinza-claro">
                <td className="px-3 py-2">{i.rotulo}</td>
                <td className="px-3 py-2 text-right">{i.quantidade}</td>
                <td className="px-3 py-2 text-right">{i.percentual}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaRolavel>
    </section>
  );
}

function TabelaComentarios({ linhas }: { linhas: RespostaPainel[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-bold text-azul-noite">Comentários ({linhas.length})</h2>
      {linhas.length === 0 ? (
        <p className="text-sm text-cinza-medio">Ninguém deixou comentário neste filtro.</p>
      ) : (
        <TabelaRolavel ariaLabel="Comentários">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th larguraFixa="128px">Data e hora</Th>
                <Th larguraFixa="88px">Origem</Th>
                <Th larguraFixa="200px">Notas</Th>
                <Th>Comentário</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className={`border-b border-cinza-claro align-top ${l.notaBaixa ? "bg-vermelho/5" : ""}`}>
                  <td className="whitespace-nowrap px-3 py-2">{dataHoraBr(l.criadoEm)}</td>
                  <td className="px-3 py-2">{ROTULO_ORIGEM[l.origem]}</td>
                  <td className="px-3 py-2 text-cinza">
                    {notasDoAlerta(l) || "-"}
                    {l.espera ? <span className="block text-xs text-cinza-medio">Espera: {rotuloOpcao("espera", l.espera)}</span> : null}
                  </td>
                  <td className="min-w-[260px] whitespace-pre-line px-3 py-2">{l.comentario}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabelaRolavel>
      )}
    </section>
  );
}

function TabelaContatos({ linhas }: { linhas: RespostaPainel[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-bold text-azul-noite">Contatos que autorizaram ({linhas.length})</h2>
      <p className="text-xs text-cinza-medio">
        Só aparece quem deixou o WhatsApp e marcou a autorização. Use só para falar sobre a avaliação; a pessoa pode pedir para apagar o número.
      </p>
      {linhas.length > 0 && (
        <TabelaRolavel ariaLabel="Contatos que autorizaram">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th larguraFixa="128px">Data e hora</Th>
                <Th larguraFixa="88px">Origem</Th>
                <Th larguraFixa="150px">WhatsApp</Th>
                <Th>Notas</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-b border-cinza-claro">
                  <td className="whitespace-nowrap px-3 py-2">{dataHoraBr(l.criadoEm)}</td>
                  <td className="px-3 py-2">{ROTULO_ORIGEM[l.origem]}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold">{l.whatsapp ? formatarWhatsapp(l.whatsapp) : ""}</td>
                  <td className="px-3 py-2 text-cinza">{notasDoAlerta(l) || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabelaRolavel>
      )}
    </section>
  );
}
