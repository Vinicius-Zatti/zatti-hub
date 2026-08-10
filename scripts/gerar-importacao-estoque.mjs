import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { google } from "googleapis";

function argumento(nome) {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

function carregarAmbiente() {
  const arquivo = path.join(process.cwd(), ".env.local");
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const partes = linha.match(/^\s*([^#=]+)=(.*)$/);
    if (!partes) continue;
    let valor = partes[2].trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    process.env[partes[1].trim()] = valor;
  }
}

function numeroBR(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const limpo = String(valor)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!limpo) return null;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

function sql(valor) {
  if (valor === null || valor === undefined) return "null";
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) throw new Error("Número inválido na planilha.");
    return String(valor);
  }
  if (typeof valor === "boolean") return valor ? "true" : "false";
  if (Array.isArray(valor)) return `array[${valor.map(sql).join(", ")}]::text[]`;
  return `'${String(valor).replaceAll("'", "''")}'`;
}

function dataBrParaIso(data) {
  const [dia, mes, ano] = String(data).split("/");
  if (!dia || !mes || !ano) throw new Error(`Data inválida no inventário: ${data}`);
  return `${ano.padStart(4, "0")}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

function soma(lista, campo) {
  return Number(
    lista.reduce((total, item) => total + (item[campo] ?? 0), 0).toFixed(2),
  );
}

carregarAmbiente();
const unidadeId = argumento("unidade");
const spreadsheetId = argumento("planilha");
const saida = argumento("saida") ?? path.join(os.tmpdir(), `${unidadeId}-estoque.sql`);

if (!unidadeId || !/^[a-z0-9-]+$/.test(unidadeId)) {
  throw new Error("Informe --unidade com o identificador exato do Supabase.");
}
if (!spreadsheetId) throw new Error("Informe --planilha com o identificador da planilha.");

const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!email || !key) throw new Error("Credenciais do Google Sheets não configuradas.");

const auth = new google.auth.JWT({
  email,
  key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });
const meta = await sheets.spreadsheets.get({
  spreadsheetId,
  fields: "properties.title,sheets.properties.title",
});
const abas = meta.data.sheets?.map((aba) => aba.properties?.title).filter(Boolean) ?? [];
const inventarioNome = abas.find(
  (nome) => nome.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() === "inventario",
);
if (!inventarioNome) throw new Error("Aba Inventário não encontrada.");

const resposta = await sheets.spreadsheets.values.batchGet({
  spreadsheetId,
  ranges: [
    "'Cadastro de Produtos'!A3:R",
    "'Fornecedores'!A3:L",
    `'${inventarioNome}'!A3:J`,
  ],
});
const [produtosRaw, fornecedoresRaw, inventarioRaw] = resposta.data.valueRanges.map(
  (faixa) => faixa.values ?? [],
);

const produtos = produtosRaw.flatMap((row, indice) =>
  row[0]
    ? [{
        ordem: indice + 1,
        sku: row[0] ?? "",
        posicao: numeroBR(row[1]),
        grupo: row[2] ?? "",
        nome: row[3] ?? "",
        unidadeBase: row[4] ?? "",
        precoUnitario: numeroBR(row[5]),
        estoqueNecessarioSemana: numeroBR(row[6]),
        estoqueMinimo: numeroBR(row[7]),
        nomeCompra: row[8] ?? "",
        unidadeEmbalagemFornecedor: row[9] ?? "",
        qtdUnidadeBasePorEmbalagem: numeroBR(row[10]),
        precoFornecedor: numeroBR(row[11]),
        fornecedor1: row[12] ?? "",
        fornecedor2: row[13] ?? "",
        fornecedor3: row[14] ?? "",
        fornecedor4: row[15] ?? "",
        observacoes: row[16] ?? "",
        ativo: (row[17] ?? "1") === "1",
      }]
    : [],
);

const fornecedores = fornecedoresRaw.flatMap((row, indice) =>
  row[1] || row[2]
    ? [{
        ordem: indice + 1,
        codigo: row[0] ?? "",
        razaoSocial: row[1] ?? "",
        nomeFantasia: row[2] ?? "",
        grupos: String(row[3] ?? "").split(",").map((grupo) => grupo.trim()).filter(Boolean),
        nomeVendedor: row[4] ?? "",
        whatsapp: row[5] ?? "",
        condicoesPagamento: row[6] ?? "",
        prazoBoleto: row[7] ?? "",
        limiteCredito: numeroBR(row[8]),
        pedidoMinimo: numeroBR(row[9]),
        diasEntrega: row[10] ?? "",
        observacoes: row[11] ?? "",
      }]
    : [],
);

if (fornecedores.some((fornecedor) => !fornecedor.codigo)) {
  throw new Error("Há fornecedor sem código. Abra a edição de fornecedores antes de importar.");
}

const inventario = inventarioRaw.flatMap((row, indice) =>
  row[2]
    ? [{
        linhaPlanilha: indice + 3,
        data: dataBrParaIso(row[0]),
        mes: row[1] ?? "",
        sku: row[2] ?? "",
        grupo: row[3] ?? "",
        nome: row[4] ?? "",
        unidadeBase: row[5] ?? "",
        quantidade: numeroBR(row[6]),
        precoUnitario: numeroBR(row[7]),
        total: numeroBR(row[8]),
        alerta: row[9] ?? "",
      }]
    : [],
);

const skus = produtos.map((produto) => produto.sku);
const codigos = fornecedores.map((fornecedor) => fornecedor.codigo);
const chavesInventario = inventario.map((item) => `${item.data}|${item.sku}`);
const repetidos = (lista) => [...new Set(lista.filter((valor, i) => lista.indexOf(valor) !== i))];
if (repetidos(skus).length) throw new Error("Há SKU duplicado no cadastro de produtos.");
if (repetidos(codigos).length) throw new Error("Há código duplicado no cadastro de fornecedores.");
// SKU repetido na mesma data é permitido pelo próprio schema (contagem_itens
// não tem unique por sku, só por origem_linha_planilha - o legado permitia
// reenvio no mesmo dia). Não bloqueia a importação, só é reportado no resumo
// final pra quem gera o SQL decidir se quer revisar antes de rodar.
const gruposComSkuRepetidoNoDia = repetidos(chavesInventario);

const contagens = [...new Map(inventario.map((item) => [item.data, item.mes])).entries()];

// Cada bloco só entra no SQL se tiver pelo menos 1 linha - "values" sem
// nenhuma linha é erro de sintaxe no Postgres. Unidade nova/incompleta (ex:
// cadastro criado mas sem fornecedor nem contagem ainda) é um caso real, não
// hipotético - achado importando a Adega em 10/08.
const blocoProdutos = produtos.length === 0 ? [] : [
  "insert into produtos (unidade_id, ordem, sku, posicao, grupo, nome, unidade_base, preco_unitario, estoque_necessario_semana, estoque_minimo, nome_compra, unidade_embalagem_fornecedor, qtd_unidade_base_por_embalagem, preco_fornecedor, fornecedor_1, fornecedor_2, fornecedor_3, fornecedor_4, observacoes, ativo)",
  `values\n${produtos.map((p) => `(${[
    unidadeId, p.ordem, p.sku, p.posicao, p.grupo, p.nome, p.unidadeBase,
    p.precoUnitario, p.estoqueNecessarioSemana, p.estoqueMinimo, p.nomeCompra,
    p.unidadeEmbalagemFornecedor, p.qtdUnidadeBasePorEmbalagem, p.precoFornecedor,
    p.fornecedor1, p.fornecedor2, p.fornecedor3, p.fornecedor4, p.observacoes, p.ativo,
  ].map(sql).join(", ")})`).join(",\n")}`,
  "on conflict (unidade_id, sku) do update set posicao = excluded.posicao, grupo = excluded.grupo, nome = excluded.nome, unidade_base = excluded.unidade_base, preco_unitario = excluded.preco_unitario, estoque_necessario_semana = excluded.estoque_necessario_semana, estoque_minimo = excluded.estoque_minimo, nome_compra = excluded.nome_compra, unidade_embalagem_fornecedor = excluded.unidade_embalagem_fornecedor, qtd_unidade_base_por_embalagem = excluded.qtd_unidade_base_por_embalagem, preco_fornecedor = excluded.preco_fornecedor, fornecedor_1 = excluded.fornecedor_1, fornecedor_2 = excluded.fornecedor_2, fornecedor_3 = excluded.fornecedor_3, fornecedor_4 = excluded.fornecedor_4, observacoes = excluded.observacoes, ativo = excluded.ativo, atualizado_em = now();",
  "",
];

const blocoFornecedores = fornecedores.length === 0 ? [] : [
  "insert into fornecedores (unidade_id, ordem, codigo, razao_social, nome_fantasia, grupos, nome_vendedor, whatsapp, condicoes_pagamento, prazo_boleto, limite_credito, pedido_minimo, dias_entrega, observacoes)",
  `values\n${fornecedores.map((f) => `(${[
    unidadeId, f.ordem, f.codigo, f.razaoSocial, f.nomeFantasia, f.grupos,
    f.nomeVendedor, f.whatsapp, f.condicoesPagamento, f.prazoBoleto,
    f.limiteCredito, f.pedidoMinimo, f.diasEntrega, f.observacoes,
  ].map(sql).join(", ")})`).join(",\n")}`,
  "on conflict (unidade_id, codigo) do update set razao_social = excluded.razao_social, nome_fantasia = excluded.nome_fantasia, grupos = excluded.grupos, nome_vendedor = excluded.nome_vendedor, whatsapp = excluded.whatsapp, condicoes_pagamento = excluded.condicoes_pagamento, prazo_boleto = excluded.prazo_boleto, limite_credito = excluded.limite_credito, pedido_minimo = excluded.pedido_minimo, dias_entrega = excluded.dias_entrega, observacoes = excluded.observacoes, atualizado_em = now();",
  "",
];

const blocoContagens = contagens.length === 0 ? [] : [
  "insert into contagens (unidade_id, data, mes)",
  `values\n${contagens.map(([data, mes]) => `(${[unidadeId, data, mes].map(sql).join(", ")})`).join(",\n")}`,
  "on conflict (unidade_id, data) do update set mes = excluded.mes;",
  "",
];

const blocoContagemItens = inventario.length === 0 ? [] : [
  "insert into contagem_itens (contagem_id, ordem, origem_linha_planilha, sku, grupo, nome, unidade_base, quantidade, preco_unitario, total, alerta)",
  "select c.id, v.linha, v.linha, v.sku, v.grupo, v.nome, v.unidade_base, v.quantidade, v.preco_unitario, v.total, v.alerta",
  `from (values\n${inventario.map((item) => `(${[
    item.data, item.linhaPlanilha, item.sku, item.grupo, item.nome, item.unidadeBase,
    item.quantidade, item.precoUnitario, item.total, item.alerta,
  ].map(sql).join(", ")})`).join(",\n")}) as v(data, linha, sku, grupo, nome, unidade_base, quantidade, preco_unitario, total, alerta)`,
  `join contagens c on c.unidade_id = ${sql(unidadeId)} and c.data = v.data::date`,
  // ordem = número da linha original na planilha (estritamente crescente na
  // ordem de leitura), em vez de deixar pro identity automático do Postgres -
  // garante por construção que, quando o mesmo SKU repete na mesma data,
  // `listarInventarioBanco` (que lê ordenado por `ordem`) devolve as
  // ocorrências na mesma ordem da planilha, e a última prevalece em Pedidos -
  // mesma regra de hoje na planilha, onde a linha mais embaixo prevalece.
  "on conflict (contagem_id, origem_linha_planilha) do update set ordem = excluded.ordem, sku = excluded.sku, grupo = excluded.grupo, nome = excluded.nome, unidade_base = excluded.unidade_base, quantidade = excluded.quantidade, preco_unitario = excluded.preco_unitario, total = excluded.total, alerta = excluded.alerta;",
  "",
];

const linhasSql = [
  "begin;",
  `do $$ begin if not exists (select 1 from unidades where id = ${sql(unidadeId)}) then raise exception 'Unidade não encontrada'; end if; end $$;`,
  "",
  ...blocoProdutos,
  ...blocoFornecedores,
  ...blocoContagens,
  ...blocoContagemItens,
  "commit;",
  "",
  `select ${sql(unidadeId)} as unidade,`,
  `  (select count(*) from produtos where unidade_id = ${sql(unidadeId)}) as produtos,`,
  `  (select count(*) from fornecedores where unidade_id = ${sql(unidadeId)}) as fornecedores,`,
  `  (select count(*) from contagens where unidade_id = ${sql(unidadeId)}) as datas_contagem,`,
  `  (select count(*) from contagem_itens ci join contagens c on c.id = ci.contagem_id where c.unidade_id = ${sql(unidadeId)}) as itens_contagem;`,
];

fs.writeFileSync(saida, linhasSql.join("\n"), "utf8");
console.log(JSON.stringify({
  planilha: meta.data.properties?.title,
  unidade: unidadeId,
  produtos: produtos.length,
  fornecedores: fornecedores.length,
  datasContagem: contagens.length,
  itensContagem: inventario.length,
  chavesUnicasInventario: new Set(chavesInventario).size,
  gruposComSkuRepetidoNoDia: gruposComSkuRepetidoNoDia.length,
  somaPrecoProdutos: soma(produtos, "precoUnitario"),
  somaQuantidadeInventario: soma(inventario, "quantidade"),
  somaValorInventario: soma(inventario, "total"),
  arquivoSql: saida,
}, null, 2));
