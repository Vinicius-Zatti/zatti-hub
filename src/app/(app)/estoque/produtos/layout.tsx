import { SubTabs } from "@/components/sub-tabs";

const ITEMS = [
  { label: "Produtos", href: "/estoque/produtos" },
  { label: "Edição de Dados", href: "/estoque/produtos/edicao" },
];

export default function ProdutosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <SubTabs items={ITEMS} />
      {children}
    </div>
  );
}
