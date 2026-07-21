import { getSheetsClient, getSpreadsheetId } from "./client";
import { toNumeroBR as toNumber } from "./numero";
import type { ItemInventario, ItemPendente, Produto } from "@/lib/types";
import { listProdutos } from "./produtos";

const SHEET = "Inventário";
const FIRST_DATA_ROW = 3;
const RANGE = `'${SHEET}'!A${FIRST_DATA_ROW}:J`;

export const PENDENTE_PREFIX = "PENDENTE-";

function rowToItem(row: string[]): ItemInventario {
  return {
    data: row[0] ?? "",
    mes: row[1] ?? "",
    sku: row[2] ?? "",
    grupo: row[3] ?? "",
    nome: row[4] ?? "",
    unidadeBase: row[5] ?? "",
    quantidade: toNumber(row[6]),
    precoUnitario: toNumber(row[7]),
    total: toNumber(row[8]),
    alerta: row[9] ?? "",
  };
}

export async function listInventario(tenantId?: string): Promise<ItemInventario[]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId(tenantId);

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE });
  const rows = res.data.values ?? [];
  return rows.filter((r) => r[2]).map(rowToItem);
}

/** Mesma regra combinada com o Vinícius em 18/07: alto = suspeita de erro de
 * contagem; baixo (abaixo do estoque mínimo) = alerta de compra emergencial,
 * nunca "erro" (pode legitimamente zerar). */
function calcularAlerta(
  quantidade: number | null,
  precoUnitario: number | null,
  produto: Produto | undefined
): string {
  if (quantidade === null) return "";
  if (precoUnitario === null) return "Falta preço no cadastro";
  if (!produto) return "";
  if (
    produto.estoqueNecessarioSemana !== null &&
    quantidade > produto.estoqueNecessarioSemana * 2
  ) {
    return "Possível erro de contagem";
  }
  if (produto.estoqueMinimo !== null && quantidade < produto.estoqueMinimo) {
    return "Comprar emergencial";
  }
  return "";
}

export type NovaContagemLinha = {
  sku: string;
  quantidade: number;
  /** Presente quando o item foi digitado na hora da contagem e ainda não
   * tem cadastro em Cadastro de Produtos (equivalente ao antigo "item avulso"
   * do HTML de inventário). Quando presente, ignora o lookup por SKU. */
  nomeAvulso?: string;
  unidadeAvulso?: string;
};

export async function registrarContagem(
  data: string, // "DD/MM/AAAA"
  mes: string, // "julho 2026"
  linhas: NovaContagemLinha[],
  tenantId?: string
): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId(tenantId);
  const produtos = await listProdutos(tenantId);
  const porSku = new Map(produtos.map((p) => [p.sku, p]));

  const rows = linhas.map(({ sku, quantidade, nomeAvulso, unidadeAvulso }) => {
    if (nomeAvulso) {
      return [
        data,
        mes,
        sku,
        "",
        nomeAvulso,
        unidadeAvulso || "UN",
        quantidade,
        "",
        "a calcular",
        "Sem cadastro, falta criar produto",
      ];
    }

    const produto = porSku.get(sku);
    const precoUnitario = produto?.precoUnitario ?? null;
    const total = precoUnitario !== null ? Number((quantidade * precoUnitario).toFixed(2)) : "a calcular";
    const alerta = calcularAlerta(quantidade, precoUnitario, produto);

    return [
      data,
      mes,
      sku,
      produto?.grupo ?? "",
      produto?.nome ?? "",
      produto?.unidadeBase ?? "",
      quantidade,
      precoUnitario ?? "",
      total,
      alerta,
    ];
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: RANGE,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

/** Corrige a quantidade de um item já registrado (só a última contagem pode
 * ser corrigida, decisão de 21/07 — contagens antigas ficam intactas como
 * histórico). Recalcula total e alerta a partir do preço que já estava
 * gravado naquela linha — não busca preço novo do cadastro, pra não mudar o
 * valor da contagem por conta de um reajuste de preço posterior. */
export async function atualizarQuantidadeInventario(
  data: string,
  sku: string,
  quantidade: number,
  tenantId?: string
): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId(tenantId);

  const [res, produtos] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE }),
    listProdutos(tenantId),
  ]);
  const rows = res.data.values ?? [];
  const idx = rows.findIndex((r) => r[0] === data && r[2] === sku);
  if (idx === -1) {
    throw new Error("Não achei essa contagem pra corrigir - pode ter sido alterada por outra pessoa.");
  }
  const linha = rows[idx];
  const rowNumber = FIRST_DATA_ROW + idx;

  const precoUnitario = toNumber(linha[7]);
  const produto = produtos.find((p) => p.sku === sku);
  const total = precoUnitario !== null ? Number((quantidade * precoUnitario).toFixed(2)) : "a calcular";
  const alerta = calcularAlerta(quantidade, precoUnitario, produto);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SHEET}'!G${rowNumber}:J${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[quantidade, linha[7] ?? "", total, alerta]] },
  });
}

/** Itens contados como avulso (fora do Cadastro de Produtos) que ainda não
 * viraram produto de verdade. Pega a ocorrência mais recente de cada nome. */
export async function listItensPendentes(tenantId?: string): Promise<ItemPendente[]> {
  const [inventario, produtos] = await Promise.all([
    listInventario(tenantId),
    listProdutos(tenantId),
  ]);
  const skusCadastrados = new Set(produtos.map((p) => p.sku));
  // Resolvido = já existe um produto de verdade com o mesmo nome (o SKU
  // provisório PENDENTE- nunca vira o SKU real, por decisão de 18/07 — o
  // histórico fica separado, só o nome muda de "pendente" pra "resolvido").
  const nomesCadastrados = new Set(produtos.map((p) => p.nome.trim().toLowerCase()));

  const porNome = new Map<string, ItemPendente>();
  for (const item of inventario) {
    if (!item.sku.startsWith(PENDENTE_PREFIX)) continue;
    if (skusCadastrados.has(item.sku)) continue;
    if (nomesCadastrados.has(item.nome.trim().toLowerCase())) continue;
    const existente = porNome.get(item.nome);
    if (!existente || item.data > existente.ultimaContagem) {
      porNome.set(item.nome, {
        nome: item.nome,
        unidadeBase: item.unidadeBase,
        ultimaContagem: item.data,
      });
    }
  }
  return Array.from(porNome.values());
}
