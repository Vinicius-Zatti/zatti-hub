import { describe, expect, it } from "vitest";
import { buscarPorAssunto, montarEscritorio } from "./escritorio";
import { ESTADO } from "./estado";
import { POSICOES, SALAS } from "./estrutura";
import { ARQUETIPOS } from "./ocupantes";
import { RESPONSABILIDADES } from "./responsabilidades";

const porId = new Map(POSICOES.map((p) => [p.id, p]));
const salaDe = (id: string) => SALAS.find((s) => s.id === porId.get(id)?.salaId);

describe("estrutura do Time de IA", () => {
  it("toda posição tem sala, responsabilidades e estado, e ids não se repetem", () => {
    expect(porId.size).toBe(POSICOES.length);
    for (const p of POSICOES) {
      expect(salaDe(p.id), p.id).toBeDefined();
      expect(RESPONSABILIDADES[p.id], p.id).toBeDefined();
      expect(ESTADO[p.id], p.id).toBeDefined();
      if (p.reportaA) expect(porId.has(p.reportaA), p.id).toBe(true);
      if (p.arquetipoId) expect(ARQUETIPOS[p.arquetipoId], p.id).toBeDefined();
    }
  });

  it("vaga não tem ocupante nem nível, e situação de alerta exige motivo", () => {
    for (const p of POSICOES) {
      const estado = ESTADO[p.id];
      expect(estado.situacao === "vaga", p.id).toBe(p.ocupanteId === null);
      if (p.ocupanteId === null) expect(estado.nivel, p.id).toBeNull();
      if (estado.situacao === "aguardando-vinicius" || estado.situacao === "com-problema") {
        expect(estado.motivo, p.id).toBeTruthy();
      }
    }
  });

  it("Horizzon não responde a nenhuma posição da Zatti", () => {
    for (const p of POSICOES.filter((x) => salaDe(x.id)?.empresa === "horizzon")) {
      if (p.reportaA) expect(salaDe(p.reportaA)?.empresa, p.id).toBe("horizzon");
    }
  });

  it("busca por assunto ignora acento e caixa", () => {
    const { salas } = montarEscritorio();
    expect(buscarPorAssunto(salas, "CONCILIACAO").map((p) => p.id)).toContain("bpo-financeiro");
  });
});
