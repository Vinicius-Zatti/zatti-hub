import { getSheetsClient, getSpreadsheetId } from "./client";
import type { Fornecedor } from "@/lib/types";

const SHEET = "Fornecedores";
const FIRST_DATA_ROW = 3;
const RANGE = `'${SHEET}'!A${FIRST_DATA_ROW}:K`;

function toNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const limpo = String(v).replace(/[^\d,.-]/g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isNaN(n) ? null : n;
}

function rowToFornecedor(row: string[]): Fornecedor {
  return {
    codigo: row[0] ?? "",
    razaoSocial: row[1] ?? "",
    nomeFantasia: row[2] ?? "",
    nomeVendedor: row[3] ?? "",
    whatsapp: row[4] ?? "",
    condicoesPagamento: row[5] ?? "",
    prazoBoleto: row[6] ?? "",
    limiteCredito: toNumber(row[7]),
    pedidoMinimo: toNumber(row[8]),
    diasEntrega: row[9] ?? "",
    observacoes: row[10] ?? "",
  };
}

function fornecedorToRow(f: Fornecedor): (string | number)[] {
  return [
    f.codigo,
    f.razaoSocial,
    f.nomeFantasia,
    f.nomeVendedor,
    f.whatsapp,
    f.condicoesPagamento,
    f.prazoBoleto,
    f.limiteCredito ?? "",
    f.pedidoMinimo ?? "",
    f.diasEntrega,
    f.observacoes,
  ];
}

export async function listFornecedores(tenantId?: string): Promise<Fornecedor[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId(tenantId);

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE });
  const rows = res.data.values ?? [];
  return rows.filter((r) => r[0]).map(rowToFornecedor);
}

export async function upsertFornecedor(fornecedor: Fornecedor, tenantId?: string): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId(tenantId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SHEET}'!A${FIRST_DATA_ROW}:A`,
  });
  const codigos = (res.data.values ?? []).map((r) => r[0]);
  const idx = codigos.findIndex((c) => c === fornecedor.codigo);

  if (idx >= 0) {
    const rowNumber = FIRST_DATA_ROW + idx;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${SHEET}'!A${rowNumber}:K${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [fornecedorToRow(fornecedor)] },
    });
  } else {
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
