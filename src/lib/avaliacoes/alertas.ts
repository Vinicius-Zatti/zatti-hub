import { dataHoraBr } from "./painel";
import { ROTULO_ORIGEM, rotuloAtendente, rotuloOpcao, ehOrigem } from "./perguntas";

// Alerta de nota baixa pelo WhatsApp do Vini (12/11/2026). Mesmo contrato dos avisos do Garante:
// o banco reserva (`avaliacoes_alertas_reservar`), o Hub monta o texto aqui, o Vini envia e
// confirma. Sem emoji e sem travessão. Revisão de 12/11: o WhatsApp de quem avaliou não vai no
// alerta (o destinatário pode ser da operação, que não vê o painel); a mensagem só avisa que há
// contato autorizado no painel. Link no comentário vira "[link removido]": a mensagem sai de um
// número em que o gerente confia, e o comentário é texto livre de qualquer pessoa.

export const RESULTADOS_ENVIO = ["enviado", "falhou", "incerto"] as const;
export type ResultadoEnvio = (typeof RESULTADOS_ENVIO)[number];

/** Como `avaliacoes_alertas_reservar` devolve cada avaliação. */
export type AlertaParaEnvio = {
  respostaId: string;
  criadoEm: string;
  origem: string;
  atendimento: number | null;
  comida: number | null;
  tempo?: number | null;
  ambiente?: number | null;
  embalagem?: number | null;
  entrega?: number | null;
  atendimentoPedido?: number | null;
  pedidoCerto?: boolean | null;
  atendente?: string | null;
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

type NotasDoAlerta = Pick<AlertaParaEnvio, "atendimento" | "comida" | "nps"> &
  Partial<Pick<AlertaParaEnvio, "tempo" | "ambiente" | "embalagem" | "entrega" | "atendimentoPedido" | "pedidoCerto">>;

const ROTULOS_NOTA: [keyof NotasDoAlerta, string][] = [
  ["atendimento", "Atendimento"],
  ["atendimentoPedido", "Atendimento no pedido"],
  ["comida", "Comida"],
  ["embalagem", "Temperatura e embalagem"],
  ["tempo", "Tempo até a mesa"],
  ["entrega", "Tempo de entrega"],
  ["ambiente", "Ambiente"],
];

/** "Pedido veio errado, Comida 2, Indicaria 5" (só o que foi respondido). */
export function notasDoAlerta(a: NotasDoAlerta): string {
  const partes: string[] = [];
  if (a.pedidoCerto === false) partes.push("Pedido veio errado ou faltando");
  for (const [chave, rotulo] of ROTULOS_NOTA) {
    const n = a[chave];
    if (typeof n === "number") partes.push(`${rotulo} ${n}`);
  }
  if (a.nps !== null && a.nps !== undefined) partes.push(`Indicaria ${a.nps}`);
  return partes.join(", ");
}

const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|br|net|org|io|me|ly|co|app|link|xyz|site|online|info|club|shop|top)\b(?:\/\S*)?/gi;

/** Comentário numa linha, sem link clicável e com no máximo 280 letras. */
export function comentarioSeguro(texto: string | null): string {
  const limpo = (texto ?? "").replace(/\s+/g, " ").trim().replace(LINK, "[link removido]");
  return limpo.length > 280 ? `${limpo.slice(0, 277)}...` : limpo;
}

export function linhaDoAlerta(a: AlertaParaEnvio): string {
  const origem = ehOrigem(a.origem) ? ROTULO_ORIGEM[a.origem] : a.origem;
  const partes = [`${origem}, ${dataHoraBr(a.criadoEm)}: ${notasDoAlerta(a)}.`];
  if (a.espera) partes.push(`Espera: ${rotuloOpcao("espera", a.espera)}.`);
  if (a.atendente) partes.push(`Atendido por: ${rotuloAtendente(a.atendente)}.`);
  const comentario = comentarioSeguro(a.comentario);
  if (comentario) partes.push(`Comentário: "${comentario}"`);
  if (a.whatsappCliente) partes.push("O cliente deixou contato para retorno: a gestão vê em Avaliações.");
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
  "Toda avaliação com alguma nota de estrelas até 2, nota de indicação até 6 ou pedido que veio errado vira alerta. O Hub junta o que chegou desde o último ciclo (a cada 10 min, das 7h às 23h) numa mensagem só e o Vini manda para o WhatsApp da pessoa marcada aqui. Alerta com mais de 3 dias sem sair expira. Avaliação que chegou sem ninguém marcado não vira alerta depois.";
