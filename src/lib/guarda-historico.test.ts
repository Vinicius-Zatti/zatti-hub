import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _reiniciarGuardaHistoricoParaTeste,
  ehVoltaDaEntradaExtra,
  empurrarMarcaHistorico,
  historicoTemMarca,
  registrarSaidaDaEntradaExtra,
} from "./guarda-historico";

/** Histórico mínimo do navegador: pilha de entradas com estado e URL. */
function criarJanela(caminho = "/estoque/contagem") {
  const entradas: { state: unknown; url: URL }[] = [{ state: null, url: new URL(`https://app.test${caminho}`) }];
  let indice = 0;
  const atual = () => entradas[indice];
  const janela = {
    location: {
      get pathname() { return atual().url.pathname; },
      get search() { return atual().url.search; },
      get hash() { return atual().url.hash; },
    },
    history: {
      get state() { return atual().state; },
      get length() { return entradas.length; },
      pushState(state: unknown, _t: string, url?: string) {
        entradas.splice(indice + 1);
        entradas.push({ state, url: url ? new URL(url, atual().url) : new URL(atual().url) });
        indice++;
      },
      /** Como o Next faz depois de server action/refresh: estado sem a marca. */
      replaceState(state: unknown) {
        entradas[indice] = { ...atual(), state };
      },
      back() {
        if (indice > 0) indice--;
      },
    },
  };
  return janela;
}

let janela: ReturnType<typeof criarJanela>;
const global = globalThis as unknown as { window?: unknown };

beforeEach(() => {
  janela = criarJanela();
  global.window = janela;
  _reiniciarGuardaHistoricoParaTeste();
});

afterEach(() => {
  delete global.window;
});

describe("guarda-historico", () => {
  it("ativar, desativar e ativar de novo depois de o Next apagar a marca não empilha entrada", () => {
    empurrarMarcaHistorico();
    expect(janela.history.length).toBe(2);
    expect(historicoTemMarca()).toBe(true);

    // Salvar com revalidatePath: o Next regrava o estado da entrada atual.
    janela.history.replaceState({ __NA: true });
    expect(historicoTemMarca()).toBe(false);

    // A tela reativa a guarda depois de salvar.
    empurrarMarcaHistorico();
    janela.history.replaceState({ __NA: true });
    empurrarMarcaHistorico();
    expect(janela.history.length).toBe(2);
  });

  it("voltar sai da entrada extra e o aviso reconhece; continuar empurra uma só de novo", () => {
    empurrarMarcaHistorico();
    janela.history.back();
    expect(ehVoltaDaEntradaExtra()).toBe(true);
    registrarSaidaDaEntradaExtra();
    expect(ehVoltaDaEntradaExtra()).toBe(false);

    // "Continuar editando": volta a ter exatamente uma entrada extra à frente.
    empurrarMarcaHistorico();
    expect(janela.history.length).toBe(2);
  });

  it("popstate de fragmento (#conteudo-principal) não abre aviso", () => {
    empurrarMarcaHistorico();
    janela.history.pushState(null, "", "#conteudo-principal");
    expect(ehVoltaDaEntradaExtra()).toBe(false);
  });

  it("popstate que já está em outra página não abre aviso", () => {
    empurrarMarcaHistorico();
    janela.history.pushState(null, "", "/estoque/pedidos");
    expect(ehVoltaDaEntradaExtra()).toBe(false);
  });

  it("outra página (navegação no cliente) ganha a sua entrada extra", () => {
    empurrarMarcaHistorico();
    janela.history.pushState({ __NA: true }, "", "/estoque/produtos/edicao");
    empurrarMarcaHistorico();
    expect(janela.history.length).toBe(4);
    empurrarMarcaHistorico();
    expect(janela.history.length).toBe(4);
  });

  it("sem ativar, nenhum popstate é tratado como voltar", () => {
    expect(ehVoltaDaEntradaExtra()).toBe(false);
  });
});
