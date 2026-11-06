/** Quem escolhe a data do fechamento de vendas (06/11/2026). Fica fora de
 * `consolidado-vendas.ts` porque aquele arquivo importa o Supabase do servidor
 * e isto roda também no navegador.
 *
 * Só o acesso master (consultor da Zatti, sempre com segundo fator) escolhe
 * qualquer data ao lançar e muda a data de um dia já lançado. Gestão e
 * operacional do cliente continuam lançando na data do dia, sem trocar data
 * depois. O banco repete a regra no gatilho `proteger_escrita_consolidado`
 * (`usuario_e_master()`), que é a barreira que vale de verdade. */
import type { Role } from "@/lib/acesso";

export function podeEscolherDataConsolidado(role: Role): boolean {
  return role === "master";
}

/** `null` quando a troca de data é permitida (ou a data não mudou); senão a
 * mensagem para a tela. */
export function bloqueioTrocaDataConsolidado(role: Role, dataAtual: string, dataNova: string): string | null {
  if (dataAtual === dataNova) return null;
  if (podeEscolherDataConsolidado(role)) return null;
  return "A data de um dia já lançado não pode ser trocada no seu acesso. Peça à Zatti.";
}
