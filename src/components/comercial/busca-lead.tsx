"use client";

import { CampoBusca } from "@/components/campo-busca";

/** Busca de lead do Comercial (Vinícius, 27/11/2026): um campo só, pelo @ do
 * Instagram ou pelo nome, filtrando enquanto digita. Usada no funil e na
 * tabela da Prospecção fria. Quem usa filtra com `buscarLeads`. */
export function BuscaLead({
  termo,
  onChange,
  encontrados,
  total,
  singular = "lead",
  plural = "leads",
}: {
  termo: string;
  onChange: (termo: string) => void;
  encontrados: number;
  total: number;
  singular?: string;
  plural?: string;
}) {
  const nome = (n: number) => (n === 1 ? singular : plural);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <CampoBusca
        valor={termo}
        onChange={onChange}
        rotulo={`Buscar ${singular} pelo @ do Instagram ou pelo nome`}
        placeholder="Buscar pelo @ ou pelo nome"
      />
      <p className="text-sm text-cinza-medio" aria-live="polite">
        {termo.trim() ? `${encontrados} de ${total} ${nome(total)}` : `${total} ${nome(total)}`}
      </p>
    </div>
  );
}

/** Mensagem quando a busca não acha nada. */
export function BuscaLeadSemResultado({ termo }: { termo: string }) {
  return (
    <p role="status" className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">
      Nenhum resultado para &ldquo;{termo.trim()}&rdquo;. Confira o @ ou o nome, ou limpe a busca para ver a lista toda.
    </p>
  );
}
