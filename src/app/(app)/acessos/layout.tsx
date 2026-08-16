import { SubTabs } from "@/components/sub-tabs";
import { requireMaster } from "@/lib/acesso";

const SUB_ITEMS = [
  { label: "Visão geral", href: "/acessos" },
  { label: "Novo cliente", href: "/acessos/novo-cliente" },
  { label: "Usuários", href: "/acessos/usuarios" },
];

/** Barreira real do painel: `requireMaster()` redireciona quem não é
 * master antes de renderizar qualquer coisa aqui embaixo. Esconder o item
 * "Acessos" do menu (ver `src/app/(app)/layout.tsx`) é só UX - isto aqui é
 * quem de fato impede o acesso; cada Server Action em `actions.ts` chama
 * `requireMaster()` de novo, porque uma Server Action é alcançável direto
 * por POST, sem passar pela tela nem por este layout. */
export default async function AcessosLayout({ children }: { children: React.ReactNode }) {
  await requireMaster();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Painel de Acessos</h1>
        <p className="text-sm text-cinza-medio">
          Cadastro de clientes e gestão de quem acessa o Zatti Hub - só master.
        </p>
      </div>
      <SubTabs items={SUB_ITEMS} />
      {children}
    </div>
  );
}
