/** Bolinha "!" com dica no hover (tooltip nativo do navegador), mesmo padrão
 * já usado no menu (título "Em breve"). */
export function InfoIcon({ texto }: { texto: string }) {
  return (
    <span
      title={texto}
      className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full bg-branco/25 text-[9px] font-bold leading-none text-branco"
    >
      !
    </span>
  );
}
