import type { NomeIconeNavegacao } from "@/components/icones-navegacao";
import { destinosVisiveis } from "./atalhos";
import type { ItemNavegacao } from "./tipos";

// Navegação V2, fase 3 (24/10/2026): atalhos de ação do piloto, usados no
// Início (por operação) e na busca global. Cada atalho abre uma tela que já
// existe e só aparece se essa tela já está no menu montado para a pessoa
// (`destinosVisiveis` do menu do piloto): papel e flags valem igual no menu,
// nas abas, na barra inferior e aqui. `soGestao` corta também os atalhos cuja
// tela é aberta a todos, mas cujo botão só a gestão usa (ex.: + Criar Nova F.T).
// Esconder é só UX: a barreira continua em cada página e Server Action.

export type GrupoAcao = "operacao" | "gestao";

export type AcaoRapida = {
  titulo: string;
  descricao: string;
  /** Tela de destino; `?novo=1` abre o modal de criação da própria tela. */
  href: string;
  icone: NomeIconeNavegacao;
  /** Módulo do menu, para a busca mostrar de onde o atalho vem. */
  modulo: string;
  grupo: GrupoAcao;
  /** Só gestão/master, mesmo que a tela esteja no menu de todos. */
  soGestao?: boolean;
  /** Outras palavras que a busca aceita (sem acento). */
  sinonimos?: string[];
};

export const CATALOGO_ACOES: readonly AcaoRapida[] = [
  // Operação do dia: o que a equipe faz na rotina.
  {
    titulo: "Fazer contagem",
    descricao: "Contar o estoque agora",
    href: "/estoque/contagem",
    icone: "contagem",
    modulo: "Estoque",
    grupo: "operacao",
    sinonimos: ["inventario", "contar", "estoque"],
  },
  {
    titulo: "Garante do dia",
    descricao: "Checklist de hoje para cumprir",
    href: "/garante",
    icone: "tarefas",
    modulo: "Garante",
    grupo: "operacao",
    sinonimos: ["checklist", "rotina", "tarefas", "hoje"],
  },
  {
    titulo: "Lançar vendas do dia",
    descricao: "Consolidado de vendas: novo lançamento",
    href: "/financeiro/consolidado/novo",
    icone: "financeiro",
    modulo: "Vendas",
    grupo: "operacao",
    sinonimos: ["novo lancamento", "vendas", "faturamento", "ifood", "salao", "delivery"],
  },
  {
    titulo: "Receber pedido",
    descricao: "Marcar como recebido em Pedidos feitos",
    href: "/estoque/pedidos/feitos",
    icone: "pedidos",
    modulo: "Estoque",
    grupo: "operacao",
    sinonimos: ["pedidos feitos", "entrega", "recebimento", "fornecedor"],
  },
  {
    titulo: "Nova despesa",
    descricao: "Lançar no financeiro uma conta a pagar",
    href: "/financeiro-gerencial/lancamentos/despesas?novo=1",
    icone: "financeiroGerencial",
    modulo: "Financeiro",
    grupo: "operacao",
    sinonimos: ["lancar no financeiro", "novo lancamento", "pagar", "boleto", "conta"],
  },
  {
    titulo: "Nova receita",
    descricao: "Lançar no financeiro um valor a receber",
    href: "/financeiro-gerencial/lancamentos/receitas?novo=1",
    icone: "financeiroGerencial",
    modulo: "Financeiro",
    grupo: "operacao",
    sinonimos: ["lancar no financeiro", "novo lancamento", "receber", "entrada"],
  },
  // Gestão: só dono, gestão e master.
  {
    titulo: "Criar cotação",
    descricao: "Montar o pedido de compra a partir da contagem",
    href: "/estoque/pedidos",
    icone: "pedidos",
    modulo: "Estoque",
    grupo: "gestao",
    sinonimos: ["pedido de compra", "cotacao", "comprar", "fornecedor"],
  },
  {
    titulo: "Quadro do Garante",
    descricao: "Quem cumpriu e o que atrasou hoje",
    href: "/garante/quadro",
    icone: "tarefas",
    modulo: "Garante",
    grupo: "gestao",
    sinonimos: ["quadro do dia", "checklist", "atrasados"],
  },
  {
    titulo: "Contas a pagar e receber",
    descricao: "Dar baixa no que venceu",
    href: "/financeiro-gerencial/contas-pagar-receber",
    icone: "financeiroGerencial",
    modulo: "Financeiro",
    grupo: "gestao",
    soGestao: true,
    sinonimos: ["baixa", "pagar", "receber", "vencidos"],
  },
  {
    titulo: "Nova ficha técnica",
    descricao: "Em Fichas técnicas, botão + Criar Nova F.T",
    href: "/fichas-tecnicas",
    icone: "fichas",
    modulo: "Cardápio",
    grupo: "gestao",
    soGestao: true,
    sinonimos: ["ficha tecnica", "receita", "prato", "custo"],
  },
  {
    titulo: "Calcular CMV Real",
    descricao: "CMV pelo período das contagens",
    href: "/estoque/cmv",
    icone: "estoque",
    modulo: "Estoque",
    grupo: "gestao",
    sinonimos: ["cmv", "custo da mercadoria"],
  },
  {
    titulo: "Dashboard",
    descricao: "Os números de cada área num lugar só",
    href: "/painel/dashboard",
    icone: "painel",
    modulo: "Início",
    grupo: "gestao",
    sinonimos: ["indicadores", "resumo", "numeros"],
  },
];

/** Atalhos que a pessoa pode usar: a tela de destino está no menu dela (sem o
 * `?novo=1`) e, quando o atalho é `soGestao`, ela é gestão ou master. */
export function acoesDisponiveis(
  menu: ItemNavegacao[],
  podeGerir: boolean,
  catalogo: readonly AcaoRapida[] = CATALOGO_ACOES,
): AcaoRapida[] {
  const visiveis = destinosVisiveis(menu);
  return catalogo.filter(
    (acao) => visiveis.has(acao.href.split("?")[0]) && (!acao.soGestao || podeGerir),
  );
}

/** Início do piloto: ações do dia para todos; as de gestão só para gestão/master. */
export function acoesDoInicio(
  menu: ItemNavegacao[],
  podeGerir: boolean,
): { operacao: AcaoRapida[]; gestao: AcaoRapida[] } {
  const disponiveis = acoesDisponiveis(menu, podeGerir);
  return {
    operacao: disponiveis.filter((acao) => acao.grupo === "operacao"),
    gestao: podeGerir ? disponiveis.filter((acao) => acao.grupo === "gestao") : [],
  };
}
