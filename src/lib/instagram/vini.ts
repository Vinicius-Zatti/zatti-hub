import "server-only";
import { lerRespostaInstagram } from "@/lib/instagram/validacao";
import type { EntradaAutomacaoInstagram, EntradaPalavraInstagram } from "@/lib/instagram/validacao";
import type { LeituraInstagram } from "@/lib/instagram/tipos";

/** Cliente do painel do Instagram no Vini (Railway). Mesmo desenho de
 * `lib/operacao/vini.ts`: `VINI_URL` só HTTPS, token no cabeçalho
 * `x-envio-token` (ZATTI_HUB_OPERACAO_TOKEN), sem cache, sem seguir
 * redirecionamento e com tempo limite. Nunca loga corpo nem token. */

const TEMPO_LIMITE_MS = 10_000;

export const AVISO_VINI_FORA =
  "Não consegui falar com o Vini agora. Os números voltam assim que ele responder; os Directs automáticos continuam funcionando normalmente.";
const AVISO_RECUSA_CONFIG = "Não consegui falar com o Vini agora. Nada foi alterado; tente de novo em instantes.";
const AVISO_SEM_RESPOSTA =
  "O Vini não respondeu a tempo. Recarregue a página antes de tentar de novo: a mudança pode já ter sido feita.";

/** `lidoEm`: instante da leitura, para a tela saber se a pausa da Meta ainda vale. */
export type LeituraVini = { ok: true; dados: LeituraInstagram; ignorados: number; lidoEm: number } | { ok: false; mensagem: string };
export type EscritaVini = { ok: true } | { ok: false; mensagem: string };

class ErroConfiguracao extends Error {}

function configuracao(): { base: string; token: string } | null {
  const url = process.env.VINI_URL?.trim();
  const token = process.env.ZATTI_HUB_OPERACAO_TOKEN?.trim();
  if (!url || !token) {
    console.error("[instagram] VINI_URL ou ZATTI_HUB_OPERACAO_TOKEN ausente");
    return null;
  }
  if (!url.startsWith("https://")) {
    console.error("[instagram] VINI_URL precisa ser HTTPS");
    return null;
  }
  return { base: url.replace(/\/+$/, ""), token };
}

async function chamar(caminho: string, corpo?: unknown): Promise<Response> {
  const cfg = configuracao();
  if (!cfg) throw new ErroConfiguracao();
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  const post = corpo !== undefined;
  try {
    return await fetch(`${cfg.base}${caminho}`, {
      method: post ? "POST" : "GET",
      headers: {
        accept: "application/json",
        "x-envio-token": cfg.token,
        ...(post ? { "content-type": "application/json" } : {}),
      },
      body: post ? JSON.stringify(corpo) : undefined,
      signal: controle.signal,
      cache: "no-store",
      redirect: "manual",
    });
  } finally {
    clearTimeout(relogio);
  }
}

export async function lerInstagram(): Promise<LeituraVini> {
  try {
    const resposta = await chamar("/zatti-hub/instagram");
    if (!resposta.ok) {
      console.error(`[instagram] Vini respondeu ${resposta.status} à leitura`);
      return { ok: false, mensagem: AVISO_VINI_FORA };
    }
    const lido = lerRespostaInstagram(await resposta.json());
    if (!lido) {
      console.error("[instagram] resposta do Vini fora do contrato");
      return { ok: false, mensagem: AVISO_VINI_FORA };
    }
    const { ignorados, ...dados } = lido;
    if (ignorados > 0) console.error(`[instagram] ${ignorados} registro(s) fora do contrato ficaram de fora`);
    return { ok: true, dados, ignorados, lidoEm: Date.now() };
  } catch (erro) {
    if (!(erro instanceof ErroConfiguracao)) console.error(`[instagram] leitura sem resposta: ${(erro as Error).name}`);
    return { ok: false, mensagem: AVISO_VINI_FORA };
  }
}

async function escrever(caminho: string, corpo: unknown): Promise<EscritaVini> {
  let resposta: Response;
  try {
    resposta = await chamar(caminho, corpo);
  } catch (erro) {
    if (erro instanceof ErroConfiguracao) return { ok: false, mensagem: AVISO_RECUSA_CONFIG };
    // Tempo esgotado ou rede: pode ter sido feito. Nunca repetir sozinho.
    console.error(`[instagram] escrita sem resposta: ${(erro as Error).name}`);
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
  // Recusa do Vini com motivo em português (mostrável, pelo contrato: 404, 409...).
  if (corpoOk?.ok === false && typeof corpoOk.erro === "string" && corpoOk.erro.trim()) {
    return { ok: false, mensagem: corpoOk.erro.slice(0, 300) };
  }
  console.error(`[instagram] Vini respondeu ${resposta.status} à escrita`);
  if (resposta.status === 401 || resposta.status === 503) return { ok: false, mensagem: AVISO_RECUSA_CONFIG };
  if (resposta.status === 409) return { ok: false, mensagem: "Esse post já tem um Direct automático." };
  if (resposta.status === 404) return { ok: false, mensagem: "O Vini não encontrou esse post. Recarregue a página." };
  if (resposta.status >= 500) return { ok: false, mensagem: AVISO_SEM_RESPOSTA };
  return { ok: false, mensagem: "O Vini recusou o pedido. Recarregue a página e tente de novo." };
}

export function enviarPalavraInstagram(entrada: EntradaPalavraInstagram): Promise<EscritaVini> {
  return escrever("/zatti-hub/instagram/palavra", entrada);
}

export function enviarAutomacaoInstagram(entrada: EntradaAutomacaoInstagram): Promise<EscritaVini> {
  return escrever("/zatti-hub/instagram/automacao", entrada);
}
