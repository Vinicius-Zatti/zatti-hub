"use client";

import { IconeNavegacao } from "@/components/icones-navegacao";

/** Busca das listas que a pessoa percorre para preencher ou conferir
 * (Vinícius, 26/10/2026). Só guarda o termo: quem usa filtra com
 * `filtrarPorNomeOuSku` e nunca mexe no que já foi digitado. Lupa, botão de
 * limpar que diz o efeito e Esc limpa, igual à busca da Contagem. */
export function CampoBusca({
  valor,
  onChange,
  rotulo,
  placeholder = "Buscar item por nome ou SKU",
  className = "",
}: {
  valor: string;
  onChange: (valor: string) => void;
  /** Leitor de tela: o que a busca procura e onde. */
  rotulo: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative w-full max-w-sm ${className}`}>
      <IconeNavegacao
        nome="buscar"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cinza-medio"
      />
      <input
        type="text"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && valor) {
            e.stopPropagation();
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={rotulo}
        autoComplete="off"
        spellCheck={false}
        className="min-h-10 w-full rounded-md border border-cinza-claro bg-branco py-1.5 pl-9 pr-10 text-base text-cinza placeholder:text-cinza-medio focus:border-ambar focus:outline-none sm:text-sm"
      />
      {valor.trim() !== "" && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar busca e mostrar todos os itens"
          title="Limpar busca e mostrar todos os itens"
          className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-cinza-medio hover:bg-off-white hover:text-cinza focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
        >
          <IconeNavegacao nome="fechar" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
