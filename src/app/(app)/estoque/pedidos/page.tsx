import { gerarSugestaoCompra, agruparPorFornecedor } from "@/lib/sheets/sugestao-compra";
import { ConectarPlanilha } from "@/components/conectar-planilha";

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  let sugestoes;
  try {
    sugestoes = await gerarSugestaoCompra();
  } catch (err) {
    return <ConectarPlanilha erro={(err as Error).message} />;
  }

  const porFornecedor = agruparPorFornecedor(sugestoes);
  const fornecedores = Object.keys(porFornecedor).sort();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">
          Pedido de Compras
        </h1>
        <p className="text-sm text-cinza-medio">
          Calculado a partir da última contagem — o que falta pra bater o estoque
          necessário da semana, agrupado por fornecedor pra cotação.
        </p>
      </div>

      {sugestoes.length === 0 && (
        <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-cinza-medio">
          Nada pra comprar agora — todo mundo está com estoque suficiente pra semana.
        </div>
      )}

      {fornecedores.map((fornecedor) => (
        <div key={fornecedor} className="rounded-lg border border-cinza-claro bg-branco">
          <div className="border-b border-cinza-claro bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco">
            {fornecedor}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-off-white text-xs uppercase tracking-wide text-cinza-medio">
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Estoque atual</th>
                <th className="px-3 py-2 text-right">Necessário</th>
                <th className="px-3 py-2 text-right">Comprar</th>
              </tr>
            </thead>
            <tbody>
              {porFornecedor[fornecedor].map((s) => (
                <tr key={s.sku} className="border-t border-cinza-claro">
                  <td className="px-3 py-2 font-medium text-cinza">{s.nome}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">
                    {s.estoqueAtual} {s.unidadeBase}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">
                    {s.estoqueNecessario} {s.unidadeBase}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-ambar">
                    {s.quantidadeSugerida} {s.unidadeBase}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
