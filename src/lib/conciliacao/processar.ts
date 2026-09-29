import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { detectarArquivo, sanitizarNomeArquivo } from "./arquivo";
import { lerOfx } from "./ofx";
import { lerCsv } from "./csv";
import { extrairTextoPdf } from "./pdf-texto";
import { lerPagSeguro } from "./pdf-pagseguro";
import { chamarIa } from "./ia-chamada";
import {
  ESQUEMA_CLASSIFICACAO,
  ESQUEMA_DOCUMENTO,
  montarPedidoClassificacao,
  SISTEMA_CLASSIFICACAO,
  SISTEMA_DOCUMENTO,
  validarSaidaClassificacao,
  validarSaidaDocumento,
  type ContaPermitida,
} from "./ia";
import { aplicarSugestoesIa, itensParaIa, montarConteudoRegistro, prepararMovimentos } from "./preparacao";
import { categoriaCompativel } from "./classificacao";
import { criarPrazo, MINIMO_CHAMADA_IA_MS, type Prazo } from "./prazo";
import type { ResultadoLeitura, TipoDocumento } from "./tipos";
import {
  baixarArquivo,
  carregarContextoMotor,
  criarImportacao,
  enviarArquivo,
  iniciarProcessamento,
  quarentenar,
  registrarResultado,
  registroUsoIa,
  type FlagsConciliacao,
  type ResultadoRegistro,
} from "@/lib/banco/conciliacao";
import type { AcessoAtual } from "@/lib/acesso";

// Orquestra: validar o arquivo -> registrar a importação (identidade pelo
// SHA) -> guardar o original no bucket privado -> ler (local primeiro; IA só
// quando a leitura local falha e a unidade autorizou) -> preparar sugestões
// -> registrar tudo numa transação atestada. Nenhum efeito financeiro.

export type ResultadoImportacao =
  | { tipo: "quarentena"; motivo: string }
  | { tipo: "duplicada"; canonica: string }
  | { tipo: "registrada"; importacaoId: string; resultado: ResultadoRegistro };

type Contexto = { acesso: AcessoAtual; flags: FlagsConciliacao };

export async function importarDocumento(
  ctx: Contexto,
  entrada: { bytes: Uint8Array; nomeOriginal: string; contaFinanceiraId: string; tipoDocumento: TipoDocumento },
): Promise<ResultadoImportacao> {
  // O prazo começa com o pedido: criar, guardar e ler cabem no maxDuration.
  const prazo = criarPrazo();
  const deteccao = detectarArquivo(entrada.bytes);
  const sha256 = createHash("sha256").update(entrada.bytes).digest("hex");
  const nome = sanitizarNomeArquivo(entrada.nomeOriginal);
  const criada = await criarImportacao(ctx.acesso.userId, {
    unidade: ctx.acesso.unidadeId,
    conta: entrada.contaFinanceiraId,
    tipoDocumento: entrada.tipoDocumento,
    formato: deteccao.ok ? deteccao.formato : "desconhecido",
    nome,
    tamanho: entrada.bytes.length,
    sha256,
    mime: deteccao.ok ? deteccao.mime : null,
    quarentenaMotivo: deteccao.ok ? null : deteccao.motivo,
    nonce: randomUUID(),
  });
  if (criada.situacao === "quarentena") return { tipo: "quarentena", motivo: criada.motivo };
  if (criada.situacao === "duplicada") return { tipo: "duplicada", canonica: criada.canonica };
  if (!deteccao.ok) throw new Error("conciliacao_estado_inconsistente");

  await enviarArquivo(criada.caminho, entrada.bytes, deteccao.mime);
  return processarImportacao(ctx, { importacaoId: criada.id, sha256, bytes: entrada.bytes, tipoDocumento: entrada.tipoDocumento, prazo });
}

/** Reprocessa uma importação presa (processamento interrompido há mais de
 * 10 minutos) lendo o original do bucket. */
export async function reprocessarImportacao(
  ctx: Contexto,
  importacao: { id: string; sha256: string; caminhoArquivo: string; tipoDocumento: TipoDocumento },
): Promise<ResultadoImportacao> {
  const prazo = criarPrazo();
  const bytes = await baixarArquivo(importacao.caminhoArquivo);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== importacao.sha256) throw new Error("conciliacao_arquivo_divergente");
  return processarImportacao(ctx, { importacaoId: importacao.id, sha256: sha, bytes, tipoDocumento: importacao.tipoDocumento, prazo });
}

