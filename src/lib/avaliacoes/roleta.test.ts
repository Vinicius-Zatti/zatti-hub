import { describe, expect, it } from "vitest";
import { anguloFinal, chances, codigoValido, normalizarCodigo, resumirCupons, rotuloFatia, validarRoleta } from "./roleta";

describe("roleta: configuração", () => {
  const dq = [
    { nome: "R$ 12 de desconto", regra: "Em pedidos acima de R$ 60", peso: 1 },
    { nome: "Frete grátis", regra: "", peso: 1 },
    { nome: "Batata grátis", regra: "", peso: 1 },
  ];

  it("aceita os prêmios da Dom Quixote e ignora linha vazia", () => {
    const r = validarRoleta({ ativa: true, validadeDias: 30, premios: [...dq, { nome: " ", regra: "", peso: 1 }] });
    expect(r).toMatchObject({ ok: true, premios: [{ nome: "R$ 12 de desconto", regra: "Em pedidos acima de R$ 60" }, { regra: null }, {}] });
  });

  it("recusa roleta ligada sem prêmio, validade fora de 1 a 180 e peso fora de 1 a 100", () => {
    expect(validarRoleta({ ativa: true, validadeDias: 30, premios: [] })).toMatchObject({ ok: false });
    expect(validarRoleta({ ativa: false, validadeDias: 30, premios: [] })).toMatchObject({ ok: true });
    expect(validarRoleta({ ativa: true, validadeDias: 0, premios: dq })).toMatchObject({ ok: false });
    expect(validarRoleta({ ativa: true, validadeDias: 30, premios: [{ nome: "Batata", regra: "", peso: 0 }] })).toMatchObject({ ok: false });
    expect(validarRoleta({ ativa: true, validadeDias: 30, premios: Array.from({ length: 9 }, (_, i) => ({ nome: `Prêmio ${i}`, regra: "", peso: 1 })) })).toMatchObject({
      ok: false,
    });
  });

  it("chance de cada prêmio pelo peso", () => {
    expect(chances([{ peso: 1 }, { peso: 1 }, { peso: 2 }])).toEqual([25, 25, 50]);
    expect(chances([])).toEqual([]);
  });
});

describe("roleta: roda e cupom", () => {
  it("a roda para com o meio da fatia sorteada debaixo do ponteiro", () => {
    // 3 fatias de 120°: a do meio (índice 1) tem centro em 180°.
    expect(anguloFinal(1, 3) % 360).toBe(180);
    expect(anguloFinal(0, 4) % 360).toBe(315);
    expect(anguloFinal(0, 4)).toBeGreaterThan(360 * 5);
  });

  it("código: maiúsculo, sem espaço nem traço; sem letras confundíveis", () => {
    expect(normalizarCodigo(" abc-234 ")).toBe("ABC234");
    expect(codigoValido("ABC234")).toBe(true);
    expect(codigoValido("ABO234")).toBe(false);
    expect(codigoValido("ABC23")).toBe(false);
  });

  it("resumo dos cupons: emitidos, usados, vencidos e em aberto", () => {
    const agora = new Date("2026-11-20T12:00:00Z");
    const r = resumirCupons(
      [
        { usadoEm: "2026-11-15T12:00:00Z", validoAte: "2026-12-13T12:00:00Z" },
        { usadoEm: null, validoAte: "2026-11-19T12:00:00Z" },
        { usadoEm: null, validoAte: "2026-12-19T12:00:00Z" },
        { usadoEm: null, validoAte: "2026-12-19T12:00:00Z" },
      ],
      agora,
    );
    expect(r).toEqual({ emitidos: 4, usados: 1, vencidos: 1, abertos: 2, taxaUso: 25 });
    expect(resumirCupons([]).taxaUso).toBeNull();
  });
});

describe("roleta: nome na fatia", () => {
  it("até 4 fatias o nome vai deitado; de 5 em diante, em pé", () => {
    expect(rotuloFatia("Frete grátis", 4)).toMatchObject({ radial: false, linhas: ["Frete grátis"] });
    expect(rotuloFatia("Frete grátis", 5)).toMatchObject({ radial: true, linhas: ["Frete grátis"] });
  });
  it("quebra por palavra em até 2 linhas, sem passar do que cabe", () => {
    const r = rotuloFatia("R$ 12 de desconto", 6);
    expect(r.linhas).toEqual(["R$ 12 de", "desconto"]);
    const longo = rotuloFatia("Batata frita grande grátis hoje", 8);
    expect(longo.linhas).toHaveLength(2);
    expect(longo.linhas.every((l) => l.length <= 13)).toBe(true);
    expect(longo.linhas[1].endsWith("…")).toBe(true);
  });
  it("nome no limite de letras cabe nas 8 fatias", () => {
    expect(rotuloFatia("Batata grande + refri 2L", 8).linhas.join(" ")).not.toContain("…");
    expect(validarRoleta({ ativa: true, validadeDias: 30, premios: [{ nome: "x".repeat(25), regra: "", peso: 1 }] })).toMatchObject({ ok: false });
  });
});
