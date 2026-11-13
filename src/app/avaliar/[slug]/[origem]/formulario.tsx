"use client";

import { useActionState, useEffect, useRef, useState, type CSSProperties } from "react";
import { enviarAvaliacaoAction, type EstadoAvaliacao } from "../../acoes";
import { RoletaPremios } from "./roleta";
import type { PremioPublico } from "@/lib/avaliacoes/roleta";
import { COR_ESTRELA, contraste, corDaNotaNps, corTextoSobre } from "@/lib/avaliacoes/marca";
import {
  LIMITE_COMENTARIO,
  LIMITE_CONHECEU_OUTRO,
  NAO_LEMBRO,
  TEXTO_COMENTARIO_OTIMO,
  TEXTO_COMENTARIO_RUIM,
  ehNotaBaixa,
  humorDaAvaliacao,
  type NotasAvaliacao,
  type Origem,
  type PerguntaPublica,
} from "@/lib/avaliacoes/perguntas";

// Página pública nova (13/11/2026), modelada no Falaê: capa da marca, uma pergunta por tela (tocou,
// passou), e no fim o comentário que muda com a nota. Nota baixa pede o WhatsApp para a equipe
// falar com a pessoa; o botão do Google aparece para TODOS (pedir só para quem gostou é proibido
// pelo Google), com o comentário já copiado e mais destaque para quem deu 9 ou 10.

const CHAVE_APARELHO = "zh_avaliacao_aparelho";

/** Identificador aleatório do aparelho (antispam). Sem armazenamento, um novo a cada envio: o
 * servidor cai no limite por IP. */
function idDoAparelho(): string {
  const novo = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-zh`);
  try {
    const guardado = window.localStorage.getItem(CHAVE_APARELHO);
    if (guardado && /^[A-Za-z0-9-]{16,64}$/.test(guardado)) return guardado;
    const id = novo();
    window.localStorage.setItem(CHAVE_APARELHO, id);
    return id;
  } catch {
    return novo();
  }
}

type Props = {
  slug: string;
  origem: Origem;
  nome: string;
  logoUrl: string | null;
  corPrincipal: string;
  corFundo: string;
  agradecimento: string;
  linkGoogle: string | null;
  linkPedidoDireto: string | null;
  /** Prêmios da roleta (vazio = sem roleta). Só no fim da pesquisa dos apps. */
  roleta: PremioPublico[];
  perguntas: PerguntaPublica[];
  atendentes: string[];
  termoVersao: number;
  termoTexto: string;
};

const ROTULO_ESTRELAS = ["", "Péssimo", "Ruim", "Regular", "Bom", "Excelente"];
const PAUSA_AUTOMATICA_MS = 380;

/** Tempo desde a abertura da página (o banco descarta envio em menos de 4 s: robô). */
function msDesde(inicio: number): number {
  return Date.now() - inicio;
}

function Estrela({ cheia, contorno }: { cheia: boolean; contorno: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-14 w-14 transition-transform duration-150 ${cheia ? "scale-110" : "scale-100"}`}
      fill={cheia ? COR_ESTRELA : "none"}
      stroke={cheia ? COR_ESTRELA : contorno}
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
    </svg>
  );
}

function Logo({ url, nome, tamanho, corFundo }: { url: string | null; nome: string; tamanho: number; corFundo: string }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white"
      style={{ width: tamanho, height: tamanho, boxShadow: tamanho > 60 ? `0 0 0 6px ${corFundo}22, 0 18px 40px rgba(0,0,0,0.20)` : "0 0 0 2px rgba(0,0,0,0.12)" }}
    >
      {url ? (
        // Logo do bucket público da unidade (até 300 KB); tamanho livre, por isso <img>.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={tamanho > 60 ? nome : ""} className="h-full w-full object-cover" />
      ) : (
        <span className="px-2 text-center text-xs font-bold leading-tight text-[#111111]">{nome}</span>
      )}
    </div>
  );
}

