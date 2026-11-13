"use client";

import { useActionState, useEffect, useRef, useState, type CSSProperties } from "react";
import { enviarAvaliacaoAction, type EstadoAvaliacao } from "../../acoes";
import { COR_ESTRELA, corDaNotaNps, corTextoSobre } from "@/lib/avaliacoes/marca";
import { LIMITE_COMENTARIO, LIMITE_CONHECEU_OUTRO, type Origem, type PerguntaPublica } from "@/lib/avaliacoes/perguntas";

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
  corPrincipal: string;
  corFundo: string;
  /** Cor do texto sobre o fundo (preto ou branco, o que contrastar mais). */
  corTexto: string;
  agradecimento: string;
  linkGoogle: string | null;
  perguntas: PerguntaPublica[];
  termoVersao: number;
  termoTexto: string;
};

const ROTULO_ESTRELAS = ["", "Péssimo", "Ruim", "Regular", "Bom", "Excelente"];

/** Estrela dourada quando marcada; vazia, só o contorno suave na cor do texto. */
function Estrela({ cheia, contorno }: { cheia: boolean; contorno: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-12 w-12 transition-transform duration-150 ${cheia ? "scale-110" : "scale-100"}`}
      fill={cheia ? COR_ESTRELA : "none"}
      stroke={cheia ? COR_ESTRELA : contorno}
      strokeWidth="1.6"
      strokeLinejoin="round"
    >
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
    </svg>
  );
}

export function FormularioAvaliacao(p: Props) {
  const [estado, acao, pendente] = useActionState<EstadoAvaliacao, FormData>(enviarAvaliacaoAction, {});
  const [valores, setValores] = useState<Record<string, string>>({});
  const [faltando, setFaltando] = useState<string[]>([]);
  const [consentimento, setConsentimento] = useState(false);
  const inicio = useRef(0);
  useEffect(() => {
    inicio.current = Date.now();
  }, []);

  const textoPrincipal = corTextoSobre(p.corPrincipal);
  const borda = `${p.corTexto}4D`;
  const estiloEscolhido: CSSProperties = { backgroundColor: p.corPrincipal, borderColor: p.corPrincipal, color: textoPrincipal };
  const estiloLivre: CSSProperties = { borderColor: borda };
  // Cartão de cada pergunta: branco sobre fundo claro; translúcido sobre fundo escuro.
  const claro = p.corTexto === "#111111";
  const estiloCartao: CSSProperties = claro
    ? { backgroundColor: "#FFFFFF", borderColor: "#11111114", boxShadow: "0 4px 18px rgba(17,17,17,0.07)" }
    : { backgroundColor: "#FFFFFF12", borderColor: "#FFFFFF1F" };
  const obrigatorias = p.perguntas.filter((q) => q.obrigatoria);
  const respondidas = obrigatorias.filter((q) => (valores[q.chave] ?? "").trim()).length;

  if (estado.ok) {
    return (
      <section className="mt-8 space-y-6 text-center" aria-live="polite">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: COR_ESTRELA }} aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="#111111" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold">Obrigado!</h1>
        <p className="text-lg">{p.agradecimento}</p>
        {/* Para TODOS, qualquer nota: mostrar só para quem gostou é proibido pelo Google. */}
        {p.linkGoogle ? (
          <div className="space-y-2">
            <p className="text-base opacity-80">Se puder, deixe sua avaliação no Google também. Ajuda muito.</p>
            <a
              href={p.linkGoogle}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[56px] w-full items-center justify-center rounded-2xl px-6 text-lg font-semibold shadow-lg"
              style={{ backgroundColor: p.corPrincipal, color: textoPrincipal }}
            >
              Avaliar no Google
            </a>
          </div>
        ) : null}
      </section>
    );
  }

  function mudar(chave: string, valor: string) {
    setValores((v) => ({ ...v, [chave]: valor }));
    setFaltando((f) => f.filter((c) => c !== chave));
  }

  function enviar(formData: FormData) {
    const pendentes = p.perguntas.filter((q) => q.obrigatoria && !(valores[q.chave] ?? "").trim()).map((q) => q.chave);
    setFaltando(pendentes);
    if (pendentes.length > 0) {
      document.getElementById(`pergunta-${pendentes[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    formData.set("decorrido", String(Date.now() - inicio.current));
    formData.set("dispositivo", idDoAparelho());
    acao(formData);
  }

  const campoComErro = estado.campo;

  return (
    <form action={enviar} className="mt-5 space-y-4" noValidate>
      <h1 className="text-center text-2xl font-bold leading-tight">
        {p.origem === "salao"
          ? `Como foi sua visita na ${p.nome}?`
          : p.origem === "app"
            ? `Como foi seu pedido da ${p.nome} pelo app?`
            : `Como foi seu pedido da ${p.nome}?`}
      </h1>
      <p className="text-center text-sm opacity-70">Leva menos de 1 minuto.</p>
      {obrigatorias.length > 0 ? (
        <div className="sticky top-0 z-10 -mx-4 px-4 py-2" style={{ backgroundColor: p.corFundo }}>
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: `${p.corTexto}1A` }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.round((respondidas / obrigatorias.length) * 100)}%`, backgroundColor: COR_ESTRELA }}
            />
          </div>
        </div>
      ) : null}
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

      {p.perguntas.map((q) => {
        const valor = valores[q.chave] ?? "";
        const nomeCampo = `q_${q.chave}`;
        return (
          <fieldset key={q.chave} id={`pergunta-${q.chave}`} className="scroll-mt-10 space-y-3 rounded-2xl border p-4" style={estiloCartao}>
            <legend className="float-left mb-3 w-full text-lg font-semibold leading-snug">
              {q.texto}
              {!q.obrigatoria ? <span className="ml-2 text-sm font-normal opacity-70">(opcional)</span> : null}
            </legend>

            {q.tipo === "estrelas" ? (
              <div className="clear-both">
                <div className="flex justify-between gap-1" role="radiogroup" aria-label={q.texto}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className="block cursor-pointer rounded-xl p-1 has-[:focus-visible]:outline has-[:focus-visible]:outline-2">
                      <input type="radio" name={nomeCampo} value={n} checked={valor === String(n)} onChange={() => mudar(q.chave, String(n))} className="sr-only" />
                      <Estrela cheia={valor !== "" && n <= Number(valor)} contorno={`${p.corTexto}59`} />
                      <span className="sr-only">{n} de 5</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 h-5 text-center text-sm font-semibold" aria-hidden="true">
                  {valor ? ROTULO_ESTRELAS[Number(valor)] : ""}
                </p>
              </div>
            ) : null}

            {q.tipo === "nps" ? (
              <>
                <div className="clear-both grid grid-cols-6 gap-2">
                  {Array.from({ length: 11 }, (_, n) => {
                    const cor = corDaNotaNps(n);
                    const escolhida = valor === String(n);
                    return (
                      <label key={n} className="block">
                        <input type="radio" name={nomeCampo} value={n} checked={escolhida} onChange={() => mudar(q.chave, String(n))} className="peer sr-only" />
                        <span
                          className={`flex min-h-[48px] cursor-pointer items-center justify-center rounded-xl border-2 text-lg font-semibold transition-transform peer-focus-visible:outline peer-focus-visible:outline-2 ${escolhida ? "scale-105 shadow-md" : ""}`}
                          style={escolhida ? { backgroundColor: cor.fundo, borderColor: cor.fundo, color: cor.texto } : { borderColor: cor.fundo }}
                        >
                          {n}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex justify-between text-sm opacity-70">
                  <span>0 = de jeito nenhum</span>
                  <span>10 = com certeza</span>
                </div>
              </>
            ) : null}

            {q.tipo === "faixas" || q.tipo === "escolha" ? (
              <div className="clear-both grid grid-cols-2 gap-2">
                {(q.opcoes ?? []).map((o) => (
                  <label key={o.valor} className="block">
                    <input type="radio" name={nomeCampo} value={o.valor} checked={valor === o.valor} onChange={() => mudar(q.chave, o.valor)} className="peer sr-only" />
                    <span
                      className="flex min-h-[52px] cursor-pointer items-center justify-center rounded-xl border-2 px-2 text-center text-base font-medium peer-focus-visible:outline peer-focus-visible:outline-2"
                      style={valor === o.valor ? estiloEscolhido : estiloLivre}
                    >
                      {o.rotulo}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}

            {q.chave === "conheceu" && valor === "outro" ? (
              <input
                type="text"
                name="q_conheceu_outro"
                maxLength={LIMITE_CONHECEU_OUTRO}
                placeholder="Conta pra gente onde"
                className="min-h-[48px] w-full rounded-xl border-2 bg-transparent px-3 text-base"
                style={estiloLivre}
              />
            ) : null}

            {q.tipo === "texto" ? (
              <textarea
                name={nomeCampo}
                value={valor}
                onChange={(e) => mudar(q.chave, e.target.value)}
                maxLength={LIMITE_COMENTARIO}
                rows={3}
                placeholder="Escreva aqui, se quiser"
                className="clear-both block w-full rounded-xl border-2 bg-transparent p-3 text-base"
                style={estiloLivre}
              />
            ) : null}

            {faltando.includes(q.chave) || campoComErro === q.chave ? (
              <p role="alert" className="text-sm font-semibold">
                {faltando.includes(q.chave) ? "Responda esta pergunta para enviar." : estado.erro}
              </p>
            ) : null}
          </fieldset>
        );
      })}

      <fieldset className="space-y-3 rounded-2xl border p-4" style={estiloCartao}>
        <legend className="float-left mb-1 w-full text-lg font-semibold">
          Quer que a gente fale com você? <span className="text-sm font-normal opacity-70">(opcional)</span>
        </legend>
        <label className="clear-both block text-base">
          Seu WhatsApp
          <input
            type="tel"
            name="whatsapp"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(16) 91234-5678"
            maxLength={25}
            className="mt-1 min-h-[48px] w-full rounded-xl border-2 bg-transparent px-3 text-base"
            style={estiloLivre}
          />
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug">
          <input
            type="checkbox"
            name="consentimento"
            value="sim"
            checked={consentimento}
            onChange={(e) => setConsentimento(e.target.checked)}
            className="mt-0.5 h-6 w-6 shrink-0"
            style={{ accentColor: p.corPrincipal }}
          />
          <span>{p.termoTexto}</span>
        </label>
        <p className="text-xs opacity-70">O número só é guardado se você marcar a autorização acima.</p>
        {campoComErro === "whatsapp" ? (
          <p role="alert" className="text-sm font-semibold">
            {estado.erro}
          </p>
        ) : null}
      </fieldset>

      {estado.erro && campoComErro !== "whatsapp" && !p.perguntas.some((q) => q.chave === campoComErro) ? (
        <p role="alert" className="rounded-xl border-2 p-3 text-center text-base font-medium" style={estiloLivre}>
          {estado.erro}
        </p>
      ) : null}
      {faltando.length > 0 ? (
        <p role="alert" className="text-center text-base font-semibold">
          Falta responder {faltando.length === 1 ? "1 pergunta" : `${faltando.length} perguntas`}.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pendente}
        className="mt-2 min-h-[58px] w-full rounded-2xl px-6 text-lg font-semibold shadow-lg transition active:scale-[0.98] disabled:opacity-60"
        style={{ backgroundColor: p.corPrincipal, color: textoPrincipal }}
      >
        {pendente ? "Enviando..." : "Enviar avaliação"}
      </button>
      <p className="text-center text-xs opacity-60">Pesquisa da {p.nome}, feita no Zatti Hub.</p>
    </form>
  );
}
