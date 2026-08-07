"use client";

import { trocarOrganizacaoAction } from "@/lib/supabase/actions";

export function OrgSwitcher({
  organizacoes,
  atual,
}: {
  organizacoes: { id: string; nome: string }[];
  atual: string;
}) {
  return (
    <form action={trocarOrganizacaoAction}>
      <select
        name="organizacaoId"
        aria-label="Organização atual"
        defaultValue={atual}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="min-h-10 w-full max-w-full rounded-md border border-white/15 bg-azul-petroleo px-2 py-1.5 text-xs text-branco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
      >
        {organizacoes.map((org) => (
          <option key={org.id} value={org.id}>
            {org.nome}
          </option>
        ))}
      </select>
    </form>
  );
}
