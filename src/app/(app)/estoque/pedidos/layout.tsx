import { SubTabs } from "@/components/sub-tabs";
import { getAcessoAtual } from "@/lib/acesso";

export default async function PedidosLayout({ children }: { children: React.ReactNode }) {
  // Criar Cotação é só visualização (a página não grava nada na planilha),
  // por isso Operacional entra aqui também. Editor de Espelhos é só de quem
  // compra (Gestão/master) - fecha o Pedido de Compra de verdade. Pedidos
  // Feitos todo mundo vê: Gestão confirma quantidade recebida, Operacional
  // só marca recebido/observação (recorte é reforçado na Server Action,
  // não só aqui).
  const acesso = await getAcessoAtual();

  const items = [
    { label: "Criar Cotação", href: "/estoque/pedidos" },
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
