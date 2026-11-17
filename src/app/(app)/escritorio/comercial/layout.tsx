import { SubTabs } from "@/components/sub-tabs";
import { requireEscritorio } from "@/lib/acesso";

const SUB_ITEMS = [
  { label: "Funil", href: "/escritorio/comercial" },
  { label: "Prospecção fria", href: "/escritorio/comercial/prospeccao-fria" },
];

// Comercial (16/11/2026): o funil de sempre e o painel da prospecção fria. Só
// master, como todo o Escritório; cada página confere de novo e o RLS de
// `zh_leads` é a barreira real.
export default async function ComercialLayout({ children }: { children: React.ReactNode }) {
  await requireEscritorio();
  return (
    <div className="flex flex-col gap-5">
      <SubTabs items={SUB_ITEMS} />
      {children}
    </div>
  );
}
