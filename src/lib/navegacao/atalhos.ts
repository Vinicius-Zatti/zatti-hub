import { ROTULO_CARDAPIO, ROTULO_VENDAS } from "./menu-restaurante";
import type { ItemNavegacao } from "./tipos";

// Navegação V2 (24/10/2026): barra inferior do celular no piloto. Quatro
// atalhos + o botão "Menu", iguais para todos os papéis: Início, Estoque,
// Garante e Financeiro. Os atalhos são os próprios módulos do menu já montado
// (`montarMenuRestaurantePiloto`), com o mesmo destino de entrada: só entra
// módulo que a pessoa vê hoje no menu, então papel e flags valem igual nos dois
// lugares. Módulo desligado ou sem acesso sai e a vaga vai, nesta ordem, para
// Vendas, Cardápio e Equipe.

export const QUANTIDADE_ATALHOS = 4;

/** Módulos fixos da barra (decisão de Vinícius, 24/10). */
export const ATALHOS_FIXOS: readonly string[] = ["Início", "Estoque", "Garante", "Financeiro"];
/** Quem ocupa a vaga de um fixo que a pessoa não tem. */
export const ATALHOS_RESERVA: readonly string[] = [ROTULO_VENDAS, ROTULO_CARDAPIO, "Equipe"];

/** Destinos clicáveis do menu: módulos fora de "em breve" e, dentro deles, os
 * subitens (ou o próprio href, no módulo sem subitens). */
export function destinosVisiveis(menu: ItemNavegacao[]): Set<string> {
  const hrefs = new Set<string>();
  for (const item of menu) {
    if (item.disabled) continue;
    if (!item.sections) {
      hrefs.add(item.href);
      continue;
    }
    for (const secao of item.sections) for (const sub of secao.items) hrefs.add(sub.href);
  }
  return hrefs;
}

/** Atalhos da barra inferior no formato de item de menu (sem subitens). O
 * ativo é o módulo da tela atual (`moduloAtivo`), comparado pelo rótulo. */
export function escolherAtalhos(menu: ItemNavegacao[]): ItemNavegacao[] {
  const disponivel = (label: string) => menu.find((item) => item.label === label && !item.disabled);
  const reservas = ATALHOS_RESERVA.map(disponivel).filter((item): item is ItemNavegacao => Boolean(item));
  const escolhidos: ItemNavegacao[] = [];
  for (const label of ATALHOS_FIXOS) {
    const item = disponivel(label) ?? reservas.shift();
    if (item) escolhidos.push(item);
  }
  // A reserva ocupa a mesma vaga do fixo que faltou (Garante desligado:
  // Início, Estoque, Vendas, Financeiro).
  return escolhidos
    .slice(0, QUANTIDADE_ATALHOS)
    .map(({ label, href, icone, activePrefix }) => ({ label, href, icone, activePrefix, disabled: false }));
}
