import { formatarWhatsapp, dataHoraBr } from "./painel";
import { ROTULO_ORIGEM, rotuloOpcao, ehOrigem } from "./perguntas";

// Alerta de nota baixa pelo WhatsApp do Vini (12/11/2026). Mesmo contrato dos avisos do Garante:
// o banco reserva (`avaliacoes_alertas_reservar`), o Hub monta o texto aqui, o Vini envia e
// confirma. Sem emoji e sem travessão. O WhatsApp de quem avaliou só aparece se a pessoa
// autorizou (sem autorização o número nem é guardado).

export const RESULTADOS_ENVIO = ["enviado", "falhou", "incerto"] as const;
export type ResultadoEnvio = (typeof RESULTADOS_ENVIO)[number];

/** Como `avaliacoes_alertas_reservar` devolve cada avaliação. */
export type AlertaParaEnvio = {
  respostaId: string;
  criadoEm: string;
  origem: string;
  atendimento: number | null;
  comida: number | null;
  nps: number | null;
  espera: string | null;
  comentario: string | null;
  whatsappCliente: string | null;
};

/** Acima disso a mensagem resume: o painel tem tudo. */
export const LIMITE_ALERTAS_MENSAGEM = 10;

function primeiroNome(nome: string | null | undefined): string | null {
  const limpo = (nome ?? "").trim();
  return limpo ? limpo.split(/\s+/)[0] : null;
}

/** "Atendimento 2, Indicaria 5" (só as notas respondidas). */
export function notasDoAlerta(a: Pick<AlertaParaEnvio, "atendimento" | "comida" | "nps">): string {
  const partes: string[] = [];
  if (a.atendimento !== null) partes.push(`Atendimento ${a.atendimento}`);
  if (a.comida !== null) partes.push(`Comida ${a.comida}`);
  if (a.nps !== null) partes.push(`Indicaria ${a.nps}`);
  return partes.join(", ");
}

export function linhaDoAlerta(a: AlertaParaEnvio): string {
  const origem = ehOrigem(a.origem) ? ROTULO_ORIGEM[a.origem] : a.origem;
  const partes = [`${origem}, ${dataHoraBr(a.criadoEm)}: ${notasDoAlerta(a)}.`];
  if (a.espera) partes.push(`Espera: ${rotuloOpcao("espera", a.espera)}.`);
  const comentario = (a.comentario ?? "").replace(/\s+/g, " ").trim();
  if (comentario) partes.push(`Comentário: "${comentario.length > 280 ? `${comentario.slice(0, 277)}...` : comentario}"`);
  if (a.whatsappCliente) partes.push(`O cliente autorizou contato: ${formatarWhatsapp(a.whatsappCliente)}.`);
  return partes.join(" ");
}

export function montarMensagemAlertas(p: { nomeDestinatario: string | null; unidadeNome: string; alertas: AlertaParaEnvio[] }): string {
  const nome = primeiroNome(p.nomeDestinatario);
  const total = p.alertas.length;
  const linhas: string[] = [];
  linhas.push(`${nome ? `Oi ${nome}, ` : ""}${total === 1 ? "chegou 1 avaliação com nota baixa" : `chegaram ${total} avaliações com nota baixa`} na ${p.unidadeNome}:`);
  p.alertas.slice(0, LIMITE_ALERTAS_MENSAGEM).forEach((a, i) => linhas.push(`${i + 1}) ${linhaDoAlerta(a)}`));
  if (total > LIMITE_ALERTAS_MENSAGEM) {
    const resto = total - LIMITE_ALERTAS_MENSAGEM;
    linhas.push(`E mais ${resto} no painel.`);
  }
  linhas.push("");
  linhas.push("Veja todas no Zatti Hub, em Avaliações.");
  return linhas.join("\n");
}

/** Telefone para o envio: só dígitos, igual aos avisos do Garante (a Equipe já grava com o 55). */
export function telefoneParaEnvio(whatsapp: string): string {
  return whatsapp.replace(/\D/g, "");
}

export const DICA_ALERTA =
  "Toda avaliação com atendimento ou comida até 2, ou nota de indicação até 6, vira alerta. O Hub junta o que chegou desde o último ciclo (a cada 10 min, das 7h às 23h) numa mensagem só e o Vini manda para o WhatsApp da pessoa marcada aqui. Alerta com mais de 3 dias sem sair expira. Avaliação que chegou sem ninguém marcado não vira alerta depois.";
