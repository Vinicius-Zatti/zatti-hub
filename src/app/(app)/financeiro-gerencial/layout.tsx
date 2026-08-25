import { SubTabs } from "@/components/sub-tabs";
import { requireFinanceiroGerencial } from "@/lib/acesso";

// Ordem pedida por Vinícius em 25/08: Plano de Contas primeiro (é a base de
// tudo o resto), depois Contas Financeiras, Receitas, Despesas. Rota de
// Plano de Contas continua em `/financeiro-gerencial/categorias` (nome
// técnico interno, só o rótulo do menu muda - item 2 da correção de 25/08).
const SUB_ITEMS = [
  { label: "Plano de Contas", href: "/financeiro-gerencial/categorias" },
  { label: "Contas financeiras", href: "/financeiro-gerencial/contas" },
  { label: "Receitas", href: "/financeiro-gerencial/lancamentos/receitas" },
  { label: "Despesas", href: "/financeiro-gerencial/lancamentos/despesas" },
];

// Contas financeiras e Plano de Contas são configuração - só Gestão/master
// (mesmo padrão de `estoque/layout.tsx` com CMV/Fornecedores). Lançar
// receita/despesa e marcar baixa é liberado pro Operacional também.
const SOMENTE_GESTAO = ["/financeiro-gerencial/contas", "/financeiro-gerencial/categorias"];

export default async function FinanceiroGerencialLayout({ children }: { children: React.ReactNode }) {
  // Defesa em profundidade: sai pra fora se a flag do piloto não estiver
  // ligada pra essa unidade, igual `fichas-tecnicas/layout.tsx` faz hoje.
  const acesso = await requireFinanceiroGerencial();

  const items = acesso.role === "operacional" ? SUB_ITEMS.filter((item) => !SOMENTE_GESTAO.includes(item.href)) : SUB_ITEMS;

  return (
    <div className="flex flex-col gap-5">
      <SubTabs items={items} />
      {children}
    </div>
  );
}
