import { SubTabs } from "@/components/sub-tabs";
import { requireAvaliacoes } from "@/lib/avaliacoes/acesso";

const SUB_ITEMS = [
  { label: "Painel", href: "/avaliacoes" },
  { label: "Configurar", href: "/avaliacoes/configurar" },
  { label: "Arte do QR", href: "/avaliacoes/qr" },
];

// Avaliações (12/11/2026): gestão e master, módulo ligado. Cada página e cada Server Action
// confere de novo; o banco é a última barreira (`usuario_pode_usar_avaliacoes`).
export default async function AvaliacoesLayout({ children }: { children: React.ReactNode }) {
  await requireAvaliacoes();
  return (
    <div className="flex flex-col gap-5">
      <SubTabs items={SUB_ITEMS} />
      {children}
    </div>
  );
}
