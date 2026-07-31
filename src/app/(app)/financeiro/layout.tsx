import { redirect } from "next/navigation";
import { SubTabs } from "@/components/sub-tabs";
import { getAcessoAtual } from "@/lib/acesso";

const SUB_ITEMS = [
  { label: "Novo Lançamento", href: "/financeiro/consolidado/novo" },
  { label: "Histórico", href: "/financeiro/consolidado" },
  { label: "Dashboard", href: "/financeiro/consolidado/dashboard" },
];

// Dashboard é só Gestão/master - Operacional cadastra e consulta o
// histórico, mas não vê indicador nenhum (mesmo padrão de
// `estoque/layout.tsx` com CMV/Fornecedores).
const SOMENTE_GESTAO = ["/financeiro/consolidado/dashboard"];

export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const acesso = await getAcessoAtual();
  // Defesa em profundidade: se alguém digitar a URL direto sem a flag ligada
  // pra essa unidade, sai pra fora igual `requireGestao`/`requireMaster`
  // fazem hoje com tela ainda não liberada.
  if (!acesso.consolidadoVendasHabilitado) redirect("/estoque/produtos");

  const items = acesso.role === "operacional" ? SUB_ITEMS.filter((item) => !SOMENTE_GESTAO.includes(item.href)) : SUB_ITEMS;

  return (
    <div className="flex flex-col gap-5">
      <SubTabs items={items} />
      {children}
    </div>
  );
}
