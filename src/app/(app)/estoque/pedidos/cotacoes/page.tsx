import { requireMaster } from "@/lib/acesso";

export const dynamic = "force-dynamic";

/** Placeholder - Editor de Espelhos de Compras ainda não foi construído.
 * Vai substituir a antiga "Cotações da Semana": confirmar quantidade
 * comprada, confirmar fornecedor vencedor, editar preço com diferença,
 * previsão de entrega por fornecedor. Guardado atrás de requireMaster()
 * até validar com o Vinícius. */
export default async function EditorEspelhosPage() {
  await requireMaster();

  return (
    <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-cinza-medio">
      <h1 className="font-display text-2xl font-bold text-azul-noite">
        Editor de Espelhos de Compras
      </h1>
      <p className="mt-2 text-sm">
        Em breve. Aqui você vai confirmar o que foi comprado de fato (quantidade, fornecedor
        vencedor, preço) e definir a previsão de entrega de cada fornecedor.
      </p>
    </div>
  );
}
