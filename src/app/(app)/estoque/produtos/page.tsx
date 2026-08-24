import { listProdutos } from "@/lib/sheets/produtos";
import { listItensPendentes } from "@/lib/sheets/inventario";
import { StatCard } from "@/components/stat-card";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { TabelaProdutos } from "@/components/tabela-produtos";
import { NovoProdutoModal } from "@/components/novo-produto-modal";
import { getAcessoAtual } from "@/lib/acesso";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const acesso = await getAcessoAtual();
  let produtos;
  try {
    produtos = await listProdutos(acesso.spreadsheetId);
  } catch {
    return <ConectarPlanilha erro="Nao foi possivel carregar os produtos." />;
  }
  const pendentes = await listItensPendentes(acesso.spreadsheetId);

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
        {acesso.role !== "operacional" && <NovoProdutoModal />}
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
                Foram lançados na contagem como avulso.{" "}
                {acesso.role === "operacional"
                  ? "A Gestão precisa completar o cadastro pra eles pararem de cair fora do Pedido de Compras."
                  : "Completa o cadastro na Edição de Dados pra eles pararem de cair fora do Pedido de Compras."}
              </p>
            </div>
            {acesso.role !== "operacional" && (
              <Link
                href="/estoque/produtos/edicao"
                className="shrink-0 rounded-md border border-ambar px-3 py-1.5 text-xs font-semibold text-ambar hover:bg-ambar/10"
              >
                Ir pra Edição de Dados
              </Link>
            )}
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

      <TabelaProdutos produtos={produtos} />
    </div>
  );
}
