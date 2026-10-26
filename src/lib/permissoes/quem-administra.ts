import { usaNavegacaoV2 } from "@/lib/navegacao/piloto";
import type { NiveisCompletos } from "./modulos";

/** Quem muda permissões por módulo na Equipe: master, ou o dono com a própria Equipe em
 * "editar". Dono = o titular da organização (marcado pelo master, 26/10/2026); sem titular
 * marcado, a gestão da organização inteira, como antes. Gestão que não é o dono não administra.
 * Mesma regra de `salvar_permissoes_modulo` no banco, que confere de novo. */
export function podeAdministrarPermissoes(acesso: {
  role: string;
  ehDono: boolean;
  permissoes: NiveisCompletos;
  unidadeId: string;
  areaInterna: boolean;
}): boolean {
  if (!usaNavegacaoV2(acesso)) return false;
  if (acesso.role === "master") return true;
  return acesso.ehDono && acesso.permissoes.equipe === "editar";
}

/** As permissões do dono (o titular ou, sem titular, outra gestão da organização inteira) só o
 * master muda. Mesma recusa ('alvo_dono') de `salvar_permissoes_modulo` no banco. */
export function podeMudarPermissoesDe(ator: { role: string }, alvo: { ehDono: boolean }): boolean {
  if (ator.role === "master") return true;
  return !alvo.ehDono;
}

/** A conta do titular (senha provisória, editar acesso, tirar acesso) só o master mexe. Mesma
 * recusa ('alvo_titular') de `gerar_senha_provisoria_conta` e `editar_vinculo_acesso`. */
export function podeMexerNaContaDe(ator: { role: string }, alvo: { ehTitular: boolean }): boolean {
  return ator.role === "master" || !alvo.ehTitular;
}
