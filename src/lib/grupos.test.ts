import { describe, expect, it } from "vitest";
import { GRUPO_NOMES, GRUPO_OPCOES, GRUPO_ORDEM, nomeGrupo } from "./grupos";

/** Os 11 grupos de insumo comprado, na ordem em que os clientes já contam o
 * estoque. Escrito aqui de propósito: se alguém reordenar ou renomear código em
 * `grupos.ts`, a contagem de todo mundo muda de ordem sem ninguém pedir. */
const INSUMOS_COMPRADOS = [
  "PRO",
  "HOR",
  "LAT",
  "MER",
  "CON",
  "BEB",
  "BAL",
  "EMB",
  "DES",
  "LIM",
  "OPE",
];

describe("grupos de produto", () => {
  it("mantém os 11 grupos de insumo comprado na mesma ordem", () => {
    expect(GRUPO_ORDEM.slice(0, INSUMOS_COMPRADOS.length)).toEqual(INSUMOS_COMPRADOS);
  });

  it("tem PRE (pré-preparo) e o deixa por último", () => {
    expect(GRUPO_ORDEM.at(-1)).toBe("PRE");
    expect(nomeGrupo("PRE")).toBe("Pré-preparos");
  });

  it("dá nome próprio a todo grupo do padrão", () => {
    // nomeGrupo devolve o próprio código quando não conhece o grupo. Nenhum
    // grupo do padrão pode cair nesse atalho: era o que fazia PRE aparecer
    // como "PRE" cru na Contagem da The House.
    for (const codigo of GRUPO_ORDEM) {
      expect(nomeGrupo(codigo)).not.toBe(codigo);
    }
  });

  it("oferece no seletor exatamente os grupos do padrão, na mesma ordem", () => {
    // O `select` de "Novo produto" monta as opções a partir de GRUPO_OPCOES.
    // Enquanto isso valer, não dá pra existir grupo cadastrável que a tela não
    // mostra, que foi o caso de PRE.
    expect(GRUPO_OPCOES.map((opcao) => opcao.codigo)).toEqual(GRUPO_ORDEM);
    expect(GRUPO_OPCOES.map((opcao) => opcao.descricao)).toEqual(
      GRUPO_ORDEM.map((codigo) => GRUPO_NOMES[codigo]),
    );
  });

  it("devolve o código cru para grupo que não existe no padrão", () => {
    expect(nomeGrupo("XPTO")).toBe("XPTO");
  });
});
