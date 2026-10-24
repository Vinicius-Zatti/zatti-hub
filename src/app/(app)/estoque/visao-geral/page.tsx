import { redirect } from "next/navigation";
import { BlocosModulo, type BlocoModulo } from "@/components/navegacao-v2/blocos-modulo";
import { getAcessoAtual } from "@/lib/acesso";
import { resumirEstoque } from "@/lib/estoque/resumo";
import { usaNavegacaoV2 } from "@/lib/navegacao/piloto";
import { listPedidosFeitos } from "@/lib/pedidos";
import { listInventario } from "@/lib/sheets/inventario";
import { listProdutos } from "@/lib/sheets/produtos";

export const dynamic = "force-dynamic";

/** Visão geral do Estoque (Navegação V2, 24/10/2026): página de entrada do
 * módulo no piloto, com um número por bloco. Os números são os mesmos do
 * Painel geral (`resumirEstoque`, mesmas leituras). CMV Real fica só como
 * atalho: o CMV depende do período escolhido na calculadora, não há um "CMV
 * do mês" pronto para mostrar. Fora do piloto a rota volta para a entrada
 * atual do Estoque. */
export default async function VisaoGeralEstoquePage() {
  const acesso = await getAcessoAtual();
  if (!usaNavegacaoV2(acesso)) redirect("/estoque/produtos");
  const podeGerir = acesso.role !== "operacional";

  const [produtos, inventario, pedidos] = await Promise.all([
    listProdutos(acesso.spreadsheetId),
    listInventario(acesso.spreadsheetId),
    listPedidosFeitos(acesso.unidadeId),
  ]);
  const resumo = resumirEstoque(produtos, inventario, pedidos);

  const blocos: BlocoModulo[] = [
    {
      titulo: "Contagem",
      descricao: resumo.ultimaContagem ? `Última em ${resumo.ultimaContagem}` : "Ainda sem contagem",
      href: "/estoque/contagem/visualizacao",
      icone: "contagem",
      numero: `${resumo.alertasCompra} pedem compra`,
      alerta: resumo.alertasCompra > 0,
      dica: "Itens da última contagem com o alerta \"Comprar emergencial\" (estoque abaixo do mínimo). Mesmo número do Painel geral.",
    },
    {
      titulo: "Pedidos",
      descricao: "Aguardando receber",
      href: "/estoque/pedidos/feitos",
      icone: "pedidos",
      numero: String(resumo.pedidosPendentes),
      alerta: resumo.pedidosPendentes > 0,
      dica: "Pedidos feitos com ao menos um item de fornecedor confirmado e que ainda não foram marcados como recebidos.",
    },
    ...(podeGerir
      ? [
          {
            titulo: "CMV Real",
            descricao: "Calcular pelo período das contagens",
            href: "/estoque/cmv",
            icone: "financeiroGerencial" as const,
          },
        ]
      : []),
    {
      titulo: "Produtos",
      descricao: "Ativos",
      href: "/estoque/produtos",
      icone: "estoque",
      numero: String(resumo.produtosAtivos),
      dica: "Produtos do cadastro marcados como ativos.",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Visão geral do Estoque</h1>
      <BlocosModulo blocos={blocos} rotulo="Telas do Estoque" />
    </div>
  );
}
