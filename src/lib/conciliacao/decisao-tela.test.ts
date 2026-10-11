import { describe, expect, it } from "vitest";
import {
  agruparFila,
  analisarDiferenca,
  chaveGrupo,
  distribuirExtrato,
  faltaNaNota,
  inicioJanelaConciliados,
  novaChaveEnvio,
  resumirLote,
  textoAcaoDecisao,
  umUnicoPlano,
  valorPadraoBaixa,
} from "./decisao-tela";

describe("diferença entre extrato e parcelas", () => {
  it("fecha sem ajuste", () => {
    expect(analisarDiferenca("saida", 10_000, 10_000)).toEqual({ diferencaCentavos: 0, caso: "fecha", ajusteCentavos: 0, ajusteTipo: null });
  });
  it("saída paga a mais pede ajuste de despesa (juros/multa)", () => {
    expect(analisarDiferenca("saida", 10_500, 10_000)).toMatchObject({ caso: "juros_multa", ajusteCentavos: 500, ajusteTipo: "despesa" });
  });
  it("saída paga a menos não tem ajuste: baixa parcial ou quitar o restante", () => {
    expect(analisarDiferenca("saida", 9_000, 10_000)).toMatchObject({ caso: "pagamento_menor", ajusteCentavos: 0, ajusteTipo: null, diferencaCentavos: -1_000 });
  });
  it("entrada recebida a menos pede ajuste de despesa (tarifa/desconto)", () => {
    expect(analisarDiferenca("entrada", 9_700, 10_000)).toMatchObject({ caso: "tarifa_desconto", ajusteCentavos: 300, ajusteTipo: "despesa" });
  });
  it("entrada recebida a mais pede ajuste de receita", () => {
    expect(analisarDiferenca("entrada", 10_200, 10_000)).toMatchObject({ caso: "receita_a_mais", ajusteCentavos: 200, ajusteTipo: "receita" });
  });
});

describe("valor a baixar", () => {
  it("padrão é o menor entre saldo e o que falta", () => {
    expect(valorPadraoBaixa(5_000, 3_000)).toBe(3_000);
    expect(valorPadraoBaixa(5_000, 8_000)).toBe(5_000);
    expect(valorPadraoBaixa(5_000, 0)).toBe(5_000);
  });
  it("distribui o extrato na ordem sem passar do saldo", () => {
    expect(distribuirExtrato(7_000, [5_000, 5_000])).toEqual([5_000, 2_000]);
    expect(distribuirExtrato(3_000, [5_000, 5_000])).toEqual([3_000, 0]);
  });
});

describe("nota nova", () => {
  it("mostra quanto falta para fechar", () => {
    expect(faltaNaNota(10_000, [6_000, 3_000])).toBe(1_000);
    expect(faltaNaNota(10_000, [6_000, 5_000])).toBe(-1_000);
  });
  it("só aprende com um único Plano de Contas", () => {
    expect(umUnicoPlano(["a"])).toBe(true);
    expect(umUnicoPlano(["a", "a"])).toBe(true);
    expect(umUnicoPlano(["a", "b"])).toBe(false);
    expect(umUnicoPlano([null, ""])).toBe(false);
  });
});

describe("lote agrupado por descrição", () => {
  it("ignora maiúsculas e números longos, separa direção", () => {
    expect(chaveGrupo("PIX ENVIADO 12345678 Joao", "saida")).toBe(chaveGrupo("pix enviado 87654321 joao", "saida"));
    expect(chaveGrupo("Pix enviado ****5678 joao", "saida")).toBe(chaveGrupo("pix enviado 11112222 joao", "saida"));
    expect(chaveGrupo("pix joao", "saida")).not.toBe(chaveGrupo("pix joao", "entrada"));
    expect(chaveGrupo("loja 12", "saida")).not.toBe(chaveGrupo("loja 13", "saida"));
  });
  it("ordena pelos que mais repetem e soma o total", () => {
    const grupos = agruparFila([
      { id: "1", descricaoOriginal: "Tarifa", direcao: "saida" as const, valor: 10 },
      { id: "2", descricaoOriginal: "PIX 123456 Ana", direcao: "saida" as const, valor: 1.1 },
      { id: "3", descricaoOriginal: "pix 654321 ana", direcao: "saida" as const, valor: 2.2 },
    ]);
    expect(grupos.map((g) => g.itens.length)).toEqual([2, 1]);
    expect(grupos[0].totalCentavos).toBe(330);
    expect(grupos[0].descricao).toBe("PIX 123456 Ana");
  });
  it("resume quantidade, total, direção e limite", () => {
    expect(resumirLote([{ direcao: "saida", valor: 1.5 }, { direcao: "saida", valor: 2 }])).toEqual({ quantidade: 2, totalCentavos: 350, direcao: "saida", acimaDoLimite: false });
    expect(resumirLote([{ direcao: "saida", valor: 1 }, { direcao: "entrada", valor: 1 }]).direcao).toBe("mista");
    expect(resumirLote(Array.from({ length: 201 }, () => ({ direcao: "saida" as const, valor: 1 }))).acimaDoLimite).toBe(true);
  });
});

describe("textos e chave", () => {
  it("ação em português", () => {
    expect(textoAcaoDecisao("criar_documento")).toBe("Nova nota já paga");
    expect(textoAcaoDecisao("outra_acao")).toBe("outra acao");
  });
  it("janela dos conciliados volta 60 dias", () => {
    expect(inicioJanelaConciliados(new Date("2026-10-11T12:00:00Z"))).toBe("2026-08-12T12:00:00.000Z");
  });
  it("chave no formato aceito pela action", () => {
    expect(novaChaveEnvio()).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
  });
});
