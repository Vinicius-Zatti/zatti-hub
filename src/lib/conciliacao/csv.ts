import { centavosDeTextoBR, centavosDeTextoOfx } from "./dinheiro";
import { LINHAS_MAXIMAS } from "./arquivo";
import { normalizarDescricao } from "./normalizacao";
import type { LinhaExtraida, ResultadoLeitura } from "./tipos";

// CSV de extrato com mapeamento por cabeçalho reconhecido. Delimitador,
// separador decimal e formato de data são detectados de forma explícita e
// o arquivo inteiro é recusado se ficar ambíguo. Mapeamento manual de
// colunas fica para a próxima rodada; nesta fatia a fila de revisão é a
// prévia (nenhum efeito financeiro acontece na importação).

export const VERSAO_PARSER_CSV = "csv-1";

/** RFC 4180: aspas duplas, aspas escapadas por repetição, quebra de linha
 * dentro de campo entre aspas. */
export function dividirCsv(texto: string, delimitador: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let emAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (emAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else emAspas = false;
      } else campo += c;
      continue;
    }
    if (c === '"' && campo === "") emAspas = true;
    else if (c === delimitador) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

function detectarDelimitador(primeiraLinha: string): string {
  const contagem = [";", "\t", ","].map((d) => [d, primeiraLinha.split(d).length - 1] as const);
  contagem.sort((a, b) => b[1] - a[1]);
  return contagem[0][0];
}

const NOMES = {
  data: ["data", "data lancamento", "data do lancamento", "data movimento", "data da transacao", "dt lancamento"],
  descricao: ["descricao", "historico", "lancamento", "detalhe", "descricao do lancamento", "memo"],
  valor: ["valor", "valor (r$)", "valor r$", "montante", "quantia"],
  debito: ["debito", "saida", "valor debito", "debito (r$)"],
  credito: ["credito", "entrada", "valor credito", "credito (r$)"],
  id: ["id", "identificador", "id transacao", "id da transacao", "fitid", "codigo da transacao"],
};

function indice(cabecalho: string[], nomes: string[]): number {
  return cabecalho.findIndex((c) => nomes.includes(normalizarDescricao(c.replace(/^﻿/, ""))));
}

/** DD/MM/AAAA ou AAAA-MM-DD; qualquer outra forma é recusada. */
export function dataCsv(texto: string): string | null {
  const t = texto.trim();
  let ano: number, mes: number, dia: number;
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (!m) return null;
    [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

type Decimal = "br" | "ponto";

function detectarDecimal(valores: string[]): Decimal | null {
  const preenchidos = valores.map((v) => v.trim()).filter(Boolean);
  if (preenchidos.some((v) => /,\d{1,2}$/.test(v))) {
    return preenchidos.every((v) => centavosDeTextoBR(v) !== null) ? "br" : null;
  }
  if (preenchidos.every((v) => /^[+-]?\d+(\.\d{1,2})?$/.test(v))) return "ponto";
  return preenchidos.every((v) => centavosDeTextoBR(v) !== null) ? "br" : null;
}

function centavos(texto: string, decimal: Decimal): number | null {
  const t = texto.trim();
  if (!t) return null;
  return decimal === "br" ? centavosDeTextoBR(t) : centavosDeTextoOfx(t);
}

export function lerCsv(texto: string): ResultadoLeitura {
  const primeira = texto.split(/\r?\n/)[0] ?? "";
  const tabela = dividirCsv(texto, detectarDelimitador(primeira));
  if (tabela.length < 2) return { ok: false, codigo: "csv_vazio", quarentena: false };
  if (tabela.length - 1 > LINHAS_MAXIMAS) return { ok: false, codigo: "linhas_excedidas", quarentena: true };

  const cab = tabela[0];
  const iData = indice(cab, NOMES.data);
  const iDesc = indice(cab, NOMES.descricao);
  const iValor = indice(cab, NOMES.valor);
  const iDeb = indice(cab, NOMES.debito);
  const iCred = indice(cab, NOMES.credito);
  const iId = indice(cab, NOMES.id);
  const colunasValor = iValor >= 0 ? [iValor] : iDeb >= 0 && iCred >= 0 ? [iDeb, iCred] : [];
  if (iData < 0 || iDesc < 0 || colunasValor.length === 0) {
    return { ok: false, codigo: "csv_sem_mapeamento", quarentena: false };
  }
  const corpo = tabela.slice(1);
  const decimal = detectarDecimal(corpo.flatMap((l) => colunasValor.map((i) => l[i] ?? "")));
  if (!decimal) return { ok: false, codigo: "csv_decimal_ambiguo", quarentena: false };

  const linhas: LinhaExtraida[] = corpo.map((l, posicao): LinhaExtraida => {
    const data = dataCsv(l[iData] ?? "");
    if (!data) return { tipo: "erro", posicao, codigo: "data_invalida" };
    const descricao = (l[iDesc] ?? "").trim();
    if (!descricao) return { tipo: "erro", posicao, codigo: "descricao_ausente" };
    if (/^saldo( do dia| anterior| final)?$/.test(normalizarDescricao(descricao))) {
      const saldo = iValor >= 0 ? centavos(l[iValor] ?? "", decimal) : null;
      return saldo === null ? { tipo: "erro", posicao, codigo: "saldo_invalido" } : { tipo: "saldo", posicao, data, saldoCentavos: saldo };
    }
    let valor: number | null;
    if (iValor >= 0) valor = centavos(l[iValor] ?? "", decimal);
    else {
      const deb = centavos(l[iDeb] ?? "", decimal);
      const cred = centavos(l[iCred] ?? "", decimal);
      if (deb !== null && cred !== null && deb !== 0 && cred !== 0) return { tipo: "erro", posicao, codigo: "debito_e_credito" };
      valor = cred !== null && cred !== 0 ? Math.abs(cred) : deb !== null ? -Math.abs(deb) : null;
    }
    if (valor === null) return { tipo: "erro", posicao, codigo: "valor_invalido" };
    if (valor === 0) return { tipo: "erro", posicao, codigo: "valor_zero" };
    const id = iId >= 0 ? (l[iId] ?? "").trim() : "";
    return {
      tipo: "movimento",
      posicao,
      data,
      direcao: valor < 0 ? "saida" : "entrada",
      valorCentavos: Math.abs(valor),
      descricaoOriginal: descricao,
      idBanco: id ? id.slice(0, 120) : null,
      conferido: false,
    };
  });

  return {
    ok: true,
    linhas,
    periodoInicio: null,
    periodoFim: null,
    versaoParser: VERSAO_PARSER_CSV,
    fonte: "deterministica",
    conferencia: "nao_verificavel",
  };
}
