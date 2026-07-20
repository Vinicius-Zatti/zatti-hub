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

export function nomeGrupo(codigo: string): string {
  return GRUPO_NOMES[codigo] ?? codigo;
}
