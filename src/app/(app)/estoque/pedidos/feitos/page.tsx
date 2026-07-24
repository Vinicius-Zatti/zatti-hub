import { requireMaster } from "@/lib/acesso";

export const dynamic = "force-dynamic";

/** Placeholder - Pedidos Feitos ainda não foi construído. Vai mostrar os
 * espelhos já fechados por data (compartilhar no grupo do restaurante,
 * confirmar recebimento, observações, totais de itens/volumes/valor).
 * Guardado atrás de requireMaster() até validar com o Vinícius. */
export default async function PedidosFeitosPage() {
  await requireMaster();

  return (
    <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-cinza-medio">
      <h1 className="font-display text-2xl font-bold text-azul-noite">Pedidos Feitos</h1>
      <p className="mt-2 text-sm">
        Em breve. Aqui vai dar pra ver os pedidos já fechados por data, compartilhar no grupo do
        restaurante, confirmar recebimento e registrar observações.
      </p>
    </div>
  );
}
