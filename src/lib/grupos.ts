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
};

export const GRUPO_ORDEM = Object.keys(GRUPO_NOMES);

export const GRUPO_OPCOES = GRUPO_ORDEM.map((codigo) => ({
  codigo,
  descricao: GRUPO_NOMES[codigo],
}));

export function nomeGrupo(codigo: string): string {
  return GRUPO_NOMES[codigo] ?? codigo;
}
