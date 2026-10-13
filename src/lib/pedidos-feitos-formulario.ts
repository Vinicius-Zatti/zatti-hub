import type { Pedido } from "@/lib/types";
import { textoEdicaoQuantidade } from "@/lib/unidades";

/** Formulário de recebimento de UM pedido em Pedidos Feitos. A versão é a do
 * pedido no momento em que estes campos foram carregados - é ela que vai para
 * o banco ao salvar, nunca a versão das props atuais. Se fosse a das props,
 * uma revalidação (depois de salvar outro pedido) atualizaria a versão e
 * manteria os campos antigos: salvar sobrescreveria a alteração de outra
 * pessoa sem o banco perceber. */
export type FormularioRecebimento = {
  versao: number;
  editado: boolean;
  /** Texto exatamente como digitado, por SKU. */
  quantidades: Record<string, string>;
  observacao: string;
  recebido: boolean;
};

export function formularioDoPedido(pedido: Pedido): FormularioRecebimento {
  return {
    versao: pedido.versaoItens,
    editado: false,
    quantidades: Object.fromEntries(
      pedido.itens.map((it) => [it.sku, textoEdicaoQuantidade(it.quantidadeRecebida ?? it.quantidadePedida, it.unidadeBase)])
    ),
    observacao: pedido.observacaoEntrega ?? "",
    recebido: pedido.recebido,
  };
}

/** Acompanha as props: pedido novo ganha formulário; versão diferente em
 * formulário não editado recarrega com os dados novos; formulário editado
 * fica como está (com a versão antiga - o banco recusa e pede para
 * recarregar). Devolve o mesmo objeto quando nada muda. */
export function sincronizarFormularios(
  atuais: Record<string, FormularioRecebimento>,
  pedidos: Pedido[]
): Record<string, FormularioRecebimento> {
  let mudou = false;
  const proximos: Record<string, FormularioRecebimento> = {};
  for (const pedido of pedidos) {
    const atual = atuais[pedido.id];
    if (atual && (atual.versao === pedido.versaoItens || atual.editado)) {
      proximos[pedido.id] = atual;
    } else {
      proximos[pedido.id] = formularioDoPedido(pedido);
      mudou = true;
    }
  }
  if (Object.keys(atuais).length !== pedidos.length) mudou = true;
  return mudou ? proximos : atuais;
}

/** Outra pessoa (ou outra tela) mudou o pedido depois que o formulário
 * editado foi carregado. */
export function pedidoMudouDesdeOFormulario(formulario: FormularioRecebimento | undefined, pedido: Pedido): boolean {
  return formulario !== undefined && formulario.versao !== pedido.versaoItens;
}
