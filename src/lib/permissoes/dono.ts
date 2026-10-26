// Dono da organização (26/10/2026): regra pura, usada pelo getAcessoAtual e pela Equipe.
// Espelho de `vinculo_e_dono` em supabase/migrations/20261026120000_titular_e_chef.sql.

/** Dono da organização na sessão (mesma regra de `vinculo_e_dono` no banco): o titular marcado,
 * se a pessoa tem esse vínculo; sem titular marcado, a gestão da organização inteira. Master
 * nunca é dono (administra por ser master). */
export function ehDonoDaOrganizacao(entrada: {
  ehMaster: boolean;
  titularVinculoId: string | null;
  vinculosDaOrg: readonly { id: string; role: string; unidade_id: string | null }[];
  vinculoBase: { role: string; unidade_id: string | null } | null;
}): { ehDono: boolean; ehTitular: boolean } {
  if (entrada.ehMaster) return { ehDono: false, ehTitular: false };
  if (entrada.titularVinculoId) {
    const ehTitular = entrada.vinculosDaOrg.some((v) => v.id === entrada.titularVinculoId && v.role === "gestao");
    return { ehDono: ehTitular, ehTitular };
  }
  const reserva = entrada.vinculoBase?.role === "gestao" && entrada.vinculoBase.unidade_id === null;
  return { ehDono: reserva, ehTitular: false };
}

/** Dono de um vínculo da equipe (tela Equipe): o titular marcado; sem titular, gestão da
 * organização inteira. */
export function vinculoEhDono(
  vinculo: { id: string; role: string; unidadeId: string | null; status: string },
  titularVinculoId: string | null,
): boolean {
  if (vinculo.role !== "gestao" || vinculo.status === "revogado") return false;
  if (titularVinculoId) return vinculo.id === titularVinculoId;
  return vinculo.unidadeId === null;
}
