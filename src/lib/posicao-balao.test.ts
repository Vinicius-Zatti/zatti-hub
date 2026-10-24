import { describe, expect, it } from "vitest";
import { MARGEM_BALAO, posicionarBalao } from "./posicao-balao";

const celular = { largura: 375, altura: 667 };
const balao = { largura: 288, altura: 90 };
const botao = (left: number, top = 100) => ({ left, top, bottom: top + 16 });

describe("posicionarBalao", () => {
  it("em 375px o balão nunca sai pela lateral, com o i em qualquer ponto", () => {
    for (let x = 0; x <= 375 - 16; x += 1) {
      const { left } = posicionarBalao(botao(x), balao, celular);
      expect(left).toBeGreaterThanOrEqual(MARGEM_BALAO);
      expect(left + balao.largura).toBeLessThanOrEqual(375 - MARGEM_BALAO);
    }
  });

  it("tela mais estreita que o balão: encosta na margem (o CSS limita a largura)", () => {
    expect(posicionarBalao(botao(200), balao, { largura: 280, altura: 600 }).left).toBe(MARGEM_BALAO);
  });

  it("abre embaixo do i e vira para cima quando não cabe embaixo", () => {
    expect(posicionarBalao(botao(20, 100), balao, celular).top).toBe(122);
    const pertoDoRodape = posicionarBalao(botao(20, 600), balao, celular);
    expect(pertoDoRodape.top).toBe(600 - 6 - 90);
  });

  it("sem espaço nem em cima, fica embaixo", () => {
    expect(posicionarBalao(botao(20, 40), { largura: 288, altura: 640 }, celular).top).toBe(62);
  });
});
