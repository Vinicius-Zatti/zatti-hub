import { SubTabs } from "@/components/sub-tabs";
import { requireAgenda } from "@/lib/acesso";

const SUB_ITEMS = [
  { label: "Dia", href: "/agenda/dia" },
  { label: "Rotina da semana", href: "/agenda/semana" },
];

// Módulo pessoal - defesa em profundidade: sai pra fora se quem estiver
// logado não for master, mesmo padrão de `meu-tempo/layout.tsx`.
export default async function AgendaLayout({ children }: { children: React.ReactNode }) {
  await requireAgenda();

  return (
    <div className="flex flex-col gap-5">
      <SubTabs items={SUB_ITEMS} />
      {children}
    </div>
  );
}
