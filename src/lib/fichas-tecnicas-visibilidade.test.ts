import { describe, expect, it } from "vitest";
import { fichaParaVisao, resumoParaVisao, visaoDaFicha } from "./fichas-tecnicas-visibilidade";
import type { FichaTecnica } from "@/lib/types";

const ficha = {
  id: "f",
  precoVenda: 30,
  precoVendaRascunho: 32,
  precoVendaDeliveryProprio: 33,
  precoVendaIfood: 35,
  precoVenda99Food: 34,
  custo: { custoTotal: 10, custoPorUnidade: 10, completo: false },
  custoComEmbalagem: { custoTotal: 11, custoPorUnidade: 11, completo: true },
  observacoesGerenciais: "fornecedor B mais barato",
  componentes: [{ nomeExibicao: "pão", custo: { custoUnitario: 1 } }],
  componentesDelivery: [],
} as unknown as FichaTecnica;

describe("o que cada nível do Cardápio recebe", () => {
  it("nível pela permissão", () => {
    expect(visaoDaFicha(true, true)).toBe("gestao");
    expect(visaoDaFicha(false, true)).toBe("chef");
    expect(visaoDaFicha(false, false)).toBe("ver");
  });

  it("gestão recebe tudo", () => {
    expect(fichaParaVisao(ficha, "gestao")).toBe(ficha);
  });

  it("chef: custo e preço do Salão, sem canais nem gerencial", () => {
    const f = fichaParaVisao(ficha, "chef");
    expect(f.precoVenda).toBe(30);
    expect(f.custo.custoPorUnidade).toBe(10);
    expect([f.precoVendaDeliveryProprio, f.precoVendaIfood, f.precoVenda99Food]).toEqual([null, null, null]);
    expect(f.observacoesGerenciais).toBe("");
  });

  it("ver: sem custo, sem preço, sem gerencial", () => {
    const f = fichaParaVisao(ficha, "ver");
    expect(f.precoVenda).toBeNull();
    expect(f.precoVendaRascunho).toBeNull();
    expect(f.custo.custoPorUnidade).toBeNull();
    expect(f.custoComEmbalagem).toBeNull();
    expect(f.componentes[0].custo).toBeUndefined();
    expect(f.observacoesGerenciais).toBe("");
    expect(resumoParaVisao(ficha, "ver").custo.custoTotal).toBeNull();
  });
});
