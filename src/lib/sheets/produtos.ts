import { getSheetsClient } from "./client";
import { toNumeroBR as toNumber } from "./numero";
import type { Produto } from "@/lib/types";
import { resolverFonteDadosEstoque } from "@/lib/estoque/fonte-dados";
import { listarProdutosBanco, salvarProdutosBanco, excluirProdutoBanco } from "@/lib/banco/estoque";
import { paraCelulaSegura } from "./seguranca";
import { ErroPublico } from "@/lib/erros";

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
    // Revenda (auto-criação de ficha técnica) só existe pra unidade no banco
    // - planilha não tem onde guardar isso nem Fichas Técnicas habilitado.
    revenda: false,
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
  ].map((valor) => (typeof valor === "string" ? paraCelulaSegura(valor) : valor));
}

async function listProdutosPlanilha(spreadsheetId: string): Promise<Produto[]> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE,
  });

  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row[0]) // ignora linhas em branco
    .map(rowToProduto);
}

export async function listProdutos(spreadsheetId: string | null): Promise<Produto[]> {
  const fonte = await resolverFonteDadosEstoque(spreadsheetId);
  if (fonte.fonte === "banco") return listarProdutosBanco(fonte.unidadeId);
  return listProdutosPlanilha(fonte.spreadsheetId!);
}

export async function upsertProduto(
  produto: Produto,
  spreadsheetId: string | null
): Promise<void> {
  await upsertProdutosBatch([produto], spreadsheetId);
}

/** Salva vários produtos de uma vez - uma única leitura da coluna de SKU
 * pra achar as linhas, um único `batchUpdate` pra gravar todas. Usada pelo
 * "Salvar todos" da grade de Edição de Dados: salvar item por item (1
 * leitura + 1 escrita cada, em paralelo) esbarrava em limite de taxa da
 * API do Sheets a partir de ~10 itens de uma vez. */
export async function upsertProdutosBatch(
  produtos: Produto[],
  spreadsheetId: string | null
): Promise<void> {
  const fonte = await resolverFonteDadosEstoque(spreadsheetId);
  if (fonte.fonte === "banco") {
    await salvarProdutosBanco(produtos, fonte.unidadeId);
    return;
  }
  await upsertProdutosPlanilha(produtos, fonte.spreadsheetId!);
}

async function upsertProdutosPlanilha(
  produtos: Produto[],
  spreadsheetId: string,
): Promise<void> {
  if (produtos.length === 0) return;
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SHEET}'!A${FIRST_DATA_ROW}:A`,
  });
  const skus = (res.data.values ?? []).map((r) => r[0]);

  const atualizacoes: { range: string; values: (string | number)[][] }[] = [];
  const novos: Produto[] = [];

  for (const produto of produtos) {
    const idx = skus.findIndex((s) => s === produto.sku);
    if (idx >= 0) {
      const rowNumber = FIRST_DATA_ROW + idx;
      atualizacoes.push({
        range: `'${SHEET}'!A${rowNumber}:R${rowNumber}`,
        values: [produtoToRow(produto)],
      });
    } else {
      novos.push(produto);
    }
  }

  if (atualizacoes.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data: atualizacoes },
    });
  }

  // SKU novo (não existia na planilha ainda) não tem linha pra mirar num
  // batchUpdate - segue append individual, caso raro no "Salvar todos" (que
  // só edita produtos já carregados da planilha).
  for (const produto of novos) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: RANGE,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [produtoToRow(produto)] },
    });
  }
}

/** Exclui o produto - dá o mesmo dispatch por `fonte` de `upsertProduto`.
 * Devolve quantos componentes de Ficha Técnica perderam esse produto (a
 * Ficha Técnica sempre lê do banco, mesmo pra unidade que ainda está na
 * planilha - ver `listarProdutosParaFicha`), pra UI avisar. */
export async function excluirProduto(sku: string, spreadsheetId: string | null): Promise<number> {
  const fonte = await resolverFonteDadosEstoque(spreadsheetId);
  if (fonte.fonte === "banco") return excluirProdutoBanco(fonte.unidadeId, sku);
  throw new ErroPublico(
    "Excluir produto ainda não está disponível para unidades na planilha - fale com o suporte."
  );
}
