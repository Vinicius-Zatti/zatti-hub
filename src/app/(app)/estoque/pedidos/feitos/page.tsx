import { getAcessoAtual } from "@/lib/acesso";
import { listPedidosFeitos } from "@/lib/pedidos";
import { ordenarDatasContagemBase } from "@/lib/pedido";
import { PedidosFeitos } from "@/components/pedidos-feitos";
import { LinkVideoAjuda } from "@/components/videos-ajuda";
import { listaDoParametro } from "@/lib/contagem/varias-datas";

export const dynamic = "force-dynamic";

export default async function PedidosFeitosPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string | string[] }>;
}) {
  const acesso = await getAcessoAtual();
  const params = await searchParams;
  const todosPedidos = await listPedidosFeitos(acesso.unidadeId);

  // Só item com vencedor confirmado no Editor de Espelhos é pedido de
  // verdade - editar quantidade/preço sozinho grava a linha, mas não decide
  // vencedor nenhum (ver `vencedorConfirmado`). Sem esse filtro, item que
  // nunca ganhou disputa nenhuma (ou que caiu pra 0 depois de sincronizar
  // com outro fornecedor) aparecia aqui como "pedido 0 unidades", confuso.
  // Fornecedor sem nenhum item confirmado nem aparece.
  const pedidosConfirmados = todosPedidos
    .map((p) => ({ ...p, itens: p.itens.filter((it) => it.vencedorConfirmado) }))
    .filter((p) => p.itens.length > 0);

  // Contagem base como filtro, igual Criar Cotação e Editor de Espelhos -
  // sem isso, pedido fechado em semanas diferentes aparecia tudo junto numa
  // lista só, sem separação nenhuma (achado real: fornecedor recorrente
  // acumulava um card por semana, todos misturados na mesma tela).
  const datasDisponiveis = ordenarDatasContagemBase(
    Array.from(new Set(pedidosConfirmados.map((p) => p.dataContagemBase)))
  );
  // Criar Cotação pode propagar várias contagens ("11/10/2026,12/10/2026",
  // em qualquer ordem, ou a chave repetida); aqui vale a base - a MAIS
  // RECENTE delas, mesma regra de `escolherDatasContagem` -, que é onde o
  // pedido foi gravado.
  const dataParam = ordenarDatasContagemBase(listaDoParametro(params.data))[0];
  const dataUsada = dataParam && datasDisponiveis.includes(dataParam) ? dataParam : (datasDisponiveis[0] ?? "");
  const pedidos = pedidosConfirmados.filter((p) => p.dataContagemBase === dataUsada);

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
        {/* Vídeo do Pedido feito (26/10/2026), mesmo link discreto da Contagem. */}
        <div className="-ml-2">
          <LinkVideoAjuda id="pedido-feito" pergunta="Como receber o pedido?" />
        </div>
      </div>
      <PedidosFeitos
        pedidos={pedidos}
        podeEditarQuantidade={acesso.role !== "operacional"}
        dataUsada={dataUsada}
        datasDisponiveis={datasDisponiveis}
      />
    </div>
  );
}
