import { describe, expect, it } from "vitest";
import { abaAtiva } from "@/components/escritorio/abas-escritorio";
import {
  diaSemana,
  diasDoPeriodo,
  formatoQueMaisSalva,
  horaEnvio,
  intervaloSemana,
  mediaPerfis,
  notaRegistro,
  numeroBr,
  ordenarPecas,
  percentualBr,
  seloAutomacao,
  tempoResposta,
  variacao,
} from "@/lib/instagram/painel";

describe("painel do Instagram", () => {
  it("null aparece como sem dado, nunca 0", () => {
    expect(numeroBr(null)).toBe("sem dado");
    expect(percentualBr(null)).toBe("sem dado");
    expect(tempoResposta(null)).toBe("sem dado");
    expect(numeroBr(0)).toBe("0");
    expect(numeroBr(412000)).toBe("412.000");
    expect(percentualBr(6.2)).toBe("6,2%");
  });

  it("tempo de resposta em s ou min", () => {
    expect(tempoResposta(3)).toBe("3 s");
    expect(tempoResposta(95)).toBe("2 min");
  });

  it("variação só com período anterior", () => {
    expect(variacao(118, 100)).toEqual({ texto: "+18%", sobe: true });
    expect(variacao(80, 100)).toEqual({ texto: "-20%", sobe: false });
    expect(variacao(6.2, 5.4, true)).toEqual({ texto: "+0,8 p.p.", sobe: true });
    expect(variacao(10, null)).toBeNull();
    expect(variacao(10, undefined)).toBeNull();
    expect(variacao(null, 10)).toBeNull();
    expect(variacao(10, 0)).toBeNull();
  });

  it("selo: desligada, pausada até e ligada", () => {
    const agora = Date.parse("2026-11-05T12:00:00Z");
    expect(seloAutomacao({ ligada: false, pausadaAte: null }, agora).texto).toBe("Desligada");
    expect(seloAutomacao({ ligada: true, pausadaAte: agora + 3_600_000 }, agora).texto).toBe("Pausada até 05/11/2026 10:00");
    expect(seloAutomacao({ ligada: true, pausadaAte: agora - 1 }, agora).texto).toBe("Ligada");
  });

  it("nota do registro só quando começou ontem ou depois", () => {
    expect(notaRegistro("2026-11-06", "2026-11-05")).toBe("A contagem por hora começou em 06/11.");
    expect(notaRegistro("2026-11-05", "2026-11-05")).not.toBeNull();
    expect(notaRegistro("2026-11-04", "2026-11-05")).toBeNull();
    expect(notaRegistro(null, "2026-11-05")).toBeNull();
  });

  it("hora do envio: só hora se foi hoje", () => {
    expect(horaEnvio(Date.parse("2026-11-05T12:41:00Z"), "2026-11-05")).toBe("09:41");
    expect(horaEnvio(Date.parse("2026-11-04T12:41:00Z"), "2026-11-05")).toBe("04/11 09:41");
  });

  it("recortes e comparações", () => {
    const dias = Array.from({ length: 10 }, (_, i) => ({ dia: `2026-11-${String(i + 1).padStart(2, "0")}`, alcance: i }));
    expect(diasDoPeriodo(dias, "7").map((d) => d.dia)[0]).toBe("2026-11-04");
    expect(diaSemana("2026-11-05")).toBe("Qui");
    expect(intervaloSemana("2026-11-28")).toEqual({ inicio: "2026-11-28", fim: "2026-12-04" });
    expect(
      formatoQueMaisSalva([
        { formato: "Reels", posts: 4, viewsPorPost: 900, salvamentosPorPost: 3 },
        { formato: "Carrossel", posts: 2, viewsPorPost: 300, salvamentosPorPost: 9 },
        { formato: "Foto", posts: 1, viewsPorPost: null, salvamentosPorPost: null },
      ])?.formato,
    ).toBe("Carrossel");
    expect(formatoQueMaisSalva([])).toBeNull();
    expect(
      mediaPerfis(
        [
          { postsPorSemana: 4, viewsPorPost: null, interacoesPorPost: 1 },
          { postsPorSemana: 6, viewsPorPost: null, interacoesPorPost: null },
        ],
        "postsPorSemana",
      ),
    ).toBe(5);
    expect(mediaPerfis([{ postsPorSemana: 4, viewsPorPost: null, interacoesPorPost: 1 }], "viewsPorPost")).toBeNull();
    expect(
      ordenarPecas([
        { id: "b", data: "2026-11-06", hora: null, formato: "", titulo: "", status: "Ideia" },
        { id: "a", data: "2026-11-06", hora: "09:00", formato: "", titulo: "", status: "Ideia" },
        { id: "c", data: "2026-11-05", hora: null, formato: "", titulo: "", status: "Ideia" },
      ]).map((p) => p.id),
    ).toEqual(["c", "a", "b"]);
  });

  it("aba Instagram fica ativa no Escritório", () => {
    expect(abaAtiva("/escritorio/instagram")).toBe("/escritorio/instagram");
  });
});
