// Contato do suporte da Zatti pelo WhatsApp. Função pura (sem `Date.now`,
// sem `window`): serve ao cartão de erro e aos testes.

import { ErroPublico } from "@/lib/erros";

/** Número único do suporte (Vinícius) - todo link de WhatsApp do app sai daqui. */
export const WHATSAPP_VINICIUS = "5511963898411";

const LIMITE_CAMPO = 120;

/** Texto curto, numa linha só: do identificador de erro vale só a primeira
 * linha, cortada - nunca carrega stack nem trecho comprido. */
function limpar(valor: string | null | undefined): string {
  const primeiraLinha = (valor ?? "").trim().split(/\r?\n/)[0];
  return primeiraLinha.replace(/\s+/g, " ").trim().slice(0, LIMITE_CAMPO);
}

/** O que identifica o erro para o suporte: o `digest` do Next (o servidor
 * guarda o detalhe no log) ou a mensagem de um `ErroPublico`, já pensada para
 * a tela. Mensagem crua de erro (SQL, caminho interno) nunca entra. */
export function identificadorDoErro(erro: Error & { digest?: string }): string | null {
  if (erro.digest) return erro.digest;
  return erro instanceof ErroPublico ? erro.message : null;
}

/** DD/MM/AAAA HH:MM no horário de Brasília, independente do fuso do aparelho. */
export function formatarDataHoraSuporte(momento: Date): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(momento)
      .map((p) => [p.type, p.value]),
  );
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}

export type DadosSuporte = {
  /** Nome da unidade (e da organização) vindos da sessão. */
  unidade: string | null;
  /** Caminho da tela. Parâmetros de busca (`?x=`) e âncora são descartados. */
  tela: string;
  momento: Date;
  /** `error.digest` do Next ou a mensagem pública (`ErroPublico`) do erro. */
  identificador: string | null;
};

/** Mensagem pronta para o usuário só clicar e enviar. Só leva unidade, tela,
 * data/hora e identificador: nunca stack, SQL, valores ou segredo. */
export function montarMensagemSuporte(dados: DadosSuporte): string {
  const tela = limpar(dados.tela.split(/[?#]/)[0]) || "/";
  return [
    "Oi Vinícius, deu erro no Zatti Hub.",
    `Unidade: ${limpar(dados.unidade) || "não identificada"}`,
    `Tela: ${tela}`,
    `Data e hora: ${formatarDataHoraSuporte(dados.momento)}`,
    `Identificador do erro: ${limpar(dados.identificador) || "não informado"}`,
  ].join("\n");
}

export function montarLinkSuporteWhatsApp(dados: DadosSuporte): string {
  return `https://wa.me/${WHATSAPP_VINICIUS}?text=${encodeURIComponent(montarMensagemSuporte(dados))}`;
}
