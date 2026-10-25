"use server";

import { revalidatePath } from "next/cache";
import { requireMaster } from "@/lib/acesso";
import { alterarFlagModulo, validarExtratoEstoque } from "@/lib/acessos/alterar-flag";
import { definicaoModulo, ehChaveModulo } from "@/lib/configuracoes/modulos";
import { usaNavegacaoV2 } from "@/lib/navegacao/piloto";

type Resultado = { ok: true } | { erro: string };

/** Liga ou desliga um módulo da unidade da sessão (Configurações > Módulos).
 * Só master: módulo pode ser pago, então o dono só vê. A unidade (ou a
 * organização, no caso da Equipe) sai da sessão, nunca do formulário. Mesma
 * escrita e auditoria do /acessos (`alterarFlagModulo`). */
export async function definirModuloAction(chave: string, ligar: boolean): Promise<Resultado> {
  const acesso = await requireMaster();
  if (!ehChaveModulo(chave) || typeof ligar !== "boolean") return { erro: "Pedido inválido." };
  if (!usaNavegacaoV2(acesso)) return { erro: "Configurações ainda só existe na unidade piloto." };
  const def = definicaoModulo(chave);
  if (!def.ligadoPor) return { erro: `${def.nome} faz parte de todo acesso e não desliga.` };

  const ehOrganizacao = def.ligadoPor.tabela === "organizacoes";
  const ehExtrato = def.ligadoPor.coluna === "extrato_estoque_habilitado";
  const r = await alterarFlagModulo({
    acesso,
    tabela: def.ligadoPor.tabela,
    id: ehOrganizacao ? acesso.organizacaoId : acesso.unidadeId,
    coluna: def.ligadoPor.coluna,
    ligar,
    // Extrato mantém o nome de ação que /acessos já grava.
    acaoLigar: ehExtrato ? "ligar_extrato_estoque" : `ligar_modulo_${chave}`,
    acaoDesligar: ehExtrato ? "desligar_extrato_estoque" : `desligar_modulo_${chave}`,
    campoAuditoria: def.ligadoPor.coluna,
    ...(ehExtrato ? { colunasValidacao: ["fonte_dados_estoque"], validar: validarExtratoEstoque(ligar) } : {}),
  });
  if ("erro" in r) return r;

  // O menu, as abas e as telas de toda a unidade mudam com a chave.
  if (r.mudou) {
    revalidatePath("/", "layout");
    revalidatePath("/acessos");
  }
  return { ok: true };
}
