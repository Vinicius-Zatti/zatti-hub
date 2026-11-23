import { describe, expect, it } from "vitest";
import {
  contraparteDoDocumento,
  descricaoSugerida,
  formatarDataHoraBr,
  formatarDocumento,
  resumoDoEnvio,
  totalLido,
  valoresIniciaisDaExtracao,
  type ExtracaoComSugestao,
} from "./caixa-entrada-tela";

function extracao(p: Partial<ExtracaoComSugestao> = {}): ExtracaoComSugestao {
  return {
    tipoDocumento: "nota_fiscal",
    contraparteNome: "Atacadão",
    contraparteDocumento: "12345678000199",
    numero: "123",
    dataEmissao: "2026-10-05",
    valorTotalCentavos: 15000,
    vencimentos: [{ data: "2026-11-05", valorCentavos: 15000 }],
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
    const itens = [
      { descricao: "Carne", valorCentavos: 10000, planoContasCodigo: "cat-1" },
    ];
    const v = valoresIniciaisDaExtracao(extracao({ itens }), "2026-10-11", new Set(["cat-1"]));
    expect(v.itemAItem).toBe(true);
    expect(v.documentoLido).toBe("12345678000199");
    expect(v.contraparteId).toBeNull();
    expect(v.novaContraparte).toEqual({ nome: "Atacadão", documento: "12345678000199" });
    expect(v.dataCompetencia).toBe("2026-10-05");
    expect(v.linhas).toEqual([
      { categoriaId: "cat-1", descricao: "Carne", valor: 100 },
      { categoriaId: "", descricao: "Diferença para fechar com o total da nota", valor: 50 },
    ]);
    expect(v.vencimentos).toEqual([{ dataPrevista: "2026-11-05", valor: 150 }]);
    const semValido = valoresIniciaisDaExtracao(extracao({ itens }), "2026-10-11", new Set());
    expect(semValido.linhas?.[0].categoriaId).toBe("");
  });

  it("usa contraparte existente e hoje como competência; sem itens, uma linha com o total", () => {
    const v = valoresIniciaisDaExtracao(
      extracao({ contraparteId: "f1", dataEmissao: null, sugestao: { linhas: [], vencimentos: [], diferencaCentavos: 0 } }),
      "2026-10-11",
      new Set(),
    );
    expect(v.contraparteId).toBe("f1");
    expect(v.novaContraparte).toBeUndefined();
    expect(v.dataCompetencia).toBe("2026-10-11");
    // Sem itens lidos: uma linha com o total da nota, sem Plano de Contas, e a duplicata lida.
    expect(v.linhas).toEqual([{ categoriaId: "", descricao: "Atacadão", valor: 150 }]);
    expect(v.vencimentos).toEqual([{ dataPrevista: "2026-11-05", valor: 150 }]);
  });

  it("total lido usa vencimentos ou o total impresso", () => {
    expect(totalLido(extracao())).toBe(150);
    expect(totalLido(extracao({ sugestao: { linhas: [], vencimentos: [], diferencaCentavos: 0 } }))).toBe(150);
  });

  it("lista um item por linha, cada um com o seu Plano de Contas, mesmo quando todos são do mesmo", () => {
    const itens = [
      { descricao: "Picanha", valorCentavos: 6000, planoContasCodigo: "cat-1" },
      { descricao: "Fraldinha", valorCentavos: 4000, planoContasCodigo: "cat-1" },
      { descricao: "Sacola", valorCentavos: 5000, planoContasCodigo: "cat-2" },
    ];
    const v = valoresIniciaisDaExtracao(extracao({ itens }), "2026-10-11", new Set(["cat-1", "cat-2"]));
    expect(v.linhas).toEqual([
      { categoriaId: "cat-1", descricao: "Picanha", valor: 60 },
      { categoriaId: "cat-1", descricao: "Fraldinha", valor: 40 },
      { categoriaId: "cat-2", descricao: "Sacola", valor: 50 },
    ]);
    expect(v.vencimentos).toEqual([{ dataPrevista: "2026-11-05", valor: 150 }]);
  });

  it("reconhece o fornecedor pelo CNPJ só com os dígitos", () => {
    const lista = [
      { id: "a", documento: null },
      { id: "b", documento: "12345678000199" },
    ];
    expect(contraparteDoDocumento(lista, "12.345.678/0001-99")?.id).toBe("b");
    expect(contraparteDoDocumento(lista, "99999999000199")).toBeNull();
    expect(contraparteDoDocumento(lista, "123")).toBeNull();
    expect(contraparteDoDocumento(lista, null)).toBeNull();
    expect(formatarDocumento("12345678000199")).toBe("12.345.678/0001-99");
    expect(formatarDocumento("12345678901")).toBe("123.456.789-01");
  });
});

describe("resumoDoEnvio", () => {
  it("arquivo repetido já lançado diz onde está, em vez de 'já estava na Caixa'", () => {
    expect(resumoDoEnvio([{ nome: "faturas (2).pdf", novo: false, situacao: "lancado" }])).toBe(
      "faturas (2).pdf já foi lançado antes; está em Contas a Pagar e Receber.",
    );
  });
  it("mistura novo, descartado e pendente na Caixa", () => {
    expect(
      resumoDoEnvio([
        { nome: "a.pdf", novo: true, situacao: "recebido" },
        { nome: "b.pdf", novo: false, situacao: "descartado" },
        { nome: "c.pdf", novo: false, situacao: "lido" },
      ]),
    ).toBe("1 documento recebido, lendo agora; b.pdf já foi descartado antes; c.pdf já estava na Caixa de Entrada.");
  });
  it("dois novos no plural", () => {
    expect(resumoDoEnvio([{ nome: "a", novo: true, situacao: "recebido" }, { nome: "b", novo: true, situacao: "recebido" }])).toBe(
      "2 documentos recebidos, lendo agora.",
    );
  });
});
