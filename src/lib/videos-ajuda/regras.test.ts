import { describe, expect, it } from "vitest";
import { ehModuloTour } from "@/lib/tour/passos";
import {
  CHAVE_VIDEO_BOAS_VINDAS,
  deveOferecerBoasVindas,
  ehVideoHorizontal,
  proximoAvisoPrimeiroAcesso,
  videoDaTela,
  VIDEOS_AJUDA,
} from "./regras";

describe("deveOferecerBoasVindas", () => {
  it("oferece a quem ainda não viu o cartão, mesmo já tendo visto tours", () => {
    expect(deveOferecerBoasVindas(new Set())).toBe(true);
    expect(deveOferecerBoasVindas(new Set(["inicio", "estoque"]))).toBe(true);
  });

  it("oferece uma vez só: com a chave gravada não volta", () => {
    expect(deveOferecerBoasVindas(new Set([CHAVE_VIDEO_BOAS_VINDAS]))).toBe(false);
  });

  it("leitura do banco falhou: não oferece, para não aparecer a cada tela", () => {
    expect(deveOferecerBoasVindas(null)).toBe(false);
  });

  it("a chave cabe na regra da coluna de tours_vistos e não colide com um módulo", () => {
    expect(CHAVE_VIDEO_BOAS_VINDAS).toMatch(/^[a-z][a-z_]{0,39}$/);
    expect(ehModuloTour(CHAVE_VIDEO_BOAS_VINDAS)).toBe(false);
  });
});

describe("proximoAvisoPrimeiroAcesso: tour, boas-vindas, instalar, um de cada vez", () => {
  const todos = { tourPendente: true, boasVindasPendente: true, conviteElegivel: true };

  it("com tudo pendente, o tour vem primeiro", () => {
    expect(proximoAvisoPrimeiroAcesso(todos)).toBe("tour");
  });

  it("tour pendente segura o cartão de boas-vindas e o convite", () => {
    expect(proximoAvisoPrimeiroAcesso({ ...todos, boasVindasPendente: false })).toBe("tour");
  });

  it("depois do tour, o cartão de boas-vindas antes do convite de instalar", () => {
    expect(proximoAvisoPrimeiroAcesso({ ...todos, tourPendente: false })).toBe("boas-vindas");
  });

  it("só sem tour e sem cartão pendentes o convite de instalar aparece", () => {
    expect(proximoAvisoPrimeiroAcesso({ tourPendente: false, boasVindasPendente: false, conviteElegivel: true })).toBe(
      "instalar",
    );
  });

  it("no computador (convite não elegível) o cartão de boas-vindas aparece igual", () => {
    expect(proximoAvisoPrimeiroAcesso({ tourPendente: false, boasVindasPendente: true, conviteElegivel: false })).toBe(
      "boas-vindas",
    );
  });

  it("nada pendente: nenhum aviso", () => {
    expect(proximoAvisoPrimeiroAcesso({ tourPendente: false, boasVindasPendente: false, conviteElegivel: false })).toBe(
      null,
    );
  });
});

describe("VIDEOS_AJUDA", () => {
  it("vídeos e capas em public/videos (fora do middleware)", () => {
    for (const video of Object.values(VIDEOS_AJUDA)) {
      expect(video.src).toMatch(/^\/videos\/[a-z0-9-]+\.mp4$/);
      expect(video.capa).toMatch(/^\/videos\/[a-z0-9-]+-capa\.jpg$/);
    }
  });

  it("cotação, espelhos e pedido feito são deitados (caixa larga); boas-vindas e contagem seguem em pé", () => {
    expect(ehVideoHorizontal(VIDEOS_AJUDA.cotacao)).toBe(true);
    expect(ehVideoHorizontal(VIDEOS_AJUDA.espelhos)).toBe(true);
    expect(ehVideoHorizontal(VIDEOS_AJUDA["pedido-feito"])).toBe(true);
    expect(ehVideoHorizontal(VIDEOS_AJUDA["instalar-iphone"])).toBe(false);
    expect(ehVideoHorizontal(VIDEOS_AJUDA["boas-vindas"])).toBe(false);
    expect(ehVideoHorizontal(VIDEOS_AJUDA.contagem)).toBe(false);
  });

  it("telas do Estoque: tabelas largas deitadas, o resto em pé", () => {
    for (const id of ["estoque-produtos", "estoque-editar-produtos", "estoque-conferir-contagens", "estoque-editar-fornecedores", "estoque-perdas", "estoque-movimentacoes"] as const) {
      expect(ehVideoHorizontal(VIDEOS_AJUDA[id])).toBe(true);
    }
    for (const id of ["estoque-visao-geral", "estoque-setores", "estoque-fornecedores", "estoque-cmv-real"] as const) {
      expect(ehVideoHorizontal(VIDEOS_AJUDA[id])).toBe(false);
    }
  });

  it("telas de Fichas técnicas: todas em pé (28/10/2026)", () => {
    for (const id of ["fichas-consultar", "fichas-categorias", "fichas-conversoes", "fichas-margem", "fichas-precificacao"] as const) {
      expect(ehVideoHorizontal(VIDEOS_AJUDA[id])).toBe(false);
    }
  });

  it("telas do Checklist Garante: todas em pé", () => {
    for (const id of ["garante-hoje", "garante-planos", "garante-quadro", "garante-nota", "garante-modelos"] as const) {
      expect(ehVideoHorizontal(VIDEOS_AJUDA[id])).toBe(false);
    }
  });
});

