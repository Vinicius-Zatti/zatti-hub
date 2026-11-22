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
  freelancersVisivel: true,
};

const rotulos = (c: Partial<ContextoMenuRestaurante>) => montarMenuRestaurantePiloto({ ...ctx, ...c }).map((i) => i.label);

describe("Freelancers no menu e nas permissões", () => {
  it("aparece depois das Avaliações só com o módulo ligado e acesso; nos dois menus", () => {
    const l = rotulos({});
    expect(l.indexOf("Freelancers")).toBe(l.indexOf("Avaliações") + 1);
    expect(rotulos({ freelancersVisivel: false })).not.toContain("Freelancers");
    expect(rotulos({ freelancersVisivel: undefined })).not.toContain("Freelancers");
    // Operação liberada pelo dono vê (o layout já calculou a permissão em freelancersVisivel).
    expect(rotulos({ podeGerir: false })).toContain("Freelancers");
    expect(montarMenuRestaurante(ctx).map((i) => i.label)).toContain("Freelancers");
  });

  it("operação começa sem acesso e o dono pode liberar ver ou editar; gestão edita por padrão", () => {
    expect(nivelPadrao("operacional", false, "freelancers")).toBe("sem_acesso");
    expect(niveisPermitidos("operacional", false, "freelancers")).toEqual(["sem_acesso", "ver", "editar"]);
    expect(niveisEfetivos("operacional", false, { freelancers: "editar" }).freelancers).toBe("editar");
    expect(niveisEfetivos("operacional", false, {}).freelancers).toBe("sem_acesso");
    expect(nivelPadrao("gestao", false, "freelancers")).toBe("editar");
    expect(nivelPadrao("master", false, "freelancers")).toBe("editar");
  });

  it("quem só vê perde a tela Configurar; sem acesso some o módulo", () => {
    const menu = montarMenuRestaurantePiloto(ctx);
    const soVe = aplicarPermissoesMenu(menu, niveisEfetivos("gestao", false, { freelancers: "ver" }));
    const hrefs = soVe.find((i) => i.label === "Freelancers")?.sections?.flatMap((s) => s.items.map((x) => x.href));
    expect(hrefs).toEqual(["/freelancers", "/freelancers/cadastro", "/freelancers/historico", "/freelancers/qr"]);
    expect(destinoSemEdicao("/freelancers/configurar", niveisEfetivos("gestao", false, { freelancers: "ver" }))).toBe("/freelancers");
    const sem = aplicarPermissoesMenu(menu, niveisEfetivos("gestao", false, { freelancers: "sem_acesso" }));
    expect(sem.map((i) => i.label)).not.toContain("Freelancers");
  });
});
