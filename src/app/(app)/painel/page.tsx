import { ConectarPlanilha } from "@/components/conectar-planilha";
import { PainelGeral, type DadosPainelGeral } from "@/components/painel-geral";
import { getAcessoAtual } from "@/lib/acesso";
import { listPedidosFeitos } from "@/lib/pedidos";
import { listFornecedores } from "@/lib/sheets/fornecedores";
import { listInventario } from "@/lib/sheets/inventario";
import { listProdutos } from "@/lib/sheets/produtos";

export const dynamic = "force-dynamic";

function instanteData(valor: string): number {
  const [dia, mes, ano] = valor.split("/").map(Number);
  if (dia && mes && ano) return new Date(ano, mes - 1, dia).getTime();
  const instante = Date.parse(valor);
  return Number.isNaN(instante) ? 0 : instante;
}

function primeiroNome(email: string): string {
  const parte = email.split("@")[0]?.split(/[._-]/)[0] ?? "";
  return parte ? parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase() : "";
}

function saudacaoAtual(data: Date): string {
  const hora = Number(new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(data));
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function PainelPage() {
  const acesso = await getAcessoAtual();
  let produtos;
  let inventario;
  let fornecedores;
  let pedidos;

  try {
    [produtos, inventario, fornecedores, pedidos] = await Promise.all([
      listProdutos(acesso.spreadsheetId),
      listInventario(acesso.spreadsheetId),
      acesso.role === "operacional"
        ? Promise.resolve(null)
        : listFornecedores(acesso.spreadsheetId),
      listPedidosFeitos(acesso.unidadeId),
    ]);
  } catch (erro) {
    return <ConectarPlanilha erro={(erro as Error).message} />;
  }

  const datas = Array.from(new Set(inventario.map((item) => item.data).filter(Boolean)));
  const ultimaContagem = datas.sort((a, b) => instanteData(b) - instanteData(a))[0] ?? null;
  const itensUltimaContagem = ultimaContagem
    ? inventario.filter((item) => item.data === ultimaContagem)
    : [];
  const pedidosReais = pedidos
    .map((pedido) => ({
      ...pedido,
      itens: pedido.itens.filter((item) => item.vencedorConfirmado),
    }))
    .filter((pedido) => pedido.itens.length > 0);
  const pedidosPendentes = pedidosReais.filter((pedido) => !pedido.recebido);
  const agora = new Date();

  const dados: DadosPainelGeral = {
    saudacao: saudacaoAtual(agora),
    nomeUsuario: primeiroNome(acesso.usuarioEmail),
    dataHoje: new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "full",
      timeZone: "America/Sao_Paulo",
    }).format(agora),
    organizacaoNome: acesso.organizacaoNome,
    unidadeNome: acesso.unidadeNome,
    produtosAtivos: produtos.filter((produto) => produto.ativo).length,
    grupos: new Set(produtos.filter((produto) => produto.ativo).map((produto) => produto.grupo).filter(Boolean)).size,
    fornecedores: fornecedores?.length ?? null,
    ultimaContagem,
    itensContados: itensUltimaContagem.length,
    valorEstoque: itensUltimaContagem.reduce((total, item) => total + (item.total ?? 0), 0),
    alertasCompra: itensUltimaContagem.filter((item) => item.alerta === "Comprar emergencial").length,
    possiveisErros: itensUltimaContagem.filter((item) => item.alerta === "Possível erro de contagem").length,
    produtosSemPreco: produtos.filter((produto) => produto.ativo && produto.precoUnitario === null).length,
    pedidosPendentes: pedidosPendentes.length,
    valorPedidosPendentes: pedidosPendentes.reduce(
      (total, pedido) => total + pedido.itens.reduce(
        (subtotal, item) => subtotal + item.quantidadePedida * (item.precoAtualizado ?? item.precoAntigo ?? 0),
        0,
      ),
      0,
    ),
  };

  return <PainelGeral dados={dados} />;
}
