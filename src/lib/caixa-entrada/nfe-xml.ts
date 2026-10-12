import type { ExtracaoDocumento } from "./extracao";

// Leitura determinística do XML da NF-e (modelo 55) ou NFC-e (65): sem IA, sem custo. Pega emitente,
// número, emissão, itens (xProd e vProd líquido de desconto), frete/outras despesas como item e as
// duplicatas (vencimentos). O XML é dado não confiável: nada aqui executa, só lê texto de tags.

function tag(xml: string, nome: string): string | null {
  const m = new RegExp(`<(?:[a-zA-Z0-9]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${nome}>`).exec(xml);
  return m ? decodificar(m[1].trim()) : null;
}

function todas(xml: string, nome: string): string[] {
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${nome}>`, "g");
  return Array.from(xml.matchAll(re), (m) => m[1]);
}

function decodificar(texto: string): string {
  return texto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function centavos(texto: string | null): number {
  if (!texto || !/^\d+(\.\d{1,10})?$/.test(texto)) return 0;
  return Math.round(Number(texto) * 100);
}

function dataIso(texto: string | null): string | null {
  const m = texto ? /^(\d{4}-\d{2}-\d{2})/.exec(texto) : null;
  return m ? m[1] : null;
}

export function pareceNfeXml(texto: string): boolean {
  return /<(?:[a-zA-Z0-9]+:)?infNFe[\s>]/.test(texto);
}

export function lerNfeXml(xml: string): ExtracaoDocumento | null {
  if (!pareceNfeXml(xml)) return null;
  const emit = tag(xml, "emit") ?? "";
  const ide = tag(xml, "ide") ?? "";
  const total = tag(xml, "ICMSTot") ?? "";
  const itens = todas(xml, "det").map((det) => {
    const prod = tag(det, "prod") ?? "";
    const bruto = centavos(tag(prod, "vProd"));
    const desconto = centavos(tag(prod, "vDesc"));
    return { descricao: (tag(prod, "xProd") ?? "Item").slice(0, 200), valorCentavos: bruto - desconto, planoContasCodigo: null };
  });
  const frete = centavos(tag(total, "vFrete")) + centavos(tag(total, "vOutro")) + centavos(tag(total, "vSeg"));
  if (frete > 0) itens.push({ descricao: "Frete e outras despesas da nota", valorCentavos: frete, planoContasCodigo: null });
  const impostos = centavos(tag(total, "vIPI")) + centavos(tag(total, "vST"));
  if (impostos > 0) itens.push({ descricao: "IPI e ICMS ST da nota", valorCentavos: impostos, planoContasCodigo: null });
  const valorTotal = centavos(tag(total, "vNF"));
  const vencimentos = todas(xml, "dup")
    .map((dup) => ({ data: dataIso(tag(dup, "dVenc")), valorCentavos: centavos(tag(dup, "vDup")) }))
    .filter((v): v is { data: string; valorCentavos: number } => v.data !== null && v.valorCentavos > 0);
  const documento = tag(emit, "CNPJ") ?? tag(emit, "CPF");
  return {
    tipoDocumento: "nota_fiscal",
    contraparteNome: (tag(emit, "xNome") ?? "").slice(0, 160) || null,
    contraparteDocumento: documento && /^\d{11}(\d{3})?$/.test(documento) ? documento : null,
    numero: tag(ide, "nNF"),
    dataEmissao: dataIso(tag(ide, "dhEmi") ?? tag(ide, "dEmi")),
    valorTotalCentavos: valorTotal,
    vencimentos,
    itens: itens.filter((i) => i.valorCentavos > 0),
    fonte: "xml_nfe",
    observacao: null,
  };
}
