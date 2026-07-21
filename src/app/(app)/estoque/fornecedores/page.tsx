import { listFornecedores } from "@/lib/sheets/fornecedores";
import { ConectarPlanilha } from "@/components/conectar-planilha";

export const dynamic = "force-dynamic";

function formatMoeda(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function FornecedoresPage() {
  let fornecedores;
  try {
    fornecedores = await listFornecedores();
  } catch (err) {
    return <ConectarPlanilha erro={(err as Error).message} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">
          Fornecedores
        </h1>
        <p className="text-sm text-cinza-medio">
          Contato, condição de pagamento e prazo de entrega de cada fornecedor.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fornecedores.map((f, i) => (
          <div
            key={f.codigo || f.nomeFantasia || `${f.razaoSocial}-${i}`}
            className="rounded-lg border border-cinza-claro bg-branco p-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-lg font-bold text-azul-noite">
                  {f.nomeFantasia || f.razaoSocial}
                </div>
                {f.nomeVendedor && (
                  <div className="text-xs text-cinza-medio">Contato: {f.nomeVendedor}</div>
                )}
              </div>
              {f.codigo && (
                <span className="rounded bg-off-white px-1.5 py-0.5 font-mono text-[10px] text-cinza-medio">
                  {f.codigo}
                </span>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-cinza-medio">WhatsApp</dt>
              <dd className="text-right">{f.whatsapp || "—"}</dd>
              <dt className="text-cinza-medio">Pagamento</dt>
              <dd className="text-right">{f.condicoesPagamento || "—"}</dd>
              <dt className="text-cinza-medio">Pedido mínimo</dt>
              <dd className="text-right">{formatMoeda(f.pedidoMinimo)}</dd>
              <dt className="text-cinza-medio">Entrega</dt>
              <dd className="text-right">{f.diasEntrega || "—"}</dd>
            </dl>
          </div>
        ))}
        {fornecedores.length === 0 && (
          <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-cinza-medio sm:col-span-2">
            Nenhum fornecedor cadastrado ainda.
          </div>
        )}
      </div>
    </div>
  );
}
