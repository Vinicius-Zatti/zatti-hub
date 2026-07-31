import { SubTabs } from "@/components/sub-tabs";
import { getAcessoAtual } from "@/lib/acesso";

export default async function PedidosLayout({ children }: { children: React.ReactNode }) {
  // Criar Cotação e Editor de Espelhos são só de quem compra (Gestão/master)
  // - decisão do Vinícius em 31/07 depois de testar como Operacional (antes,
  // Criar Cotação ficava aberta pro Operacional por ser só visualização, mas
  // confundia). Pedidos Feitos todo mundo vê: Gestão confirma quantidade
  // recebida, Operacional só marca recebido/observação (recorte reforçado
  // na Server Action, não só aqui).
  const acesso = await getAcessoAtual();

  const items = [
    ...(acesso.role !== "operacional" ? [{ label: "Criar Cotação", href: "/estoque/pedidos" }] : []),
    ...(acesso.role !== "operacional"
      ? [{ label: "Editor de Espelhos de Compras", href: "/estoque/pedidos/cotacoes" }]
      : []),
    { label: "Pedidos Feitos", href: "/estoque/pedidos/feitos" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SubTabs items={items} />
      {children}
    </div>
  );
}
