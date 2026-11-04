import { describe, expect, it } from "vitest";
import { AVISO_ESPERA_SEFAZ, textoUltimaBusca } from "./aviso-rodada";
import type { RodadaResumo } from "./painel";

const rodada = (parcial: Partial<RodadaResumo>): RodadaResumo => ({
  dia: "2026-11-04",
  hora: "08:01",
  situacao: "erro",
  erroCodigo: null,
  notasNovas: 0,
  ciencias: 0,
  filaZerou: false,
  ...parcial,
});

describe("textoUltimaBusca", () => {
  it("recusa por consulta recente vira aviso de espera, nunca falha", () => {
    for (const erroCodigo of ["sefaz_656_consumo_indevido", "sefaz_evento_lote_656"]) {
      const texto = textoUltimaBusca(rodada({ erroCodigo }));
      expect(texto).toBe(AVISO_ESPERA_SEFAZ);
      expect(texto).not.toContain("falhou");
    }
  });

  it("erro de verdade continua aparecendo como falha", () => {
    expect(textoUltimaBusca(rodada({ erroCodigo: "certificado_vencido" }))).toBe("falhou (certificado_vencido)");
    expect(textoUltimaBusca(rodada({ erroCodigo: null }))).toBe("falhou (erro)");
  });

  it("busca que deu certo mantém o texto de sempre", () => {
    expect(textoUltimaBusca(rodada({ situacao: "ok", notasNovas: 3, filaZerou: true }))).toBe("3 nota(s) nova(s)");
    expect(textoUltimaBusca(rodada({ situacao: "ok", notasNovas: 1 }))).toBe("1 nota(s) nova(s), fila continua na próxima busca");
  });
});
