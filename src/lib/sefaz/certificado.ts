import "server-only";
import { constants, createCipheriv, publicEncrypt, randomBytes } from "node:crypto";
import forge from "node-forge";
import { ErroPublico } from "@/lib/erros";

// Certificado A1 da captura de NF-e (30/10/2026). O Hub abre o .pfx só para conferir a senha e ler
// CNPJ, titular e validade; em seguida cifra pfx + senha com a chave pública do robô (Vini, no
// Railway) e esquece. O Hub não tem a chave privada: nem o servidor do Hub consegue abrir o
// envelope depois de gravado. Nada daqui vai para log ou resposta.

export const TAMANHO_MAXIMO_PFX = 50 * 1024;

export type Envelope = { chave: string; iv: string; tag: string; dados: string };
export type DadosCertificado = { cnpj: string; titular: string; validoAte: string };

/** Lê o PKCS#12 (aceita os antigos, que o OpenSSL 3 recusa). Senha errada vira ErroPublico. */
export function lerCertificado(pfx: Uint8Array, senha: string): DadosCertificado {
  if (pfx.length === 0 || pfx.length > TAMANHO_MAXIMO_PFX) throw new ErroPublico("Arquivo vazio ou grande demais para um certificado A1.");
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(Buffer.from(pfx).toString("binary"))), false, senha);
  } catch {
    throw new ErroPublico("Não consegui abrir o certificado. Confira o arquivo (.pfx ou .p12) e a senha.");
  }
  const sacos = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  const soltos = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [];
  const chave = [...sacos, ...soltos].find((b) => b.key)?.key as forge.pki.rsa.PrivateKey | undefined;
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).filter((b) => b.cert);
  if (!chave || certs.length === 0) throw new ErroPublico("O arquivo não tem a chave do certificado. Exporte o A1 completo (.pfx).");
  const cert = (certs.find((b) => (b.cert!.publicKey as forge.pki.rsa.PublicKey).n.equals(chave.n)) ?? certs[0]).cert!;
  const cn = String(cert.subject.getField("CN")?.value ?? "");
  const cnpj = /:(\d{14})$/.exec(cn)?.[1] ?? cnpjDoSan(cert);
  if (!cnpj) throw new ErroPublico("Não achei o CNPJ neste certificado. A captura precisa do e-CNPJ A1 da empresa.");
  return { cnpj, titular: cn.replace(/:\d{11,14}$/, "").trim().slice(0, 160) || "Sem nome", validoAte: cert.validity.notAfter.toISOString() };
}

// otherName 2.16.76.1.3.3 do subjectAltName guarda o CNPJ no e-CNPJ ICP-Brasil.
function cnpjDoSan(cert: forge.pki.Certificate): string | null {
  const san = cert.getExtension("subjectAltName") as { value?: string } | undefined;
  if (!san?.value) return null;
  const texto = (no: forge.asn1.Asn1): string => (typeof no.value === "string" ? no.value : no.value.map(texto).join(""));
  let achado: string | null = null;
  const varrer = (no: forge.asn1.Asn1) => {
    if (achado || typeof no.value === "string") return;
    no.value.forEach((filho, i) => {
      if (achado) return;
      if (filho.type === forge.asn1.Type.OID && typeof filho.value === "string" && forge.asn1.derToOid(filho.value) === "2.16.76.1.3.3") {
        const proximo = (no.value as forge.asn1.Asn1[])[i + 1];
        achado = proximo ? (/(\d{14})/.exec(texto(proximo))?.[1] ?? null) : null;
      } else varrer(filho);
    });
  };
  varrer(forge.asn1.fromDer(san.value));
  return achado;
}

/** Chave pública do robô (PEM, ou PEM em base64 numa linha). Sem ela a captura fica desligada. */
export function chavePublicaRobo(): string | null {
  const v = process.env.SEFAZ_CHAVE_PUBLICA ?? "";
  const pem = v.includes("BEGIN") ? v : v ? Buffer.from(v, "base64").toString("utf8") : "";
  return /BEGIN PUBLIC KEY/.test(pem) ? pem : null;
}

/** AES-256-GCM sobre { pfx, senha }, chave AES embrulhada com RSA-OAEP (SHA-256). */
export function cifrarParaRobo(pfx: Uint8Array, senha: string, chavePublicaPem: string): Envelope {
  const aes = randomBytes(32);
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", aes, iv);
  const claro = Buffer.from(JSON.stringify({ pfx: Buffer.from(pfx).toString("base64"), senha }), "utf8");
  const dados = Buffer.concat([cifra.update(claro), cifra.final()]);
  claro.fill(0);
  const embrulhada = publicEncrypt({ key: chavePublicaPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, aes);
  aes.fill(0);
  return { chave: embrulhada.toString("base64"), iv: iv.toString("base64"), tag: cifra.getAuthTag().toString("base64"), dados: dados.toString("base64") };
}

export const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"] as const;
