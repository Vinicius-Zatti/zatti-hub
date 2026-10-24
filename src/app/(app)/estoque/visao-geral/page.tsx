import { redirect } from "next/navigation";
import { BlocoContagem } from "@/components/navegacao-v2/bloco-contagem";
import { BlocosModulo, type BlocoModulo } from "@/components/navegacao-v2/blocos-modulo";
import { getAcessoAtual } from "@/lib/acesso";
import { listarAndamentoBanco, listarModalidadesBanco } from "@/lib/banco/setores";
import { CONTAGEM_POR_SETOR_ATIVA } from "@/lib/contagem/ativacao";
import { resumirEstoque, tipoDaContagem } from "@/lib/estoque/resumo";
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
 * atual do Estoque. A Contagem (24/10) é o bloco principal: valor em estoque
 * em destaque, com o tipo da contagem lido igual à Conferência de Contagem. */
export default async function VisaoGeralEstoquePage() {
  const acesso = await getAcessoAtual();
  if (!usaNavegacaoV2(acesso)) redirect("/estoque/produtos");
  const podeGerir = acesso.role !== "operacional";

  // Mesma condição e mesmas leituras da Conferência de Contagem para saber se
  // a data é por setor (e se está completa).
  const comSetor = CONTAGEM_POR_SETOR_ATIVA && acesso.fonteDadosEstoque === "banco";
  const [produtos, inventario, pedidos, dadosSetor] = await Promise.all([
    listProdutos(acesso.spreadsheetId),
    listInventario(acesso.spreadsheetId),
    listPedidosFeitos(acesso.unidadeId),
    comSetor
      ? Promise.all([listarAndamentoBanco(acesso.unidadeId), listarModalidadesBanco(acesso.unidadeId)])
      : null,
  ]);
  const resumo = resumirEstoque(produtos, inventario, pedidos);
  const [andamentoPorData, modalidadePorData] = dadosSetor ?? [new Map(), new Map()];
  const tipo = resumo.ultimaContagem
    ? tipoDaContagem(modalidadePorData.get(resumo.ultimaContagem), andamentoPorData.get(resumo.ultimaContagem) ?? [])
    : "";

  const blocos: BlocoModulo[] = [
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
      <BlocoContagem
        href="/estoque/contagem/visualizacao"
        dados={{
          data: resumo.ultimaContagem,
          tipo,
          valorEstoque: resumo.valorEstoque,
          itensContados: resumo.itensContados,
          alertasCompra: resumo.alertasCompra,
        }}
      />
      <BlocosModulo blocos={blocos} rotulo="Outras telas do Estoque" />
    </div>
  );
}
