import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ErroPublico } from "@/lib/erros";
import { chamarIa, MODELO_IA_CONCILIACAO, VERSAO_TABELA_PRECOS, type RegistroUsoIa } from "@/lib/conciliacao/ia-chamada";
import { criarPrazo } from "@/lib/conciliacao/prazo";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import {
  codigosDosItens,
  ESQUEMA_CAIXA,
  ESQUEMA_ITENS,
  extracaoDaIa,
  sugerirDocumento,
  SISTEMA_CAIXA_ENTRADA,
  SISTEMA_ITENS,
  type ExtracaoDocumento,
} from "./extracao";
import { lerNfeXml, pareceNfeXml } from "./nfe-xml";

// Caixa de Entrada (Financeiro V2, 11/10/2026): guardar o arquivo e ler. Usa o service role SÓ para
// isso (o bucket é privado e a entrada pode vir do Vini, sem sessão). Nunca lança nem baixa nada:
// quem lança é uma pessoa, pela RPC `fin_caixa_entrada_lancar` com a sessão dela.

export const BUCKET_CAIXA_ENTRADA = "fin-caixa-entrada";
export const TAMANHO_MAXIMO_CAIXA = 10 * 1024 * 1024;

export type MimeCaixa = "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "application/xml";

/** Tipo real pelo conteúdo (assinatura), nunca pelo nome ou pelo que o remetente declarou. */
export function detectarMime(bytes: Uint8Array): MimeCaixa | null {
  const b = bytes;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "application/pdf";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  const inicio = new TextDecoder("utf-8", { fatal: false }).decode(b.slice(0, 4096)).replace(/^﻿/, "").trimStart();
  if (inicio.startsWith("<") && pareceNfeXml(new TextDecoder("utf-8", { fatal: false }).decode(b))) return "application/xml";
  return null;
}

export type Recebimento = { id: string; novo: boolean; situacao: string; unidadeNome?: string };

/** Guarda o arquivo e registra a entrada (mesmo arquivo na mesma unidade reaproveita a entrada). */
export async function receberArquivo(params: {
  unidadeId: string;
  canal: "upload" | "whatsapp" | "drive";
  remetente: string | null;
  nomeArquivo: string;
  bytes: Uint8Array;
  criadoPor: string | null;
}): Promise<Recebimento> {
  if (params.bytes.length === 0 || params.bytes.length > TAMANHO_MAXIMO_CAIXA) {
    throw new ErroPublico("Arquivo vazio ou maior que 10 MB.");
  }
  const mime = detectarMime(params.bytes);
  if (!mime) throw new ErroPublico("Formato não aceito. Envie PDF, foto (JPG, PNG ou WEBP) ou o XML da nota.");
  // XML de NF-e real tem poucas centenas de KB; acima de 1 MB a leitura por texto fica cara demais.
  if (mime === "application/xml" && params.bytes.length > 1024 * 1024) throw new ErroPublico("XML maior que 1 MB não parece uma NF-e.");
  const sha256 = createHash("sha256").update(params.bytes).digest("hex");
  const admin = createAdminClient();
  const nome = params.nomeArquivo.replace(/[\u0000-\u001f\u007f/\\]/g, " ").trim().slice(0, 160) || "documento";
  const { data, error } = await admin.rpc("fin_caixa_entrada_registrar", {
    p_unidade: params.unidadeId,
    p_canal: params.canal,
    p_remetente: params.remetente,
    p_nome: nome,
    p_mime: mime,
    p_tamanho: params.bytes.length,
    p_sha256: sha256,
    p_criado_por: params.criadoPor,
  });
  if (error?.message?.includes("Limite diario")) {
    throw new ErroPublico("Esta unidade já recebeu 80 documentos nas últimas 24 horas. Tente de novo amanhã ou fale com a Zatti.");
  }
  if (error || !data) {
    console.error("caixa_entrada_registro_falhou", { codigo: error?.code ?? null });
    throw new Error("caixa_entrada_registro_falhou");
  }
  const r = data as { id: string; novo: boolean; caminho: string; arquivo_gravado: boolean; situacao: string };
  if (!r.arquivo_gravado) {
    const envio = await admin.storage.from(BUCKET_CAIXA_ENTRADA).upload(r.caminho, params.bytes, { contentType: mime, upsert: true });
    if (envio.error) {
      console.error("caixa_entrada_upload_falhou", { mensagem: envio.error.message });
      throw new Error("caixa_entrada_upload_falhou");
    }
    const { error: erroMarca } = await admin
      .from("fin_caixa_entrada")
      .update({ arquivo_gravado: true, atualizado_em: new Date().toISOString() })
      .eq("id", r.id);
    if (erroMarca) throw new Error("caixa_entrada_marca_falhou");
  }
  return { id: r.id, novo: r.novo, situacao: r.situacao };
}

