import { SubTabs } from "@/components/sub-tabs";
import { getAcessoAtual } from "@/lib/acesso";

const SUB_ITEMS = [
  { label: "Produtos", href: "/estoque/produtos" },
  { label: "Contagem", href: "/estoque/contagem" },
  { label: "Pedidos", href: "/estoque/pedidos" },
  { label: "Fornecedores", href: "/estoque/fornecedores" },
  { label: "CMV", href: "/estoque/cmv" },
];

// Abas restritas à Gestão/master (dado financeiro ou de fornecedor) -
// mesma barreira reforçada dentro de cada página (requireGestao/Fornecedores).
const SOMENTE_GESTAO = ["/estoque/fornecedores", "/estoque/cmv"];

export default async function EstoqueLayout({ children }: { children: React.ReactNode }) {
  const acesso = await getAcessoAtual();
  // Operacional enxerga tudo, menos as abas de SOMENTE_GESTAO. Dentro de
  // cada aba liberada, a granularidade "só visualizar" x "edita de verdade"
  // é decidida pelo layout/página dela.
  const items =
    acesso.role === "operacional"
      ? SUB_ITEMS.filter((item) => !SOMENTE_GESTAO.includes(item.href)).map((item) =>
          // Bare "/estoque/pedidos" é Criar Cotação, agora só Gestão/master
          // (ver `estoque/pedidos/layout.tsx`) - Operacional que clicar em
          // "Pedidos" cai direto em Pedidos Feitos, não numa tela que vai
          // barrar ele.
          item.href === "/estoque/pedidos" ? { ...item, href: "/estoque/pedidos/feitos" } : item
        )
      : SUB_ITEMS;

  return (
    <div className="flex flex-col gap-5">
      <SubTabs items={items} />
      {children}
    </div>
  );
}
