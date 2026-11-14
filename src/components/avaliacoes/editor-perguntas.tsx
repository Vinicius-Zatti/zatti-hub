"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { salvarExtrasParcialAction, salvarPerguntasAction } from "@/app/(app)/avaliacoes/actions";
import {
  LIMITE_ATENDENTES,
  LIMITE_LIVRES,
  LIMITE_NOME_ATENDENTE,
  LIMITE_OPCOES,
  LIMITE_TEXTO_OPCAO,
  LIMITE_TEXTO_PERGUNTA,
  ROTULO_ORIGEM,
  TEXTO_COMENTARIO_OTIMO,
  TEXTO_COMENTARIO_RUIM,
  alternarNaOrigem,
  definicaoDe,
  ehChaveLivre,
  moverNaOrigem,
  novaChaveLivre,
  origensDaPergunta,
  origensPossiveis,
  type ChavePergunta,
  type Origem,
  type PerguntaConfig,
  type TipoLivre,
} from "@/lib/avaliacoes/perguntas";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, Interruptor, MiniResposta, NOME_TIPO, ROTULO } from "./ui";

// Perguntas da pesquisa (14/11/2026), no padrão do checklist do Garante e do editor do Falaê: uma
// lista por tipo de pesquisa, cada pergunta com o próprio liga e desliga, editar, subir e descer, e
// "Adicionar pergunta" com o tipo de resposta. Cada mudança salva na hora (vira uma versão nova; as
// avaliações antigas ficam na versão em que foram respondidas).

type Janela = { tipo: "editar"; chave: ChavePergunta } | { tipo: "nova" } | { tipo: "apagar"; chave: ChavePergunta } | null;

const TIPOS_NOVA: { tipo: TipoLivre; titulo: string; exemplo: string }[] = [
  { tipo: "estrelas", titulo: "Estrelas de 1 a 5", exemplo: "E o preço, o que achou?" },
  { tipo: "simnao", titulo: "Sim ou não", exemplo: "Você pediria de novo?" },
  { tipo: "escolha", titulo: "Lista de opções", exemplo: "Qual foi o seu burger?" },
  { tipo: "texto", titulo: "Texto livre", exemplo: "Que prato você quer ver no cardápio?" },
];

