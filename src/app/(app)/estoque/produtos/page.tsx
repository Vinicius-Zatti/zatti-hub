import { listProdutos } from "@/lib/sheets/produtos";
import { listItensPendentes } from "@/lib/sheets/inventario";
import { StatCard } from "@/components/stat-card";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { Th } from "@/components/tabela";
import Link from "next/link";

export const dynamic = "force-dynamic";

function formatMoeda(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function ProdutosPage() {
  let produtos;
  try {
    produtos = await listProdutos();
  } catch (err) {
    return <ConectarPlanilha erro={(err as Error).message} />;
  }
  const pendentes = await listItensPendentes();

  const ativos = produtos.filter((p) => p.ativo);
  const semPreco = produtos.filter((p) => p.precoUnitario === null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-azul-noite">
            Cadastro de Produtos
          </h1>
          <p className="text-sm text-cinza-medio">
            Todos os insumos do restaurante — o que você compra, contagem e regra.
          </p>
        </div>
        <Link
          href="/estoque/produtos/novo"
          className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo"
        >
          + Novo produto
        </Link>
      </div>

      {pendentes.length > 0 && (
        <div className="rounded-lg border border-ambar/60 bg-ambar/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-ambar">
                {pendentes.length} {pendentes.length === 1 ? "item contado" : "itens contados"}{" "}
                sem cadastro
              </div>
              <p className="mt-0.5 text-xs text-cinza-medio">
                Foram lançados na contagem como avulso. Completa o cadastro na Edição de Dados
                pra eles pararem de cair fora do Pedido de Compras.
              </p>
            </div>
            <Link
              href="/estoque/edicao"
              className="shrink-0 rounded-md border border-ambar px-3 py-1.5 text-xs font-semibold text-ambar hover:bg-ambar/10"
            >
              Ir pra Edição de Dados
            </Link>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {pendentes.map((p) => (
              <div key={p.nome} className="text-sm text-cinza">
                {p.nome} <span className="text-cinza-medio">({p.unidadeBase})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Produtos cadastrados" value={String(produtos.length)} />
        <StatCard label="Ativos" value={String(ativos.length)} />
        <StatCard
          label="Sem preço definido"
          value={String(semPreco.length)}
          tone={semPreco.length > 0 ? "alerta" : "neutral"}
        />
        <StatCard
          label="Grupos"
          value={String(new Set(produtos.map((p) => p.grupo)).size)}
        />
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-cinza-claro bg-branco">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>SKU</Th>
              <Th>Grupo</Th>
              <Th>Nome</Th>
              <Th>Unidade</Th>
              <Th align="right">Preço</Th>
              <Th align="right">Estoque Pra Semana</Th>
              <Th align="center">Status</Th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((p, i) => (
              <tr
                key={p.sku}
                className={`border-t border-cinza-claro ${i % 2 === 1 ? "bg-off-white/60" : ""}`}
              >
                <td className="px-3 py-2 font-mono text-xs text-cinza-medio">{p.sku}</td>
                <td className="px-3 py-2">{p.grupo}</td>
                <td className="px-3 py-2 font-medium text-cinza">{p.nome}</td>
                <td className="px-3 py-2">{p.unidadeBase}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoeda(p.precoUnitario)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {p.estoqueNecessarioSemana ?? "—"}
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.ativo
                        ? "bg-verde/10 text-verde"
                        : "bg-cinza-claro text-cinza-medio"
                    }`}
                  >
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
              </tr>
            ))}
            {produtos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-cinza-medio">
                  Nenhum produto cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
