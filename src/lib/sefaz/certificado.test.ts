import { describe, expect, it, vi } from "vitest";
import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from "node:crypto";
import forge from "node-forge";

vi.mock("server-only", () => ({}));
const { cifrarParaRobo, lerCertificado } = await import("./certificado");
const { chaveDaNfe } = await import("@/lib/caixa-entrada/nfe-xml");

// Certificado falso, gerado aqui (captura de NF-e, 30/10/2026).
function pfxFalso(cn: string, senha = "s3nha") {
  const k = forge.pki.rsa.generateKeyPair(1024);
  const c = forge.pki.createCertificate();
  c.publicKey = k.publicKey;
  c.serialNumber = "01";
  c.validity.notBefore = new Date("2026-01-01T00:00:00Z");
  c.validity.notAfter = new Date("2027-03-01T00:00:00Z");
  c.setSubject([{ name: "commonName", value: cn }]);
  c.setIssuer([{ name: "commonName", value: "AC TESTE" }]);
  c.sign(k.privateKey);
  return new Uint8Array(Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(k.privateKey, [c], senha, { algorithm: "3des" })).getBytes(), "binary"));
}

describe("certificado A1", () => {
  it("lê CNPJ, titular e validade", () => {
    expect(lerCertificado(pfxFalso("BETONES BBQ LTDA:12345678000199"), "s3nha")).toEqual({
      cnpj: "12345678000199",
      titular: "BETONES BBQ LTDA",
      validoAte: "2027-03-01T00:00:00.000Z",
    });
  });
  it("senha errada não abre e não explica o arquivo", () => {
    expect(() => lerCertificado(pfxFalso("X:12345678000199"), "errada")).toThrow(/Confira o arquivo/);
  });
  it("certificado sem CNPJ (e-CPF) é recusado", () => {
    expect(() => lerCertificado(pfxFalso("FULANO DE TAL:12345678901"), "s3nha")).toThrow(/CNPJ/);
  });
  it("envelope só abre com a chave privada do robô (mesmo formato do Vini)", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pfx = pfxFalso("X:12345678000199");
    const env = cifrarParaRobo(pfx, "s3nha", publicKey.export({ type: "spki", format: "pem" }).toString());
    expect(JSON.stringify(env)).not.toContain("s3nha");
    const aes = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(env.chave, "base64"));
    const d = createDecipheriv("aes-256-gcm", aes, Buffer.from(env.iv, "base64"));
    d.setAuthTag(Buffer.from(env.tag, "base64"));
    const claro = JSON.parse(Buffer.concat([d.update(Buffer.from(env.dados, "base64")), d.final()]).toString());
    expect(claro.senha).toBe("s3nha");
    expect(Buffer.from(claro.pfx, "base64").equals(Buffer.from(pfx))).toBe(true);
  });
});

describe("chaveDaNfe", () => {
  const chave = "31261012345678000199550010000012341000012345";
  it("lê do Id do infNFe", () => {
    expect(chaveDaNfe(`<nfeProc><NFe><infNFe versao="4.00" Id="NFe${chave}"></infNFe></NFe></nfeProc>`)).toBe(chave);
  });
  it("cai para o protocolo quando o Id não tem a chave", () => {
    expect(chaveDaNfe(`<nfeProc><NFe><infNFe Id="NFe1"></infNFe></NFe><protNFe><infProt><chNFe>${chave}</chNFe></infProt></protNFe></nfeProc>`)).toBe(chave);
  });
  it("sem chave válida devolve nulo", () => {
    expect(chaveDaNfe("<nfeProc><NFe><infNFe Id=\"NFe123\"></infNFe></NFe></nfeProc>")).toBeNull();
  });
});
