import { SubTabs } from "@/components/sub-tabs";

const ITEMS = [
  { label: "Fornecedores", href: "/estoque/fornecedores" },
  { label: "Edição de Dados", href: "/estoque/fornecedores/edicao" },
];

export default function FornecedoresLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <SubTabs items={ITEMS} />
      {children}
    </div>
  );
}
