import { SubTabs } from "@/components/sub-tabs";
import { getAcessoAtual } from "@/lib/acesso";

const ITEMS = [
  { label: "Produtos", href: "/estoque/produtos" },
  { label: "Edição de Dados", href: "/estoque/produtos/edicao" },
];

export default async function ProdutosLayout({ children }: { children: React.ReactNode }) {
  const acesso = await getAcessoAtual();
  // Operacional só visualiza o cadastro - a aba de edição nem aparece pra
  // ele (a barreira de verdade fica na própria página e nas Server Actions).
  const items =
    acesso.role === "operacional"
      ? ITEMS.filter((item) => item.href === "/estoque/produtos")
      : ITEMS;
  return (
    <div className="flex flex-col gap-4">
      <SubTabs items={items} />
      {children}
    </div>
  );
}
