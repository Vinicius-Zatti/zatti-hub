import type { ReactNode } from "react";
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
  gerarLeitura,
  inicioAnterior,
  serieDiaria,
  intervaloPeriodo,
  lerFiltroOrigem,
  lerPeriodo,
  PERIODOS,
  resumir,
  resumirLivres,
  textoMedia,
  type ResumoLivre,
  textoNps,
  type FiltroOrigem,
  type LinhaAtendente,
  type RespostaPainel,
} from "@/lib/avaliacoes/painel";
import { ROTULO_ORIGEM, rotuloAtendente, rotuloOpcao } from "@/lib/avaliacoes/perguntas";
import { notasDoAlerta } from "@/lib/avaliacoes/alertas";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { DicaCalculo } from "@/components/dica-calculo";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { CriarPesquisa } from "@/components/avaliacoes/criar-pesquisa";
import { ExportarCsv } from "@/components/avaliacoes/exportar-csv";
import { BarraNps, BarrasDistribuicao, BarrasNotas, GraficoDiario } from "@/components/avaliacoes/graficos";

const ORIGENS_FILTRO: { valor: FiltroOrigem; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "salao", rotulo: "Salão" },
  { valor: "delivery", rotulo: "Delivery próprio" },
  { valor: "app", rotulo: "Apps de entrega" },
];

const PILULA = "rounded-md px-3 py-1.5 text-xs font-semibold";
const PILULA_ATIVA = `${PILULA} bg-azul-noite text-branco`;
const PILULA_LIVRE = `${PILULA} border border-cinza-claro bg-branco text-azul-noite hover:border-azul-petroleo`;

