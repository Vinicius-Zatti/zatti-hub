import { SubTabs } from "@/components/sub-tabs";
import { getAcessoAtual } from "@/lib/acesso";

export default async function PedidosLayout({ children }: { children: React.ReactNode }) {
  // Criar Cotação é só visualização (a página não grava nada na planilha),
  // por isso Operacional entra aqui também - Editor de Espelhos e Pedidos
  // Feitos continuam só pro master, Fase 2 ainda não desenhada com o
  // Vinícius pra decidir o recorte de permissão deles.
  const acesso = await getAcessoAtual();

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
