import { z } from "zod";
import { ErroPublico } from "@/lib/erros";

const LIMITE_DINHEIRO = 99_999_999.99;
const LIMITE_QUANTIDADE = 1_000_000_000;
const CONTROLES_NAO_PERMITIDOS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function texto(maximo: number, minimo = 0) {
  return z
    .string()
    .trim()
    .min(minimo)
    .max(maximo)
    .refine((valor) => !CONTROLES_NAO_PERMITIDOS.test(valor));
}

const textoObrigatorio = (maximo: number) => texto(maximo, 1);
const identificador = textoObrigatorio(80).refine((valor) => !/[\r\n]/.test(valor));
const numeroNaoNegativo = z.number().finite().min(0).max(LIMITE_QUANTIDADE);
const dinheiroOuNull = z.number().finite().min(0).max(LIMITE_DINHEIRO).nullable();

function dataIsoValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(data.valueOf()) && data.toISOString().slice(0, 10) === valor;
}

function dataBrValida(valor: string): boolean {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
  if (!match) return false;
  const [, dia, mes, ano] = match;
  return dataIsoValida(`${ano}-${mes}-${dia}`);
}

export const dataIsoSchema = textoObrigatorio(10).refine(dataIsoValida);
export const dataContagemSchema = textoObrigatorio(10).refine(
  (valor) => dataIsoValida(valor) || dataBrValida(valor),
);

export const produtoSchema = z
  .object({
    sku: identificador,
    posicao: numeroNaoNegativo.nullable(),
    grupo: textoObrigatorio(30),
    nome: textoObrigatorio(160),
    unidadeBase: textoObrigatorio(30),
    precoUnitario: dinheiroOuNull,
    estoqueNecessarioSemana: numeroNaoNegativo.nullable(),
    estoqueMinimo: numeroNaoNegativo.nullable(),
    nomeCompra: texto(160),
    unidadeEmbalagemFornecedor: texto(30),
    qtdUnidadeBasePorEmbalagem: numeroNaoNegativo.nullable(),
    precoFornecedor: dinheiroOuNull,
    fornecedor1: texto(160),
    fornecedor2: texto(160),
    fornecedor3: texto(160),
    fornecedor4: texto(160),
    observacoes: texto(2_000),
    ativo: z.boolean(),
  })
  .strict();

export const produtosSchema = z.array(produtoSchema).min(1).max(500);

export const fornecedorSchema = z
  .object({
    codigo: identificador,
    razaoSocial: texto(200),
    nomeFantasia: textoObrigatorio(160),
    grupos: z.array(textoObrigatorio(30)).max(30),
    nomeVendedor: texto(160),
    whatsapp: texto(40),
    condicoesPagamento: texto(500),
    prazoBoleto: texto(100),
    limiteCredito: dinheiroOuNull,
    pedidoMinimo: dinheiroOuNull,
    diasEntrega: texto(200),
    observacoes: texto(2_000),
  })
  .strict();

export const fornecedorNovoSchema = fornecedorSchema.omit({ codigo: true });
export const fornecedoresSchema = z.array(fornecedorSchema).min(1).max(500);

