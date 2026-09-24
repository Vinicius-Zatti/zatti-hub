import { AbasEscritorio } from "@/components/escritorio/abas-escritorio";
import { requireEscritorio } from "@/lib/acesso";

// Módulo interno de Vinícius - defesa em profundidade: sai pra fora se quem
// estiver logado não for master, mesmo padrão de `agenda/layout.tsx`.
export default async function EscritorioLayout({ children }: { children: React.ReactNode }) {
  await requireEscritorio();

  return (
    <div className="flex flex-col gap-5">
      <AbasEscritorio />
      {children}
    </div>
  );
}
