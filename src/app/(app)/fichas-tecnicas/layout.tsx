import { SubTabs } from "@/components/sub-tabs";
import { requireFichasTecnicas } from "@/lib/acesso";

const SUB_ITEMS = [
  { label: "Fichas", href: "/fichas-tecnicas" },
  { label: "Nova Ficha", href: "/fichas-tecnicas/nova" },
  { label: "Categorias", href: "/fichas-tecnicas/categorias" },
];

// Nova ficha e Categorias são só Gestão/master - Operacional só consulta
// (mesmo padrão de `financeiro/layout.tsx` com o Dashboard).
const SOMENTE_GESTAO = ["/fichas-tecnicas/nova", "/fichas-tecnicas/categorias"];

export default async function FichasTecnicasLayout({ children }: { children: React.ReactNode }) {
  // Defesa em profundidade: redireciona pra fora igual `requireGestao` faz
  // hoje se alguém digitar a URL direto sem a flag do piloto ligada pra
  // essa unidade.
  const acesso = await requireFichasTecnicas();

  const items = acesso.role === "operacional" ? SUB_ITEMS.filter((item) => !SOMENTE_GESTAO.includes(item.href)) : SUB_ITEMS;

  return (
    <div className="flex flex-col gap-5">
      <SubTabs items={items} />
      {children}
    </div>
  );
}
