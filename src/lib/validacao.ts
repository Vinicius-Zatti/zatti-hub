import { z } from "zod";
import { ErroPublico } from "@/lib/erros";

/** Roda o schema e devolve o dado tipado, ou lança `ErroPublico` genérico
 * (o detalhe do que falhou fica só no log do servidor - a mensagem exata
 * de validação pode revelar estrutura interna e não ajuda quem preencheu
 * um formulário errado mais do que "confere os campos e tenta de novo"). */
export function validar<T>(schema: z.ZodType<T>, dado: unknown, contexto: string): T {
  const resultado = schema.safeParse(dado);
  if (!resultado.success) {
    console.error(`[validacao:${contexto}]`, resultado.error.issues);
    throw new ErroPublico("Alguns campos não são válidos. Confere e tenta de novo.");
  }
  return resultado.data;
}

const texto = (max: number) => z.string().max(max);
const textoObrigatorio = (max: number) => z.string().trim().min(1).max(max);
const numeroOpcional = z.number().finite().nullable();
const numeroNaoNegativoOpcional = z.number().finite().nonnegative().nullable();
const numeroNaoNegativo = z.number().finite().nonnegative();

// ── Produtos ──────────────────────────────────────────────────────────

export const produtoSchema = z.object({
  sku: textoObrigatorio(64),
  posicao: numeroOpcional,
  grupo: texto(100),
  nome: texto(300),
  unidadeBase: texto(20),
  precoUnitario: numeroNaoNegativoOpcional,
  estoqueNecessarioSemana: numeroNaoNegativoOpcional,
  estoqueMinimo: numeroNaoNegativoOpcional,
  nomeCompra: texto(300),
  unidadeEmbalagemFornecedor: texto(50),
  qtdUnidadeBasePorEmbalagem: numeroNaoNegativoOpcional,
  precoFornecedor: numeroNaoNegativoOpcional,
  fornecedor1: texto(64),
  fornecedor2: texto(64),
  fornecedor3: texto(64),
  fornecedor4: texto(64),
  observacoes: texto(2000),
  ativo: z.boolean(),
});

export const produtosBatchSchema = z.array(produtoSchema).min(1).max(2000);

export const sugerirSkuSchema = textoObrigatorio(300);

export const definirFornecedor1Schema = z.object({
  sku: textoObrigatorio(64),
  fornecedor1: texto(64),
});

// ── Fornecedores ──────────────────────────────────────────────────────

export const fornecedorSchema = z.object({
  codigo: textoObrigatorio(64),
  razaoSocial: texto(300),
  nomeFantasia: texto(300),
  grupos: z.array(texto(50)).max(20),
  nomeVendedor: texto(200),
  whatsapp: texto(32),
  condicoesPagamento: texto(500),
  prazoBoleto: texto(100),
  limiteCredito: numeroNaoNegativoOpcional,
  pedidoMinimo: numeroNaoNegativoOpcional,
  diasEntrega: texto(200),
  observacoes: texto(2000),
});

export const fornecedorNovoSchema = fornecedorSchema.omit({ codigo: true });

export const fornecedoresBatchSchema = z.array(fornecedorSchema).min(1).max(2000);

export const fornecedorRapidoSchema = z.object({
  nomeFantasia: textoObrigatorio(300),
  nomeVendedor: texto(200),
  whatsapp: texto(32),
  grupos: z.array(texto(50)).max(20),
});

// ── Contagem ──────────────────────────────────────────────────────────

export const contagemLinhaSchema = z.object({
  sku: textoObrigatorio(64),
  quantidade: numeroNaoNegativo,
  nomeAvulso: texto(300).optional(),
  unidadeAvulso: texto(20).optional(),
});

export const registrarContagemSchema = z.object({
  linhas: z.array(contagemLinhaSchema).min(1).max(2000),
  dataISO: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const atualizarQuantidadeContagemSchema = z.object({
  data: textoObrigatorio(20),
  sku: textoObrigatorio(64),
  quantidade: numeroNaoNegativo,
});

// ── Pedidos / cotações ───────────────────────────────────────────────

const itemConfirmarSchema = z.object({
  sku: textoObrigatorio(64),
  nome: texto(300),
  nomeCompra: texto(300),
  unidadeBase: texto(20),
  quantidadePedida: numeroNaoNegativo,
  precoAntigo: numeroNaoNegativoOpcional,
  precoAtualizado: numeroNaoNegativoOpcional,
  precoConfirmado: z.boolean(),
});

export const confirmarItemSchema = z.object({
  fornecedor: textoObrigatorio(64),
  dataContagemBase: textoObrigatorio(20),
  item: itemConfirmarSchema,
  atualizarPreco: z.boolean(),
});

export const confirmarVencedorSchema = z.object({
  dataContagemBase: textoObrigatorio(20),
  fornecedorVencedor: textoObrigatorio(64),
  outrosFornecedores: z.array(texto(64)).max(50),
  item: itemConfirmarSchema,
});

export const desfazerVencedorSchema = z.object({
  dataContagemBase: textoObrigatorio(20),
  fornecedorAtual: textoObrigatorio(64),
  outrosFornecedores: z.array(texto(64)).max(50),
  item: itemConfirmarSchema.omit({ precoAtualizado: true, precoConfirmado: true }),
});

export const atualizarPrevisaoEntregaSchema = z.object({
  fornecedor: textoObrigatorio(64),
  dataContagemBase: textoObrigatorio(20),
  previsaoEntrega: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export const marcarRecebidoSchema = z.object({
  pedidoId: textoObrigatorio(64),
  recebido: z.boolean(),
  observacaoEntrega: texto(1000).nullable(),
  itensRecebidos: z
    .array(
      z.object({
        sku: textoObrigatorio(64),
        quantidadeRecebida: numeroNaoNegativoOpcional,
      })
    )
    .max(500),
});

// ── Financeiro / Consolidado de Vendas ───────────────────────────────

export const entradaConsolidadoSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  credito: numeroNaoNegativo,
  debito: numeroNaoNegativo,
  pix: numeroNaoNegativo,
  dinheiro: numeroNaoNegativo,
  valeAlimentacao: numeroNaoNegativo,
  salao: numeroNaoNegativo,
  deliveryProprio: numeroNaoNegativo,
  ifood: numeroNaoNegativo,
  food99: numeroNaoNegativo,
  confirmarDivergencia: z.boolean(),
});

export const editarConsolidadoSchema = z.object({
  id: textoObrigatorio(64),
  entrada: entradaConsolidadoSchema,
});
