import { describe, expect, it } from "vitest";
import { detectarArquivo, sanitizarNomeArquivo, TAMANHO_MAXIMO_BYTES } from "./arquivo";
import { centavosDeTextoBR, centavosDeTextoOfx } from "./dinheiro";
import { lerOfx } from "./ofx";
import { dividirCsv, lerCsv } from "./csv";
import { lerPagSeguro, type TrechoPdf } from "./pdf-pagseguro";
import { conferirSaldos } from "./conferencia";
import type { LinhaExtraida } from "./tipos";

const bytes = (t: string) => new TextEncoder().encode(t);

describe("upload hostil e detecção pelo conteúdo", () => {
  it("rejeita executável, compactado, binário, HTML/script e vazio", () => {
    expect(detectarArquivo(new Uint8Array([0x4d, 0x5a, 1, 2]))).toMatchObject({ ok: false, motivo: "executavel" });
    expect(detectarArquivo(new Uint8Array([0x50, 0x4b, 3, 4, 0]))).toMatchObject({ ok: false, motivo: "compactado_nao_suportado" });
    expect(detectarArquivo(new Uint8Array([0x41, 0, 0x42]))).toMatchObject({ ok: false, motivo: "binario_desconhecido" });
    expect(detectarArquivo(bytes("data;valor\n<script>alert(1)</script>"))).toMatchObject({ ok: false, motivo: "conteudo_ativo" });
    expect(detectarArquivo(new Uint8Array())).toMatchObject({ ok: false, motivo: "arquivo_vazio" });
    expect(detectarArquivo(new Uint8Array(TAMANHO_MAXIMO_BYTES + 1))).toMatchObject({ ok: false, motivo: "tamanho_excedido" });
  });

  it("não confia no nome: PDF, imagem, OFX e CSV reconhecidos pela assinatura", () => {
    expect(detectarArquivo(bytes("%PDF-1.7\n..."))).toMatchObject({ ok: true, formato: "pdf" });
    expect(detectarArquivo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toMatchObject({ ok: true, formato: "imagem", mime: "image/jpeg" });
    expect(detectarArquivo(bytes("OFXHEADER:100\nDATA:OFXSGML\n<OFX>"))).toMatchObject({ ok: true, formato: "ofx" });
    expect(detectarArquivo(bytes("﻿Data;Descrição;Valor\n01/09/2026;x;1,00"))).toMatchObject({ ok: true, formato: "csv" });
    expect(detectarArquivo(bytes("texto solto sem colunas"))).toMatchObject({ ok: false, motivo: "formato_desconhecido" });
  });

  it("nome enviado vira só rótulo, sem caminho", () => {
    expect(sanitizarNomeArquivo("..\\..\\etc/passwd")).toBe("passwd");
    expect(sanitizarNomeArquivo('ext<rato>:"x".pdf')).toBe("extratox.pdf");
  });
});

describe("dinheiro sem ponto flutuante", () => {
  it("texto brasileiro estrito", () => {
    expect(centavosDeTextoBR("R$ 4.073,40")).toBe(407340);
    expect(centavosDeTextoBR("-R$ 1.195,32")).toBe(-119532);
    expect(centavosDeTextoBR("12,5")).toBe(1250);
    expect(centavosDeTextoBR("abc12")).toBeNull();
    expect(centavosDeTextoBR("1.23,45")).toBeNull();
    expect(centavosDeTextoBR("--1,00")).toBeNull();
  });
  it("OFX com ponto ou vírgula decimal, sem milhar", () => {
    expect(centavosDeTextoOfx("-1234.56")).toBe(-123456);
    expect(centavosDeTextoOfx("150")).toBe(15000);
    expect(centavosDeTextoOfx("0.1")).toBe(10);
    expect(centavosDeTextoOfx("1.234,56")).toBeNull();
  });
});

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKTRANLIST><DTSTART>20260901<DTEND>20260930
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260929120000[-3:BRT]<TRNAMT>-2000.00<FITID>A1<NAME>BEMDITA CARNES<MEMO>BOLETO
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260930<TRNAMT>150,5<FITID>A2<MEMO>PIX RECEBIDO
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260931<TRNAMT>-1.00<FITID>A3<MEMO>DATA RUIM
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260930<TRNAMT>-3.00<MEMO>SEM FITID
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("OFX", () => {
  it("lê SGML com sinal, FITID, data validada e FITID ausente", () => {
    const r = lerOfx(OFX_SGML);
    if (!r.ok) throw new Error(r.codigo);
    expect(r.periodoInicio).toBe("2026-09-01");
    expect(r.linhas[0]).toMatchObject({ tipo: "movimento", direcao: "saida", valorCentavos: 200000, idBanco: "A1", data: "2026-09-29", descricaoOriginal: "BEMDITA CARNES - BOLETO" });
    expect(r.linhas[1]).toMatchObject({ tipo: "movimento", direcao: "entrada", valorCentavos: 15050 });
    expect(r.linhas[2]).toMatchObject({ tipo: "erro", codigo: "data_invalida" });
    expect(r.linhas[3]).toMatchObject({ tipo: "movimento", idBanco: null });
  });
  it("lê XML (OFX 2) e recusa moeda estrangeira e cartão de crédito", () => {
    const xml = `<?xml version="1.0"?><OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN><DTPOSTED>20260901</DTPOSTED><TRNAMT>-10.00</TRNAMT><FITID>X</FITID><NAME>Tarifa &amp; pacote</NAME></STMTTRN></BANKTRANLIST></STMTRS></OFX>`;
    const r = lerOfx(xml);
    expect(r.ok && r.linhas[0]).toMatchObject({ descricaoOriginal: "Tarifa & pacote", valorCentavos: 1000 });
    expect(lerOfx(xml.replace("BRL", "USD"))).toMatchObject({ ok: false, codigo: "moeda_nao_brl" });
    expect(lerOfx("<OFX><CCSTMTRS></CCSTMTRS></OFX>")).toMatchObject({ ok: false, codigo: "ofx_cartao_nao_suportado" });
  });
});

describe("CSV", () => {
  it("aspas, vírgula dentro de campo e quebra de linha entre aspas", () => {
    expect(dividirCsv('a;"b;c";"d ""e"""\n1;"x\ny";3', ";")).toEqual([["a", "b;c", 'd "e"'], ["1", "x\ny", "3"]]);
  });
  it("cabeçalho reconhecido, decimal brasileiro, débito/crédito e saldo", () => {
    const r = lerCsv("﻿Data;Histórico;Débito;Crédito\n29/09/2026;Bemdita;2.000,00;\n30/09/2026;Pix;;150,50\n31/09/2026;Ruim;1,00;");
    if (!r.ok) throw new Error(r.codigo);
    expect(r.linhas[0]).toMatchObject({ tipo: "movimento", direcao: "saida", valorCentavos: 200000 });
    expect(r.linhas[1]).toMatchObject({ tipo: "movimento", direcao: "entrada", valorCentavos: 15050 });
    expect(r.linhas[2]).toMatchObject({ tipo: "erro", codigo: "data_invalida" });
  });
  it("decimal com ponto só quando o arquivo inteiro é inequívoco", () => {
    const r = lerCsv("data,descricao,valor\n2026-09-01,Pix,-10.50\n2026-09-02,Ted,20");
    expect(r.ok && r.linhas.map((l) => l.tipo === "movimento" && l.valorCentavos)).toEqual([1050, 2000]);
  });
  it("sem colunas reconhecidas, recusa o arquivo inteiro", () => {
    expect(lerCsv("a;b;c\n1;2;3")).toMatchObject({ ok: false, codigo: "csv_sem_mapeamento" });
  });
});

function trechos(texto: string): TrechoPdf[] {
  return texto.split("|").map((t) => ({ texto: t, fimDeLinha: false }));
}

describe("PDF PagSeguro (leitura local antes de qualquer IA)", () => {
  const cabecalho = "Extrato da conta|Periodo: 01/08/2026 a 31/08/2026|290 - PagSeguro Internet S/A|Descrição|Data| |Valor";
  it("lê movimentos, descrição quebrada em duas linhas e confere o saldo do dia", () => {
    const r = lerPagSeguro(
      trechos(
        `${cabecalho}|01/08/2026| |Pix recebido - Fulano| |R$ 100,00|Saldo do dia|01/08/2026| |R$ 500,00|` +
          `02/08/2026| |Vendas - Disponivel DEBITO VISA| |R$ 50,00|02/08/2026| |Cobrança Seguro - Para: INSTITUICAO DE|PAGAMENTO| |-R$ 7,90|` +
          `Saldo do dia|02/08/2026| |R$ 542,10`,
      ),
    );
    if (!r || !r.ok) throw new Error("falhou");
    const movs = r.linhas.filter((l) => l.tipo === "movimento");
    expect(movs).toHaveLength(3);
    expect(movs[2]).toMatchObject({ descricaoOriginal: "Cobrança Seguro - Para: INSTITUICAO DE PAGAMENTO", direcao: "saida", valorCentavos: 790 });
    expect(r.conferencia).toBe("conferida_exceto_inicio");
    expect(movs.map((m) => m.tipo === "movimento" && m.conferido)).toEqual([false, true, true]);
  });
  it("saldo que não fecha marca divergente, sem descartar nada", () => {
    const r = lerPagSeguro(
      trechos(`${cabecalho}|Saldo do dia|31/07/2026| |R$ 0,00|01/08/2026| |Pix| |R$ 10,00|Saldo do dia|01/08/2026| |R$ 11,00`),
    );
    expect(r && r.ok && r.conferencia).toBe("divergente");
  });
  it("tira banco, agência e conta do cabeçalho, sem nome nem CPF", () => {
    const r = lerPagSeguro(
      trechos(
        "Extrato da conta|Emitido em: 01/10/2026 às 09:17|Periodo: 01/09/2026 a 30/09/2026|Fulana de Tal|CPF: 000.000.000-00|" +
          "290 - PagSeguro Internet S/A|Agência 0001|Conta 51881143-5|Descrição|Data| |Valor|01/09/2026| |Pix| |R$ 10,00",
      ),
    );
    if (!r || !r.ok) throw new Error("falhou");
    expect(r.contaDetectada).toEqual({ banco: "290", agencia: "0001", conta: "51881143-5" });
  });
  it("cabeçalho sem agência e conta não inventa número", () => {
    const r = lerPagSeguro(trechos(`${cabecalho}|01/08/2026| |Pix| |R$ 10,00`));
    expect(r && r.ok && r.contaDetectada).toEqual({ banco: "290", agencia: null, conta: null });
  });
  it("layout desconhecido devolve null (não inventa leitura)", () => {
    expect(lerPagSeguro(trechos("Extrato por Período|31 de Agosto de 2026|Deb Pix Qr Cod|-R$ 70,38|31AGO"))).toBeNull();
  });
});

describe("conferência aritmética", () => {
  it("sem dois saldos não há o que conferir", () => {
    const linhas: LinhaExtraida[] = [{ tipo: "movimento", posicao: 0, data: "2026-09-01", direcao: "saida", valorCentavos: 1, descricaoOriginal: "x", idBanco: null, conferido: false }];
    expect(conferirSaldos(linhas).conferencia).toBe("nao_verificavel");
  });
});