describe("videoDaTela: o (?) abre o vídeo da tela quando ela tem um", () => {
  it("contagem, criar cotação, editor de espelhos e pedidos feitos", () => {
    expect(videoDaTela("/estoque/contagem")).toBe("contagem");
    expect(videoDaTela("/estoque/pedidos")).toBe("cotacao");
    expect(videoDaTela("/estoque/pedidos/cotacoes")).toBe("espelhos");
    expect(videoDaTela("/estoque/pedidos/feitos")).toBe("pedido-feito");
  });

  it("as 10 telas do Estoque com vídeo próprio (27/10/2026)", () => {
    expect(videoDaTela("/estoque/visao-geral")).toBe("estoque-visao-geral");
    expect(videoDaTela("/estoque/produtos")).toBe("estoque-produtos");
    expect(videoDaTela("/estoque/produtos/edicao")).toBe("estoque-editar-produtos");
    expect(videoDaTela("/estoque/setores")).toBe("estoque-setores");
    expect(videoDaTela("/estoque/contagem/visualizacao")).toBe("estoque-conferir-contagens");
    expect(videoDaTela("/estoque/fornecedores")).toBe("estoque-fornecedores");
    expect(videoDaTela("/estoque/fornecedores/edicao")).toBe("estoque-editar-fornecedores");
    expect(videoDaTela("/estoque/cmv")).toBe("estoque-cmv-real");
    expect(videoDaTela("/estoque/contagem/perdas")).toBe("estoque-perdas");
    expect(videoDaTela("/estoque/contagem/movimentacoes")).toBe("estoque-movimentacoes");
  });

  it("as 5 telas do Checklist Garante com vídeo próprio (27/10/2026)", () => {
    expect(videoDaTela("/garante")).toBe("garante-hoje");
    expect(videoDaTela("/garante/planos")).toBe("garante-planos");
    expect(videoDaTela("/garante/quadro")).toBe("garante-quadro");
    expect(videoDaTela("/garante/nota")).toBe("garante-nota");
    expect(videoDaTela("/garante/modelos")).toBe("garante-modelos");
  });

  it("as 5 telas de Fichas técnicas com vídeo próprio (28/10/2026)", () => {
    expect(videoDaTela("/fichas-tecnicas")).toBe("fichas-consultar");
    expect(videoDaTela("/fichas-tecnicas/categorias")).toBe("fichas-categorias");
    expect(videoDaTela("/fichas-tecnicas/conversoes")).toBe("fichas-conversoes");
    expect(videoDaTela("/fichas-tecnicas/calculadora")).toBe("fichas-margem");
    expect(videoDaTela("/fichas-tecnicas/precificacao")).toBe("fichas-precificacao");
  });

  it("ignora barra no fim e parâmetros", () => {
    expect(videoDaTela("/estoque/pedidos/")).toBe("cotacao");
    expect(videoDaTela("/estoque/pedidos?data=2026-10-20")).toBe("cotacao");
  });

  it("tela sem vídeo (inclusive irmãs e o Início): null, o (?) segue no tour", () => {
    expect(videoDaTela("/estoque/fornecedores/novo")).toBeNull();
    expect(videoDaTela("/financeiro-gerencial/visao-geral")).toBeNull();
    expect(videoDaTela("/estoque")).toBeNull();
    expect(videoDaTela("/garante/execucao/abc")).toBeNull();
    expect(videoDaTela("/garante/modelos/abc")).toBeNull();
    expect(videoDaTela("/fichas-tecnicas/abc")).toBeNull();
    expect(videoDaTela("/inicio")).toBeNull();
    expect(videoDaTela("/constructor")).toBeNull();
    expect(videoDaTela(null)).toBeNull();
  });

  it("todo vídeo do mapa existe em VIDEOS_AJUDA", () => {
    const rotas = ["/estoque/contagem", "/estoque/pedidos", "/estoque/pedidos/cotacoes", "/estoque/pedidos/feitos", "/estoque/visao-geral", "/estoque/produtos", "/estoque/produtos/edicao", "/estoque/setores", "/estoque/contagem/visualizacao", "/estoque/fornecedores", "/estoque/fornecedores/edicao", "/estoque/cmv", "/estoque/contagem/perdas", "/estoque/contagem/movimentacoes", "/garante", "/garante/planos", "/garante/quadro", "/garante/nota", "/garante/modelos", "/fichas-tecnicas", "/fichas-tecnicas/categorias", "/fichas-tecnicas/conversoes", "/fichas-tecnicas/calculadora", "/fichas-tecnicas/precificacao"];
    for (const rota of rotas) {
      expect(VIDEOS_AJUDA[videoDaTela(rota)!]).toBeDefined();
    }
  });
});

describe("videoDaTela: Início e Dashboard (27/10/2026)", () => {
  it("o (?) do Início e do Dashboard abre o vídeo da tela", () => {
    expect(videoDaTela("/painel")).toBe("inicio");
    expect(videoDaTela("/painel/dashboard")).toBe("dashboard");
  });
});