function registroIa(unidadeId: string, criadoPor: string | null): RegistroUsoIa {
  const admin = createAdminClient();
  return {
    iniciar: async (chave) => {
      const { error } = await admin.from("fin_ia_chamadas").insert({
        unidade_id: unidadeId,
        chave_idempotencia: chave,
        finalidade: "caixa_entrada",
        modelo: MODELO_IA_CONCILIACAO,
        tabela_precos_versao: VERSAO_TABELA_PRECOS,
        situacao: "iniciada",
        criado_por: criadoPor,
      });
      if (error) throw new Error("caixa_entrada_ia_registro");
    },
    finalizar: async (chave, d) => {
      await admin
        .from("fin_ia_chamadas")
        .update({
          situacao: d.situacao,
          resultado_codigo: d.resultadoCodigo,
          tokens_entrada: d.tokensEntrada,
          tokens_saida: d.tokensSaida,
          tokens_cache_leitura: d.tokensCacheLeitura,
          tokens_cache_escrita: d.tokensCacheEscrita,
          custo_estimado_usd: d.custoUsd,
          finalizada_em: new Date().toISOString(),
        })
        .eq("chave_idempotencia", chave);
    },
  };
}

type ContaPlano = { id: string; nome: string; caminho: string; papelDre: string };

async function contasDeDespesa(unidadeId: string): Promise<ContaPlano[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("fin_categorias")
    .select("id, parent_id, nome, nivel, papel_dre, arquivado")
    .eq("unidade_id", unidadeId)
    .limit(1000);
  type Row = { id: string; parent_id: string | null; nome: string; nivel: string; papel_dre: string | null; arquivado: boolean };
  const linhas = (data as Row[] | null) ?? [];
  const porId = new Map(linhas.map((c) => [c.id, c]));
  const caminho = (c: Row) => {
    const partes: string[] = [];
    for (let a: Row | undefined = c; a && partes.length < 6; a = a.parent_id ? porId.get(a.parent_id) : undefined) partes.unshift(a.nome);
    return partes.join(" > ");
  };
  const provisao = new Set(["cmo_ferias", "cmo_decimo_terceiro", "cmo_multa_fgts", "receita"]);
  return linhas
    .filter((c) => c.nivel === "conta" && !c.arquivado && c.papel_dre && !provisao.has(c.papel_dre))
    .map((c) => ({ id: c.id, nome: c.nome, caminho: caminho(c), papelDre: c.papel_dre as string }));
}

/** Lê a entrada (XML sem IA; PDF/foto com IA) e grava extração e sugestão. Nunca lança. */
export async function lerEntrada(entradaId: string, criadoPor: string | null): Promise<"lido" | "falhou" | "ocupado"> {
  const admin = createAdminClient();
  const { data: travou } = await admin.rpc("fin_caixa_entrada_travar_leitura", { p_id: entradaId });
  if (!travou) return "ocupado";
  // Toda gravação da leitura só vale se a entrada continua nesta mesma trava (achado da revisão:
  // sem isso, a leitura desfazia um Anexar feito enquanto lia).
  const lendoDesde = travou as string;
  try {
    return await lerTravada(entradaId, criadoPor, lendoDesde);
  } catch (erro) {
    console.error("caixa_entrada_leitura_falhou", { mensagem: erro instanceof Error ? erro.message.slice(0, 80) : "desconhecido" });
    await admin
      .from("fin_caixa_entrada")
      .update({ situacao: "falhou", erro_codigo: "erro_interno", atualizado_em: new Date().toISOString() })
      .eq("id", entradaId)
      .eq("situacao", "lendo")
      .eq("lendo_desde", lendoDesde);
    return "falhou";
  }
}

