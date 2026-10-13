import Link from "next/link";

/** Anterior / "Página X de Y" / Próxima, por link (a página vem da URL). Some
 * quando há uma página só. Nasceu na Conciliação; também na tela de planos do
 * Garante. Serve em componente de servidor e de cliente. */
export function Paginacao({ atual, total, link }: { atual: number; total: number; link: (n: number) => string }) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-xs">
      {atual > 1 && <Link href={link(atual - 1)} className="rounded border border-cinza-claro px-2 py-1">Anterior</Link>}
      <span className="text-cinza-medio">Página {atual} de {total}</span>
      {atual < total && <Link href={link(atual + 1)} className="rounded border border-cinza-claro px-2 py-1">Próxima</Link>}
    </div>
  );
}
