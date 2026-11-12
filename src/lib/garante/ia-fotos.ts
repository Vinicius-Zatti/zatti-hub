// IA confere as fotos do Garante (fase de teste, 12/11/2026). Funções puras: prompt, esquema
// da resposta, leitura da resposta e textos da tela. Servidor e cliente importam daqui; a
// chamada de rede fica em ia-fotos-servidor.ts.

export type VereditoIa = "aprovado" | "reprovado" | "inconclusivo";

/** Teto de conferências por organização no mês (espelho de `garante_ia_limite_mensal()`). */
export const LIMITE_CONFERENCIAS_MES = 1500;
/** Motivo curto na tela; o banco aceita até 200. */
export const MOTIVO_MAXIMO = 160;

export const SISTEMA_CONFERENCIA = [
  "Você confere fotos de checklist de restaurante (abertura, fechamento, limpeza, armazenamento).",
  "Avalie só se a foto mostra o item cumprido no padrão de restaurante: limpeza, organização, armazenamento correto e segurança alimentar.",
  'Responda "aprovado" quando a foto mostra o item feito no padrão.',
  'Responda "reprovado" quando a foto mostra algo fora do padrão (ex.: pano em cima do balcão, pote de comida na geladeira de bebidas, chão molhado, lixo aberto, alimento sem tampa ou sem etiqueta).',
  'Responda "inconclusivo" quando a foto não permite conferir o item: escura, borrada, cortada ou de outro lugar.',
  "Nunca invente o que não aparece na foto: reprove só pelo que dá para ver.",
  "O motivo é uma frase curta em português do Brasil, até 140 caracteres, dizendo o que você viu na foto. Sem travessão.",
].join("\n");

export const ESQUEMA_CONFERENCIA: Record<string, unknown> = {
  type: "object",
  properties: {
    veredito: { type: "string", enum: ["aprovado", "reprovado", "inconclusivo"] },
    motivo: { type: "string" },
  },
  required: ["veredito", "motivo"],
  additionalProperties: false,
};

export type ItemParaConferir = {
  checklist: string;
  titulo: string;
  grupo?: string | null;
  instrucao?: string | null;
};

/** Texto que acompanha a foto: checklist, item e a instrução do item, quando houver. */
export function montarTextoItem(item: ItemParaConferir): string {
  const linhas = [`Checklist: ${item.checklist.trim()}`];
  if (item.grupo?.trim()) linhas.push(`Grupo: ${item.grupo.trim()}`);
  linhas.push(`Item: ${item.titulo.trim()}`);
  if (item.instrucao?.trim()) linhas.push(`Como deve estar: ${item.instrucao.trim()}`);
  linhas.push("A foto acima é a evidência deste item. Ela mostra o item cumprido?");
  return linhas.join("\n");
}

function encurtar(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").replace(/[–—]/g, "-").trim();
  if (limpo.length <= MOTIVO_MAXIMO) return limpo;
  const corte = limpo.slice(0, MOTIVO_MAXIMO - 3);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > 80 ? corte.slice(0, espaco) : corte).replace(/[\s,.;:]+$/, "")}...`;
}

/** Lê a resposta da IA. Qualquer coisa fora do esquema vira null ("não deu para conferir"). */
export function interpretarResposta(texto: string): { veredito: VereditoIa; motivo: string } | null {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!bruto || typeof bruto !== "object") return null;
  const { veredito, motivo } = bruto as { veredito?: unknown; motivo?: unknown };
  if (veredito !== "aprovado" && veredito !== "reprovado" && veredito !== "inconclusivo") return null;
  if (typeof motivo !== "string") return null;
  const curto = encurtar(motivo);
  if (!curto) return null;
  return { veredito, motivo: curto };
}

/** Situação da reserva no banco (`garante_ia_reservar`). */
export type SituacaoReserva = "reservada" | "desligada" | "sem_foto" | "repetida" | "limite";

/** O que o item mostra na tela depois de pedir a conferência. */
export type ResultadoConferencia =
  | { estado: "resultado"; veredito: VereditoIa; motivo: string }
  | { estado: "desligada" }
  | { estado: "limite" }
  | { estado: "falhou" };

export function lerReserva(dado: unknown): { situacao: SituacaoReserva; chamadaId: string | null } | null {
  if (!dado || typeof dado !== "object") return null;
  const { situacao, chamada_id } = dado as { situacao?: unknown; chamada_id?: unknown };
  const validas: SituacaoReserva[] = ["reservada", "desligada", "sem_foto", "repetida", "limite"];
  if (typeof situacao !== "string" || !validas.includes(situacao as SituacaoReserva)) return null;
  const chamadaId = typeof chamada_id === "string" ? chamada_id : null;
  if (situacao === "reservada" && !chamadaId) return null;
  return { situacao: situacao as SituacaoReserva, chamadaId };
}

/** Reserva que não chama a IA: o que a tela mostra. */
export function resultadoSemChamada(situacao: Exclude<SituacaoReserva, "reservada" | "repetida">): ResultadoConferencia {
  if (situacao === "desligada") return { estado: "desligada" };
  if (situacao === "limite") return { estado: "limite" };
  return { estado: "falhou" };
}

export const SELO_IA: Record<VereditoIa, { texto: string; classe: string }> = {
  aprovado: { texto: "Aprovado pela IA", classe: "border-verde/40 bg-verde/10 text-verde" },
  reprovado: { texto: "Reprovado pela IA", classe: "border-vermelho/40 bg-vermelho/10 text-vermelho" },
  inconclusivo: { texto: "Não deu para conferir", classe: "border-ambar/40 bg-ambar/15 text-ambar" },
};

export const TEXTO_IA = {
  conferindo: "IA conferindo...",
  falhou: "Não deu para conferir agora. O checklist segue normal.",
  limite: "Limite de conferências do mês atingido.",
} as const;

export const DICA_REPROVADAS_IA =
  "Quantos itens deste checklist tiveram a foto reprovada pela IA. Conta só o resultado da foto atual de cada item: foto nova apaga o resultado anterior. Nesta fase de teste a reprovação só informa, não impede concluir.";
