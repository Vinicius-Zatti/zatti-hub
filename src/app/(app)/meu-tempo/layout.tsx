import { SubTabs } from "@/components/sub-tabs";
import { requireMeuTempo } from "@/lib/acesso";

const SUB_ITEMS = [
  { label: "Hoje", href: "/meu-tempo/hoje" },
  { label: "Painel mensal", href: "/meu-tempo/painel" },
  { label: "Histórico", href: "/meu-tempo/historico" },
  { label: "Configurações", href: "/meu-tempo/configuracoes" },
];

// Módulo pessoal - defesa em profundidade: sai pra fora se quem estiver
// logado não for master, mesmo padrão de `financeiro-gerencial/layout.tsx`.
export default async function MeuTempoLayout({ children }: { children: React.ReactNode }) {
  await requireMeuTempo();

  return (
    <div className="flex flex-col gap-5">
      <SubTabs items={SUB_ITEMS} />
      {children}
    </div>
  );
}