export function EditorPerguntas({
  perguntas,
  origens,
  atendentes,
  podeEditar,
}: {
  perguntas: PerguntaConfig[];
  /** Tipos de pesquisa ligados. */
  origens: Origem[];
  atendentes: string[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [origem, setOrigem] = useState<Origem>(origens[0] ?? "salao");
  const [lista, setLista] = useState(perguntas);
  // A lista do servidor mudou (depois de salvar): começa dela de novo.
  const [base, setBase] = useState(perguntas);
  if (perguntas !== base) {
    setBase(perguntas);
    setLista(perguntas);
  }
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ erro: boolean; texto: string } | null>(null);
  const [janela, setJanela] = useState<Janela>(null);
  const [erroJanela, setErroJanela] = useState<string | null>(null);

  const origemValida = origens.includes(origem) ? origem : (origens[0] ?? "salao");
  const ativas = lista.filter((p) => p.chave !== "comentario" && origensDaPergunta(p).includes(origemValida));
  const comentario = lista.find((p) => p.chave === "comentario");
  const desligadas = lista.filter(
    (p) => p.chave !== "comentario" && origensPossiveis(p.chave).includes(origemValida) && !origensDaPergunta(p).includes(origemValida),
  );
  const livres = lista.filter((p) => ehChaveLivre(p.chave)).length;

  function salvar(nova: PerguntaConfig[], mensagem: string) {
    const anterior = lista;
    const comJanela = janela !== null;
    setLista(nova);
    setAviso(null);
    setErroJanela(null);
    startTransition(async () => {
      const r = await salvarPerguntasAction(nova);
      if ("erro" in r) {
        setLista(anterior);
        if (comJanela) setErroJanela(r.erro);
        else setAviso({ erro: true, texto: r.erro });
        return;
      }
      setJanela(null);
      setAviso({ erro: false, texto: mensagem });
      router.refresh();
    });
  }

  function trocar(chave: ChavePergunta, nova: PerguntaConfig): PerguntaConfig[] {
    return lista.map((p) => (p.chave === chave ? nova : p));
  }

  function abrir(j: Janela) {
    setErroJanela(null);
    setJanela(j);
  }

  const emEdicao = janela?.tipo === "editar" || janela?.tipo === "apagar" ? lista.find((p) => p.chave === janela.chave) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {origens.length > 1 && (
        <div className="flex flex-wrap gap-1 rounded-lg bg-off-white p-1" role="tablist" aria-label="Tipo de pesquisa">
          {origens.map((o) => {
            const quantas = lista.filter((p) => p.chave !== "comentario" && origensDaPergunta(p).includes(o)).length;
            return (
              <button
                key={o}
                type="button"
                role="tab"
                aria-selected={o === origemValida}
                onClick={() => setOrigem(o)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${o === origemValida ? "bg-branco text-azul-noite shadow" : "text-cinza hover:text-azul-noite"}`}
              >
                {ROTULO_ORIGEM[o]} <span className="text-xs font-normal text-cinza-medio">({quantas})</span>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-sm text-cinza">
        É a ordem em que o cliente vê, uma pergunta por tela. O que você muda aqui vale só para{" "}
        <strong className="text-azul-noite">{ROTULO_ORIGEM[origemValida].toLowerCase()}</strong> e salva na hora.
      </p>
      {(pendente || aviso) && (
        <p role="status" className={`text-sm font-semibold ${pendente ? "text-cinza-medio" : aviso?.erro ? "text-vermelho" : "text-verde"}`}>
          {pendente ? "Salvando..." : aviso?.texto}
        </p>
      )}

      <ol className="flex flex-col gap-2">
        {ativas.map((p, i) => (
          <CartaoPergunta
            key={p.chave}
            p={p}
            numero={i + 1}
            origem={origemValida}
            origensLigadas={origens}
            atendentes={atendentes}
            podeEditar={podeEditar}
            pendente={pendente}
            primeira={i === 0}
            ultima={i === ativas.length - 1}
            aoMover={(d) => salvar(moverNaOrigem(lista, p.chave, origemValida, d), "Ordem salva.")}
            aoLigar={(v) => salvar(trocar(p.chave, alternarNaOrigem(p, origemValida, v)), v ? "Pergunta ligada." : "Pergunta desligada.")}
            aoEditar={() => abrir({ tipo: "editar", chave: p.chave })}
          />
        ))}
        {comentario && (
          <li className="rounded-xl border border-cinza-claro bg-branco p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Última tela, sempre · Texto livre · opcional</p>
                <p className="mt-1 font-semibold text-azul-noite">A pergunta muda com a nota que o cliente deu</p>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-cinza">
                  <li>
                    <span className="font-semibold text-azul-noite">Nota 0 a 6:</span> {TEXTO_COMENTARIO_RUIM} (e pede o WhatsApp)
                  </li>
                  <li>
                    <span className="font-semibold text-azul-noite">Nota 7 ou 8:</span> {comentario.texto}
                  </li>
                  <li>
                    <span className="font-semibold text-azul-noite">Nota 9 ou 10:</span> {TEXTO_COMENTARIO_OTIMO}
                  </li>
                </ul>
              </div>
              {podeEditar && (
                <div className="flex items-center gap-2">
                  <Interruptor
                    ligado={origensDaPergunta(comentario).includes(origemValida)}
                    aoMudar={(v) => salvar(trocar("comentario", alternarNaOrigem(comentario, origemValida, v)), v ? "Comentário ligado." : "Comentário desligado.")}
                    rotulo="Comentário no fim da pesquisa"
                    desabilitado={pendente}
                  />
                  <button type="button" onClick={() => abrir({ tipo: "editar", chave: "comentario" })} className={BOTAO_SECUNDARIO}>
                    Editar
                  </button>
                </div>
              )}
            </div>
          </li>
        )}
      </ol>

      {podeEditar && (
        <button
          type="button"
          disabled={pendente || livres >= LIMITE_LIVRES}
          onClick={() => abrir({ tipo: "nova" })}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 border-dashed border-azul-petroleo/50 text-sm font-semibold text-azul-petroleo hover:bg-azul-petroleo/5 disabled:opacity-40"
        >
          <span className="text-lg leading-none">+</span>
          {livres >= LIMITE_LIVRES ? `Você já criou ${LIMITE_LIVRES} perguntas (o máximo)` : "Adicionar pergunta"}
        </button>
      )}

      {desligadas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-cinza-medio">Desligadas em {ROTULO_ORIGEM[origemValida].toLowerCase()} ({desligadas.length})</h3>
          <ul className="flex flex-col gap-2">
            {desligadas.map((p) => (
              <li key={p.chave} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-cinza-claro bg-off-white/60 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-cinza">{p.texto}</p>
                  <p className="text-xs text-cinza-medio">
                    {NOME_TIPO[definicaoDe(p).tipo]}
                    {ehChaveLivre(p.chave) ? " · sua pergunta" : ""}
                    {p.chave === "atendente" && atendentes.length === 0 ? " · cadastre os nomes de quem atende em Editar" : ""}
                  </p>
                </div>
                {podeEditar && (
                  <div className="flex items-center gap-2">
                    <Interruptor
                      ligado={false}
                      aoMudar={() => salvar(trocar(p.chave, alternarNaOrigem(p, origemValida, true)), "Pergunta ligada.")}
                      rotulo={`Ligar: ${p.texto}`}
                      desabilitado={pendente}
                    />
                    <button type="button" onClick={() => abrir({ tipo: "editar", chave: p.chave })} className={BOTAO_SECUNDARIO}>
                      Editar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ModalFlutuante aberto={janela !== null} onFechar={() => !pendente && setJanela(null)}>
        {janela?.tipo === "nova" && (
          <FormPergunta
            key="nova"
            inicial={null}
            origemAtual={origemValida}
            origensLigadas={origens}
            atendentes={atendentes}
            erro={erroJanela}
            pendente={pendente}
            aoSalvar={(p) => {
              const nova = { ...p, chave: novaChaveLivre(lista.map((q) => q.chave)) };
              const fim = lista.findIndex((q) => q.chave === "comentario");
              salvar(fim >= 0 ? [...lista.slice(0, fim), nova, ...lista.slice(fim)] : [...lista, nova], "Pergunta criada.");
            }}
            aoCancelar={() => setJanela(null)}
          />
        )}
        {janela?.tipo === "editar" && emEdicao && (
          <FormPergunta
            key={emEdicao.chave}
            inicial={emEdicao}
            origemAtual={origemValida}
            origensLigadas={origens}
            atendentes={atendentes}
            erro={erroJanela}
            pendente={pendente}
            aoSalvar={(p) => salvar(trocar(emEdicao.chave, p), "Pergunta salva.")}
            aoApagar={ehChaveLivre(emEdicao.chave) ? () => abrir({ tipo: "apagar", chave: emEdicao.chave }) : undefined}
            aoCancelar={() => setJanela(null)}
          />
        )}
        {janela?.tipo === "apagar" && emEdicao && (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-bold text-azul-noite">Apagar esta pergunta?</h2>
            <p className="text-sm text-azul-noite">&quot;{emEdicao.texto}&quot;</p>
            <ul className="list-disc pl-5 text-sm text-cinza">
              <li>Sai da pesquisa de todos os tipos (salão, delivery e apps).</li>
              <li>As respostas que já chegaram continuam no painel e no CSV.</li>
            </ul>
            {erroJanela && <p className="text-sm text-vermelho">{erroJanela}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pendente}
                onClick={() => salvar(lista.filter((p) => p.chave !== emEdicao.chave), "Pergunta apagada.")}
                className="rounded-md bg-vermelho px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60"
              >
                {pendente ? "Apagando..." : "Apagar a pergunta"}
              </button>
              <button type="button" onClick={() => setJanela(null)} className={BOTAO_SECUNDARIO}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </ModalFlutuante>
    </div>
  );
}

function CartaoPergunta({
  p,
  numero,
  origem,
  origensLigadas,
  atendentes,
  podeEditar,
  pendente,
  primeira,
  ultima,
  aoMover,
  aoLigar,
  aoEditar,
}: {
  p: PerguntaConfig;
  numero: number;
  origem: Origem;
  origensLigadas: Origem[];
  atendentes: string[];
  podeEditar: boolean;
  pendente: boolean;
  primeira: boolean;
  ultima: boolean;
  aoMover: (d: "subir" | "descer") => void;
  aoLigar: (v: boolean) => void;
  aoEditar: () => void;
}) {
  const def = definicaoDe(p);
  const tambem = origensDaPergunta(p).filter((o) => o !== origem && origensLigadas.includes(o));
  return (
    <li className="flex gap-3 rounded-xl border border-cinza-claro bg-branco p-3 md:p-4">
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-azul-noite text-xs font-bold text-branco">{numero}</span>
        {podeEditar && (
          <>
            <button type="button" disabled={pendente || primeira} onClick={() => aoMover("subir")} className="rounded border border-cinza-claro px-1.5 text-xs disabled:opacity-25" aria-label={`Subir: ${p.texto}`}>
              ↑
            </button>
            <button type="button" disabled={pendente || ultima} onClick={() => aoMover("descer")} className="rounded border border-cinza-claro px-1.5 text-xs disabled:opacity-25" aria-label={`Descer: ${p.texto}`}>
              ↓
            </button>
          </>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">
              {NOME_TIPO[def.tipo]} · {def.obrigatoria ? "obrigatória" : "opcional"}
              {def.livre && <span className="ml-1 rounded bg-azul-petroleo/10 px-1 text-azul-petroleo">sua pergunta</span>}
            </p>
            <p className="mt-0.5 font-semibold leading-snug text-azul-noite">{p.texto}</p>
            {def.ajuda && <p className="text-xs text-cinza-medio">{def.ajuda}</p>}
          </div>
          {podeEditar && (
            <div className="flex items-center gap-2">
              <Interruptor ligado aoMudar={aoLigar} rotulo={`Desligar: ${p.texto}`} desabilitado={pendente} />
              <button type="button" onClick={aoEditar} className={BOTAO_SECUNDARIO}>
                Editar
              </button>
            </div>
          )}
        </div>
        <MiniResposta tipo={def.tipo} opcoes={def.opcoes?.map((o) => o.rotulo)} chave={p.chave} />
        {p.chave === "atendente" && (
          <p className="text-xs text-cinza-medio">
            {atendentes.length ? `Nomes: ${atendentes.join(", ")}` : "Sem nomes cadastrados, a pergunta não aparece. Cadastre em Editar."}
          </p>
        )}
        {tambem.length > 0 && <p className="text-xs text-cinza-medio">Também em: {tambem.map((o) => ROTULO_ORIGEM[o]).join(", ")}</p>}
      </div>
    </li>
  );
}

/** Criar ou editar uma pergunta: texto (com prévia), opções, obrigatória e em que pesquisas
 * aparece. Nas do modelo, só o texto e as pesquisas mudam. */
function FormPergunta({
  inicial,
  origemAtual,
  origensLigadas,
  atendentes,
  erro,
  pendente,
  aoSalvar,
  aoApagar,
  aoCancelar,
}: {
  inicial: PerguntaConfig | null;
  origemAtual: Origem;
  origensLigadas: Origem[];
  atendentes: string[];
  erro: string | null;
  pendente: boolean;
  aoSalvar: (p: PerguntaConfig) => void;
  aoApagar?: () => void;
  aoCancelar: () => void;
}) {
  const livre = inicial === null || ehChaveLivre(inicial.chave);
  const def = inicial ? definicaoDe(inicial) : null;
  const possiveis = inicial ? origensPossiveis(inicial.chave) : origensLigadas;
  const [tipo, setTipo] = useState<TipoLivre | null>(inicial?.tipo ?? null);
  const [texto, setTexto] = useState(inicial?.texto ?? "");
  const [opcoes, setOpcoes] = useState<string[]>(inicial?.opcoes?.length ? inicial.opcoes : ["", ""]);
  const [obrigatoria, setObrigatoria] = useState(inicial?.obrigatoria ?? false);
  const [onde, setOnde] = useState<Origem[]>(inicial ? (origensDaPergunta(inicial).length ? origensDaPergunta(inicial) : [origemAtual]) : [origemAtual]);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const tipoResposta = livre ? tipo : (def?.tipo ?? null);

  if (livre && tipo === null) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold text-azul-noite">Nova pergunta: como o cliente responde?</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {TIPOS_NOVA.map((t) => (
            <button
              key={t.tipo}
              type="button"
              onClick={() => setTipo(t.tipo)}
              className="flex flex-col gap-2 rounded-xl border-2 border-cinza-claro bg-branco p-3 text-left hover:border-azul-petroleo"
            >
              <span className="text-sm font-bold text-azul-noite">{t.titulo}</span>
              <MiniResposta tipo={t.tipo} opcoes={t.tipo === "escolha" ? ["Opção 1", "Opção 2", "Opção 3"] : undefined} />
              <span className="text-xs text-cinza-medio">Ex.: {t.exemplo}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={aoCancelar} className={`${BOTAO_SECUNDARIO} self-start`}>
          Cancelar
        </button>
      </div>
    );
  }

  function confirmar() {
    setErroLocal(null);
    const t = texto.trim();
    if (t.length < 3) return setErroLocal("Escreva a pergunta (pelo menos 3 letras).");
    const marcadas = possiveis.filter((o) => (origensLigadas.includes(o) ? onde.includes(o) : (inicial?.origens ?? possiveis).includes(o)));
    if (livre) {
      if (marcadas.length === 0) return setErroLocal("Escolha pelo menos uma pesquisa em que ela aparece.");
      const lista = opcoes.map((o) => o.trim()).filter(Boolean);
      if (tipo === "escolha" && lista.length < 2) return setErroLocal("Coloque pelo menos 2 opções.");
      aoSalvar({
        chave: inicial?.chave ?? "extra_novo00",
        texto: t,
        ativa: true,
        origens: marcadas,
        tipo: tipo ?? "estrelas",
        obrigatoria,
        ...(tipo === "escolha" ? { opcoes: lista } : {}),
      });
      return;
    }
    if (!inicial) return;
    if (marcadas.length === 0) return aoSalvar({ chave: inicial.chave, texto: t, ativa: false });
    if (marcadas.length === possiveis.length) return aoSalvar({ chave: inicial.chave, texto: t, ativa: true });
    aoSalvar({ chave: inicial.chave, texto: t, ativa: true, origens: marcadas });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        confirmar();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-azul-noite">{inicial ? "Editar pergunta" : "Nova pergunta"}</h2>
        <span className="rounded-full bg-off-white px-2 py-0.5 text-xs font-semibold text-cinza">{tipoResposta ? NOME_TIPO[tipoResposta] : ""}</span>
      </div>

      <label className={ROTULO}>
        {inicial?.chave === "comentario" ? "Pergunta para quem deu 7 ou 8" : "Pergunta"}
        <textarea className={CAMPO} rows={2} value={texto} maxLength={LIMITE_TEXTO_PERGUNTA} autoFocus onChange={(e) => setTexto(e.target.value)} placeholder="Escreva como você falaria com o cliente" />
      </label>
      {inicial?.chave === "comentario" && (
        <p className="-mt-2 text-xs text-cinza-medio">
          Para nota 0 a 6 a página pergunta &quot;{TEXTO_COMENTARIO_RUIM}&quot; e para 9 ou 10, &quot;{TEXTO_COMENTARIO_OTIMO}&quot;.
        </p>
      )}

      {livre && tipo === "escolha" && (
        <fieldset className="flex flex-col gap-2">
          <legend className={ROTULO}>Opções (de 2 a {LIMITE_OPCOES})</legend>
          {opcoes.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="w-full rounded-md border border-cinza-claro bg-branco px-3 py-2 text-sm"
                value={o}
                maxLength={LIMITE_TEXTO_OPCAO}
                placeholder={`Opção ${i + 1}`}
                onChange={(e) => setOpcoes(opcoes.map((x, j) => (j === i ? e.target.value : x)))}
                aria-label={`Opção ${i + 1}`}
              />
              <button
                type="button"
                disabled={opcoes.length <= 2}
                onClick={() => setOpcoes(opcoes.filter((_, j) => j !== i))}
                className="rounded-md border border-cinza-claro px-3 text-sm text-cinza disabled:opacity-30"
                aria-label={`Tirar a opção ${i + 1}`}
              >
                ×
              </button>
            </div>
          ))}
          {opcoes.length < LIMITE_OPCOES && (
            <button type="button" onClick={() => setOpcoes([...opcoes, ""])} className="self-start text-sm font-semibold text-azul-petroleo">
              + Adicionar opção
            </button>
          )}
        </fieldset>
      )}

      {livre && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-cinza-claro p-3">
          <div>
            <p className="text-sm font-semibold text-azul-noite">Resposta obrigatória</p>
            <p className="text-xs text-cinza-medio">{obrigatoria ? "O cliente só passa depois de responder." : "O cliente pode pular."}</p>
          </div>
          <Interruptor ligado={obrigatoria} aoMudar={setObrigatoria} rotulo="Resposta obrigatória" mostrarTexto={false} />
        </div>
      )}

      {origensLigadas.filter((o) => possiveis.includes(o)).length > 0 && (
        <fieldset>
          <legend className={ROTULO}>Aparece na pesquisa de</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {origensLigadas
              .filter((o) => possiveis.includes(o))
              .map((o) => (
                <label key={o} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${onde.includes(o) ? "border-azul-petroleo bg-azul-petroleo/5 text-azul-noite" : "border-cinza-claro text-cinza"}`}>
                  <input type="checkbox" checked={onde.includes(o)} onChange={(e) => setOnde(e.target.checked ? [...onde, o] : onde.filter((x) => x !== o))} />
                  {ROTULO_ORIGEM[o]}
                </label>
              ))}
          </div>
          {!livre && possiveis.length < 3 && <p className="mt-1 text-xs text-cinza-medio">Esta pergunta só faz sentido em: {possiveis.map((o) => ROTULO_ORIGEM[o]).join(", ")}.</p>}
        </fieldset>
      )}

      {inicial?.chave === "atendente" && <NomesAtendentes atuais={atendentes} />}

      <div className="rounded-xl bg-off-white p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Como o cliente vê</p>
        <p className="mt-1 font-semibold text-azul-noite">{texto.trim() || "Sua pergunta aparece aqui"}</p>
        {tipoResposta && (
          <div className="mt-2">
            <MiniResposta
              tipo={tipoResposta}
              chave={inicial?.chave}
              opcoes={livre ? opcoes.map((o) => o.trim()).filter(Boolean) : def?.opcoes?.map((o) => o.rotulo)}
            />
          </div>
        )}
      </div>

      {(erroLocal || erro) && <p className="text-sm text-vermelho">{erroLocal ?? erro}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? "Salvando..." : inicial ? "Salvar" : "Criar pergunta"}
        </button>
        <button type="button" onClick={aoCancelar} className={BOTAO_SECUNDARIO}>
          Cancelar
        </button>
        {!inicial && (
          <button type="button" onClick={() => setTipo(null)} className="text-sm font-semibold text-azul-petroleo">
            Trocar o tipo
          </button>
        )}
        {aoApagar && (
          <button type="button" onClick={aoApagar} className="ml-auto text-sm font-semibold text-vermelho">
            Apagar pergunta
          </button>
        )}
      </div>
    </form>
  );
}

/** Nomes de quem atende no salão (a pergunta "quem atendeu" mostra estes nomes + "não lembro"). */
function NomesAtendentes({ atuais }: { atuais: string[] }) {
  const router = useRouter();
  const [nomes, setNomes] = useState<string[]>(atuais);
  const [novo, setNovo] = useState("");
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ erro: boolean; texto: string } | null>(null);
  const mudou = nomes.join("|") !== atuais.join("|");

  function adicionar() {
    const n = novo.replace(/\s+/g, " ").trim();
    if (!n || nomes.some((x) => x.toLowerCase() === n.toLowerCase())) return setNovo("");
    setNomes([...nomes, n]);
    setNovo("");
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-cinza-claro p-3">
      <p className="text-sm font-semibold text-azul-noite">Quem atende no salão</p>
      <div className="flex flex-wrap gap-1.5">
        {nomes.map((n) => (
          <span key={n} className="flex items-center gap-1 rounded-full bg-off-white py-1 pl-3 pr-1 text-sm text-azul-noite">
            {n}
            <button type="button" onClick={() => setNomes(nomes.filter((x) => x !== n))} className="rounded-full px-1.5 text-cinza hover:text-vermelho" aria-label={`Tirar ${n}`}>
              ×
            </button>
          </span>
        ))}
        {nomes.length === 0 && <span className="text-xs text-cinza-medio">Nenhum nome ainda.</span>}
      </div>
      {nomes.length < LIMITE_ATENDENTES && (
        <div className="flex gap-2">
          <input
            className="w-full rounded-md border border-cinza-claro bg-branco px-3 py-2 text-sm"
            value={novo}
            maxLength={LIMITE_NOME_ATENDENTE}
            placeholder="Nome (ex.: Carla)"
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                adicionar();
              }
            }}
          />
          <button type="button" onClick={adicionar} className={BOTAO_SECUNDARIO}>
            Incluir
          </button>
        </div>
      )}
      {mudou && (
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            startTransition(async () => {
              const r = await salvarExtrasParcialAction({ atendentes: nomes });
              if ("erro" in r) return setAviso({ erro: true, texto: r.erro });
              setAviso({ erro: false, texto: "Nomes salvos." });
              router.refresh();
            })
          }
          className={`${BOTAO_PRIMARIO} self-start`}
        >
          {pendente ? "Salvando..." : "Salvar os nomes"}
        </button>
      )}
      {aviso && <p className={`text-xs font-semibold ${aviso.erro ? "text-vermelho" : "text-verde"}`}>{aviso.texto}</p>}
    </div>
  );
}
