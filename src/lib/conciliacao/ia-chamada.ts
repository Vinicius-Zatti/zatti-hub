import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { custoEstimadoUsd, MODELO_IA_CONCILIACAO, VERSAO_TABELA_PRECOS } from "./ia-custo";
import { MINIMO_CHAMADA_IA_MS, type Prazo } from "./prazo";

// Chamada de rede à Anthropic, sempre com registro de uso: a chamada é
// gravada ANTES (situação "iniciada") e finalizada DEPOIS com tokens e custo.
// Tempo esgotado ou erro de rede vira "consumo_desconhecido" (pode ter sido
// cobrado). Sem novas tentativas automáticas do SDK, para o custo gravado
// ser o custo real de uma chamada.

export type RegistroUsoIa = {
  iniciar: (chave: string) => Promise<void>;
  finalizar: (chave: string, dados: FinalizacaoIa) => Promise<void>;
};

export type FinalizacaoIa = {
  situacao: "concluida" | "erro" | "consumo_desconhecido";
  resultadoCodigo: string;
  tokensEntrada: number | null;
  tokensSaida: number | null;
  tokensCacheLeitura: number | null;
  tokensCacheEscrita: number | null;
  custoUsd: number | null;
};

export type RespostaIa = { ok: true; texto: string; stopReason: string | null } | { ok: false; codigo: string };

type Conteudo = Anthropic.Messages.ContentBlockParam[];

export async function chamarIa(params: {
  sistema: string;
  conteudo: Conteudo;
  esquema: Record<string, unknown>;
  maxTokens: number;
  registro: RegistroUsoIa;
  /** Teto desta chamada; o efetivo é o menor entre ele e o que sobra do prazo. */
  tempoMaximoMs: number;
  prazo: Prazo;
}): Promise<RespostaIa> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, codigo: "ia_sem_chave" };
  const limite = Math.min(params.tempoMaximoMs, params.prazo.restante());
  // Sem tempo para uma chamada completa: nem começa (nada cobrado).
  if (limite < MINIMO_CHAMADA_IA_MS) return { ok: false, codigo: "prazo_insuficiente" };
  const cliente = new Anthropic({ apiKey, maxRetries: 0, timeout: limite });
  const sinal = AbortSignal.any([params.prazo.sinal, AbortSignal.timeout(limite)]);
  const chave = randomUUID();
  await params.registro.iniciar(chave);

  let mensagem: Anthropic.Messages.Message;
  try {
    mensagem = await cliente.messages
      .stream({
        model: MODELO_IA_CONCILIACAO,
        max_tokens: params.maxTokens,
        system: params.sistema,
        output_config: { format: { type: "json_schema", schema: params.esquema } },
        messages: [{ role: "user", content: params.conteudo }],
      }, { signal: sinal, timeout: limite })
      .finalMessage();
  } catch (erro) {
    // 4xx de validação não gera cobrança; o resto (tempo, rede, 5xx) pode ter gerado.
    const status = erro instanceof Anthropic.APIError ? erro.status : undefined;
    const semCusto = typeof status === "number" && status >= 400 && status < 500 && status !== 408;
    await params.registro.finalizar(chave, {
      situacao: semCusto ? "erro" : "consumo_desconhecido",
      resultadoCodigo: semCusto ? "ia_erro_requisicao" : "ia_sem_resposta",
      tokensEntrada: null,
      tokensSaida: null,
      tokensCacheLeitura: null,
      tokensCacheEscrita: null,
      custoUsd: null,
    });
    // Log técnico só com código: nada do documento.
    console.error("conciliacao_ia_falhou", { status: status ?? null });
    return { ok: false, codigo: semCusto ? "ia_erro_requisicao" : "ia_sem_resposta" };
  }

  const uso = mensagem.usage;
  const tokens = {
    entrada: uso.input_tokens,
    saida: uso.output_tokens,
    cacheEscrita: uso.cache_creation_input_tokens ?? 0,
    cacheLeitura: uso.cache_read_input_tokens ?? 0,
  };
  const texto = mensagem.content.find((b) => b.type === "text");
  const codigo =
    mensagem.stop_reason === "max_tokens"
      ? "ia_truncada"
      : mensagem.stop_reason === "refusal"
        ? "ia_recusou"
        : !texto
          ? "ia_sem_texto"
          : "ok";
  await params.registro.finalizar(chave, {
    situacao: "concluida",
    resultadoCodigo: codigo,
    tokensEntrada: tokens.entrada,
    tokensSaida: tokens.saida,
    tokensCacheLeitura: tokens.cacheLeitura,
    tokensCacheEscrita: tokens.cacheEscrita,
    custoUsd: custoEstimadoUsd(MODELO_IA_CONCILIACAO, tokens),
  });
  if (codigo !== "ok" || !texto || texto.type !== "text") return { ok: false, codigo };
  return { ok: true, texto: texto.text, stopReason: mensagem.stop_reason };
}

export { VERSAO_TABELA_PRECOS, MODELO_IA_CONCILIACAO };
