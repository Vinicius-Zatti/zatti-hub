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
        defaultValue={atual}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded bg-azul-petroleo px-2 py-1 text-xs text-branco"
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
