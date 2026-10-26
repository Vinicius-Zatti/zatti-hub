/** Dica discreta só no celular em pé (26/10/2026): deitado, as tabelas largas
 * da cotação mostram todas as colunas. Some sozinha ao virar e no computador. */
export function DicaVirarCelular() {
  return (
    <p className="hidden items-center gap-2 text-xs text-cinza-medio max-sm:portrait:flex">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="2" width="10" height="16" rx="2" />
        <path d="M11 15h2" />
        <path d="M4 14a8 8 0 0 0 6 7.5" />
        <path d="m8 21 2 .5-.5-2" />
      </svg>
      Vire o celular para ver a tabela inteira
    </p>
  );
}