/** Painel das Avaliações (gestão): médias de cada pergunta, pedido certo, NPS, quem atendeu, como conheceu, comentários e
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
  // Lê também o período anterior, do mesmo tamanho, para a leitura comparar.
  const { respostas: lidas, cortado } = await carregarRespostas(acesso, inicioAnterior(periodo, de));
  const desde = new Date(desdeIso).getTime();
  const noFiltro = filtrarPorOrigem(lidas, origem);
  const respostas = noFiltro.filter((x) => new Date(x.criadoEm).getTime() >= desde);
  const r = resumir(respostas);
  // Corte de 5.000: se nem chegou ao período anterior, o atual também ficou incompleto.
  const atualCortado = cortado && !lidas.some((x) => new Date(x.criadoEm).getTime() < desde);
  const anterior = cortado ? null : resumir(noFiltro.filter((x) => new Date(x.criadoEm).getTime() < desde));
  const leitura = gerarLeitura(r, anterior);
  const dias = serieDiaria(respostas, de, ate);
  const livres = resumirLivres(
    respostas,
    pesquisa.perguntasLivres,
    pesquisa.perguntas.filter((p) => p.ativa).map((p) => p.chave),
  );
  const comentarios = comComentario(respostas);
  const contatos = contatosComConsentimento(respostas);
  const link = (p: string, o: FiltroOrigem) => `/avaliacoes?periodo=${p}${o === "todas" ? "" : `&origem=${o}`}`;

  const cartoes = [
    { rotulo: "Avaliações", valor: String(r.total), dica: DICAS.total, extra: `${r.porOrigem.salao} salão · ${r.porOrigem.delivery} delivery · ${r.porOrigem.app} apps`, destaque: false },
    ...(r.pedidoCerto.total > 0
      ? [
          {
            rotulo: "Pedido certo",
            valor: `${Math.round((r.pedidoCerto.certos / r.pedidoCerto.total) * 100)}%`,
            dica: DICAS.pedidoCerto,
            extra: `${r.pedidoCerto.total - r.pedidoCerto.certos} vieram errados ou faltando`,
            destaque: false,
          },
        ]
      : []),
    {
      rotulo: "NPS",
      valor: textoNps(r.nps.nps),
      dica: DICAS.nps,
      extra: `${r.nps.promotores} promotores · ${r.nps.neutros} neutros · ${r.nps.detratores} detratores`,
      destaque: true,
    },
    { rotulo: "Notas baixas", valor: String(r.notasBaixas), dica: DICAS.notasBaixas, extra: "viram alerta no WhatsApp", destaque: false },
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
        <ExportarCsv respostas={respostas} livres={pesquisa.perguntasLivres} nomeArquivo={`avaliacoes-${pesquisa.slug}-${de}-a-${ate}.csv`} />
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

      {atualCortado && (
        <p className="rounded-lg border border-ambar bg-ambar/10 p-3 text-sm text-azul-noite">
          O período tem mais de {LIMITE_RESPOSTAS_PAINEL.toLocaleString("pt-BR")} avaliações: os números usam as {LIMITE_RESPOSTAS_PAINEL.toLocaleString("pt-BR")} mais recentes. Escolha um período menor.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          {leitura.length > 0 && (
            <section className="rounded-lg border border-azul-petroleo/40 bg-azul-petroleo/5 p-4">
              <h2 className="flex items-center gap-1 font-display text-lg font-bold text-azul-noite">
                Leitura do período
                <DicaCalculo rotulo="leitura do período" texto={DICAS.leitura} />
              </h2>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-cinza">
                {leitura.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </section>
          )}
          <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
            <Bloco titulo="Avaliações por dia">
              <GraficoDiario dias={dias} />
            </Bloco>
            <Bloco titulo="NPS" dica={DICAS.nps}>
              <BarraNps nps={r.nps} />
            </Bloco>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Bloco titulo="Nota de cada pergunta" dica={DICAS.media}>
              <BarrasNotas medias={r.medias} />
            </Bloco>
            <Bloco titulo="Como conheceu" dica={DICAS.conheceu}>
              <BarrasDistribuicao itens={r.conheceu} />
            </Bloco>
            {r.atendentes.length > 0 && <TabelaAtendentes linhas={r.atendentes} />}
            {r.espera.some((i) => i.quantidade > 0) && (
              <Bloco titulo="Tempo de espera (pergunta antiga)" dica={DICAS.espera}>
                <BarrasDistribuicao itens={r.espera} />
              </Bloco>
            )}
          </div>
          {livres.length > 0 && <PerguntasLivres itens={livres} />}
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

function Bloco({ titulo, dica, children }: { titulo: string; dica?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-cinza-claro bg-branco p-4">
      <h2 className="flex items-center gap-1 font-display text-lg font-bold text-azul-noite">
        {titulo}
        {dica && <DicaCalculo rotulo={titulo.toLowerCase()} texto={dica} />}
      </h2>
      {children}
    </section>
  );
}

function TabelaAtendentes({ linhas }: { linhas: LinhaAtendente[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1 font-display text-lg font-bold text-azul-noite">
        Quem atendeu
        <DicaCalculo rotulo="quem atendeu" texto={DICAS.atendentes} />
      </h2>
      <TabelaRolavel ariaLabel="Quem atendeu">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>Pessoa</Th>
              <Th align="right" larguraFixa="96px">
                Avaliações
              </Th>
              <Th align="right" larguraFixa="110px">
                Atendimento
              </Th>
              <Th align="right" larguraFixa="96px">
                Indicaria
              </Th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.nome} className="border-b border-cinza-claro">
                <td className="px-3 py-2">{l.nome}</td>
                <td className="px-3 py-2 text-right">{l.quantidade}</td>
                <td className="px-3 py-2 text-right">{textoMedia(l.mediaAtendimento)}</td>
                <td className="px-3 py-2 text-right">{textoMedia(l.mediaIndicaria)}</td>
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
                    {l.atendente ? <span className="block text-xs text-cinza-medio">Atendido por: {rotuloAtendente(l.atendente)}</span> : null}
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

/** Perguntas criadas pela gestão: média, % de sim, opções ou o que escreveram. */
function PerguntasLivres({ itens }: { itens: ResumoLivre[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-bold text-azul-noite">Suas perguntas</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {itens.map((p) => (
          <div key={p.chave} className="rounded-lg border border-cinza-claro bg-branco p-3 text-sm">
            <p className="font-semibold text-azul-noite">{p.texto}</p>
            <p className="text-xs text-cinza-medio">{p.respostas === 1 ? "1 resposta" : `${p.respostas} respostas`}</p>
            {p.respostas === 0 ? null : p.tipo === "estrelas" ? (
              <div className="mt-2">
                <BarrasNotas medias={[{ chave: "atendimento", nome: "Média", media: p.media, respostas: p.respostas }]} />
              </div>
            ) : p.tipo === "simnao" ? (
              <div className="mt-2">
                <BarrasDistribuicao
                  itens={[
                    { valor: "sim", rotulo: "Sim", quantidade: p.sim, percentual: Math.round((p.sim / p.respostas) * 100) },
                    { valor: "nao", rotulo: "Não", quantidade: p.respostas - p.sim, percentual: 100 - Math.round((p.sim / p.respostas) * 100) },
                  ]}
                />
              </div>
            ) : p.tipo === "escolha" ? (
              <div className="mt-2">
                <BarrasDistribuicao itens={p.opcoes} />
              </div>
            ) : (
              <ul className="mt-1 list-disc pl-5 text-cinza">
                {p.textos.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
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
