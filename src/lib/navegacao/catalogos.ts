import type { NomeIconeNavegacao } from "@/components/icones-navegacao";
import { destinosVisiveis } from "./atalhos";
import { normalizarBusca } from "./filtro";
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

/** Áreas do catálogo de Relatórios, na ordem da página. */
export const AREAS_RELATORIOS = ["Financeiro", "Estoque", "Garante", "Vendas"] as const;
export type AreaRelatorio = (typeof AREAS_RELATORIOS)[number];

/** Flag que o menu não cobre: Perdas e Movimentações estão no menu do Estoque
 * para todos, mas sem o extrato ligado a tela mostra só o aviso, sem número. */
export type ExigenciaRelatorio = "extratoEstoque";

export type EntradaRelatorio = EntradaCatalogo & { area: AreaRelatorio; exige?: ExigenciaRelatorio };

/** Só relatórios que existem de verdade (24/10/2026). A frase diz o que cada um
 * responde; papel e flag vêm do menu da pessoa (`filtrarCatalogo`). */
export const CATALOGO_RELATORIOS: readonly EntradaRelatorio[] = [
  {
    area: "Financeiro",
    titulo: "Painel M.E.G.A.",
    descricao: "Como está o mês nos números da DRE, com farol onde a unidade tem meta.",
    href: "/financeiro-gerencial/painel-mega",
    icone: "painel",
  },
  {
    area: "Financeiro",
    titulo: "DRE",
    descricao: "Quanto sobrou em cada mês, pela data de competência, no ano completo.",
    href: "/financeiro-gerencial/dre",
    icone: "relatorios",
  },
  {
    area: "Financeiro",
    titulo: "Fluxo de Caixa",
    descricao: "Quanto dinheiro entrou e saiu, no realizado e no projetado.",
    href: "/financeiro-gerencial/fluxo-caixa",
    icone: "financeiro",
  },
  {
    area: "Financeiro",
    titulo: "DFC",
    descricao: "De onde veio e para onde foi o caixa no ano, pelo método direto.",
    href: "/financeiro-gerencial/dfc",
    icone: "financeiroGerencial",
  },
  {
    area: "Estoque",
    titulo: "CMV Real",
    descricao: "Quanto a mercadoria custou no período, pelo estoque contado, compras e faturamento.",
    href: "/estoque/cmv",
    icone: "estoque",
  },
  {
    area: "Estoque",
    titulo: "Contagens",
    descricao: "O que foi contado em cada inventário já registrado.",
    href: "/estoque/contagem/visualizacao",
    icone: "contagem",
  },
  {
    area: "Estoque",
    titulo: "Pedidos feitos",
    descricao: "O que foi pedido a cada fornecedor e o que já chegou.",
    href: "/estoque/pedidos/feitos",
    icone: "pedidos",
  },
  {
    area: "Estoque",
    titulo: "Perdas",
    descricao: "O que foi jogado fora e por qual motivo.",
    href: "/estoque/contagem/perdas",
    icone: "estoque",
    exige: "extratoEstoque",
  },
  {
    area: "Estoque",
    titulo: "Movimentações",
    descricao: "Compras recebidas, perdas e a posição de cada contagem completa.",
    href: "/estoque/contagem/movimentacoes",
    icone: "relatorios",
    exige: "extratoEstoque",
  },
  {
    area: "Garante",
    titulo: "Quadro do dia",
    descricao: "Quais checklists estão pendentes, atrasados e feitos no dia, com as fotos.",
    href: "/garante/quadro",
    icone: "tarefas",
  },
  {
    area: "Garante",
    titulo: "Nota do Garante",
    descricao: "Pontualidade, Execução e Qualidade de cada checklist, por pessoa e por setor.",
    href: "/garante/nota",
    icone: "tarefas",
  },
  {
    area: "Vendas",
    titulo: "Painel de vendas",
    descricao: "Quanto a unidade faturou por canal: Salão, Delivery próprio, iFood e 99Food.",
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

/** Entradas do catálogo que a pessoa já abre hoje pelo menu. Relatório com
 * exigência extra (extrato do estoque) só entra com ela ligada. */
export function filtrarCatalogo<T extends EntradaCatalogo & { exige?: ExigenciaRelatorio }>(
  catalogo: readonly T[],
  menu: ItemNavegacao[],
  flags: { extratoEstoqueHabilitado?: boolean } = {},
): T[] {
  const visiveis = destinosVisiveis(menu);
  return catalogo.filter(
    (entrada) => visiveis.has(entrada.href) && (entrada.exige !== "extratoEstoque" || flags.extratoEstoqueHabilitado === true),
  );
}

/** Relatórios agrupados por área, na ordem de `AREAS_RELATORIOS`; área vazia sai. */
export function agruparPorArea(entradas: readonly EntradaRelatorio[]): { area: AreaRelatorio; itens: EntradaRelatorio[] }[] {
  return AREAS_RELATORIOS.map((area) => ({ area, itens: entradas.filter((e) => e.area === area) })).filter(
    (grupo) => grupo.itens.length > 0,
  );
}

/** Busca simples pelo nome do relatório (sem acento e sem maiúscula). */
export function buscarPorNome<T extends { titulo: string }>(entradas: readonly T[], termo: string): T[] {
  const alvo = normalizarBusca(termo);
  if (!alvo) return [...entradas];
  return entradas.filter((e) => normalizarBusca(e.titulo).includes(alvo));
}
