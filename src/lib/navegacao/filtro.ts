import type { ItemNavegacao } from "./tipos";

/** Sem acento, sem caixa e com espaços simples: "Conciliação" casa "conciliacao". */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Campo "Filtrar menus" (Navegação V2). Cada palavra digitada precisa aparecer
 * no caminho módulo > seção > item, então "estoque contagem" acha a seção
 * Contagem do Estoque e "editar" acha os dois "Editar dados" dos Cadastros.
 * - casou no módulo: o módulo vem inteiro;
 * - casou na seção: a seção vem inteira;
 * - senão, só os itens que casaram (seção e módulo vazios somem).
 * Não muda permissão: filtra só o que o menu já mostra para quem está logado.
 */
export function filtrarMenus(itens: ItemNavegacao[], termo: string): ItemNavegacao[] {
  const palavras = normalizarBusca(termo).split(" ").filter(Boolean);
  if (palavras.length === 0) return itens;
  const casa = (texto: string) => palavras.every((palavra) => texto.includes(palavra));

  const resultado: ItemNavegacao[] = [];
  for (const item of itens) {
    const textoModulo = normalizarBusca(item.label);
    if (casa(textoModulo)) {
      resultado.push(item);
      continue;
    }
    if (!item.sections) continue;

    const secoes = [];
    for (const secao of item.sections) {
      const textoSecao = `${textoModulo} ${normalizarBusca(secao.label)}`;
      if (casa(textoSecao)) {
        secoes.push(secao);
        continue;
      }
      const subitens = secao.items.filter((sub) => casa(`${textoSecao} ${normalizarBusca(sub.label)}`));
      if (subitens.length > 0) secoes.push({ ...secao, items: subitens });
    }
    if (secoes.length > 0) resultado.push({ ...item, sections: secoes });
  }
  return resultado;
}
