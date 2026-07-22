import { SubTabs } from "@/components/sub-tabs";
import { requireGestao } from "@/lib/acesso";

const ITEMS = [
  { label: "Pedido de Compras", href: "/estoque/pedidos" },
  { label: "Cotações da Semana", href: "/estoque/pedidos/cotacoes" },
];

export default async function PedidosLayout({ children }: { children: React.ReactNode }) {
  await requireGestao();
  return (
    <div className="flex flex-col gap-4">
      <SubTabs items={ITEMS} />
      {children}
    </div>
  );
}
