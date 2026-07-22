import { SubTabs } from "@/components/sub-tabs";
import { getAcessoAtual } from "@/lib/acesso";

const SUB_ITEMS = [
  { label: "Produtos", href: "/estoque/produtos" },
  { label: "Contagem", href: "/estoque/contagem" },
  { label: "Pedidos", href: "/estoque/pedidos" },
  { label: "Fornecedores", href: "/estoque/fornecedores" },
];

export default async function EstoqueLayout({ children }: { children: React.ReactNode }) {
  const acesso = await getAcessoAtual();
  const items =
    acesso.role === "gestao"
      ? SUB_ITEMS
      : SUB_ITEMS.filter((item) => item.href === "/estoque/contagem");

  return (
    <div className="flex flex-col gap-5">
      <SubTabs items={items} />
      {children}
    </div>
  );
}
