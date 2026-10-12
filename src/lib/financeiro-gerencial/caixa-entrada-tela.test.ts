import { describe, expect, it } from "vitest";
import { descricaoSugerida, formatarDataHoraBr, totalLido, valoresIniciaisDaExtracao, type ExtracaoComSugestao } from "./caixa-entrada-tela";

function extracao(p: Partial<ExtracaoComSugestao> = {}): ExtracaoComSugestao {
  return {
    tipoDocumento: "nota_fiscal",
    contraparteNome: "Atacadão",
    contraparteDocumento: "12345678000199",
    numero: "123",
    dataEmissao: "2026-10-05",
    valorTotalCentavos: 15000,
    vencimentos: [],
    itens: [],
    fonte: "xml_nfe",
    observacao: null,
    contraparteId: null,
    sugestao: {
      linhas: [
        { planoContasCodigo: "cat-1", descricao: "Carne", valorCentavos: 10000 },
        { planoContasCodigo: null, descricao: "Diferença", valorCentavos: 5000 },
      ],
      vencimentos: [{ data: "2026-11-05", valorCentavos: 15000 }],
      diferencaCentavos: 5000,
    },
    ...p,
  };
}

describe("caixa de entrada - tela", () => {
  it("formata data e hora em São Paulo", () => {
    expect(formatarDataHoraBr("2026-10-11T15:04:00Z")).toBe("11/10/2026 12:04");
    expect(formatarDataHoraBr("2026-10-11T02:30:00Z")).toBe("10/10/2026 23:30");
  });

  it("monta descrição pelo tipo, número e fornecedor", () => {
    expect(descricaoSugerida(extracao())).toBe("Nota fiscal nº 123 - Atacadão");
    expect(descricaoSugerida(extracao({ tipoDocumento: "boleto", numero: null, contraparteNome: null }))).toBe("Boleto");
  });

  it("preenche novo fornecedor quando não achou contraparte e limpa Plano de Contas inválido", () => {
    const v = valoresIniciaisDaExtracao(extracao(), "2026-10-11", new Set(["cat-1"]));
    expect(v.contraparteId).toBeNull();
    expect(v.novaContraparte).toEqual({ nome: "Atacadão", documento: "12345678000199" });
    expect(v.dataCompetencia).toBe("2026-10-05");
    expect(v.linhas).toEqual([
      { categoriaId: "cat-1", descricao: "Carne", valor: 100 },
      { categoriaId: "", descricao: "Diferença", valor: 50 },
    ]);
    expect(v.vencimentos).toEqual([{ dataPrevista: "2026-11-05", valor: 150 }]);
    const semValido = valoresIniciaisDaExtracao(extracao(), "2026-10-11", new Set());
    expect(semValido.linhas?.[0].categoriaId).toBe("");
  });

  it("usa contraparte existente, hoje como competência e deixa vencimentos para o formulário", () => {
    const v = valoresIniciaisDaExtracao(
      extracao({ contraparteId: "f1", dataEmissao: null, sugestao: { linhas: [], vencimentos: [], diferencaCentavos: 0 } }),
      "2026-10-11",
      new Set(),
    );
    expect(v.contraparteId).toBe("f1");
    expect(v.novaContraparte).toBeUndefined();
    expect(v.dataCompetencia).toBe("2026-10-11");
    expect(v.linhas).toBeUndefined();
    expect(v.vencimentos).toBeUndefined();
  });

  it("total lido usa vencimentos ou o total impresso", () => {
    expect(totalLido(extracao())).toBe(150);
    expect(totalLido(extracao({ sugestao: { linhas: [], vencimentos: [], diferencaCentavos: 0 } }))).toBe(150);
  });
});