export function FormularioAvaliacao(p: Props) {
  const [estado, acao, pendente] = useActionState<EstadoAvaliacao, FormData>(enviarAvaliacaoAction, {});
  const [passo, setPasso] = useState(-1);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [outro, setOutro] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [consentimento, setConsentimento] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const inicio = useRef(0);
  const avanco = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    inicio.current = Date.now();
    return () => {
      if (avanco.current) clearTimeout(avanco.current);
    };
  }, []);

  // Cores: a principal pinta a capa e a faixa do topo; o que a pessoa toca usa a "tinta" (preto ou
  // branco, o que contrastar mais com o fundo). O botão leva a cor principal no texto quando dá
  // para ler; senão, a cor do fundo.
  const textoCapa = corTextoSobre(p.corPrincipal);
  const tinta = corTextoSobre(p.corFundo);
  const textoBotao = contraste(p.corPrincipal, tinta) >= 3 ? p.corPrincipal : p.corFundo;
  const claro = tinta === "#111111";
  const estiloOpcao: CSSProperties = claro
    ? { backgroundColor: "#FFFFFF", borderColor: "#11111117", color: tinta }
    : { backgroundColor: "#FFFFFF10", borderColor: "#FFFFFF26", color: tinta };
  const estiloEscolhido: CSSProperties = { backgroundColor: tinta, borderColor: tinta, color: textoBotao };
  const estiloBotao: CSSProperties = { backgroundColor: tinta, color: textoBotao };
  const suave = `${tinta}A6`;

  const comentarioLigado = p.perguntas.some((q) => q.chave === "comentario");
  const textoComentarioMedio = p.perguntas.find((q) => q.chave === "comentario")?.texto ?? "";
  const telas = p.perguntas.filter((q) => q.chave !== "comentario");
  const totalPassos = telas.length + 1; // + tela final (comentário e contato)
  const notas: NotasAvaliacao = {};
  for (const q of telas) {
    const v = valores[q.chave];
    if (v === undefined || v === "") continue;
    if (q.tipo === "estrelas" || q.tipo === "nps") notas[q.chave] = Number(v);
    else if (q.tipo === "simnao") notas[q.chave] = v === "sim";
  }
  const humor = humorDaAvaliacao(notas);
  // Contato: sempre que a avaliação vira alerta (até nota 7 ou 8 com pedido errado), mas sem o "poxa".
  const pedeContato = humor === "ruim" || ehNotaBaixa(notas);
  const comentario = (valores.comentario ?? "").trim();

  // Erro do servidor numa pergunta: volta para ela (ajuste no render, quando o estado muda).
  const [estadoVisto, setEstadoVisto] = useState(estado);
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    const i = estado.campo ? telas.findIndex((q) => q.chave === estado.campo) : -1;
    if (i >= 0) setPasso(i);
  }

  function escolher(chave: string, valor: string, avancar: boolean) {
    setValores((v) => ({ ...v, [chave]: valor }));
    if (!avancar) return;
    if (avanco.current) clearTimeout(avanco.current);
    avanco.current = setTimeout(() => setPasso((n) => n + 1), PAUSA_AUTOMATICA_MS);
  }

  function enviar(formData: FormData) {
    const faltando = telas.findIndex((q) => q.obrigatoria && !(valores[q.chave] ?? "").trim());
    if (faltando >= 0) {
      setPasso(faltando);
      return;
    }
    for (const q of p.perguntas) {
      const v = valores[q.chave];
      if (v) formData.set(`q_${q.chave}`, v);
    }
    if (valores.conheceu === "outro" && outro.trim()) formData.set("q_conheceu_outro", outro);
    if (pedeContato && whatsapp.trim()) {
      formData.set("whatsapp", whatsapp);
      if (consentimento) formData.set("consentimento", "sim");
    }
    formData.set("decorrido", String(msDesde(inicio.current)));
    formData.set("dispositivo", idDoAparelho());
    acao(formData);
  }

  // ── Obrigado ───────────────────────────────────────────────────────────
  if (estado.ok) {
    const destaqueGoogle = humor === "otimo";
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10 text-center" style={{ backgroundColor: p.corFundo, color: tinta }} aria-live="polite">
        <div className="flex h-24 w-24 items-center justify-center rounded-full" style={{ backgroundColor: COR_ESTRELA, boxShadow: "0 14px 30px rgba(245,179,1,0.45)" }} aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="#111111" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h1 className="mt-6 text-3xl font-extrabold">Obrigado!</h1>
        <p className="mt-2 max-w-sm text-lg leading-snug" style={{ color: suave }}>
          {pedeContato && whatsapp.trim() && consentimento ? "Recebemos sua mensagem. Alguém da equipe vai falar com você pelo WhatsApp." : p.agradecimento}
        </p>

        {p.origem === "app" && estado.respostaId && p.roleta.length > 0 ? (
          <div className="mt-7 w-full max-w-sm">
            <RoletaPremios
              respostaId={estado.respostaId}
              premios={p.roleta}
              nome={p.nome}
              corPrincipal={p.corPrincipal}
              tinta={tinta}
              textoBotao={textoBotao}
              estiloCartao={estiloOpcao}
              linkPedidoDireto={p.linkPedidoDireto}
            />
          </div>
        ) : p.origem === "app" && p.linkPedidoDireto ? (
          <div className="mt-7 w-full max-w-sm rounded-2xl border-2 p-5 text-left" style={estiloOpcao}>
            <p className="text-lg font-bold">Da próxima vez, peça direto com a gente</p>
            <p className="mt-1 text-sm leading-snug" style={{ color: suave }}>
              O pedido chega do mesmo jeito e fica mais em conta para a {p.nome}.
            </p>
            <a
              href={p.linkPedidoDireto}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex min-h-[54px] w-full items-center justify-center rounded-2xl px-6 text-base font-bold shadow-lg"
              style={estiloBotao}
            >
              Pedir direto com a {p.nome}
            </a>
          </div>
        ) : null}

        {/* Para TODOS, qualquer nota: pedir só para quem gostou é proibido pelo Google. */}
        {p.linkGoogle ? (
          <div className={`mt-5 w-full max-w-sm rounded-2xl p-5 text-left ${destaqueGoogle ? "border-2" : ""}`} style={destaqueGoogle ? estiloOpcao : undefined}>
            <p className="text-base font-bold">Deixe sua avaliação no Google também</p>
            <p className="mt-1 text-sm leading-snug" style={{ color: suave }}>
              {comentario ? "Seu comentário vai copiado: lá é só colar." : "Leva 10 segundos e ajuda muito a gente."}
            </p>
            <a
              href={p.linkGoogle}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (!comentario) return;
                navigator.clipboard?.writeText(comentario).then(
                  () => setCopiado(true),
                  () => undefined,
                );
              }}
              className="mt-4 flex min-h-[54px] w-full items-center justify-center rounded-2xl border-2 px-6 text-base font-bold"
              style={destaqueGoogle ? estiloBotao : { borderColor: tinta, color: tinta }}
            >
              Avaliar no Google
            </a>
            {copiado ? <p className="mt-2 text-center text-sm font-semibold">Comentário copiado. Cole no Google.</p> : null}
          </div>
        ) : null}
      </main>
    );
  }

  // ── Capa ───────────────────────────────────────────────────────────────
  if (passo < 0) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-8 py-10 text-center" style={{ backgroundColor: p.corPrincipal, color: textoCapa }}>
        <Logo url={p.logoUrl} nome={p.nome} tamanho={168} corFundo={textoCapa} />
        <h1 className="mt-8 text-[28px] font-extrabold leading-tight">
          {p.origem === "salao" ? `Como foi sua experiência na ${p.nome}?` : `Como foi seu pedido da ${p.nome}?`}
        </h1>
        <p className="mt-3 max-w-xs text-base leading-snug opacity-80">Sua opinião chega direto para a gente e ajuda a melhorar cada detalhe.</p>
        <button
          type="button"
          onClick={() => setPasso(0)}
          className="mt-9 flex min-h-[58px] w-full max-w-sm items-center justify-center rounded-2xl px-6 text-lg font-bold shadow-xl transition active:scale-[0.98]"
          style={{ backgroundColor: textoCapa, color: p.corPrincipal }}
        >
          Começar avaliação
        </button>
        <p className="mt-4 text-sm opacity-70">Leva menos de 1 minuto</p>
      </main>
    );
  }

  const naUltima = passo >= telas.length;
  const q = naUltima ? null : telas[passo];
  const valor = q ? valores[q.chave] ?? "" : "";
  const pct = Math.round((passo / totalPassos) * 100);

  return (
    <main className="flex min-h-dvh flex-col" style={{ backgroundColor: p.corFundo, color: tinta }}>
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-4" style={{ backgroundColor: p.corPrincipal, color: textoCapa }}>
        <button
          type="button"
          onClick={() => setPasso((n) => n - 1)}
          aria-label="Voltar"
          className="flex h-10 w-8 items-center justify-center text-3xl leading-none"
        >
          ‹
        </button>
        <Logo url={p.logoUrl} nome={p.nome} tamanho={42} corFundo={textoCapa} />
        <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: `${textoCapa}26` }} aria-hidden="true">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: textoCapa }} />
        </div>
      </header>

      <div key={passo} className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 pt-12 motion-safe:animate-[entrar_0.28s_ease]">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: suave }}>
          {passo + 1} de {totalPassos}
        </p>

        {q ? (
          <>
            <h1 className="mt-2 text-[26px] font-bold leading-tight">{q.texto}</h1>
            {q.ajuda ? (
              <p className="mt-2 text-base" style={{ color: suave }}>
                {q.ajuda}
              </p>
            ) : null}

            {q.tipo === "estrelas" ? (
              <div className="mt-10">
                <div className="flex justify-between" role="radiogroup" aria-label={q.texto}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={valor === String(n)}
                      aria-label={`${n} de 5, ${ROTULO_ESTRELAS[n]}`}
                      onClick={() => escolher(q.chave, String(n), true)}
                      className="rounded-xl p-0.5"
                    >
                      <Estrela cheia={valor !== "" && n <= Number(valor)} contorno={`${tinta}40`} />
                    </button>
                  ))}
                </div>
                <p className="mt-3 h-6 text-center text-lg font-bold" aria-hidden="true">
                  {valor ? ROTULO_ESTRELAS[Number(valor)] : ""}
                </p>
              </div>
            ) : null}

            {q.tipo === "nps" ? (
              <div className="mt-10">
                <div className="grid grid-cols-11 gap-1" role="radiogroup" aria-label={q.texto}>
                  {Array.from({ length: 11 }, (_, n) => {
                    const cor = corDaNotaNps(n);
                    const escolhida = valor === String(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={escolhida}
                        onClick={() => escolher(q.chave, String(n), true)}
                        className={`flex min-h-[48px] items-center justify-center rounded-lg border-2 text-sm font-bold tabular-nums transition-transform ${escolhida ? "scale-110 shadow-md" : ""}`}
                        style={escolhida ? { backgroundColor: cor.fundo, borderColor: cor.fundo, color: cor.texto } : { borderColor: cor.fundo, color: cor.fundo, backgroundColor: claro ? "#FFFFFF" : "transparent" }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-xs" style={{ color: suave }}>
                  <span>Não indicaria</span>
                  <span>Com certeza</span>
                </div>
              </div>
            ) : null}

            {q.tipo === "simnao" ? (
              <div className="mt-8 grid gap-3" role="radiogroup" aria-label={q.texto}>
                {[
                  { v: "sim", r: "Sim, veio tudo certo" },
                  { v: "nao", r: "Não, faltou ou veio errado" },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={valor === o.v}
                    onClick={() => escolher(q.chave, o.v, true)}
                    className="flex min-h-[60px] items-center rounded-2xl border-2 px-5 text-left text-lg font-semibold"
                    style={valor === o.v ? estiloEscolhido : estiloOpcao}
                  >
                    {o.r}
                  </button>
                ))}
              </div>
            ) : null}

            {q.tipo === "atendente" ? (
              <div className="mt-8 grid grid-cols-2 gap-3" role="radiogroup" aria-label={q.texto}>
                {[...p.atendentes.map((n) => ({ v: n, r: n })), { v: NAO_LEMBRO, r: "Não lembro o nome" }].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={valor === o.v}
                    onClick={() => escolher(q.chave, o.v, true)}
                    className={`flex min-h-[56px] items-center justify-center rounded-2xl border-2 px-3 text-center text-base font-semibold ${o.v === NAO_LEMBRO ? "col-span-2" : ""}`}
                    style={valor === o.v ? estiloEscolhido : estiloOpcao}
                  >
                    {o.r}
                  </button>
                ))}
              </div>
            ) : null}

            {q.tipo === "escolha" ? (
              <>
                <div className="mt-8 flex flex-wrap gap-2.5" role="radiogroup" aria-label={q.texto}>
                  {(q.opcoes ?? []).map((o) => (
                    <button
                      key={o.valor}
                      type="button"
                      role="radio"
                      aria-checked={valor === o.valor}
                      onClick={() => escolher(q.chave, valor === o.valor ? "" : o.valor, false)}
                      className="rounded-full border-2 px-4 py-3 text-base font-semibold"
                      style={valor === o.valor ? estiloEscolhido : estiloOpcao}
                    >
                      {o.rotulo}
                    </button>
                  ))}
                </div>
                {q.chave === "conheceu" && valor === "outro" ? (
                  <input
                    type="text"
                    value={outro}
                    onChange={(e) => setOutro(e.target.value)}
                    maxLength={LIMITE_CONHECEU_OUTRO}
                    placeholder="Conta pra gente onde"
                    className="mt-4 min-h-[52px] w-full rounded-2xl border-2 px-4 text-base"
                    style={estiloOpcao}
                  />
                ) : null}
              </>
            ) : null}

            {estado.erro && estado.campo === q.chave ? (
              <p role="alert" className="mt-6 text-base font-semibold">
                {estado.erro}
              </p>
            ) : null}

            <div className="mt-auto grid gap-2 pt-10">
              {!q.obrigatoria ? (
                <>
                  <button type="button" onClick={() => setPasso((n) => n + 1)} className="min-h-[58px] w-full rounded-2xl px-6 text-lg font-bold shadow-lg" style={estiloBotao}>
                    Continuar
                  </button>
                  {!valor ? (
                    <button type="button" onClick={() => setPasso((n) => n + 1)} className="py-2 text-sm font-semibold" style={{ color: suave }}>
                      Pular
                    </button>
                  ) : null}
                </>
              ) : valor ? (
                <button type="button" onClick={() => setPasso((n) => n + 1)} className="min-h-[58px] w-full rounded-2xl px-6 text-lg font-bold shadow-lg" style={estiloBotao}>
                  Continuar
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <form action={enviar} className="flex flex-1 flex-col" noValidate>
            <input type="hidden" name="slug" value={p.slug} />
            <input type="hidden" name="origem" value={p.origem} />
            <input type="hidden" name="termo" value={p.termoVersao} />
            {/* Campo armadilha: invisível para pessoas; robô costuma preencher. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Não preencha
                <input type="text" name="site" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <h1 className="mt-2 text-[26px] font-bold leading-tight">
              {humor === "ruim" ? TEXTO_COMENTARIO_RUIM : humor === "otimo" ? TEXTO_COMENTARIO_OTIMO : comentarioLigado ? textoComentarioMedio : "Tudo pronto!"}
            </h1>
            {comentarioLigado ? (
              <textarea
                value={valores.comentario ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, comentario: e.target.value }))}
                maxLength={LIMITE_COMENTARIO}
                rows={4}
                placeholder={humor === "ruim" ? "Conte o que deu errado" : humor === "otimo" ? "Pode falar da comida, do atendimento, de tudo" : "O que faria você dar um 9 ou 10?"}
                aria-label="Comentário"
                className="mt-6 w-full rounded-2xl border-2 p-4 text-base"
                style={estiloOpcao}
              />
            ) : null}

            {pedeContato ? (
              <div className="mt-5">
                <label className="block text-base font-semibold">
                  Quer que a gente fale com você?
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="Seu WhatsApp com DDD"
                    maxLength={25}
                    className="mt-2 min-h-[52px] w-full rounded-2xl border-2 px-4 text-base font-normal"
                    style={estiloOpcao}
                  />
                </label>
                <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm leading-snug" style={{ color: suave }}>
                  <input
                    type="checkbox"
                    checked={consentimento}
                    onChange={(e) => setConsentimento(e.target.checked)}
                    className="mt-0.5 h-6 w-6 shrink-0"
                    style={{ accentColor: tinta }}
                  />
                  <span>{p.termoTexto}</span>
                </label>
                {whatsapp.trim() && !consentimento ? <p className="mt-2 text-xs" style={{ color: suave }}>O número só é guardado se você marcar a autorização.</p> : null}
                {estado.campo === "whatsapp" ? (
                  <p role="alert" className="mt-2 text-sm font-semibold">
                    {estado.erro}
                  </p>
                ) : null}
              </div>
            ) : null}

            {estado.erro && estado.campo !== "whatsapp" && !telas.some((t) => t.chave === estado.campo) ? (
              <p role="alert" className="mt-5 rounded-2xl border-2 p-3 text-center text-base font-medium" style={estiloOpcao}>
                {estado.erro}
              </p>
            ) : null}

            <div className="mt-auto pt-10">
              <button
                type="submit"
                disabled={pendente}
                className="min-h-[58px] w-full rounded-2xl px-6 text-lg font-bold shadow-lg transition active:scale-[0.98] disabled:opacity-60"
                style={estiloBotao}
              >
                {pendente ? "Enviando..." : "Enviar avaliação"}
              </button>
              <p className="mt-3 text-center text-xs" style={{ color: suave }}>
                Pesquisa da {p.nome}, feita no Zatti Hub.
              </p>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
