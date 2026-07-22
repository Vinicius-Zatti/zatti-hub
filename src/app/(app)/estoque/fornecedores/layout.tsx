import { SubTabs } from "@/components/sub-tabs";
import { requireGestao } from "@/lib/acesso";

const ITEMS = [
  { label: "Fornecedores", href: "/estoque/fornecedores" },
  { label: "Edição de Dados", href: "/estoque/fornecedores/edicao" },
];

export default async function FornecedoresLayout({ children }: { children: React.ReactNode }) {
  await requireGestao();
  return (
    <div className="flex flex-col gap-4">
      <SubTabs items={ITEMS} />
      {children}
    </div>
  );
}
