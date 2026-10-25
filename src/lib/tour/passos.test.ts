import { describe, expect, it } from "vitest";
import { montarMenuRestaurantePiloto } from "@/lib/navegacao/menu-restaurante";
import {
  MODULOS_TOUR,
  deveMostrarTour,
  ehModuloTour,
  ehUltimoPasso,
  moduloTourDoRotulo,
  passosVisiveis,
  posicionarBalaoTour,
  textoContador,
} from "./passos";
import { ROTEIROS_TOUR } from "./roteiros";

const tudoLigado = {
  podeGerir: true,
  consolidadoVendasHabilitado: true,
  financeiroGerencialHabilitado: true,
  fichasTecnicasHabilitado: true,
  equipeHabilitado: true,
  garanteHabilitado: true,
  conciliacaoHabilitada: true,
};

describe("quando o tour aparece", () => {
  it("aparece só no módulo ainda não visto", () => {
    expect(deveMostrarTour("estoque", new Set())).toBe(true);
    expect(deveMostrarTour("estoque", new Set(["estoque"]))).toBe(false);
    expect(deveMostrarTour("garante", new Set(["estoque"]))).toBe(true);
  });

  it("não aparece quando a leitura do banco falhou (migration não aplicada)", () => {
    expect(deveMostrarTour("estoque", null)).toBe(false);
  });

  it("não aparece em módulo sem tour", () => {
    expect(deveMostrarTour(null, new Set())).toBe(false);
  });
});

describe("módulo do tour", () => {
  it("todo módulo do menu do piloto tem tour", () => {
    for (const item of montarMenuRestaurantePiloto(tudoLigado)) {
      expect(moduloTourDoRotulo(item.label), item.label).not.toBeNull();
    }
  });

  it("rótulo desconhecido ou vazio não tem tour", () => {
    expect(moduloTourDoRotulo("Marketing")).toBeNull();
    expect(moduloTourDoRotulo(undefined)).toBeNull();
  });

  it("só aceita chave conhecida (barreira da action)", () => {
    expect(ehModuloTour("estoque")).toBe(true);
    expect(ehModuloTour("estoque'; drop table")).toBe(false);
    expect(ehModuloTour(1)).toBe(false);
  });
});

describe("roteiros", () => {
  it("cobre os 10 módulos com 3 a 5 passos", () => {
    expect(MODULOS_TOUR).toHaveLength(10);
    for (const modulo of MODULOS_TOUR) {
      const passos = ROTEIROS_TOUR[modulo];
      expect(passos.length, modulo).toBeGreaterThanOrEqual(3);
      expect(passos.length, modulo).toBeLessThanOrEqual(5);
    }
  });

  it("textos curtos, sem travessão, sem emoji e sem 'tu'", () => {
    for (const modulo of MODULOS_TOUR) {
      for (const passo of ROTEIROS_TOUR[modulo]) {
        const texto = `${passo.titulo} ${passo.texto}`;
        expect(texto, texto).not.toMatch(/[–—]/);
        expect(texto, texto).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(texto, texto).not.toMatch(/\b(tu|teu|tua|ti|contigo)\b/i);
        expect(passo.texto.length, texto).toBeLessThanOrEqual(110);
        expect(passo.alvos.length, texto).toBeGreaterThan(0);
      }
    }
  });
});

describe("passos visíveis e contador", () => {
  const passos = ROTEIROS_TOUR.estoque;

  it("pula o passo cujo alvo não está na tela", () => {
    const naTela = new Set(['[data-tour="abas-modulo"]', '[data-tour="rever-tour"]']);
    const visiveis = passosVisiveis(passos, (alvos) => alvos.some((a) => naTela.has(a)));
    expect(visiveis.map((p) => p.titulo)).toEqual(["Seções do Estoque", "Rever o tour"]);
  });

  it("sem nenhum alvo, nada a mostrar", () => {
    expect(passosVisiveis(passos, () => false)).toEqual([]);
  });

  it("contador e último passo", () => {
    expect(textoContador(1, 4)).toBe("2 de 4");
    expect(ehUltimoPasso(2, 4)).toBe(false);
    expect(ehUltimoPasso(3, 4)).toBe(true);
  });
});

describe("posição do balão", () => {
  const balao = { largura: 320, altura: 160 };
  const desktop = { largura: 1440, altura: 900, reservaInferior: 0 };
  const celular = { largura: 390, altura: 844, reservaInferior: 80 };

  it("fica embaixo do alvo quando cabe, centralizado nele", () => {
    const pos = posicionarBalaoTour({ top: 100, bottom: 140, left: 600, right: 800 }, balao, desktop);
    expect(pos).toEqual({ top: 152, left: 540, lado: "abaixo" });
  });

  it("vai para cima quando não cabe embaixo", () => {
    const pos = posicionarBalaoTour({ top: 700, bottom: 760, left: 600, right: 800 }, balao, desktop);
    expect(pos.lado).toBe("acima");
    expect(pos.top).toBe(700 - 12 - 160);
  });

  it("no celular não cobre a barra de baixo", () => {
    const pos = posicionarBalaoTour({ top: 560, bottom: 600, left: 20, right: 370 }, balao, celular);
    // 600 + 12 + 160 = 772 > 844 - 80 - 12 = 752: sobe.
    expect(pos.lado).toBe("acima");
    expect(pos.top + balao.altura).toBeLessThanOrEqual(844 - 80);
  });

  it("nunca sai pela lateral (alvo na borda direita, tela estreita)", () => {
    const pos = posicionarBalaoTour({ top: 10, bottom: 44, left: 340, right: 376 }, { largura: 400, altura: 150 }, celular);
    expect(pos.left).toBe(12);
    const pos2 = posicionarBalaoTour({ top: 10, bottom: 44, left: 340, right: 376 }, balao, celular);
    expect(pos2.left + balao.largura).toBeLessThanOrEqual(390 - 12);
  });

  it("alvo maior que a tela: balão preso na faixa livre", () => {
    const pos = posicionarBalaoTour({ top: 20, bottom: 1400, left: 0, right: 390 }, balao, celular);
    expect(pos.top).toBe(844 - 80 - 12 - 160);
    expect(pos.top).toBeGreaterThanOrEqual(12);
  });
});
