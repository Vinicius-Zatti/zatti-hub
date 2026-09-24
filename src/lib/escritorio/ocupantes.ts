import type { Arquetipo, Ocupante, OcupanteId } from "./tipos";

/** Quem ocupa as posições. A mesma inteligência pode ocupar várias. */
export const OCUPANTES: Record<OcupanteId, Ocupante> = {
  vinicius: {
    nome: "Vinícius Zanetti",
    tipo: "pessoa",
    descricao: "CEO e autoridade técnica em restaurantes. Define metas e decisões e guarda o Método M.E.G.A.: todo assunto de restaurante parte do conhecimento dele.",
  },
  vini: {
    nome: "Vini",
    tipo: "ia",
    descricao: "Segundinho. Recepção e chefe de operações: recebe os pedidos e encaminha para a sala certa.",
  },
  bia: {
    nome: "BIA",
    tipo: "ia",
    descricao: "Inteligência responsável pelo Jurídico.",
  },
  antonio: {
    nome: "Antonio",
    tipo: "ia",
    descricao: "Agente /antonio. Dono da Operação Zatti com o Grupo Silva e, como o Grupo Silva estrutura o comercial da Zatti, também do Comercial.",
  },
  agente: {
    nome: "Agente de IA",
    tipo: "ia",
    descricao: "Agente identificado pelo próprio cargo. Não tem nome próprio.",
  },
};

/** Arquétipos são só referência de estilo de atuação. Nenhuma dessas pessoas
 * tem vínculo, participação ou endosso da Zatti. A tela nunca usa foto, voz,
 * logotipo ou imagem delas e mostra o nome apenas como "inspirado em". */
export const ARQUETIPOS: Record<string, Arquetipo> = {
  "flavio-augusto": { nome: "Flávio Augusto" },
  "alfredo-soares": { nome: "Alfredo Soares" },
  "eliandro-prado": { nome: "Eliandro Prado" },
  "marcos-eduardo": { nome: "Marcos Eduardo" },
  anderson: { nome: "Anderson" },
  "erico-rocha": { nome: "Érico Rocha" },
  karol: { nome: "Karol" },
  "bruno-perini": { nome: "Bruno Perini" },
};

export const AVISO_ARQUETIPO =
  "Referência de estilo de atuação. Sem vínculo, participação ou endosso dessa pessoa com a Zatti.";
