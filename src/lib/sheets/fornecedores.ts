import { getSheetsClient } from "./client";
import { toNumeroBR as toNumber } from "./numero";
import type { Fornecedor } from "@/lib/types";
import { resolverFonteDadosEstoque } from "@/lib/estoque/fonte-dados";
import { listarFornecedoresBanco, salvarFornecedoresBanco } from "@/lib/banco/estoque";
import { paraCelulaSegura } from "./seguranca";

const SHEET = "Fornecedores";
const FIRST_DATA_ROW = 3;
// Colunas reais da planilha (A-L), com "Grupos" inserida em 21/07 logo
// depois de Nome Fantasia: Código, Razão Social, Nome Fantasia, Grupos,
// Nome do Vendedor, WhatsApp, Condições de Pagamento, Prazo do Boleto,
// Limite de Crédito, Pedido Mínimo, Dias de Entrega, Observações.
const RANGE = `'${SHEET}'!A${FIRST_DATA_ROW}:L`;

function gruposFromCell(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
}

function gruposToCell(grupos: string[]): string {
  return grupos.join(",");
}

function rowToFornecedor(row: string[]): Fornecedor {
  return {
    codigo: row[0] ?? "",
    razaoSocial: row[1] ?? "",
    nomeFantasia: row[2] ?? "",
    grupos: gruposFromCell(row[3]),
    nomeVendedor: row[4] ?? "",
    whatsapp: row[5] ?? "",
    condicoesPagamento: row[6] ?? "",
    prazoBoleto: row[7] ?? "",
    limiteCredito: toNumber(row[8]),
    pedidoMinimo: toNumber(row[9]),
    diasEntrega: row[10] ?? "",
    observacoes: row[11] ?? "",
  };
}

function fornecedorToRow(f: Fornecedor): (string | number)[] {
  return [
    f.codigo,
    f.razaoSocial,
    f.nomeFantasia,
    gruposToCell(f.grupos),
    f.nomeVendedor,
    f.whatsapp,
    f.condicoesPagamento,
    f.prazoBoleto,
    f.limiteCredito ?? "",
    f.pedidoMinimo ?? "",
    f.diasEntrega,
    f.observacoes,
  ].map((valor) => (typeof valor === "string" ? paraCelulaSegura(valor) : valor));
}

async function listFornecedoresPlanilha(spreadsheetId: string): Promise<Fornecedor[]> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE });
  const rows = res.data.values ?? [];
  // Filtra por Razão Social/Nome Fantasia, não por Código: na planilha real
  // o Código fica em branco na maioria das linhas cadastradas na mão, então
  // filtrar pela coluna A jogava fora todo o cadastro de fornecedores.
  return rows.filter((r) => r[1] || r[2]).map(rowToFornecedor);
}

export async function listFornecedores(spreadsheetId: string | null): Promise<Fornecedor[]> {
  const fonte = await resolverFonteDadosEstoque(spreadsheetId);
  if (fonte.fonte === "banco") return listarFornecedoresBanco(fonte.unidadeId);
  return listFornecedoresPlanilha(fonte.spreadsheetId!);
}

/** Atualiza/insere um fornecedor. Exige `codigo` preenchido pra saber qual
 * linha é qual - fornecedor sem código ainda (cadastro antigo, direto na
 * planilha) precisa passar por `garantirCodigos` antes. */
export async function upsertFornecedor(
  fornecedor: Fornecedor,
  spreadsheetId: string | null,
): Promise<void> {
  await upsertFornecedoresBatch([fornecedor], spreadsheetId);
}

/** Salva vários fornecedores de uma vez - mesma lógica de
 * `upsertProdutosBatch`, uma leitura + um `batchUpdate` em vez de N pares
 * leitura/escrita em paralelo (que a partir de ~10 itens esbarrava em
 * limite de taxa da API do Sheets). */
export async function upsertFornecedoresBatch(
  fornecedores: Fornecedor[],
  spreadsheetId: string | null
): Promise<void> {
  const fonte = await resolverFonteDadosEstoque(spreadsheetId);
  if (fonte.fonte === "banco") {
    await salvarFornecedoresBanco(fornecedores, fonte.unidadeId);
    return;
  }
  await upsertFornecedoresPlanilha(fornecedores, fonte.spreadsheetId!);
}

async function upsertFornecedoresPlanilha(
  fornecedores: Fornecedor[],
  spreadsheetId: string,
): Promise<void> {
  if (fornecedores.length === 0) return;
  for (const f of fornecedores) {
    if (!f.codigo) throw new Error("Fornecedor sem código - não dá pra saber qual linha atualizar.");
  }

  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SHEET}'!A${FIRST_DATA_ROW}:A`,
  });
  const codigos = (res.data.values ?? []).map((r) => r[0]);

  const atualizacoes: { range: string; values: (string | number)[][] }[] = [];
  const novos: Fornecedor[] = [];

  for (const fornecedor of fornecedores) {
    const idx = codigos.findIndex((c) => c === fornecedor.codigo);
    if (idx >= 0) {
      const rowNumber = FIRST_DATA_ROW + idx;
      atualizacoes.push({
        range: `'${SHEET}'!A${rowNumber}:L${rowNumber}`,
        values: [fornecedorToRow(fornecedor)],
      });
    } else {
      novos.push(fornecedor);
    }
  }

  if (atualizacoes.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data: atualizacoes },
    });
  }

  for (const fornecedor of novos) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: RANGE,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [fornecedorToRow(fornecedor)] },
    });
  }
}

export function proximoCodigo(fornecedores: Fornecedor[]): string {
  const nums = fornecedores
    .map((f) => Number(f.codigo.replace(/\D/g, "")))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `FOR${String(next).padStart(3, "0")}`;
}

/** Fornecedores cadastrados direto na planilha (antes do app existir) não
 * têm Código - e sem um código estável, `upsertFornecedor` não sabe achar a
 * linha certa pra salvar uma correção. Dá um código pra quem ainda não tem
 * (casando pela linha com Código vazio + mesmo Nome Fantasia, a única coisa
 * estável que sobra). Depois da primeira vez que cada fornecedor passa por
 * aqui isso vira no-op pra ele. */
export async function garantirCodigos(spreadsheetId: string | null): Promise<Fornecedor[]> {
  const fonte = await resolverFonteDadosEstoque(spreadsheetId);
  if (fonte.fonte === "banco") return listarFornecedoresBanco(fonte.unidadeId);

  const planilhaId = fonte.spreadsheetId!;
  const fornecedores = await listFornecedoresPlanilha(planilhaId);
  const semCodigo = fornecedores.filter((f) => !f.codigo);
  if (semCodigo.length === 0) return fornecedores;

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: planilhaId,
    range: `'${SHEET}'!A${FIRST_DATA_ROW}:C`,
  });
  const linhas = res.data.values ?? [];

  let proximoNum =
    Math.max(
      0,
      ...fornecedores.map((f) => Number(f.codigo.replace(/\D/g, ""))).filter((n) => !Number.isNaN(n))
    ) + 1;

  for (const f of semCodigo) {
    const idx = linhas.findIndex((r) => !r[0] && r[2] === f.nomeFantasia);
    if (idx === -1) continue;
    const codigo = `FOR${String(proximoNum).padStart(3, "0")}`;
    proximoNum += 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId: planilhaId,
      range: `'${SHEET}'!A${FIRST_DATA_ROW + idx}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[codigo]] },
    });
    f.codigo = codigo;
  }

  return fornecedores;
}
