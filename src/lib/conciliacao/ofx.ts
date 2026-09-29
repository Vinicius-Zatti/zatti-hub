import { centavosDeTextoOfx } from "./dinheiro";
import { LINHAS_MAXIMAS } from "./arquivo";
import type { LinhaExtraida, ResultadoLeitura } from "./tipos";

// OFX 1.x (SGML, tags sem fechamento) e 2.x (XML). Só extrato de conta
// (STMTRS); cartão de crédito (CCSTMTRS) e investimento ficam fora da V1.
// Identidade: FITID. Moeda: só BRL.

export const VERSAO_PARSER_OFX = "ofx-1";

function campo(bloco: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(bloco);
  if (!m) return null;
  const valor = m[1].trim();
  return valor === "" ? null : decodificarEntidades(valor);
}

function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/** DTPOSTED: AAAAMMDD[HHMMSS[.XXX]][[-3:BRT]] -> AAAA-MM-DD, validando a data. */
export function dataOfx(texto: string | null): string | null {
  if (!texto) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(texto);
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function lerOfx(texto: string): ResultadoLeitura {
  if (/<CCSTMTRS>/i.test(texto)) return { ok: false, codigo: "ofx_cartao_nao_suportado", quarentena: false };
  if (!/<STMTRS>/i.test(texto)) return { ok: false, codigo: "ofx_sem_extrato", quarentena: false };
  const moeda = campo(texto, "CURDEF");
  if (moeda && moeda.toUpperCase() !== "BRL") return { ok: false, codigo: "moeda_nao_brl", quarentena: false };

  const blocos = texto.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0]);
  if (blocos.length > LINHAS_MAXIMAS) return { ok: false, codigo: "linhas_excedidas", quarentena: true };

  const linhas: LinhaExtraida[] = blocos.map((bloco, posicao): LinhaExtraida => {
    const data = dataOfx(campo(bloco, "DTPOSTED"));
    const valorTexto = campo(bloco, "TRNAMT");
    const centavos = valorTexto === null ? null : centavosDeTextoOfx(valorTexto);
    if (!data) return { tipo: "erro", posicao, codigo: "data_invalida" };
    if (centavos === null) return { tipo: "erro", posicao, codigo: "valor_invalido" };
    if (centavos === 0) return { tipo: "erro", posicao, codigo: "valor_zero" };
    const nome = campo(bloco, "NAME");
    const memo = campo(bloco, "MEMO");
    const partes = [nome, memo && memo !== nome ? memo : null].filter((p): p is string => Boolean(p));
    const descricao = partes.join(" - ") || campo(bloco, "TRNTYPE") || "";
    if (!descricao) return { tipo: "erro", posicao, codigo: "descricao_ausente" };
    return {
      tipo: "movimento",
      posicao,
      data,
      direcao: centavos < 0 ? "saida" : "entrada",
      valorCentavos: Math.abs(centavos),
      descricaoOriginal: descricao,
      idBanco: campo(bloco, "FITID"),
      conferido: false,
    };
  });

  return {
    ok: true,
    linhas,
    periodoInicio: dataOfx(campo(texto, "DTSTART")),
    periodoFim: dataOfx(campo(texto, "DTEND")),
    versaoParser: VERSAO_PARSER_OFX,
    fonte: "deterministica",
    conferencia: "nao_verificavel",
  };
}
