import { SubTabs } from "@/components/sub-tabs";

const ITEMS = [
  { label: "Fazer Contagem", href: "/estoque/contagem" },
  { label: "Visualização de Contagens", href: "/estoque/contagem/visualizacao" },
];

export default function ContagemLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <SubTabs items={ITEMS} />
      {children}
    </div>
  );
}
