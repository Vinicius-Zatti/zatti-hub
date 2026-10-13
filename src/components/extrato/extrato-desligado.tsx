import { AVISO_EXTRATO_DESLIGADO } from "@/lib/extrato";

/** Aviso das telas do extrato (Movimentações e Perdas) quando a chave "Usar
 * extrato do estoque" da unidade está desligada (decisão 7, 13/10/2026). Nenhum
 * número aparece; o recebimento continua gravando as compras em segundo plano. */
export function ExtratoDesligado({ titulo }: { titulo: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-bold text-azul-noite">{titulo}</h1>
      <div className="flex flex-col gap-2 rounded-lg border border-cinza-claro bg-branco p-6 text-sm text-cinza">
        <p className="font-semibold text-azul-noite">{AVISO_EXTRATO_DESLIGADO.titulo}</p>
        <p>{AVISO_EXTRATO_DESLIGADO.corpo}</p>
        <p className="text-xs text-cinza-medio">{AVISO_EXTRATO_DESLIGADO.quemLiga}</p>
      </div>
    </div>
  );
}
