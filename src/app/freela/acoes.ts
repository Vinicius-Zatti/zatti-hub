"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { chaveHash, dispositivoValido, hashAnonimo, ipDaRequisicao, ipParaLimite } from "@/lib/avaliacoes/anonimizacao";
import { mensagemCodigo, normalizarWhatsapp, slugValido, validarCheckin } from "@/lib/freelancers/regras";

export type EstadoCheckinPublico = { ok?: boolean; hora?: string; jaFeito?: boolean; erro?: string; campo?: string };

const MENSAGEM_GENERICA = "Não deu para registrar agora. Tente de novo em instantes.";

// Única porta de gravação da página do QR (sem login). Nada do formulário é confiável: o
// WhatsApp é normalizado aqui, os hashes de IP e de aparelho são calculados aqui (o banco nunca
// vê o IP puro) e a RPC `freela_registrar_checkin`, que só o servidor executa, confere tudo de
// novo, aplica o limite e grava. Mesmo desenho da página das Avaliações.
export async function registrarCheckinAction(_estado: EstadoCheckinPublico, formData: FormData): Promise<EstadoCheckinPublico> {
  const slug = String(formData.get("slug") ?? "").slice(0, 60);
  if (!slugValido(slug)) return { erro: "Check-in não encontrado." };
  const whatsapp = normalizarWhatsapp(String(formData.get("whatsapp") ?? "").slice(0, 40));
  const validacao = validarCheckin({
    whatsapp,
    nome: String(formData.get("nome") ?? "").slice(0, 120),
    funcao: String(formData.get("funcao") ?? "").slice(0, 60),
  });
  if (!validacao.ok) return { erro: validacao.erro, campo: validacao.campo };

  const chave = chaveHash();
  if (!chave) {
    console.error("freela_sem_chave_hash");
    return { erro: MENSAGEM_GENERICA };
  }
  const cabecalhos = await headers();
  const ip = ipParaLimite(ipDaRequisicao(cabecalhos));
  const dispositivoBruto = dispositivoValido(formData.get("dispositivo"));
  const semAparelho = dispositivoBruto === "sem-dispositivo";
  const dispositivo = semAparelho ? `sem-dispositivo:${ip}` : dispositivoBruto;
  const hoje = hojeIsoBrasil();
  const decorrido = Number(formData.get("decorrido") ?? 0);

  const { data, error } = await createAdminClient().rpc("freela_registrar_checkin", {
    p_slug: slug,
    p_whatsapp: whatsapp,
    p_nome: validacao.nome,
    p_funcao: validacao.funcao,
    p_armadilha: String(formData.get("site") ?? ""),
    p_decorrido_ms: Number.isFinite(decorrido) ? Math.max(0, Math.min(Math.trunc(decorrido), 2_000_000_000)) : 0,
    // Hash do aparelho com o dia: liga dois check-ins do mesmo celular no mesmo dia, nunca entre dias.
    p_hash_ip: hashAnonimo(chave, "ip", ip, hoje),
    p_hash_dispositivo: hashAnonimo(chave, "dispositivo", `freela|${dispositivo}`, hoje),
  });
  if (error) {
    console.error("freela_registrar_checkin_falhou", { codigo: error.code ?? null });
    return { erro: MENSAGEM_GENERICA };
  }
  const r = data as { ok: boolean; codigo?: string; hora?: string; jaFeito?: boolean; descartado?: boolean };
  if (!r?.ok) {
    if (r?.codigo === "fechado") return { erro: "O check-in desta loja está fechado no momento. Fale com o gerente." };
    if (r?.codigo === "limite") return { erro: "Muitos check-ins por este celular hoje. Fale com o gerente." };
    if (r?.codigo === "nao_encontrado") return { erro: "Check-in não encontrado." };
    if (r?.codigo === "nome_invalido") return { erro: "Escreva seu nome (de 2 a 80 letras).", campo: "nome" };
    if (r?.codigo === "whatsapp_invalido") return { erro: mensagemCodigo("whatsapp_invalido"), campo: "whatsapp" };
    if (r?.codigo === "funcao_invalida") return { erro: mensagemCodigo("funcao_invalida"), campo: "funcao" };
    return { erro: MENSAGEM_GENERICA };
  }
  return { ok: true, hora: r.hora, jaFeito: r.jaFeito === true };
}
