"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { carregarPesquisaPublica, type PesquisaPublica } from "@/lib/avaliacoes/servidor";
import { chaveHash, dispositivoValido, hashAnonimo, ipDaRequisicao, ipParaLimite } from "@/lib/avaliacoes/anonimizacao";
import { ehOrigem, normalizarWhatsapp, perguntasDoTipo, validarRespostas } from "@/lib/avaliacoes/perguntas";

/** `respostaId` só vem quando a avaliação pode girar a roleta (app, roleta ligada). */
export type EstadoAvaliacao = { ok?: boolean; erro?: string; campo?: string; respostaId?: string };

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
  if (!pesquisa.ativa || !pesquisa.origens.includes(origem)) return { erro: "Esta pesquisa está pausada no momento." };

  const perguntas = perguntasDoTipo(pesquisa.perguntas, origem, pesquisa.atendentes);
  const brutas: Record<string, unknown> = {};
  for (const p of perguntas) {
    const valor = formData.get(`q_${p.chave}`);
    if (typeof valor === "string") brutas[p.chave] = valor.slice(0, 1100);
  }
  const outro = formData.get("q_conheceu_outro");
  if (typeof outro === "string") brutas.conheceu_outro = outro.slice(0, 200);
  const validacao = validarRespostas(perguntas, brutas, pesquisa.atendentes);
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
  const r = (data ?? {}) as { ok?: boolean; codigo?: string; campo?: string; respostaId?: string };
  if (r.ok) return typeof r.respostaId === "string" ? { ok: true, respostaId: r.respostaId } : { ok: true };
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

export type ResultadoRoleta =
  | { ok: true; premioId: string; premio: string; regra: string | null; cupom: string; validoAte: string }
  | { ok: false; erro: string; campo?: "whatsapp" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function dataBr(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

// Roleta (13/11/2026): só depois da avaliação de app gravada, com o id que a gravação devolveu. O
// banco sorteia, gera o código e barra o segundo prêmio do mesmo WhatsApp em 30 dias.
export async function girarRoletaAction(respostaId: string, whatsapp: string): Promise<ResultadoRoleta> {
  if (typeof respostaId !== "string" || !UUID.test(respostaId)) return { ok: false, erro: "Avaliação não encontrada." };
  const numero = normalizarWhatsapp(String(whatsapp ?? "").slice(0, 40));
  if (!numero) return { ok: false, erro: "Esse WhatsApp não parece válido. Confira o DDD e o número.", campo: "whatsapp" };
  const { data, error } = await createAdminClient().rpc("avaliacoes_girar_roleta", { p_resposta_id: respostaId, p_whatsapp: numero });
  if (error) {
    console.error("avaliacoes_girar_roleta_falhou", { codigo: error.code ?? null });
    return { ok: false, erro: MENSAGEM_GENERICA };
  }
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok === true && typeof r.cupom === "string" && typeof r.premio === "string" && typeof r.premioId === "string" && typeof r.validoAte === "string") {
    return { ok: true, premioId: r.premioId, premio: r.premio, regra: typeof r.regra === "string" ? r.regra : null, cupom: r.cupom, validoAte: r.validoAte };
  }
  switch (r.codigo) {
    case "ja_ganhou":
      return {
        ok: false,
        erro: `Esse WhatsApp já ganhou um prêmio nos últimos 30 dias${typeof r.premio === "string" ? ` (${r.premio}` : ""}${typeof r.validoAte === "string" ? `, válido até ${dataBr(r.validoAte)})` : typeof r.premio === "string" ? ")" : ""}. Cada número gira uma vez por mês.`,
        campo: "whatsapp",
      };
    case "whatsapp_invalido":
      return { ok: false, erro: "Esse WhatsApp não parece válido. Confira o DDD e o número.", campo: "whatsapp" };
    case "expirada":
      return { ok: false, erro: "O tempo para girar a roleta desta avaliação acabou." };
    case "desligada":
      return { ok: false, erro: "A roleta está desligada no momento." };
    default:
      return { ok: false, erro: MENSAGEM_GENERICA };
  }
}
