import { requireConfiguracoes } from "./acesso";

/** O cabeçalho e as abas (Unidade | Módulos) vêm do menu do piloto. */
export default async function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  await requireConfiguracoes();
  return <div className="flex flex-col gap-4">{children}</div>;
}
