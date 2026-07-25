import { getAcessoAtual } from "@/lib/acesso";
import { listPedidosFeitos } from "@/lib/pedidos";
import { PedidosFeitos } from "@/components/pedidos-feitos";

export const dynamic = "force-dynamic";

export default async function PedidosFeitosPage() {
  const acesso = await getAcessoAtual();
  const pedidos = await listPedidosFeitos(acesso.unidadeId);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Pedidos Feitos</h1>
        <p className="text-sm text-cinza-medio">
          Pedidos de Compra já fechados no Editor de Espelhos, por fornecedor.
          {acesso.role === "operacional"
            ? " Marca aqui quando o pedido chegar e anota qualquer diferença na observação."
            : " Confirma a quantidade recebida quando vier diferente da pedida."}
        </p>
      </div>
      <PedidosFeitos pedidos={pedidos} podeEditarQuantidade={acesso.role !== "operacional"} />
    </div>
  );
}