async function lerTravada(entradaId: string, criadoPor: string | null, lendoDesde: string): Promise<"lido" | "falhou"> {
  const admin = createAdminClient();
  const { data: ent } = await admin
    .from("fin_caixa_entrada")
    .select("id, unidade_id, mime, caminho_arquivo")
    .eq("id", entradaId)
    .single();
  if (!ent) throw new Error("entrada_sumiu");
  const entrada = ent as { id: string; unidade_id: string; mime: MimeCaixa | "text/xml"; caminho_arquivo: string };

  const falhar = async (codigo: string) => {
    await admin
      .from("fin_caixa_entrada")
      .update({ situacao: "falhou", erro_codigo: codigo, atualizado_em: new Date().toISOString() })
      .eq("id", entradaId)
      .eq("situacao", "lendo")
      .eq("lendo_desde", lendoDesde);
    return "falhou" as const;
  };

  const arquivo = await admin.storage.from(BUCKET_CAIXA_ENTRADA).download(entrada.caminho_arquivo);
  if (arquivo.error || !arquivo.data) return falhar("arquivo_indisponivel");
  const bytes = new Uint8Array(await arquivo.data.arrayBuffer());

  const contas = await contasDeDespesa(entrada.unidade_id);
  const codigoPorId = new Map(contas.map((c, i) => [c.id, `c${i + 1}`]));
  const idPorCodigo = new Map(contas.map((c, i) => [`c${i + 1}`, c.id]));
  const codigos = new Set(idPorCodigo.keys());
  const listaPlano = contas.map((c) => `${codigoPorId.get(c.id)}: ${c.caminho}`).join("\n");
  const prazo = criarPrazo();
  const registro = registroIa(entrada.unidade_id, criadoPor);

  let extracao: ExtracaoDocumento | null = null;
  if (entrada.mime === "application/xml" || entrada.mime === "text/xml") {
    extracao = lerNfeXml(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
    if (!extracao) return falhar("xml_nao_e_nfe");
    if (extracao.itens.length > 0 && extracao.itens.length <= 300 && process.env.ANTHROPIC_API_KEY) {
      const r = await chamarIa({
        sistema: SISTEMA_ITENS,
        conteudo: [{ type: "text", text: `Plano de Contas:\n${listaPlano}\n\nItens (um por linha):\n${extracao.itens.map((i) => i.descricao).join("\n")}` }],
        esquema: ESQUEMA_ITENS,
        maxTokens: 4000,
        registro,
        tempoMaximoMs: 60_000,
        prazo,
      });
      const cods = r.ok ? codigosDosItens(r.texto, extracao.itens.length, codigos) : null;
      if (cods) extracao.itens = extracao.itens.map((i, k) => ({ ...i, planoContasCodigo: cods[k] }));
    }
  } else {
    const base64 = Buffer.from(bytes).toString("base64");
    const bloco =
      entrada.mime === "application/pdf"
        ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } as const)
        : ({ type: "image", source: { type: "base64", media_type: entrada.mime as "image/jpeg" | "image/png" | "image/webp", data: base64 } } as const);
    const r = await chamarIa({
      sistema: SISTEMA_CAIXA_ENTRADA,
      conteudo: [bloco, { type: "text", text: `Plano de Contas (use só estes códigos):\n${listaPlano}` }],
      esquema: ESQUEMA_CAIXA,
      maxTokens: 8000,
      registro,
      tempoMaximoMs: 80_000,
      prazo,
    });
    if (!r.ok) return falhar(r.codigo);
    extracao = extracaoDaIa(r.texto, codigos);
    if (!extracao) return falhar("ia_formato_invalido");
  }

  // Códigos curtos -> ids do Plano de Contas da unidade.
  extracao.itens = extracao.itens.map((i) => ({ ...i, planoContasCodigo: i.planoContasCodigo ? (idPorCodigo.get(i.planoContasCodigo) ?? null) : null }));
  const sugestao = sugerirDocumento(extracao, hojeIsoBrasil());
  let contraparteId: string | null = null;
  if (extracao.contraparteDocumento) {
    const { data: cp } = await admin
      .from("fin_contrapartes")
      .select("id")
      .eq("unidade_id", entrada.unidade_id)
      .eq("documento", extracao.contraparteDocumento)
      .maybeSingle();
    contraparteId = (cp as { id: string } | null)?.id ?? null;
  }
  await admin
    .from("fin_caixa_entrada")
    .update({
      situacao: "lido",
      erro_codigo: null,
      extracao: { ...extracao, sugestao, contraparteId },
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", entradaId)
    .eq("situacao", "lendo")
    .eq("lendo_desde", lendoDesde);
  return "lido";
}
