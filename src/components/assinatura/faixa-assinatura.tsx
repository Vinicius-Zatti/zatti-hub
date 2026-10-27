import type { Faixa } from "@/lib/assinatura/regras";

/** Faixa da vigência anual no topo do app (15/10/2026). O botão abre a página de renovação do
 * site, que já sabe qual é a conta pelo link. */
export function FaixaAssinatura({ faixa, link }: { faixa: Faixa; link: string | null }) {
  const estilo =
    faixa.tom === "alerta"
      ? "border-vermelho/30 bg-vermelho/10 text-azul-noite"
      : "border-ambar/40 bg-ambar/10 text-azul-noite";
  return (
    <div role="status" className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${estilo}`}>
      <p>{faixa.texto}</p>
      {faixa.botao && link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-azul-noite px-3 py-1.5 text-sm font-semibold text-branco hover:bg-azul-petroleo"
        >
          {faixa.rotulo}
        </a>
      ) : null}
    </div>
  );
}
