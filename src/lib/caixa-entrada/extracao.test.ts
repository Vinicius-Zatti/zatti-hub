import { describe, expect, it } from "vitest";
import { centavosDeReais, codigosDosItens, extracaoDaIa, sugerirDocumento, type ExtracaoDocumento } from "./extracao";
import { lerNfeXml } from "./nfe-xml";

const XML = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe1"><ide><nNF>4521</nNF><dhEmi>2026-10-05T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>75315333000109</CNPJ><xNome>ATACADAO S.A. &amp; CIA</xNome></emit>
<det nItem="1"><prod><xProd>CARNE MOIDA 1KG</xProd><vProd>300.00</vProd></prod></det>
<det nItem="2"><prod><xProd>CAIXA PIZZA 35CM</xProd><vProd>100.00</vProd><vDesc>10.00</vDesc></prod></det>
<total><ICMSTot><vFrete>15.50</vFrete><vNF>405.50</vNF></ICMSTot></total>
<cobr><dup><nDup>001</nDup><dVenc>2026-10-20</dVenc><vDup>202.75</vDup></dup><dup><nDup>002</nDup><dVenc>2026-11-20</dVenc><vDup>202.75</vDup></dup></cobr>
</infNFe></NFe></nfeProc>`;

describe("lerNfeXml", () => {
  it("lê emitente, itens com desconto, frete e duplicatas", () => {
    const e = lerNfeXml(XML) as ExtracaoDocumento;
    expect(e.contraparteNome).toBe("ATACADAO S.A. & CIA");
    expect(e.contraparteDocumento).toBe("75315333000109");
    expect(e.numero).toBe("4521");
    expect(e.dataEmissao).toBe("2026-10-05");
    expect(e.itens.map((i) => i.valorCentavos)).toEqual([30000, 9000, 1550]);
    expect(e.valorTotalCentavos).toBe(40550);
    expect(e.vencimentos).toEqual([
      { data: "2026-10-20", valorCentavos: 20275 },
      { data: "2026-11-20", valorCentavos: 20275 },
    ]);
  });
  it("não reconhece XML que não é NF-e", () => {
    expect(lerNfeXml("<foo>bar</foo>")).toBeNull();
  });
});

describe("sugerirDocumento", () => {
  it("agrupa itens por Plano de Contas e usa as duplicatas", () => {
    const e = lerNfeXml(XML) as ExtracaoDocumento;
    e.itens[0].planoContasCodigo = "c1";
    e.itens[1].planoContasCodigo = "c2";
    e.itens[2].planoContasCodigo = "c1";
    const s = sugerirDocumento(e, "2026-10-11");
    expect(s.linhas.map((l) => [l.planoContasCodigo, l.valorCentavos])).toEqual([["c1", 31550], ["c2", 9000]]);
    expect(s.vencimentos).toHaveLength(2);
    expect(s.diferencaCentavos).toBe(0);
  });
  it("diferença sem item vira linha para a pessoa decidir e vencimento único na emissão", () => {
    const s = sugerirDocumento({ ...base, itens: [{ descricao: "Pão", valorCentavos: 900, planoContasCodigo: "c1" }] }, "2026-10-11");
    expect(s.linhas).toEqual([
      { planoContasCodigo: "c1", descricao: "Pão", valorCentavos: 900 },
      { planoContasCodigo: null, descricao: "Diferença para fechar com o total da nota", valorCentavos: 100 },
    ]);
    expect(s.vencimentos).toEqual([{ data: "2026-10-01", valorCentavos: 1000 }]);
  });
  it("desconto não detalhado abate da maior linha", () => {
    const s = sugerirDocumento({ ...base, itens: [{ descricao: "Queijo", valorCentavos: 1200, planoContasCodigo: "c1" }] }, "2026-10-11");
    expect(s.linhas).toEqual([{ planoContasCodigo: "c1", descricao: "Queijo", valorCentavos: 1000 }]);
  });
});

const base: ExtracaoDocumento = {
  tipoDocumento: "recibo", contraparteNome: "Padaria", contraparteDocumento: null, numero: null, dataEmissao: "2026-10-01",
  valorTotalCentavos: 1000, vencimentos: [], itens: [], fonte: "ia", observacao: null,
};

describe("saída da IA", () => {
  it("valida e converte, descartando código inventado", () => {
    const texto = JSON.stringify({
      tipo_documento: "boleto", contraparte_nome: "Bemdita Carnes", contraparte_documento: "12.345.678/0001-90", numero: "77",
      data_emissao: "2026-10-01", valor_total: "1.234,56", vencimentos: [{ data: "2026-10-15", valor: "1.234,56" }],
      itens: [{ descricao: "Carnes", valor: "1.234,56", plano_contas: "c9" }],
    });
    const e = extracaoDaIa(texto, new Set(["c1"]));
    expect(e).toMatchObject({ contraparteDocumento: "12345678000190", valorTotalCentavos: 123456, vencimentos: [{ data: "2026-10-15", valorCentavos: 123456 }] });
    expect(e?.itens[0].planoContasCodigo).toBeNull();
  });
  it("recusa JSON fora do formato", () => {
    expect(extracaoDaIa('{"tipo_documento":"nota"}', new Set())).toBeNull();
    expect(extracaoDaIa("não é json", new Set())).toBeNull();
    expect(codigosDosItens('{"codigos":["c1"]}', 2, new Set(["c1"]))).toBeNull();
  });
  it("converte valores em reais", () => {
    expect(centavosDeReais("R$ 1.234,56")).toBe(123456);
    expect(centavosDeReais("-5,00")).toBe(-500);
    expect(centavosDeReais("12.90")).toBe(1290);
    expect(centavosDeReais("1.500")).toBe(150000);
    expect(centavosDeReais("1.234.567")).toBe(123456700);
    expect(centavosDeReais("abc")).toBeNull();
  });
});
