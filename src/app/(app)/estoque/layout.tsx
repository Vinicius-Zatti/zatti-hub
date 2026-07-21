import { SubTabs } from "@/components/sub-tabs";

const SUB_ITEMS = [
  { label: "Produtos", href: "/estoque/produtos" },
  { label: "Contagem", href: "/estoque/contagem" },
  { label: "Pedidos", href: "/estoque/pedidos" },
  { label: "Fornecedores", href: "/estoque/fornecedores" },
];

export default function EstoqueLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <SubTabs items={SUB_ITEMS} />
      {children}
    </div>
  );
}
