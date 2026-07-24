import { SubTabs } from "@/components/sub-tabs";
import { requireGestao } from "@/lib/acesso";

export default async function PedidosLayout({ children }: { children: React.ReactNode }) {
  const acesso = await requireGestao();

  const items = [
    { label: "Criar Cotação", href: "/estoque/pedidos" },
    ...(acesso.role === "master"
      ? [
          { label: "Editor de Espelhos de Compras (em breve)", href: "/estoque/pedidos/cotacoes" },
          { label: "Pedidos Feitos (em breve)", href: "/estoque/pedidos/feitos" },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <SubTabs items={items} />
      {children}
    </div>
  );
}
