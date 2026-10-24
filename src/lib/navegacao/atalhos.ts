import type { NomeIconeNavegacao } from "@/components/icones-navegacao";
import type { ItemNavegacao } from "./tipos";

// Navegação V2 (24/10/2026): barra inferior do celular no piloto. Quatro atalhos
// por papel + o botão "Menu". Os atalhos nascem do próprio menu já montado
// (`montarMenuRestaurantePiloto`): só entra destino que a pessoa vê hoje no
// menu, então papel e flags de módulo valem igual nos dois lugares. Atalho de
// módulo desligado sai e o próximo candidato da lista ocupa a vaga.

export const QUANTIDADE_ATALHOS = 4;

type Candidato = {
  label: string;
  href: string;
  icone: NomeIconeNavegacao;
  /** Prefixos que acendem o atalho (mesma regra do menu: o mais longo vence). */
  activePrefix: string | string[];
};

const INICIO: Candidato = { label: "Início", href: "/painel", icone: "painel", activePrefix: "/painel" };
const CONTAGEM: Candidato = {
  label: "Contagem",
  href: "/estoque/contagem",
  icone: "contagem",
  activePrefix: "/estoque/contagem",
};
const PEDIDOS: Candidato = {
  label: "Pedidos",
  href: "/estoque/pedidos/feitos",
  icone: "pedidos",
  activePrefix: "/estoque/pedidos",
};
// "Hoje" do Garante: lista de onde o operacional abre o checklist do dia
// (`/garante/execucao/[id]` fica dentro do mesmo prefixo).
const GARANTE: Candidato = { label: "Garante", href: "/garante", icone: "tarefas", activePrefix: "/garante" };
const ESTOQUE: Candidato = { label: "Estoque", href: "/estoque/produtos", icone: "estoque", activePrefix: "/estoque" };
const FINANCEIRO: Candidato = {
  label: "Financeiro",
  href: "/financeiro-gerencial/visao-geral",
  icone: "financeiroGerencial",
  activePrefix: "/financeiro-gerencial",
};
const DESEMPENHO: Candidato = {
  label: "Desempenho",
  href: "/financeiro/consolidado/novo",
  icone: "financeiro",
  activePrefix: "/financeiro",
};
const PRECIFICACAO: Candidato = {
  label: "Precificação",
  href: "/fichas-tecnicas",
  icone: "fichas",
  activePrefix: "/fichas-tecnicas",
};
const PRODUTOS: Candidato = {
  label: "Produtos",
  href: "/estoque/produtos",
  icone: "cadastros",
  activePrefix: "/estoque/produtos",
};
const EQUIPE: Candidato = { label: "Equipe", href: "/equipe", icone: "acessos", activePrefix: "/equipe" };

/** Ordem de preferência: os quatro primeiros são os pedidos por Vinícius
 * (24/10); os seguintes só entram para cobrir módulo desligado. */
export const CANDIDATOS_OPERACIONAL: readonly Candidato[] = [
  INICIO,
  CONTAGEM,
  PEDIDOS,
  GARANTE,
  DESEMPENHO,
  FINANCEIRO,
  PRECIFICACAO,
  PRODUTOS,
];

export const CANDIDATOS_GESTAO: readonly Candidato[] = [
  INICIO,
  ESTOQUE,
  FINANCEIRO,
  DESEMPENHO,
  GARANTE,
  PRECIFICACAO,
  EQUIPE,
  CONTAGEM,
  PEDIDOS,
];

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

/** Atalhos da barra inferior no formato de item de menu, para o ativo usar a
 * mesma função do menu (`itemAtivo`). Gestão e master (`podeGerir`) têm a
 * mesma lista. */
export function escolherAtalhos(menu: ItemNavegacao[], podeGerir: boolean): ItemNavegacao[] {
  const visiveis = destinosVisiveis(menu);
  const candidatos = podeGerir ? CANDIDATOS_GESTAO : CANDIDATOS_OPERACIONAL;
  const escolhidos: ItemNavegacao[] = [];
  for (const candidato of candidatos) {
    if (escolhidos.length === QUANTIDADE_ATALHOS) break;
    if (!visiveis.has(candidato.href)) continue;
    if (escolhidos.some((atalho) => atalho.href === candidato.href)) continue;
    escolhidos.push({ ...candidato, disabled: false });
  }
  return escolhidos;
}
