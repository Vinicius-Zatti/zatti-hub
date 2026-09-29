import { descricaoParaBusca } from "./normalizacao";
import type { Direcao, Natureza } from "./tipos";

// Natureza antes de classificar (regras portadas do motor da DQ no Vini).
// Nada aqui altera a direção lida do banco: quando o texto contradiz a
// direção, a natureza fica "desconhecido" e o movimento vai para revisão.

type Padrao = { regex: RegExp; natureza: Natureza; somenteEntrada: boolean };

const PADROES: Padrao[] = [
  { regex: /^renda fixa (aplicacao em|resgate de) cdb$/, natureza: "aplicacao_resgate", somenteEntrada: false },
  { regex: /^(aplicacao|resgate) (automatica|cdb|rdb|poupanca)/, natureza: "aplicacao_resgate", somenteEntrada: false },
  // Liquidação de venda: nunca receita nova, concilia com recebível.
  { regex: /^vendas disponivel (credito|debito|pix)/, natureza: "repasse_cartao", somenteEntrada: true },
  { regex: /^(cart|rede) (el|vs|mc|ae) (cd|cc)$/, natureza: "repasse_cartao", somenteEntrada: true },
  { regex: /\b(alelo sa|banco vr|pluxee|ticket servicos)\b/, natureza: "repasse_cartao", somenteEntrada: true },
  { regex: /ifoo mc cc|ifood com agencia de restaurantes/, natureza: "repasse_plataforma", somenteEntrada: true },
  { regex: /^99 food/, natureza: "repasse_plataforma", somenteEntrada: true },
  { regex: /\b(estorno|devolucao|devolvido)\b/, natureza: "estorno", somenteEntrada: false },
];

// Textos que só existem numa direção. "Vendas - Disponivel DEBITO" é
// entrada mesmo tendo a palavra "debito" (erro real da leitura de julho).
const SOMENTE_ENTRADA = /^vendas disponivel /;

export type ResultadoNatureza = { natureza: Natureza; motivo: string };

export function identificarNatureza(descricaoNormalizada: string, direcao: Direcao): ResultadoNatureza {
  const busca = descricaoParaBusca(descricaoNormalizada);
  if (SOMENTE_ENTRADA.test(busca) && direcao !== "entrada") {
    return { natureza: "desconhecido", motivo: "direcao_contraditoria" };
  }
  for (const p of PADROES) {
    if (!p.regex.test(busca) && !p.regex.test(descricaoNormalizada)) continue;
    if (p.somenteEntrada && direcao !== "entrada") continue; // ex.: "99 Food" na saída é taxa, despesa comum
    return { natureza: p.natureza, motivo: `padrao_${p.natureza}` };
  }
  return { natureza: direcao, motivo: "direcao_do_banco" };
}
