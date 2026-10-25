import type { NomeIconeNavegacao } from "@/components/icones-navegacao";

// Tipos do menu lateral. Moram em `lib` (e não no componente client) para o
// montador do menu e o filtro serem funções puras testáveis no vitest.

export type SecaoNavegacao = {
  label: string;
  items: { label: string; href: string }[];
};

export type ItemNavegacao = {
  label: string;
  href: string;
  icone: NomeIconeNavegacao;
  disabled: boolean;
  /** Lista quando um módulo agrupa rotas de prefixos diferentes (ex.: Escritório). */
  activePrefix?: string | string[];
  sections?: SecaoNavegacao[];
  /** Na sanfona o módulo é link direto para `href`, sem abrir subitens: as
   * seções servem só às abas do cabeçalho, à busca e às permissões (Início do
   * piloto, cuja aba Dashboard fica só no cabeçalho). */
  linkDireto?: boolean;
};

/** Módulo ativo pelo prefixo mais longo: na área do Vinícius "/escritorio"
 * (Time de IA) é prefixo de "/escritorio/comercial", que tem item próprio. */
export function itemAtivo(items: ItemNavegacao[], pathname: string): string | undefined {
  let melhor: { label: string; tamanho: number } | undefined;
  for (const item of items) {
    if (item.disabled) continue;
    for (const prefixo of [item.activePrefix ?? item.href].flat()) {
      if (pathname.startsWith(prefixo) && (!melhor || prefixo.length > melhor.tamanho)) {
        melhor = { label: item.label, tamanho: prefixo.length };
      }
    }
  }
  return melhor?.label;
}

/** Subitem ativo (menu em sanfona): o href mais longo que é a própria rota ou
 * pai dela, para a tela de detalhe manter o item certo aceso
 * ("/financeiro/consolidado/novo" vence "/financeiro/consolidado"). */
export function subitemAtivo(items: ItemNavegacao[], pathname: string): string | undefined {
  let melhor: string | undefined;
  for (const item of items) {
    if (item.disabled) continue;
    for (const secao of item.sections ?? []) {
      for (const sub of secao.items) {
        const casa = pathname === sub.href || pathname.startsWith(`${sub.href}/`);
        if (casa && (!melhor || sub.href.length > melhor.length)) melhor = sub.href;
      }
    }
  }
  return melhor;
}

/** Módulo da tela atual no menu do piloto: primeiro o dono do subitem mais
 * específico (o mesmo prefixo "/estoque" serve a Estoque e a Cadastros, e
 * "/financeiro-gerencial/contas" é de Cadastros sem pegar
 * "/financeiro-gerencial/contas-pagar-receber"); sem subitem, o prefixo mais
 * longo (`itemAtivo`), como em "/financeiro-gerencial/estoque". */
export function moduloAtivo(items: ItemNavegacao[], pathname: string): string | undefined {
  const href = subitemAtivo(items, pathname);
  if (href) {
    const dono = items.find(
      (item) => !item.disabled && item.sections?.some((secao) => secao.items.some((sub) => sub.href === href)),
    );
    if (dono) return dono.label;
  }
  return itemAtivo(items, pathname);
}