export const registrarContagemSchema = z
  .object({
    linhas: z
      .array(
        z
          .object({
            sku: identificador,
            quantidade: numeroNaoNegativo,
            nomeAvulso: texto(160).optional(),
            unidadeAvulso: texto(30).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(1_000),
    dataISO: dataIsoSchema.optional(),
  })
  .strict();

export const atualizarQuantidadeContagemSchema = z
  .object({
    data: textoObrigatorio(10).refine(dataBrValida),
    sku: identificador,
    quantidade: numeroNaoNegativo,
  })
  .strict();

export const itemPedidoSchema = z
  .object({
    sku: identificador,
    nome: textoObrigatorio(160),
    nomeCompra: texto(160),
    unidadeBase: textoObrigatorio(30),
    quantidadePedida: numeroNaoNegativo,
    precoAntigo: dinheiroOuNull,
    precoAtualizado: dinheiroOuNull,
    precoConfirmado: z.boolean(),
  })
  .strict();

export const confirmarItemSchema = z
  .object({
    fornecedor: textoObrigatorio(160),
    dataContagemBase: dataContagemSchema,
    item: itemPedidoSchema,
    atualizarPreco: z.boolean(),
  })
  .strict();

export const confirmarVencedorSchema = z
  .object({
    dataContagemBase: dataContagemSchema,
    fornecedorVencedor: textoObrigatorio(160),
    outrosFornecedores: z.array(textoObrigatorio(160)).max(50),
    item: itemPedidoSchema,
  })
  .strict();

export const desfazerVencedorSchema = z
  .object({
    dataContagemBase: dataContagemSchema,
    fornecedorAtual: textoObrigatorio(160),
    outrosFornecedores: z.array(textoObrigatorio(160)).max(50),
    item: itemPedidoSchema.omit({ precoAtualizado: true, precoConfirmado: true }),
  })
  .strict();

export const previsaoEntregaSchema = z
  .object({
    fornecedor: textoObrigatorio(160),
    dataContagemBase: dataContagemSchema,
    previsaoEntrega: dataIsoSchema.nullable(),
  })
  .strict();

export const recebimentoSchema = z
  .object({
    pedidoId: z.string().uuid(),
    recebido: z.boolean(),
    observacaoEntrega: texto(2_000).nullable(),
    itensRecebidos: z
      .array(
        z
          .object({
            sku: identificador,
            quantidadeRecebida: numeroNaoNegativo.nullable(),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();

const valorConsolidado = z.number().finite().min(0).max(LIMITE_DINHEIRO);

export const consolidadoSchema = z
  .object({
    data: dataIsoSchema,
    confirmarDivergencia: z.boolean(),
    credito: valorConsolidado,
    debito: valorConsolidado,
    pix: valorConsolidado,
    dinheiro: valorConsolidado,
    valeAlimentacao: valorConsolidado,
    salao: valorConsolidado,
    deliveryProprio: valorConsolidado,
    ifood: valorConsolidado,
    food99: valorConsolidado,
  })
  .strict();

export const idUuidSchema = z.string().uuid();
export const nomeProdutoSchema = textoObrigatorio(160);
export const organizacaoIdSchema = identificador;
export const fornecedor1Schema = z
  .object({ sku: identificador, fornecedor1: textoObrigatorio(160) })
  .strict();

const numeroInteiroNaoNegativo = z.number().int().min(0).max(LIMITE_QUANTIDADE);
const quantidadePositiva = z.number().finite().min(0.0001).max(LIMITE_QUANTIDADE);
const unidadeUsoSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(20)
  .regex(/^[A-Z0-9]+$/, "Use letras maiusculas e numeros, sem espaco");

export const camadaFichaSchema = z.enum(["PRE", "VEN"]);
export const statusFichaSchema = z.enum(["rascunho", "ativa", "inativa"]);
export const rendimentoUnidadeFichaSchema = z.enum(["KG", "LT", "UN"]);

export const conversaoProdutoEntradaSchema = z
  .object({
    produtoSku: identificador,
    unidadeSaida: unidadeUsoSchema,
    fatorPorUnidadeBase: z.number().finite().min(0.0001).max(LIMITE_QUANTIDADE),
    descricao: texto(200),
  })
  .strict();

export const categoriaFichaEntradaSchema = z
  .object({
    camada: camadaFichaSchema,
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Use 3 letras, ex: BUR"),
    nome: textoObrigatorio(80),
  })
  .strict();

const componenteFichaBase = {
  quantidade: quantidadePositiva,
  unidadeUso: unidadeUsoSchema,
  ordem: numeroInteiroNaoNegativo,
  observacoes: texto(500),
};

/** Ou aponta pra um produto do Estoque ou pra outra ficha técnica usada como
 * sub-receita - nunca os dois, mesma regra do check constraint em
 * `ficha_componentes` na migração. */
export const componenteFichaEntradaSchema = z.discriminatedUnion("tipo", [
  z
    .object({ tipo: z.literal("produto"), produtoSku: identificador, fichaComponenteId: z.null(), ...componenteFichaBase })
    .strict(),
  z
    .object({ tipo: z.literal("ficha"), produtoSku: z.null(), fichaComponenteId: idUuidSchema, ...componenteFichaBase })
    .strict(),
]);

export const etapaFichaEntradaSchema = z
  .object({
    ordem: numeroInteiroNaoNegativo,
    descricao: textoObrigatorio(2_000),
  })
  .strict();

export const fichaTecnicaEntradaSchema = z
  .object({
    categoriaId: idUuidSchema,
    camada: camadaFichaSchema,
    nome: textoObrigatorio(160),
    rendimentoQuantidade: quantidadePositiva,
    rendimentoUnidade: rendimentoUnidadeFichaSchema,
    tempoPreparoMinutos: numeroInteiroNaoNegativo.nullable(),
    fotoPath: texto(500).nullable(),
    observacoesOperacionais: texto(2_000),
    observacoesGerenciais: texto(2_000),
    status: statusFichaSchema,
    componentes: z.array(componenteFichaEntradaSchema).max(200),
    etapas: z.array(etapaFichaEntradaSchema).max(200),
  })
  .strict();

export function validarEntrada<T>(schema: z.ZodType<T>, entrada: unknown): T {
  const resultado = schema.safeParse(entrada);
  if (resultado.success) return resultado.data;

  const campo = resultado.error.issues[0]?.path.join(".");
  throw new ErroPublico(campo ? `Campo invalido: ${campo}` : "Dados invalidos");
}
