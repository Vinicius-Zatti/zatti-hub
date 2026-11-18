/** Conversa do SDR guardada no CRM (pedido de Vinícius em 17/11/2026: toda
 * conversa do SDR fica arquivada na linha do tempo do lead). Funções puras,
 * usadas na rota da API, no servidor e na tela. */
import type { EventoLead, FalaMensagem } from "@/lib/comercial/funil";

/** RPC que trata o evento recebido do Vini: mensagens só arquivam (não criam
 * lead nem mexem em etapa); o resto segue a entrada de sempre. */
export function rpcDoEvento(evento: unknown): "zh_leads_registrar_mensagem" | "zh_leads_registrar_evento" {
  const tipo = evento && typeof evento === "object" ? (evento as { tipo?: unknown }).tipo : undefined;
  return tipo === "mensagem" ? "zh_leads_registrar_mensagem" : "zh_leads_registrar_evento";
}

/** Lê `dados` de um evento "mensagem" ({de, canal}); valor fora do contrato vira null. */
export function lerFalaMensagem(dados: unknown): FalaMensagem | null {
  if (!dados || typeof dados !== "object") return null;
  const { de, canal } = dados as { de?: unknown; canal?: unknown };
  if (de !== "lead" && de !== "vinicius" && de !== "sdr") return null;
  if (canal !== "whatsapp" && canal !== "instagram") return null;
  return { de, canal };
}

export const ROTULO_FALA: Record<FalaMensagem["de"], string> = { lead: "Lead", vinicius: "Vinícius", sdr: "SDR" };
export const ROTULO_CANAL: Record<FalaMensagem["canal"], string> = { whatsapp: "WhatsApp", instagram: "Direct" };

/** Separa a conversa (mensagens, da mais antiga para a mais recente) dos
 * demais eventos da linha do tempo, para a conversa não afogar o funil. */
export function separarConversa(eventos: EventoLead[]): { conversa: EventoLead[]; linhaDoTempo: EventoLead[] } {
  const conversa: EventoLead[] = [];
  const linhaDoTempo: EventoLead[] = [];
  for (const ev of eventos) (ev.tipo === "mensagem" ? conversa : linhaDoTempo).push(ev);
  conversa.sort((a, b) => a.em.localeCompare(b.em));
  return { conversa, linhaDoTempo };
}

/** Quem falou: o que veio em `dados.de`; sem isso, o autor gravado (vinicius ou sdr). */
export function falaDe(ev: EventoLead): FalaMensagem["de"] {
  if (ev.mensagem) return ev.mensagem.de;
  return ev.autor === "vinicius" ? "vinicius" : "sdr";
}
