"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria, requireMaster } from "@/lib/acesso";
import { createClient } from "@/lib/supabase/server";
import { requireConfiguracoes } from "./acesso";
import { alterarFlagModulo, validarExtratoEstoque } from "@/lib/acessos/alterar-flag";
import { definicaoModulo, ehChaveModulo } from "@/lib/configuracoes/modulos";
import { usaNavegacaoV2 } from "@/lib/navegacao/piloto";

type Resultado = { ok: true } | { erro: string };

/** Liga ou desliga um módulo da unidade da sessão (Configurações > Módulos).
 * Só master: módulo pode ser pago, então o dono só vê. A unidade (ou a
 * organização, no caso da Equipe) sai da sessão, nunca do formulário. Mesma
 * escrita e auditoria do /acessos (`alterarFlagModulo`). */
export async function definirModuloAction(chave: string, ligar: boolean): Promise<Resultado> {
  if (chave === "contagem_setor") return definirContagemPorSetor(ligar);
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

/** Chave "Contagem por setor" (28/10/2026): exceção aberta só para ela. Dono e
 * gestão também trocam (é modo de trabalho, não módulo pago). Quem chega aqui
 * passou por `requireConfiguracoes` (master, dono ou gestão que vê
 * Configurações; operacional volta ao Início). A escrita vai pela sessão da
 * pessoa, na função do banco que confere o papel de novo, trava a troca com
 * contagem por setor em andamento e recusa ligar com o estoque na planilha. */
async function definirContagemPorSetor(ligar: boolean): Promise<Resultado> {
  const acesso = await requireConfiguracoes();
  if (typeof ligar !== "boolean") return { erro: "Pedido inválido." };
  if (acesso.role !== "master" && acesso.role !== "gestao") {
    return { erro: "Só a gestão ou a Zatti trocam o modo da contagem." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("definir_contagem_por_setor", {
    p_unidade_id: acesso.unidadeId,
    p_ligar: ligar,
  });
  if (error) {
    // P0001 traz a frase pronta do banco (contagem em andamento, planilha).
    if (error.code === "P0001") return { erro: error.message };
    if (error.code === "42501") return { erro: "Sem permissão para trocar o modo da contagem nesta unidade." };
    console.error("Falha ao trocar a contagem por setor", error.code ?? "", error.message);
    return { erro: "Não foi possível salvar agora. Tente de novo em instantes." };
  }

  if (data === true) {
    await registrarAuditoria({
      acesso,
      acao: ligar ? "ligar_modulo_contagem_setor" : "desligar_modulo_contagem_setor",
      entidade: "unidade",
      entidadeId: acesso.unidadeId,
      dadosAntigos: { contagem_por_setor_habilitada: !ligar },
      dadosNovos: { contagem_por_setor_habilitada: ligar },
    });
    // Contagem, Setores, pedidos, CMV e o cadastro rápido mudam com a chave.
    revalidatePath("/", "layout");
  }
  return { ok: true };
}
