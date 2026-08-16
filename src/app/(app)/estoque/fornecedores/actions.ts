"use server";

import { listFornecedores, upsertFornecedor, upsertFornecedoresBatch, proximoCodigo } from "@/lib/sheets/fornecedores";
import type { Fornecedor } from "@/lib/types";
import { requireGestao, registrarAuditoria, registrarAuditoriaBatch } from "@/lib/acesso";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  fornecedorNovoSchema,
  fornecedorSchema,
  fornecedoresSchema,
  validarEntrada,
} from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";

function revalidarTudo() {
  revalidatePath("/estoque/fornecedores");
  revalidatePath("/estoque/fornecedores/edicao");
  revalidatePath("/estoque/produtos/edicao");
  revalidatePath("/estoque/pedidos");
}

async function criarFornecedor(
  dados: Omit<Fornecedor, "codigo">,
  acesso: Awaited<ReturnType<typeof requireGestao>>
): Promise<Fornecedor> {
  const existentes = await listFornecedores(acesso.spreadsheetId);

  // Achado real em produção (Dom Quixote, 27/07): clique repetido em "Novo
  // Fornecedor" pro mesmo nome criou 54 linhas duplicadas de "Mart Minas"
  // (algumas com "M"/"m" trocado) - nenhuma delas vinculada a produto
  // nenhum, só lixo de cadastro. Bloqueia nome igual (sem diferenciar
  // maiúscula/minúscula ou espaço nas pontas) em vez de deixar acontecer
  // de novo.
  const nomeNormalizado = dados.nomeFantasia.trim().toLowerCase();
  const duplicado = existentes.find((f) => f.nomeFantasia.trim().toLowerCase() === nomeNormalizado);
  if (duplicado) {
    throw new ErroPublico(
      `Já existe um fornecedor "${duplicado.nomeFantasia}" cadastrado (código ${duplicado.codigo}) - escolhe ele na lista em vez de criar de novo.`
    );
  }

  const fornecedor: Fornecedor = { codigo: proximoCodigo(existentes), ...dados };

  await upsertFornecedor(fornecedor, acesso.spreadsheetId);
  await registrarAuditoria({
    acesso,
    acao: "criar",
    entidade: "fornecedor",
    entidadeId: fornecedor.codigo,
    dadosNovos: fornecedor,
  });
  revalidarTudo();
  return fornecedor;
}

export async function criarFornecedorAction(formData: FormData) {
  const acesso = await requireGestao();

  try {
    await exigirLimiteRequisicao("salvar_fornecedores");
    const dados = validarEntrada(fornecedorNovoSchema, {
      razaoSocial: String(formData.get("razaoSocial") ?? ""),
      nomeFantasia: String(formData.get("nomeFantasia") ?? ""),
      grupos: formData.getAll("grupos").map(String),
      nomeVendedor: String(formData.get("nomeVendedor") ?? ""),
      whatsapp: String(formData.get("whatsapp") ?? ""),
      condicoesPagamento: String(formData.get("condicoesPagamento") ?? ""),
      prazoBoleto: String(formData.get("prazoBoleto") ?? ""),
      limiteCredito: formData.get("limiteCredito") ? Number(formData.get("limiteCredito")) : null,
      pedidoMinimo: formData.get("pedidoMinimo") ? Number(formData.get("pedidoMinimo")) : null,
      diasEntrega: String(formData.get("diasEntrega") ?? ""),
      observacoes: String(formData.get("observacoes") ?? ""),
    });
    await criarFornecedor(
      dados,
      acesso
    );
  } catch (err) {
    const mensagem = mensagemErroPublica(err, "Nao foi possivel criar o fornecedor.");
    redirect(`/estoque/fornecedores/novo?erro=${encodeURIComponent(mensagem)}`);
  }
  redirect("/estoque/fornecedores");
}

/** Cria um fornecedor mínimo direto de uma tela de edição (ex: seletor de
 * Fornecedor 1-4 em Produtos) sem sair da página - o resto do cadastro
 * (condições de pagamento, limite de crédito etc) fica pendente pra
 * completar depois em Fornecedores > Edição de Dados. */
export async function criarFornecedorRapidoAction(dados: {
  nomeFantasia: string;
  nomeVendedor: string;
  whatsapp: string;
  grupos: string[];
}): Promise<{ fornecedor: Fornecedor } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await exigirLimiteRequisicao("salvar_fornecedores");
    const entrada = validarEntrada(fornecedorNovoSchema, {
      razaoSocial: "",
      nomeFantasia: dados.nomeFantasia,
      grupos: dados.grupos,
      nomeVendedor: dados.nomeVendedor,
      whatsapp: dados.whatsapp,
      condicoesPagamento: "",
      prazoBoleto: "",
      limiteCredito: null,
      pedidoMinimo: null,
      diasEntrega: "",
      observacoes: "",
    });
    const fornecedor = await criarFornecedor(
      entrada,
      acesso
    );
    return { fornecedor };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel criar o fornecedor.") };
  }
}

/** Cria ou atualiza um fornecedor (por Código) direto da grade de Edição de
 * Dados. */
export async function salvarFornecedorAction(
  fornecedor: Fornecedor
): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await exigirLimiteRequisicao("salvar_fornecedores");
    const entrada = validarEntrada(fornecedorSchema, fornecedor);
    await upsertFornecedor(entrada, acesso.spreadsheetId);
    await registrarAuditoria({
      acesso,
      acao: "salvar",
      entidade: "fornecedor",
      entidadeId: entrada.codigo,
      dadosNovos: entrada,
    });
    revalidarTudo();
    return { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel salvar o fornecedor.") };
  }
}

/** Versão em lote de `salvarFornecedorAction`, mesmo motivo de
 * `salvarProdutosAction`: 1 leitura + 1 escrita em lote + 1 auditoria em
 * lote pro "Salvar todos" inteiro, em vez de um par leitura/escrita por
 * linha alterada disparado em paralelo. */
export async function salvarFornecedoresAction(
  fornecedores: Fornecedor[]
): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await exigirLimiteRequisicao("salvar_fornecedores");
    const entradas = validarEntrada(fornecedoresSchema, fornecedores);
    await upsertFornecedoresBatch(entradas, acesso.spreadsheetId);
    await registrarAuditoriaBatch(
      entradas.map((fornecedor) => ({
        acesso,
        acao: "salvar",
        entidade: "fornecedor",
        entidadeId: fornecedor.codigo,
        dadosNovos: fornecedor,
      }))
    );
    revalidarTudo();
    return { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel salvar os fornecedores.") };
  }
}
