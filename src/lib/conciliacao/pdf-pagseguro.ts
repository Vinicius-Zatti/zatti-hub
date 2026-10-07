import { centavosDeTextoBR } from "./dinheiro";
import { conferirSaldos } from "./conferencia";
import { LINHAS_MAXIMAS } from "./arquivo";
import type { ContaDetectada, LinhaExtraida, ResultadoLeitura } from "./tipos";

// Leitura determinística do "Extrato da conta" do PagSeguro/PagBank (4 das
// contas da Dom Quixote). Entrada: os trechos de texto do PDF na ordem do
// conteúdo, como o pdfjs devolve. Layout reconhecido pelo cabeçalho
// "Extrato da conta" + "Periodo: DD/MM/AAAA a DD/MM/AAAA" + colunas
// Data | Descrição | Valor. Qualquer outro layout devolve `null` e o
// processamento decide o próximo passo (IA, se autorizada).

export const VERSAO_PARSER_PAGSEGURO = "pdf-pagseguro-1";

export type TrechoPdf = { texto: string; fimDeLinha: boolean };

const DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const DINHEIRO = /^-?R\$\s?(\d{1,3}(\.\d{3})*|\d+),\d{2}$/;
const CABECALHO = new Set(["Descrição", "Descricao", "Data", "Valor"]);

function isoDeBr(texto: string): string | null {
  const m = DATA.exec(texto);
  if (!m) return null;
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function reconhecerPagSeguro(trechos: TrechoPdf[]): boolean {
  const inicio = trechos.slice(0, 60).map((t) => t.texto).join(" ");
  return /Extrato da conta/.test(inicio) && /Per[ií]odo:\s*\d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}/.test(inicio) && /PagSeguro|PagBank/i.test(inicio);
}

/** Cabeçalho do PagBank: "290 - PagSeguro Internet S/A", "Agência 0001",
 * "Conta 51881143-5". Só números; titular e CPF ficam de fora. */
export function identificarContaPagSeguro(trechos: TrechoPdf[]): ContaDetectada | null {
  const inicio = trechos.slice(0, 60).map((t) => t.texto).join(" ");
  const banco = /\b(\d{3})\s*-\s*Pag(?:Seguro|Bank)/i.exec(inicio)?.[1] ?? null;
  const agencia = /Ag[eê]ncia:?\s*(\d{1,6})\b/i.exec(inicio)?.[1] ?? null;
  const conta = /\bConta:?\s*(\d{1,20}(?:-[0-9Xx])?)\b/.exec(inicio)?.[1] ?? null;
  return banco || agencia || conta ? { banco, agencia, conta } : null;
}

export function lerPagSeguro(trechos: TrechoPdf[]): ResultadoLeitura | null {
  if (!reconhecerPagSeguro(trechos)) return null;
  const inicio = trechos.slice(0, 60).map((t) => t.texto).join(" ");
  const periodo = /Per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4}) a (\d{2}\/\d{2}\/\d{4})/.exec(inicio);
  const periodoInicio = periodo ? isoDeBr(periodo[1]) : null;
  const periodoFim = periodo ? isoDeBr(periodo[2]) : null;
  if (!periodoInicio || !periodoFim) return { ok: false, codigo: "periodo_invalido", quarentena: false };

  const tokens = trechos.map((t) => t.texto.trim()).filter((t) => t !== "");
  // O corpo começa no primeiro cabeçalho de coluna.
  const inicioCorpo = tokens.findIndex((t) => t === "Descrição" || t === "Descricao");
  if (inicioCorpo < 0) return null;

  const linhas: LinhaExtraida[] = [];
  let posicao = 0;
  const dentroDoPeriodo = (iso: string) => iso >= periodoInicio && iso <= periodoFim;

  for (let i = inicioCorpo; i < tokens.length; ) {
    const t = tokens[i];
    if (CABECALHO.has(t)) {
      i++;
      continue;
    }
    if (t === "Saldo do dia") {
      const data = isoDeBr(tokens[i + 1] ?? "");
      const valor = DINHEIRO.test(tokens[i + 2] ?? "") ? centavosDeTextoBR(tokens[i + 2]) : null;
      if (!data || valor === null) {
        linhas.push({ tipo: "erro", posicao: posicao++, codigo: "saldo_ilegivel" });
        i++;
        continue;
      }
      linhas.push({ tipo: "saldo", posicao: posicao++, data, saldoCentavos: valor });
      i += 3;
      continue;
    }
    const data = isoDeBr(t);
    if (!data) {
      linhas.push({ tipo: "erro", posicao: posicao++, codigo: "texto_nao_reconhecido" });
      i++;
      continue;
    }
    // Descrição pode quebrar linha; termina no primeiro valor em reais.
    const partes: string[] = [];
    let j = i + 1;
    while (j < tokens.length && !DINHEIRO.test(tokens[j]) && !isoDeBr(tokens[j]) && tokens[j] !== "Saldo do dia") {
      if (!CABECALHO.has(tokens[j])) partes.push(tokens[j]);
      j++;
    }
    if (j >= tokens.length || !DINHEIRO.test(tokens[j]) || partes.length === 0) {
      linhas.push({ tipo: "erro", posicao: posicao++, codigo: "linha_incompleta" });
      i = j;
      continue;
    }
    const centavos = centavosDeTextoBR(tokens[j]);
    i = j + 1;
    if (centavos === null) {
      linhas.push({ tipo: "erro", posicao: posicao++, codigo: "valor_invalido" });
    } else if (centavos === 0) {
      linhas.push({ tipo: "erro", posicao: posicao++, codigo: "valor_zero" });
    } else if (!dentroDoPeriodo(data)) {
      linhas.push({ tipo: "erro", posicao: posicao++, codigo: "data_fora_do_periodo" });
    } else {
      linhas.push({
        tipo: "movimento",
        posicao: posicao++,
        data,
        direcao: centavos < 0 ? "saida" : "entrada",
        valorCentavos: Math.abs(centavos),
        descricaoOriginal: partes.join(" "),
        idBanco: null,
        conferido: false,
      });
    }
    if (linhas.length > LINHAS_MAXIMAS) return { ok: false, codigo: "linhas_excedidas", quarentena: true };
  }

  if (!linhas.some((l) => l.tipo === "movimento")) return null;
  const conferida = conferirSaldos(linhas);
  return {
    ok: true,
    linhas: conferida.linhas,
    periodoInicio,
    periodoFim,
    versaoParser: VERSAO_PARSER_PAGSEGURO,
    fonte: "deterministica",
    conferencia: conferida.conferencia,
    contaDetectada: identificarContaPagSeguro(trechos),
  };
}
