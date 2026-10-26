import { describe, expect, it } from "vitest";
import { ehModuloTour } from "@/lib/tour/passos";
import {
  CHAVE_VIDEO_BOAS_VINDAS,
  deveOferecerBoasVindas,
  ehVideoHorizontal,
  proximoAvisoPrimeiroAcesso,
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

  it("cotação e espelhos são deitados (caixa larga); boas-vindas e contagem seguem em pé", () => {
    expect(ehVideoHorizontal(VIDEOS_AJUDA.cotacao)).toBe(true);
    expect(ehVideoHorizontal(VIDEOS_AJUDA.espelhos)).toBe(true);
    expect(ehVideoHorizontal(VIDEOS_AJUDA["boas-vindas"])).toBe(false);
    expect(ehVideoHorizontal(VIDEOS_AJUDA.contagem)).toBe(false);
  });
});
