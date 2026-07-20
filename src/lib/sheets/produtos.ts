import { getSheetsClient, getSpreadsheetId } from "./client";
import type { Produto } from "@/lib/types";

const SHEET = "Cadastro de Produtos";
const HEADER_ROW = 2;
const FIRST_DATA_ROW = 3;
const RANGE = `'${SHEET}'!A${FIRST_DATA_ROW}:P`;

function toNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function rowToProduto(row: string[]): Produto {
  return {
    sku: row[0] ?? "",
    grupo: row[1] ?? "",
    nome: row[2] ?? "",
    nomeCompra: row[3] ?? "",
    unidadeBase: row[4] ?? "",
    precoUnitario: toNumber(row[5]),
    precoFornecedor: toNumber(row[6]),
    estoqueNecessarioSemana: toNumber(row[7]),
    estoqueMinimo: toNumber(row[8]),
    fornecedor1: row[9] ?? "",
    fornecedor2: row[10] ?? "",
    fornecedor3: row[11] ?? "",
    fornecedor4: row[12] ?? "",
    observacoes: row[13] ?? "",
    ativo: (row[14] ?? "1") === "1",
    posicao: toNumber(row[15]),
  };
}

function produtoToRow(p: Produto): (string | number)[] {
  return [
    p.sku,
    p.grupo,
    p.nome,
    p.nomeCompra,
    p.unidadeBase,
    p.precoUnitario ?? "",
    p.precoFornecedor ?? "",
    p.estoqueNecessarioSemana ?? "",
    p.estoqueMinimo ?? "",
    p.fornecedor1,
    p.fornecedor2,
    p.fornecedor3,
    p.fornecedor4,
    p.observacoes,
    p.ativo ? 1 : 0,
    p.posicao ?? "",
  ];
}

export async function listProdutos(tenantId?: string): Promise<Produto[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId(tenantId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE,
  });

  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row[0]) // ignora linhas em branco
    .map(rowToProduto);
}

export async function upsertProduto(
  produto: Produto,
  tenantId?: string
): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId(tenantId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SHEET}'!A${FIRST_DATA_ROW}:A`,
  });
  const skus = (res.data.values ?? []).map((r) => r[0]);
  const idx = skus.findIndex((s) => s === produto.sku);

  if (idx >= 0) {
    const rowNumber = FIRST_DATA_ROW + idx;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${SHEET}'!A${rowNumber}:P${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [produtoToRow(produto)] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: RANGE,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [produtoToRow(produto)] },
    });
  }
}
