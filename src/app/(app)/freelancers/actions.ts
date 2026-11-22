"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensagemSemEdicao } from "@/lib/acesso";
import { requireFreelancers } from "@/lib/freelancers/acesso";
import { sincronizarTitulos } from "@/lib/freelancers/servidor";
import { diariaValida, mensagemCodigo, normalizarWhatsapp } from "@/lib/freelancers/regras";

// Freelancers (gestão e quem o dono liberou). Tudo que grava vai pela sessão da pessoa, nas RPCs
// `freela_*`, que conferem de novo o acesso, o módulo ligado e o "editar" e gravam a auditoria.
// A unidade sai sempre da sessão, nunca do formulário. Depois de conferir ou desfazer, o servidor
// sincroniza os títulos do Contas a Pagar (o Financeiro é exclusivo: a sessão não grava lá).

type Resultado = { ok: true } | { erro: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

function revalidar() {
  revalidatePath("/freelancers", "layout");
}

async function acessoEditar() {
  const acesso = await requireFreelancers();
  return { acesso, bloqueio: mensagemSemEdicao(acesso, "freelancers") };
}

function erroDaRpc(mensagem: string): string {
  return mensagemCodigo(mensagem.includes("sem_permissao") ? "sem_permissao" : "");
}

export async function criarConfiguracaoAction(): Promise<Resultado> {
  const { acesso, bloqueio } = await acessoEditar();
  if (bloqueio) return { erro: bloqueio };
  const { error } = await (await createClient()).rpc("freela_criar_configuracao", { p_unidade_id: acesso.unidadeId });
  if (error) return { erro: erroDaRpc(error.message) };
  revalidar();
  return { ok: true };
}

export async function salvarConfiguracaoAction(entrada: { diariaPadrao: number | null; contaCaixaId: string | null; ativa: boolean }): Promise<Resultado> {
  const { acesso, bloqueio } = await acessoEditar();
  if (bloqueio) return { erro: bloqueio };
  if (entrada.diariaPadrao !== null && !diariaValida(entrada.diariaPadrao)) return { erro: mensagemCodigo("diaria_invalida") };
  if (entrada.contaCaixaId !== null && !UUID.test(entrada.contaCaixaId)) return { erro: mensagemCodigo("conta_invalida") };
  const { data, error } = await (await createClient()).rpc("freela_salvar_configuracao", {
    p_unidade_id: acesso.unidadeId,
    p_diaria_padrao: entrada.diariaPadrao,
    p_conta_caixa_id: entrada.contaCaixaId,
    p_ativa: entrada.ativa === true,
  });
  if (error) return { erro: erroDaRpc(error.message) };
  if (data !== "ok") return { erro: mensagemCodigo(String(data)) };
  // Conta do caixa escolhida agora pode destravar diárias "pagas pelo caixa" que esperavam.
  await sincronizarTitulos(acesso.unidadeId);
  revalidar();
  return { ok: true };
}

export type EntradaFreelancer = {
  id: string | null;
  nome: string;
  whatsapp: string;
  funcao: string;
  diaria: number | null;
  ativo: boolean;
};

export async function salvarFreelancerAction(entrada: EntradaFreelancer): Promise<Resultado> {
  const { acesso, bloqueio } = await acessoEditar();
  if (bloqueio) return { erro: bloqueio };
  if (entrada.id !== null && !UUID.test(entrada.id)) return { erro: mensagemCodigo("nao_encontrado") };
  const whatsapp = normalizarWhatsapp(String(entrada.whatsapp ?? "").slice(0, 40));
  if (!whatsapp) return { erro: mensagemCodigo("whatsapp_invalido") };
  if (entrada.diaria !== null && !diariaValida(entrada.diaria)) return { erro: mensagemCodigo("diaria_invalida") };
  const { data, error } = await (await createClient()).rpc("freela_salvar_freelancer", {
    p_unidade_id: acesso.unidadeId,
    p_id: entrada.id,
    p_nome: String(entrada.nome ?? "").slice(0, 120),
    p_whatsapp: whatsapp,
    p_funcao: String(entrada.funcao ?? "").slice(0, 60),
    p_diaria: entrada.diaria,
    p_situacao: entrada.ativo ? "ativo" : "inativo",
  });
  if (error) return { erro: erroDaRpc(error.message) };
  const r = data as { ok: boolean; codigo?: string };
  if (!r?.ok) return { erro: mensagemCodigo(r?.codigo ?? "") };
  revalidar();
  return { ok: true };
}

export async function conferirAction(checkinId: string, valor: number | null, pagoNoCaixa: boolean): Promise<Resultado> {
  const { acesso, bloqueio } = await acessoEditar();
  if (bloqueio) return { erro: bloqueio };
  if (!UUID.test(checkinId)) return { erro: mensagemCodigo("nao_encontrado") };
  if (!diariaValida(valor)) return { erro: mensagemCodigo("valor_invalido") };
  const { data, error } = await (await createClient()).rpc("freela_conferir", {
    p_checkin_id: checkinId,
    p_valor: valor,
    p_pago_no_caixa: pagoNoCaixa === true,
  });
  if (error) return { erro: erroDaRpc(error.message) };
  if (data !== "ok") {
    revalidar();
    return { erro: mensagemCodigo(String(data)) };
  }
  await sincronizarTitulos(acesso.unidadeId);
  revalidar();
  return { ok: true };
}

export async function recusarAction(checkinId: string, motivo: string): Promise<Resultado> {
  const { bloqueio } = await acessoEditar();
  if (bloqueio) return { erro: bloqueio };
  if (!UUID.test(checkinId)) return { erro: mensagemCodigo("nao_encontrado") };
  const { data, error } = await (await createClient()).rpc("freela_recusar", {
    p_checkin_id: checkinId,
    p_motivo: String(motivo ?? "").slice(0, 240),
  });
  if (error) return { erro: erroDaRpc(error.message) };
  revalidar();
  return data === "ok" ? { ok: true } : { erro: mensagemCodigo(String(data)) };
}

export async function desfazerAction(checkinId: string): Promise<Resultado> {
  const { acesso, bloqueio } = await acessoEditar();
  if (bloqueio) return { erro: bloqueio };
  if (!UUID.test(checkinId)) return { erro: mensagemCodigo("nao_encontrado") };
  const { data, error } = await (await createClient()).rpc("freela_desfazer", { p_checkin_id: checkinId });
  if (error) return { erro: erroDaRpc(error.message) };
  if (data !== "ok") return { erro: mensagemCodigo(String(data)) };
  await sincronizarTitulos(acesso.unidadeId);
  revalidar();
  return { ok: true };
}

export async function adicionarManualAction(freelancerId: string, dia: string): Promise<Resultado> {
  const { acesso, bloqueio } = await acessoEditar();
  if (bloqueio) return { erro: bloqueio };
  if (!UUID.test(freelancerId)) return { erro: mensagemCodigo("nao_encontrado") };
  if (!DIA.test(dia)) return { erro: mensagemCodigo("dia_invalido") };
  const { data, error } = await (await createClient()).rpc("freela_adicionar_manual", {
    p_unidade_id: acesso.unidadeId,
    p_freelancer_id: freelancerId,
    p_dia: dia,
  });
  if (error) return { erro: erroDaRpc(error.message) };
  revalidar();
  return data === "ok" ? { ok: true } : { erro: mensagemCodigo(String(data)) };
}

/** Tenta de novo lançar no Contas a Pagar as diárias conferidas que ficaram sem título (ex.: o
 * Financeiro foi ligado depois, ou o mês foi reaberto). */
export async function lancarPendentesAction(): Promise<Resultado> {
  const { acesso, bloqueio } = await acessoEditar();
  if (bloqueio) return { erro: bloqueio };
  await sincronizarTitulos(acesso.unidadeId);
  revalidar();
  return { ok: true };
}
