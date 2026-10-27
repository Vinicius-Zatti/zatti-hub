import { describe, expect, it } from "vitest";
import { passosDaTela, ROTEIROS_TOUR } from "./roteiros";

const ultimo = (passos: readonly { texto: string }[]) => passos[passos.length - 1].texto;
const TEXTO_VIDEO = "Ficou com dúvida? Toque aqui para ver o vídeo desta tela.";
const TEXTO_TOUR = "Quer ver estas dicas de novo? Toque aqui quando quiser.";

describe("passosDaTela: último passo do tour conforme o (?) da tela", () => {
  it("nas telas com vídeo, o passo do (?) fala do vídeo", () => {
    for (const rota of ["/estoque/contagem", "/estoque/pedidos", "/estoque/pedidos/cotacoes", "/estoque/pedidos/feitos", "/estoque/visao-geral", "/estoque/contagem/visualizacao", "/estoque/cmv"]) {
      const passos = passosDaTela(ROTEIROS_TOUR.estoque, rota);
      expect(ultimo(passos)).toBe(TEXTO_VIDEO);
      expect(passos[passos.length - 1].alvos).toEqual(['[data-tour="rever-tour"]']);
    }
  });

  it("nas outras telas o texto atual fica", () => {
    expect(ultimo(passosDaTela(ROTEIROS_TOUR.estoque, "/estoque/fornecedores/novo"))).toBe(TEXTO_TOUR);
    expect(ultimo(passosDaTela(ROTEIROS_TOUR.financeiro, "/financeiro"))).toBe(TEXTO_TOUR);
    expect(passosDaTela(ROTEIROS_TOUR.estoque, null)).toBe(ROTEIROS_TOUR.estoque);
  });

  it("telas do Estoque no módulo Cadastros (Produtos, Fornecedores, edições) também falam do vídeo", () => {
    for (const rota of ["/estoque/produtos", "/estoque/produtos/edicao", "/estoque/fornecedores", "/estoque/fornecedores/edicao"]) {
      expect(ultimo(passosDaTela(ROTEIROS_TOUR.cadastros, rota))).toBe(TEXTO_VIDEO);
    }
  });

  it("só o passo do (?) muda: os outros e a ordem ficam iguais", () => {
    const original = ROTEIROS_TOUR.estoque;
    const tela = passosDaTela(original, "/estoque/pedidos");
    expect(tela).toHaveLength(original.length);
    expect(tela.slice(0, -1)).toEqual(original.slice(0, -1));
  });
});