async function processarImportacao(
  ctx: Contexto,
  p: { importacaoId: string; sha256: string; bytes: Uint8Array; tipoDocumento: TipoDocumento; prazo: Prazo },
): Promise<ResultadoImportacao> {
  const { tentativa, nonce } = await iniciarProcessamento(ctx.acesso.userId, p.importacaoId, p.sha256);
  // Orçamento único: PDF, IA e classificação usam o que sobra do prazo,
  // sempre com reserva para gravar o resultado dentro do maxDuration.
  const { prazo } = p;
  const deteccao = detectarArquivo(p.bytes);
  if (!deteccao.ok) {
    await quarentenar(ctx.acesso.userId, { importacao: p.importacaoId, tentativa, nonce, motivo: deteccao.motivo });
    return { tipo: "quarentena", motivo: deteccao.motivo };
  }

  const leitura = await lerConteudo(ctx, p.importacaoId, deteccao, p.bytes, p.tipoDocumento, prazo);
  if (!leitura.ok && leitura.quarentena) {
    await quarentenar(ctx.acesso.userId, { importacao: p.importacaoId, tentativa, nonce, motivo: leitura.codigo });
    return { tipo: "quarentena", motivo: leitura.codigo };
  }
  if (!leitura.ok) {
    const resultado = await registrarResultado(ctx.acesso.userId, {
      importacao: p.importacaoId,
      tentativa,
      nonce,
      versao_parser: "nenhum",
      versao_motor: null,
      fonte_extracao: null,
      erro_global: leitura.codigo,
      linhas: [],
    });
    return { tipo: "registrada", importacaoId: p.importacaoId, resultado };
  }

  const { categorias, regras } = await carregarContextoMotor(ctx.acesso.unidadeId, ctx.acesso.organizacaoId);
  let movimentos = prepararMovimentos(leitura, categorias, regras);
  if (ctx.flags.iaClassificacao) {
    movimentos = aplicarSugestoesIa(movimentos, await classificarComIa(ctx, p.importacaoId, movimentos, categorias, prazo), categorias);
  }
  const resultado = await registrarResultado(
    ctx.acesso.userId,
    montarConteudoRegistro({ importacao: p.importacaoId, tentativa, nonce, leitura, movimentos }),
  );
  return { tipo: "registrada", importacaoId: p.importacaoId, resultado };
}

async function lerConteudo(
  ctx: Contexto,
  importacaoId: string,
  deteccao: Extract<ReturnType<typeof detectarArquivo>, { ok: true }>,
  bytes: Uint8Array,
  tipoDocumento: TipoDocumento,
  prazo: Prazo,
): Promise<ResultadoLeitura> {
  if (deteccao.formato === "ofx") return lerOfx(deteccao.texto ?? "");
  if (deteccao.formato === "csv") return lerCsv(deteccao.texto ?? "");

  // PDF: leitura local primeiro. IA só se a local falhar (P1 de Vinícius).
  if (deteccao.formato === "pdf") {
    const texto = await extrairTextoPdf(bytes, prazo);
    if (!texto.ok) return { ok: false, codigo: texto.motivo, quarentena: true };
    const local = lerPagSeguro(texto.trechos);
    if (local) return local;
  }
  // Imagem não tem leitura local (sem OCR no servidor): é a falha da leitura local.
  if (!ctx.flags.iaDocumentos) {
    return { ok: false, codigo: deteccao.formato === "pdf" ? "pdf_layout_desconhecido" : "imagem_requer_ia", quarentena: false };
  }
  const base64 = Buffer.from(bytes).toString("base64");
  const bloco =
    deteccao.formato === "pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: deteccao.mime as "image/jpeg" | "image/png" | "image/webp", data: base64 },
        } as const);
  const resposta = await chamarIa({
    sistema: SISTEMA_DOCUMENTO,
    conteudo: [bloco, { type: "text", text: `Tipo de documento informado pelo usuário: ${tipoDocumento}. Transcreva seguindo as regras.` }],
    esquema: ESQUEMA_DOCUMENTO as unknown as Record<string, unknown>,
    maxTokens: 32_000,
    tempoMaximoMs: 75_000,
    prazo,
    registro: registroUsoIa({ usuarioId: ctx.acesso.userId, unidadeId: ctx.acesso.unidadeId, importacaoId, finalidade: "extracao_documento" }),
  });
  if (!resposta.ok) return { ok: false, codigo: resposta.codigo, quarentena: false };
  return validarSaidaDocumento(resposta.texto, tipoDocumento);
}

const LOTE_CLASSIFICACAO = 100;

async function classificarComIa(
  ctx: Contexto,
  importacaoId: string,
  movimentos: ReturnType<typeof prepararMovimentos>,
  categorias: Awaited<ReturnType<typeof carregarContextoMotor>>["categorias"],
  prazo: Prazo,
) {
  const itens = itensParaIa(movimentos);
  const resultado = new Map<number, { contaId: string; confianca: "media" | "baixa" }>();
  if (itens.length === 0) return resultado;
  const contas: ContaPermitida[] = [];
  for (const c of categorias) {
    if (categoriaCompativel(c, "entrada")) contas.push({ id: c.id, caminho: c.caminho, direcao: "entrada" });
    else if (categoriaCompativel(c, "saida")) contas.push({ id: c.id, caminho: c.caminho, direcao: "saida" });
  }
  for (let i = 0; i < itens.length; i += LOTE_CLASSIFICACAO) {
    // Classificação é opcional: sem orçamento, o resto fica "sem evidência".
    if (prazo.restante() < MINIMO_CHAMADA_IA_MS) break;
    const lote = itens.slice(i, i + LOTE_CLASSIFICACAO);
    const { texto, codigos } = montarPedidoClassificacao(lote, contas);
    const resposta = await chamarIa({
      sistema: SISTEMA_CLASSIFICACAO,
      conteudo: [{ type: "text", text: texto }],
      esquema: ESQUEMA_CLASSIFICACAO as unknown as Record<string, unknown>,
      maxTokens: 8_000,
      tempoMaximoMs: 40_000,
      prazo,
      registro: registroUsoIa({ usuarioId: ctx.acesso.userId, unidadeId: ctx.acesso.unidadeId, importacaoId, finalidade: "classificacao" }),
    });
    if (!resposta.ok) continue; // sem sugestão de IA: o item fica "sem evidência"
    const validas = validarSaidaClassificacao(resposta.texto, lote, codigos);
    for (const [k, v] of validas ?? []) resultado.set(k, v);
  }
  return resultado;
}
