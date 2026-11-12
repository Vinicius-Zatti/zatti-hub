"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { carregarPesquisaPublica, type PesquisaPublica } from "@/lib/avaliacoes/servidor";
import { chaveHash, dispositivoValido, hashAnonimo, ipDaRequisicao, ipParaLimite } from "@/lib/avaliacoes/anonimizacao";
import { ehOrigem, normalizarWhatsapp, perguntasAtivas, validarRespostas } from "@/lib/avaliacoes/perguntas";

export type EstadoAvaliacao = { ok?: boolean; erro?: string; campo?: string };

const MENSAGEM_GENERICA = "Não deu para enviar agora. Tente de novo em instantes.";

// Única porta de gravação da página pública (sem login). Nada do formulário é confiável: a
// pesquisa e as perguntas são relidas do banco aqui, os hashes de IP e de aparelho são calculados
// aqui (o banco nunca vê o IP puro) e a RPC `avaliacoes_registrar`, que só o servidor executa,
// valida tudo de novo, aplica o limite e grava.
export async function enviarAvaliacaoAction(_estado: EstadoAvaliacao, formData: FormData): Promise<EstadoAvaliacao> {
  const slug = String(formData.get("slug") ?? "").slice(0, 60);
  const origem = String(formData.get("origem") ?? "");
  if (!ehOrigem(origem)) return { erro: "Pesquisa não encontrada." };
  let pesquisa: PesquisaPublica | null;
  try {
    pesquisa = await carregarPesquisaPublica(slug);
  } catch {
    return { erro: MENSAGEM_GENERICA };
  }
  if (!pesquisa) return { erro: "Pesquisa não encontrada." };
  if (!pesquisa.ativa) return { erro: "Esta pesquisa está pausada no momento." };

  const perguntas = perguntasAtivas(pesquisa.perguntas);
  const brutas: Record<string, unknown> = {};
  for (const p of perguntas) {
    const valor = formData.get(`q_${p.chave}`);
    if (typeof valor === "string") brutas[p.chave] = valor.slice(0, 1100);
  }
  const outro = formData.get("q_conheceu_outro");
  if (typeof outro === "string") brutas.conheceu_outro = outro.slice(0, 200);
  const validacao = validarRespostas(perguntas, brutas);
  if (!validacao.ok) return { erro: validacao.erro, campo: validacao.chave };

  const consentiu = formData.get("consentimento") === "sim";
  const whatsappDigitado = String(formData.get("whatsapp") ?? "").slice(0, 40).trim();
  if (consentiu && whatsappDigitado && !normalizarWhatsapp(whatsappDigitado)) {
    return { erro: "Esse WhatsApp não parece válido. Confira o DDD e o número.", campo: "whatsapp" };
  }

  const chave = chaveHash();
  if (!chave) {
    console.error("avaliacoes_sem_chave_hash");
    return { erro: MENSAGEM_GENERICA };
  }
  const cabecalhos = await headers();
  const ip = ipParaLimite(ipDaRequisicao(cabecalhos));
  const dispositivoBruto = dispositivoValido(formData.get("dispositivo"));
  // Sem identificador do aparelho (navegador sem armazenamento), o limite vale por IP.
  const semAparelho = dispositivoBruto === "sem-dispositivo";
  const dispositivo = semAparelho ? `sem-dispositivo:${ip}` : dispositivoBruto;
  const hoje = hojeIsoBrasil();
  const decorrido = Number(formData.get("decorrido") ?? 0);
  // Versão do texto de consentimento que a pessoa leu na tela (a RPC guarda a cópia dessa versão).
  const termo = Number(formData.get("termo"));

  const { data, error } = await createAdminClient().rpc("avaliacoes_registrar", {
    p_slug: slug,
    p_origem: origem,
    p_respostas: validacao.respostas,
    p_whatsapp: consentiu && whatsappDigitado ? whatsappDigitado : null,
    p_consentimento: consentiu && whatsappDigitado !== "",
    p_termo_versao: Number.isInteger(termo) && termo > 0 ? termo : pesquisa.termoVersao,
    p_armadilha: String(formData.get("site") ?? ""),
    p_decorrido_ms: Number.isFinite(decorrido) ? Math.max(0, Math.min(Math.trunc(decorrido), 2_000_000_000)) : 0,
    p_hash_ip: hashAnonimo(chave, "ip", ip, hoje),
    p_hash_dispositivo: hashAnonimo(chave, "dispositivo", dispositivo, semAparelho ? hoje : ""),
  });
  if (error) {
    console.error("avaliacoes_registrar_falhou", { codigo: error.code ?? null });
    return { erro: MENSAGEM_GENERICA };
  }
  const r = (data ?? {}) as { ok?: boolean; codigo?: string; campo?: string };
  if (r.ok) return { ok: true };
  switch (r.codigo) {
    case "limite":
      return { erro: "Já recebemos uma avaliação deste celular há pouco. Obrigado!" };
    case "encerrada":
      return { erro: "Esta pesquisa está pausada no momento." };
    case "whatsapp_invalido":
      return { erro: "Esse WhatsApp não parece válido. Confira o DDD e o número.", campo: "whatsapp" };
    case "invalida":
      return { erro: "Confira as respostas e tente de novo.", campo: r.campo };
    case "nao_encontrada":
      return { erro: "Pesquisa não encontrada." };
    default:
      return { erro: MENSAGEM_GENERICA };
  }
}
