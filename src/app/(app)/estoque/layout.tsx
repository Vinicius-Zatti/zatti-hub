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
  // Operacional enxerga tudo, menos Fornecedores (só Gestão/master mexem em
  // cadastro de fornecedor). Dentro de cada aba liberada, a granularidade
  // "só visualizar" x "edita de verdade" é decidida pelo layout/página dela.
  const items =
    acesso.role === "operacional"
      ? SUB_ITEMS.filter((item) => item.href !== "/estoque/fornecedores")
      : SUB_ITEMS;

  return (
    <div className="flex flex-col gap-5">
      <SubTabs items={items} />
      {children}
    </div>
  );
}
