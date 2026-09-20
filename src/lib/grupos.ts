export const GRUPO_NOMES: Record<string, string> = {
  PRO: "Proteínas",
  HOR: "Hortifrúti",
  LAT: "Laticínios e Frios",
  MER: "Mercearia / Secos",
  CON: "Congelados",
  BEB: "Bebidas",
  BAL: "Bebidas Alcoólicas",
  EMB: "Embalagens",
  DES: "Descartáveis",
  LIM: "Limpeza",
  OPE: "Operacional",
  // PRE é o único que não se compra de fornecedor: é o que a casa produz e
  // guarda pronto (molho, massa, blend, recheio). Fica por último de propósito,
  // porque `GRUPO_ORDEM` manda na ordem da Contagem e do Pedido, e antes de
  // existir aqui esses itens já caíam no fim da lista como grupo desconhecido -
  // ganhar nome não podia reordenar a contagem de ninguém.
  //
  // O SKU dele não segue a forma dos outros: é `PRE` + 3 letras + 3 letras, sem
  // número de referência, e o nome termina em "da casa". Regra completa no
  // Cérebro do Gestor, em `_conhecimento/negocios/padrao-sku-zatti.md`. O
  // sugeridor de SKU (`lib/skus/sugerir.ts`) não conhece essa forma: ele só
  // classifica insumo comprado, então em item produzido o SKU se escreve na mão.
  PRE: "Pré-preparos",
};

export const GRUPO_ORDEM = Object.keys(GRUPO_NOMES);

export const GRUPO_OPCOES = GRUPO_ORDEM.map((codigo) => ({
  codigo,
  descricao: GRUPO_NOMES[codigo],
}));

export function nomeGrupo(codigo: string): string {
  return GRUPO_NOMES[codigo] ?? codigo;
}
