import { SubTabs } from "@/components/sub-tabs";
import { requireFinanceiroGerencial } from "@/lib/acesso";
import { lerFlagsConciliacao } from "@/lib/banco/conciliacao";
import { AvisoSomenteVer } from "@/components/aviso-somente-ver";
import { destinoSemEdicao } from "@/lib/permissoes/menu";

// Ordem do dia a dia (pedido de Vinícius em 20/10/2026, substitui a de 25/08): painel primeiro,
// trabalho diário, relatórios e por último a configuração. Conciliação entra logo depois da
// Caixa de Entrada quando a flag da unidade está ligada.
const SUB_ITEMS = [
  { label: "Painel financeiro", href: "/financeiro-gerencial/visao-geral" },
  { label: "Caixa de Entrada", href: "/financeiro-gerencial/caixa-entrada" },
  { label: "Contas a pagar e receber", href: "/financeiro-gerencial/contas-pagar-receber" },
  { label: "Receitas", href: "/financeiro-gerencial/lancamentos/receitas" },
  { label: "Despesas", href: "/financeiro-gerencial/lancamentos/despesas" },
  { label: "Cartões", href: "/financeiro-gerencial/cartoes" },
  { label: "Painel M.E.G.A.", href: "/financeiro-gerencial/painel-mega" },
  { label: "DRE", href: "/financeiro-gerencial/dre" },
  { label: "Fluxo de Caixa", href: "/financeiro-gerencial/fluxo-caixa" },
  { label: "DFC", href: "/financeiro-gerencial/dfc" },
  { label: "Fechamento", href: "/financeiro-gerencial/fechamento" },
  { label: "Provisões", href: "/financeiro-gerencial/provisoes" },
  { label: "Recorrências", href: "/financeiro-gerencial/recorrencias" },
  { label: "Contas financeiras", href: "/financeiro-gerencial/contas" },
  { label: "Plano de Contas", href: "/financeiro-gerencial/categorias" },
];

// Contas financeiras e Plano de Contas são configuração - só Gestão/master
// (mesmo padrão de `estoque/layout.tsx` com CMV/Fornecedores). Lançar
// receita/despesa e marcar baixa é liberado pro Operacional também.
const SOMENTE_GESTAO = [
  "/financeiro-gerencial/contas",
  "/financeiro-gerencial/categorias",
  "/financeiro-gerencial/provisoes",
  "/financeiro-gerencial/fechamento",
];

export default async function FinanceiroGerencialLayout({ children }: { children: React.ReactNode }) {
  // Defesa em profundidade: sai pra fora se a flag do piloto não estiver
  // ligada pra essa unidade, igual `fichas-tecnicas/layout.tsx` faz hoje.
  const acesso = await requireFinanceiroGerencial();

  // Conciliação (piloto, 30/09): aparece só com a flag da unidade ligada.
  const conciliacao = await lerFlagsConciliacao(acesso.unidadeId);
  const todos = conciliacao.habilitada
    ? [...SUB_ITEMS.slice(0, 2), { label: "Conciliação", href: "/financeiro-gerencial/conciliacao" }, ...SUB_ITEMS.slice(2)]
    : SUB_ITEMS;
  const items = (acesso.role === "operacional" ? todos.filter((item) => !SOMENTE_GESTAO.includes(item.href)) : todos)
    // Permissão por módulo (fase 6): quem só vê não abre as telas de trabalho.
    .filter((item) => destinoSemEdicao(item.href, acesso.permissoes) === null);

  return (
    <div className="flex flex-col gap-5">
      {/* Fixo no topo ao rolar (pedido de 25/09) - relatórios longos. */}
      <SubTabs items={items} fixoNoTopo />
      <AvisoSomenteVer acesso={acesso} modulo="financeiro" />
      {children}
    </div>
  );
}
