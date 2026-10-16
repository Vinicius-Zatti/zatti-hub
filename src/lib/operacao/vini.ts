import "server-only";
import { lerRespostaOperacao } from "@/lib/operacao/validacao";
import type { EntradaAcaoOperacao, EntradaTarefaOperacao } from "@/lib/operacao/validacao";
import type { LeituraOperacao } from "@/lib/operacao/tipos";

/** Cliente do painel de operação no Vini (Railway). Mesmo desenho de
 * `lib/equipe/envio.ts`: `VINI_URL` só HTTPS, token próprio no cabeçalho
 * `x-envio-token` (ZATTI_HUB_OPERACAO_TOKEN), sem cache, sem seguir
 * redirecionamento e com tempo limite. Nunca loga corpo nem token. */

const TEMPO_LIMITE_MS = 10_000;

export const AVISO_VINI_FORA =
  "Não consegui falar com o Vini agora. O quadro volta assim que ele responder; nada se perdeu e tudo continua valendo pelo WhatsApp.";
const AVISO_RECUSA_CONFIG = "Não consegui falar com o Vini agora. Nada foi alterado; tente de novo em instantes.";
const AVISO_SEM_RESPOSTA =
  "O Vini não respondeu a tempo. Confira o quadro antes de tentar de novo: a ação pode já ter sido feita.";

export type LeituraVini = { ok: true; dados: LeituraOperacao; ignorados: number } | { ok: false; mensagem: string };
export type EscritaVini = { ok: true } | { ok: false; mensagem: string };

function configuracao(): { base: string; token: string } | null {
  // trim: valor colado com quebra de linha no painel vira header inválido.
  const url = process.env.VINI_URL?.trim();
  const token = process.env.ZATTI_HUB_OPERACAO_TOKEN?.trim();
  if (!url || !token) {
    console.error("[operacao] VINI_URL ou ZATTI_HUB_OPERACAO_TOKEN ausente");
    return null;
  }
  if (!url.startsWith("https://")) {
    console.error("[operacao] VINI_URL precisa ser HTTPS");
    return null;
  }
  return { base: url.replace(/\/+$/, ""), token };
}

async function chamar(caminho: string, init: { method: "GET" } | { method: "POST"; corpo: unknown }): Promise<Response> {
  const cfg = configuracao();
  if (!cfg) throw new ErroConfiguracao();
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    return await fetch(`${cfg.base}${caminho}`, {
      method: init.method,
      headers: {
        accept: "application/json",
        "x-envio-token": cfg.token,
        ...(init.method === "POST" ? { "content-type": "application/json" } : {}),
      },
      body: init.method === "POST" ? JSON.stringify(init.corpo) : undefined,
      signal: controle.signal,
      cache: "no-store",
      redirect: "manual",
    });
  } finally {
    clearTimeout(relogio);
  }
}

class ErroConfiguracao extends Error {}

export async function lerOperacao(): Promise<LeituraVini> {
  try {
    const resposta = await chamar("/zatti-hub/operacao", { method: "GET" });
    if (!resposta.ok) {
      console.error(`[operacao] Vini respondeu ${resposta.status} à leitura`);
      return { ok: false, mensagem: AVISO_VINI_FORA };
    }
    const lido = lerRespostaOperacao(await resposta.json());
    if (!lido) {
      console.error("[operacao] resposta do Vini fora do contrato");
      return { ok: false, mensagem: AVISO_VINI_FORA };
    }
    const { ignorados, ...dados } = lido;
    if (ignorados > 0) console.error(`[operacao] ${ignorados} registro(s) fora do contrato ficaram de fora`);
    return { ok: true, dados, ignorados };
  } catch (erro) {
    if (!(erro instanceof ErroConfiguracao)) console.error(`[operacao] leitura sem resposta: ${(erro as Error).name}`);
    return { ok: false, mensagem: AVISO_VINI_FORA };
  }
}

async function escrever(caminho: string, corpo: unknown): Promise<EscritaVini> {
  let resposta: Response;
  try {
    resposta = await chamar(caminho, { method: "POST", corpo });
  } catch (erro) {
    if (erro instanceof ErroConfiguracao) return { ok: false, mensagem: AVISO_RECUSA_CONFIG };
    // Tempo esgotado ou rede: pode ter sido feito. Nunca repetir sozinho.
    console.error(`[operacao] escrita sem resposta: ${(erro as Error).name}`);
    return { ok: false, mensagem: AVISO_SEM_RESPOSTA };
  }
  let json: unknown = null;
  try {
    json = await resposta.json();
  } catch {
    json = null;
  }
  const corpoOk = typeof json === "object" && json !== null ? (json as { ok?: unknown; erro?: unknown }) : null;
  if (resposta.ok && corpoOk?.ok === true) return { ok: true };
  // Recusa do Vini com motivo em português (mostrável, pelo contrato).
  if (corpoOk?.ok === false && typeof corpoOk.erro === "string" && corpoOk.erro.trim()) {
    return { ok: false, mensagem: corpoOk.erro.slice(0, 300) };
  }
  console.error(`[operacao] Vini respondeu ${resposta.status} à escrita`);
  // 401/503 = token ou segredo: o Vini recusou antes de mexer em qualquer coisa.
  if (resposta.status === 401 || resposta.status === 503) return { ok: false, mensagem: AVISO_RECUSA_CONFIG };
  if (resposta.status >= 500)return { ok: false, mensagem: AVISO_SEM_RESPOSTA };
  return { ok: false, mensagem: "O Vini recusou o pedido. Recarregue a página e tente de novo." };
}

export function enviarAcaoOperacao(entrada: EntradaAcaoOperacao): Promise<EscritaVini> {
  return escrever("/zatti-hub/operacao/acao", entrada);
}

export function enviarEstadoTarefa(entrada: EntradaTarefaOperacao): Promise<EscritaVini> {
  return escrever("/zatti-hub/operacao/tarefa", entrada);
}
