import { SubTabs } from "@/components/sub-tabs";
import { AvisoSomenteVer } from "@/components/aviso-somente-ver";
import { temPermissao } from "@/lib/acesso";
import { requireFreelancers } from "@/lib/freelancers/acesso";

// Freelancers (22/11/2026): gestão, master ou a operação que o dono liberou, com o módulo ligado.
// Cada página e cada Server Action confere de novo; o banco é a última barreira
// (`usuario_pode_usar_freelancers`).
export default async function FreelancersLayout({ children }: { children: React.ReactNode }) {
  const acesso = await requireFreelancers();
  const itens = [
    { label: "Hoje", href: "/freelancers" },
    { label: "Cadastro", href: "/freelancers/cadastro" },
    { label: "Histórico", href: "/freelancers/historico" },
    { label: "Arte do QR", href: "/freelancers/qr" },
    ...(temPermissao(acesso, "freelancers", "editar") ? [{ label: "Configurar", href: "/freelancers/configurar" }] : []),
  ];
  return (
    <div className="flex flex-col gap-5">
      <SubTabs items={itens} />
      <AvisoSomenteVer acesso={acesso} modulo="freelancers" />
      {children}
    </div>
  );
}
