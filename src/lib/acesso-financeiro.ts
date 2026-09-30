/** Regra de negócio de 29/09/2026, textual de Vinícius: "só eu posso ter
 * acesso ao financeiro de qq cliente [...] até segunda ordem". Financeiro
 * Gerencial, Conciliação e Uso de IA ficam só para ele, em toda unidade:
 * Gestão, Operacional e qualquer outro master perdem o módulo, sem perder o
 * vínculo nem os outros módulos.
 *
 * Esta é a barreira do app (menu, layouts, páginas e Server Actions, via
 * `financeiroGerencialHabilitado` do `getAcessoAtual`). A barreira que vale
 * de verdade está no banco: `usuario_e_titular_financeiro()` dentro de
 * `usuario_pode_usar_financeiro_gerencial` (migração 20260930092000), com a
 * lista de titulares em `fin_acesso_titulares`.
 *
 * Desfazer ("segunda ordem"): `RESTRICAO_FINANCEIRO_ATIVA = false` aqui e
 * `update public.fin_acesso_exclusivo set ativo = false where id;` no banco. */
export const RESTRICAO_FINANCEIRO_ATIVA = true;

/** As duas contas de Vinícius. Só valem com vínculo master e segundo fator. */
export const TITULARES_FINANCEIRO = ["consultoriazatti@gmail.com", "viniciusczanetti@gmail.com"] as const;

export function ehTitularFinanceiro(params: { ehMaster: boolean; aal: unknown; email: string }): boolean {
  if (!RESTRICAO_FINANCEIRO_ATIVA) return true;
  if (!params.ehMaster || params.aal !== "aal2") return false;
  const email = params.email.trim().toLowerCase();
  return (TITULARES_FINANCEIRO as readonly string[]).includes(email);
}
