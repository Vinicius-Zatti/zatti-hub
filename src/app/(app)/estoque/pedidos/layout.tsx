import { SubTabs } from "@/components/sub-tabs";

const ITEMS = [
  { label: "Pedido de Compras", href: "/estoque/pedidos" },
  { label: "Cotações da Semana", href: "/estoque/pedidos/cotacoes" },
];

export default function PedidosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <SubTabs items={ITEMS} />
      {children}
    </div>
  );
}
