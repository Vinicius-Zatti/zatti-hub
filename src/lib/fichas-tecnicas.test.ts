import { describe, expect, it } from "vitest";
import { montarPrecosPorCanal } from "./fichas-tecnicas";

describe("montarPrecosPorCanal", () => {
  it("usa o custo base no Salão e no Delivery Próprio sem embalagem vinculada", () => {
    const canais = montarPrecosPorCanal({
      custoBase: 10,
      custoComEmbalagem: null,
      precoVendaSalao: 30,
      precoVendaDeliveryProprio: 30,
      precoVendaIfood: null,
      precoVenda99Food: null,
      margemNecessaria: 0.5,
      margemPontoEquilibrio: 0.3,
      deducoesSalao: 0.13,
      deducoesIfood: 0.27,
      deducoes99Food: 0.23,
    });

    const salao = canais.find((c) => c.canal === "salao")!;
    const deliveryProprio = canais.find((c) => c.canal === "delivery_proprio")!;
    expect(salao.custoPorUnidade).toBe(10);
    expect(deliveryProprio.custoPorUnidade).toBe(10);
  });

  it("soma a embalagem só nos canais de delivery, nunca no Salão", () => {
    const canais = montarPrecosPorCanal({
      custoBase: 10,
      custoComEmbalagem: 12,
      precoVendaSalao: 30,
      precoVendaDeliveryProprio: 32,
      precoVendaIfood: 40,
      precoVenda99Food: 38,
      margemNecessaria: 0.5,
      margemPontoEquilibrio: 0.3,
      deducoesSalao: 0.13,
      deducoesIfood: 0.27,
      deducoes99Food: 0.23,
    });

    expect(canais.find((c) => c.canal === "salao")!.custoPorUnidade).toBe(10);
    expect(canais.find((c) => c.canal === "delivery_proprio")!.custoPorUnidade).toBe(12);
    expect(canais.find((c) => c.canal === "ifood")!.custoPorUnidade).toBe(12);
    expect(canais.find((c) => c.canal === "99food")!.custoPorUnidade).toBe(12);
  });

  it("usa a comissão do marketplace no lugar da dedução do Salão pro preço sugerido", () => {
    const base = {
      custoBase: 10,
      custoComEmbalagem: 12,
      precoVendaSalao: null,
      precoVendaDeliveryProprio: null,
      precoVendaIfood: null,
      precoVenda99Food: null,
      margemNecessaria: 0.5,
      margemPontoEquilibrio: 0.3,
    };

    // custo 12, margem necessaria 50%, deducao 13% -> CMV alvo 37% -> 12/0,37
    const comDeducaoBaixa = montarPrecosPorCanal({ ...base, deducoesSalao: 0.13, deducoesIfood: 0.13, deducoes99Food: 0.13 });
    // mesmo custo e margem, mas deducao do ifood bem maior (27%) -> CMV alvo 23% -> preco sugerido maior
    const comComissaoAlta = montarPrecosPorCanal({ ...base, deducoesSalao: 0.13, deducoesIfood: 0.27, deducoes99Food: 0.13 });

    const sugeridoBase = comDeducaoBaixa.find((c) => c.canal === "ifood")!.precoSugerido!;
    const sugeridoComissaoAlta = comComissaoAlta.find((c) => c.canal === "ifood")!.precoSugerido!;
    expect(sugeridoComissaoAlta).toBeGreaterThan(sugeridoBase);
  });

  it("classifica prejuízo quando o preço praticado não cobre nem o ponto de equilíbrio", () => {
    const canais = montarPrecosPorCanal({
      custoBase: 20,
      custoComEmbalagem: 22,
      precoVendaSalao: 21,
      precoVendaDeliveryProprio: 23,
      precoVendaIfood: 25,
      precoVenda99Food: 25,
      margemNecessaria: 0.5,
      margemPontoEquilibrio: 0.3,
      deducoesSalao: 0.13,
      deducoesIfood: 0.27,
      deducoes99Food: 0.23,
    });

    expect(canais.find((c) => c.canal === "salao")!.classificacao).toBe("prejuizo");
  });
});
