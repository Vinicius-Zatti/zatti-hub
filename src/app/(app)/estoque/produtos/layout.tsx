import { SubTabs } from "@/components/sub-tabs";
import { requireGestao } from "@/lib/acesso";

const ITEMS = [
  { label: "Produtos", href: "/estoque/produtos" },
  { label: "Edição de Dados", href: "/estoque/produtos/edicao" },
];

export default async function ProdutosLayout({ children }: { children: React.ReactNode }) {
  await requireGestao();
  return (
    <div className="flex flex-col gap-4">
      <SubTabs items={ITEMS} />
      {children}
    </div>
  );
}
