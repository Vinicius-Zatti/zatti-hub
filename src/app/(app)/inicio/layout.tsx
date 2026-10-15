import { requireEscritorio } from "@/lib/acesso";

// Início da área do Vinícius (Zatti HUB): só master, mesmo padrão de
// `escritorio/layout.tsx`. A página repete a barreira.
export default async function InicioLayout({ children }: { children: React.ReactNode }) {
  await requireEscritorio();
  return children;
}
