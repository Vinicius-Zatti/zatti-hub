import { usaNavegacaoV2 } from "@/lib/navegacao/piloto";
import type { NiveisCompletos } from "./modulos";

/** Quem muda permissões por módulo na Equipe (fase 6): master, ou o dono (gestão da
 * organização inteira) com a própria Equipe em "editar". Só na unidade piloto. Mesma regra de
 * `salvar_permissoes_modulo` no banco, que confere de novo. */
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

/** Dono não mexe nas permissões de outro dono (gestão da organização inteira): só o master.
 * Mesma recusa ('alvo_dono') de `salvar_permissoes_modulo` no banco. */
export function podeMudarPermissoesDe(
  ator: { role: string },
  alvo: { role: string; unidadeId: string | null },
): boolean {
  if (ator.role === "master") return true;
  return !(alvo.role === "gestao" && alvo.unidadeId === null);
}
