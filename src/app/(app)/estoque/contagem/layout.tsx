import { SubTabs } from "@/components/sub-tabs";

const ITEMS = [
  { label: "Fazer Contagem", href: "/estoque/contagem" },
  { label: "Conferência de Contagem", href: "/estoque/contagem/visualizacao" },
  { label: "Movimentações", href: "/estoque/contagem/movimentacoes" },
  { label: "Perdas", href: "/estoque/contagem/perdas" },
];

export default function ContagemLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <SubTabs items={ITEMS} />
      {children}
    </div>
  );
}
