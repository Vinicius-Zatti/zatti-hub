import { getSheetsClient, getSpreadsheetId } from "./client";
import { toNumeroBR as toNumber } from "./numero";
import type { Produto } from "@/lib/types";

const SHEET = "Cadastro de Produtos";
const HEADER_ROW = 2;
const FIRST_DATA_ROW = 3;
const RANGE = `'${SHEET}'!A${FIRST_DATA_ROW}:R`;

// Colunas reais da planilha (A-R), reorganizada em 20/07: SKU, Posição,
// Grupo, Nome, Unidade, Preço, Estoque semana, Estoque mínimo, Nome de
// Compra, Unidade Embalagem Fornecedor, Qtd Und Base por Embalagem, Preço
// Fornecedor, Fornecedor 1-4, Observações, Ativo.
function rowToProduto(row: string[]): Produto {
  return {
    sku: row[0] ?? "",
    posicao: toNumber(row[1]),
    grupo: row[2] ?? "",
    nome: row[3] ?? "",
    unidadeBase: row[4] ?? "",
    precoUnitario: toNumber(row[5]),
    estoqueNecessarioSemana: toNumber(row[6]),
    estoqueMinimo: toNumber(row[7]),
    nomeCompra: row[8] ?? "",
    unidadeEmbalagemFornecedor: row[9] ?? "",
    qtdUnidadeBasePorEmbalagem: toNumber(row[10]),
    precoFornecedor: toNumber(row[11]),
    fornecedor1: row[12] ?? "",
    fornecedor2: row[13] ?? "",
    fornecedor3: row[14] ?? "",
    fornecedor4: row[15] ?? "",
    observacoes: row[16] ?? "",
    ativo: (row[17] ?? "1") === "1",
  };
}

function produtoToRow(p: Produto): (string | number)[] {
  return [
    p.sku,
    p.posicao ?? "",
    p.grupo,
    p.nome,
    p.unidadeBase,
    p.precoUnitario ?? "",
    p.estoqueNecessarioSemana ?? "",
    p.estoqueMinimo ?? "",
    p.nomeCompra,
    p.unidadeEmbalagemFornecedor,
    p.qtdUnidadeBasePorEmbalagem ?? "",
    p.precoFornecedor ?? "",
    p.fornecedor1,
    p.fornecedor2,
    p.fornecedor3,
    p.fornecedor4,
    p.observacoes,
    p.ativo ? 1 : 0,
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
      range: `'${SHEET}'!A${rowNumber}:R${rowNumber}`,
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
