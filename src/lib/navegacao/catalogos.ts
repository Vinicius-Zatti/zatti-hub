import type { NomeIconeNavegacao } from "@/components/icones-navegacao";
import { destinosVisiveis } from "./atalhos";
import type { ItemNavegacao } from "./tipos";

// Navegação V2 (24/10/2026): blocos das páginas de entrada Relatórios e
// Cadastros do piloto. Cada bloco só aparece se o destino dele já está no menu
// da pessoa (`destinosVisiveis` do menu do piloto): papel e flags valem igual
// no menu, nas abas e aqui. A descrição repete o que a própria tela diz.

export type EntradaCatalogo = {
  titulo: string;
  descricao: string;
  href: string;
  icone: NomeIconeNavegacao;
};

export const CATALOGO_RELATORIOS: readonly EntradaCatalogo[] = [
  {
    titulo: "DRE",
    descricao: "Resultado por data de competência, ano completo, mês a mês.",
    href: "/financeiro-gerencial/dre",
    icone: "relatorios",
  },
  {
    titulo: "Fluxo de Caixa",
    descricao: "Entradas e saídas de dinheiro, no realizado (o que já foi pago ou recebido) e no projetado.",
    href: "/financeiro-gerencial/fluxo-caixa",
    icone: "financeiro",
  },
  {
    titulo: "DFC",
    descricao: "Demonstração do Fluxo de Caixa pelo método direto, ano completo.",
    href: "/financeiro-gerencial/dfc",
    icone: "financeiroGerencial",
  },
  {
    titulo: "Painel M.E.G.A.",
    descricao: "Os números da DRE do mês, com farol onde a unidade tem meta.",
    href: "/financeiro-gerencial/painel-mega",
    icone: "painel",
  },
  {
    titulo: "Painel de vendas",
    descricao: "Faturamento do consolidado de vendas: Salão, Delivery próprio, iFood e 99Food.",
    href: "/financeiro/consolidado/dashboard",
    icone: "financeiro",
  },
];

export const CATALOGO_CADASTROS: readonly EntradaCatalogo[] = [
  {
    titulo: "Produtos",
    descricao: "Editar o cadastro dos produtos do estoque.",
    href: "/estoque/produtos/edicao",
    icone: "estoque",
  },
  { titulo: "Setores", descricao: "Setores em que a contagem de estoque é dividida.", href: "/estoque/setores", icone: "contagem" },
  {
    titulo: "Fornecedores",
    descricao: "Contato, condição de pagamento e prazo de entrega de cada fornecedor.",
    href: "/estoque/fornecedores",
    icone: "pedidos",
  },
  {
    titulo: "Categorias de fichas",
    descricao: "Agrupam as fichas técnicas; o código da categoria entra no SKU.",
    href: "/fichas-tecnicas/categorias",
    icone: "fichas",
  },
  {
    titulo: "Conversões de unidade",
    descricao: "Para o produto usado na ficha em outra unidade ou com perda de preparo.",
    href: "/fichas-tecnicas/conversoes",
    icone: "fichas",
  },
  {
    titulo: "Contas financeiras",
    descricao: "Conta bancária, caixa físico, carteira digital ou cartão de crédito.",
    href: "/financeiro-gerencial/contas",
    icone: "financeiro",
  },
  {
    titulo: "Plano de Contas",
    descricao: "Grupos de Contas do Método M.E.G.A. e as contas dentro deles.",
    href: "/financeiro-gerencial/categorias",
    icone: "financeiroGerencial",
  },
];

/** Entradas do catálogo que a pessoa já abre hoje pelo menu. */
export function filtrarCatalogo(catalogo: readonly EntradaCatalogo[], menu: ItemNavegacao[]): EntradaCatalogo[] {
  const visiveis = destinosVisiveis(menu);
  return catalogo.filter((entrada) => visiveis.has(entrada.href));
}
