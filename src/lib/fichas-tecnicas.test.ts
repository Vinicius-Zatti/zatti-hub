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

  it("preço sugerido de delivery mira o mesmo valor em R$ de margem de contribuição do Salão, não a mesma porcentagem", () => {
    // Caso real: X Burger custa 10,91, margem necessária 55%, dedução Salão
    // 10,2% (3% taxa de pagamento + 7,2% imposto) -> Salão sugere 31,35,
    // rendendo 17,24 de margem de contribuição. No iFood o mesmo item custa
    // 11,78 (com embalagem) e a dedução é 22,2% (7,2% imposto + 15% comissão)
    // - repetir os 55% de margem inflaria o preço; a meta certa é entregar
    // os mesmos 17,24 de margem, o que dá 37,30.
    const canais = montarPrecosPorCanal({
      custoBase: 10.91,
      custoComEmbalagem: 11.78,
      precoVendaSalao: null,
      precoVendaDeliveryProprio: null,
      precoVendaIfood: null,
      precoVenda99Food: null,
      margemNecessaria: 0.55,
      margemPontoEquilibrio: 0.4,
      deducoesSalao: 0.102,
      deducoesIfood: 0.222,
      deducoes99Food: 0.222,
    });

    const salao = canais.find((c) => c.canal === "salao")!;
    const ifood = canais.find((c) => c.canal === "ifood")!;
    expect(salao.precoSugerido).toBeCloseTo(31.35, 1);
    expect(ifood.precoSugerido).toBeCloseTo(37.3, 1);

    // Mesma margem em R$ nos dois preços sugeridos (a meta que motivou a
    // conta), não a mesma margem em %.
    const margemSalao = salao.precoSugerido! * (1 - 0.102) - 10.91;
    const margemIfood = ifood.precoSugerido! * (1 - 0.222) - 11.78;
    expect(margemIfood).toBeCloseTo(margemSalao, 5);
  });

  it("classifica a Situação do delivery pelo valor em R$ da margem, não pela porcentagem", () => {
    const base = {
      custoBase: 10.91,
      custoComEmbalagem: 11.78,
      precoVendaSalao: null,
      margemNecessaria: 0.55,
      margemPontoEquilibrio: 0.4,
      deducoesSalao: 0.102,
      deducoesIfood: 0.222,
      deducoes99Food: 0.222,
    };
    // Preço de iFood cobrado exatamente igual ao sugerido - deve dar "Lucro
    // Ajustado" mesmo a margem em % dele (~29%) ficando abaixo dos 55% do
    // Salão, porque em R$ ele bate a mesma meta. Usa o preço sugerido exato
    // (não o arredondado de exibição) pra não cair do lado errado do limite
    // por causa de centavos.
    const semPreco = montarPrecosPorCanal({ ...base, precoVendaDeliveryProprio: null, precoVendaIfood: null, precoVenda99Food: null });
    const precoSugeridoIfood = semPreco.find((c) => c.canal === "ifood")!.precoSugerido!;
    const noAlvo = montarPrecosPorCanal({
      ...base,
      precoVendaDeliveryProprio: null,
      precoVendaIfood: precoSugeridoIfood,
      precoVenda99Food: null,
    });
    const ifoodNoAlvo = noAlvo.find((c) => c.canal === "ifood")!;
    expect(ifoodNoAlvo.classificacao).toBe("lucro_ajustado");

    // Preço bem abaixo do sugerido cai pra prejuízo, mesma régua.
    const abaixo = montarPrecosPorCanal({
      ...base,
      precoVendaDeliveryProprio: null,
      precoVendaIfood: 20,
      precoVenda99Food: null,
    });
    expect(abaixo.find((c) => c.canal === "ifood")!.classificacao).toBe("prejuizo");
  });

  it("preço sugerido do delivery não depende do Salão ter preço de venda praticado", () => {
    const canais = montarPrecosPorCanal({
      custoBase: 10.91,
      custoComEmbalagem: 11.78,
      precoVendaSalao: null,
      precoVendaDeliveryProprio: null,
      precoVendaIfood: null,
      precoVenda99Food: null,
      margemNecessaria: 0.55,
      margemPontoEquilibrio: 0.4,
      deducoesSalao: 0.102,
      deducoesIfood: 0.222,
      deducoes99Food: 0.222,
    });

    expect(canais.find((c) => c.canal === "ifood")!.precoSugerido).not.toBeNull();
  });
});
