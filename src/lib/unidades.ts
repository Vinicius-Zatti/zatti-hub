export const UNIDADES = [
  { codigo: "UN", descricao: "Unidade" },
  { codigo: "KG", descricao: "Quilogramas" },
  { codigo: "LT", descricao: "Litro" },
];

/** Casas decimais padrão pra exibir/editar uma quantidade (UN, KG, LT ou
 * qualquer outra unidade de contagem/embalagem) - sempre 3, decisão
 * explícita do Vinícius (27/07), diferente de valor em dinheiro (sempre 2,
 * ver `CampoNumero`/`formatMoeda`) que não passa por aqui. */
export function decimaisQuantidade(_unidadeBase: string): number {
  return 3;
}

/** Texto pronto pra exibir uma quantidade (com separador de milhar),
 * sempre nas mesmas casas decimais da unidade - uma conta como "estoque
 * necessário menos estoque contado" pode sobrar com dízima (ex:
 * 3.333333333333335) se algum dos dois veio de uma contagem fracionária. */
export function formatarQuantidade(v: number | null, unidadeBase: string): string {
  if (v === null) return "—";
  const decimais = decimaisQuantidade(unidadeBase);
  return v.toLocaleString("pt-BR", { minimumFractionDigits: decimais, maximumFractionDigits: decimais });
}

/** Mesmo arredondamento, mas em texto pra semear um campo de edição (sem
 * separador de milhar, só vírgula decimal) - o mesmo padrão que
 * `CampoNumero`/Editor de Espelhos já usam pros próprios campos. */
export function textoEdicaoQuantidade(v: number, unidadeBase: string): string {
  const decimais = decimaisQuantidade(unidadeBase);
  return v.toFixed(decimais).replace(".", ",");
}

// Unidade em que o fornecedor vende (a embalagem de compra), diferente da
// Unidade Base (KG/LT/UN) em que o produto é controlado no estoque.
export const UNIDADES_EMBALAGEM = [
  { codigo: "UN", descricao: "Unidade" },
  { codigo: "KG", descricao: "Quilogramas" },
  { codigo: "LT", descricao: "Litro" },
  { codigo: "CX", descricao: "Caixa" },
  { codigo: "FD", descricao: "Fardo" },
  { codigo: "PCT", descricao: "Pacote" },
  { codigo: "SC", descricao: "Saco" },
  { codigo: "DZ", descricao: "Dúzia" },
  { codigo: "GL", descricao: "Galão" },
  { codigo: "BD", descricao: "Balde" },
  { codigo: "GF", descricao: "Garrafa" },
  { codigo: "PC", descricao: "Peça" },
];
