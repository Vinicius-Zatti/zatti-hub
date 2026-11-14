import { describe, expect, it } from "vitest";
import { montarMenuRestaurante, montarMenuRestaurantePiloto, type ContextoMenuRestaurante } from "@/lib/navegacao/menu-restaurante";
import { aplicarPermissoesMenu, destinoSemEdicao } from "@/lib/permissoes/menu";
import { nivelPadrao, niveisEfetivos, niveisPermitidos } from "@/lib/permissoes/modulos";

const ctx: ContextoMenuRestaurante = {
  podeGerir: true,
  consolidadoVendasHabilitado: true,
  financeiroGerencialHabilitado: true,
  fichasTecnicasHabilitado: true,
  equipeHabilitado: true,
  garanteHabilitado: true,
  conciliacaoHabilitada: true,
  avaliacoesHabilitado: true,
};

const rotulos = (c: Partial<ContextoMenuRestaurante>) => montarMenuRestaurantePiloto({ ...ctx, ...c }).map((i) => i.label);

describe("Avaliações no menu e nas permissões", () => {
  it("aparece depois do Garante só para a gestão e com o módulo ligado", () => {
    const l = rotulos({});
    expect(l.indexOf("Avaliações")).toBe(l.indexOf("Garante") + 1);
    expect(rotulos({ avaliacoesHabilitado: false })).not.toContain("Avaliações");
    expect(rotulos({ avaliacoesHabilitado: undefined })).not.toContain("Avaliações");
    expect(rotulos({ podeGerir: false })).not.toContain("Avaliações");
    expect(montarMenuRestaurante(ctx).map((i) => i.label)).toContain("Avaliações");
  });

  it("operação sem acesso por padrão e sem como subir; gestão escolhe entre sem acesso, ver e editar", () => {
    expect(nivelPadrao("operacional", false, "avaliacoes")).toBe("sem_acesso");
    expect(niveisPermitidos("operacional", false, "avaliacoes")).toEqual(["sem_acesso"]);
    expect(nivelPadrao("gestao", false, "avaliacoes")).toBe("editar");
    expect(niveisPermitidos("gestao", false, "avaliacoes")).toEqual(["sem_acesso", "ver", "editar"]);
    expect(nivelPadrao("master", false, "avaliacoes")).toBe("editar");
  });

  it("quem só vê perde a tela Configurar; sem acesso some o módulo", () => {
    const menu = montarMenuRestaurantePiloto(ctx);
    const soVe = aplicarPermissoesMenu(menu, niveisEfetivos("gestao", false, { avaliacoes: "ver" }));
    const hrefs = soVe.find((i) => i.label === "Avaliações")?.sections?.flatMap((s) => s.items.map((x) => x.href));
    expect(hrefs).toEqual(["/avaliacoes", "/avaliacoes/qr", "/avaliacoes/cupons"]);
    expect(destinoSemEdicao("/avaliacoes/configurar", niveisEfetivos("gestao", false, { avaliacoes: "ver" }))).toBe("/avaliacoes");
    const sem = aplicarPermissoesMenu(menu, niveisEfetivos("gestao", false, { avaliacoes: "sem_acesso" }));
    expect(sem.map((i) => i.label)).not.toContain("Avaliações");
  });
});
