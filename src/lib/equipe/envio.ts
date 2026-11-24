import "server-only";

/** Pede ao Vini (Railway) que mande o acesso da pessoa pelo WhatsApp de
 * Vinícius. A rota do Vini só aceita este formato e monta o texto ela
 * mesma, para não virar disparo genérico; token próprio, só para ela.
 * Nunca loga o corpo (leva a senha temporária). */

export type TipoEnvioAcesso = "conta_nova" | "conta_existente";

export type ResultadoEnvio = "aceito" | "falhou" | "incerto";

/** Por qual número o acesso sai (18/11/2026). "hub" = chip do Zatti Hub, para a equipe que o
 * cliente cadastra. "vinicius" = WhatsApp de Vinícius, para titular e comprador do app, que são
 * clientes diretos dele. Sem o campo, o Vini usa "hub". */
export type RemetenteAcesso = "hub" | "vinicius";

const TEMPO_LIMITE_MS = 15_000;

/** Esperas entre tentativas quando o Vini está trocando de versão (24/11/2026). Em 24/11 11h43 o
 * acesso da Scheila (The House) caiu no deploy do Vini: o processo velho recusou com 503
 * "reiniciando" e a tela mostrou "incerto", sem nada ter saído. */
const ESPERAS_REINICIO_MS = [2_000, 5_000, 8_000];

export const _deps = {
  esperar: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

/** 503 do middleware de encerramento do Vini (`src/core/processo.js`, `middlewareEncerramento`):
 * ele roda antes de qualquer rota, então o pedido certamente não foi processado e repetir com a
 * mesma chave é seguro. Qualquer outro 5xx segue "incerto" (pode ter saído). */
async function viniReiniciando(resposta: Response): Promise<boolean> {
  if (resposta.status !== 503) return false;
  try {
    const corpo = (await resposta.json()) as { error?: unknown };
    return typeof corpo?.error === "string" && corpo.error.includes("reiniciando");
  } catch {
    return false;
  }
}

export async function enviarAcessoPeloVini(dados: {
  tipo: TipoEnvioAcesso;
  idempotencia: string;
  whatsapp: string;
  nome: string;
  email: string;
  organizacaoNome: string;
  senhaTemporaria?: string;
  validaAte?: Date;
  remetente?: RemetenteAcesso;
}): Promise<ResultadoEnvio> {
  // trim: valor colado com quebra de linha no painel vira header inválido.
  const url = process.env.VINI_URL?.trim();
  const token = process.env.ZATTI_HUB_ENVIO_TOKEN?.trim();
  if (!url || !token) {
    console.error("[equipe] VINI_URL ou ZATTI_HUB_ENVIO_TOKEN ausente: acesso não enviado");
    return "falhou";
  }
  // O corpo leva a senha provisória: só HTTPS, sem seguir redirecionamento.
  if (!url.startsWith("https://")) {
    console.error("[equipe] VINI_URL precisa ser HTTPS: acesso não enviado");
    return "falhou";
  }

  const corpo = JSON.stringify({
    tipo: dados.tipo,
    idempotencia: dados.idempotencia,
    phone: dados.whatsapp,
    nome: dados.nome,
    email: dados.email,
    organizacao: dados.organizacaoNome,
    senha: dados.senhaTemporaria,
    validaAte: dados.validaAte?.toISOString(),
    remetente: dados.remetente ?? "hub",
  });

  for (let tentativa = 0; ; tentativa++) {
    const resultado = await tentarEnvio(url, token, corpo);
    if (resultado !== "reiniciando") return resultado;
    const espera = ESPERAS_REINICIO_MS[tentativa];
    if (espera === undefined) {
      // Nada saiu em nenhuma tentativa: "falhou" deixa a gestão reenviar sem medo de duplicar.
      console.error("[equipe] Vini seguiu reiniciando: acesso não enviado");
      return "falhou";
    }
    console.warn(`[equipe] Vini reiniciando, nova tentativa em ${espera / 1000}s`);
    await _deps.esperar(espera);
  }
}

async function tentarEnvio(
  url: string,
  token: string,
  corpo: string,
): Promise<ResultadoEnvio | "reiniciando"> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const resposta = await fetch(`${url.replace(/\/+$/, "")}/zatti-hub/acesso-equipe`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-envio-token": token },
      body: corpo,
      signal: controle.signal,
      cache: "no-store",
      redirect: "manual",
    });
    if (resposta.ok) return "aceito";
    if (await viniReiniciando(resposta)) return "reiniciando";
    // 3xx/4xx = recusado antes de sair; 5xx pode ter saído ou não (409 =
    // o mesmo pedido ainda em andamento no Vini).
    console.error(`[equipe] Vini respondeu ${resposta.status} ao envio de acesso`);
    return resposta.status >= 500 || resposta.status === 409 ? "incerto" : "falhou";
  } catch (erro) {
    // Tempo esgotado ou rede: a mensagem pode ter saído. Nunca reenviar
    // sozinho - a gestão confere com a pessoa e decide reenviar.
    console.error(`[equipe] envio de acesso sem resposta: ${(erro as Error).name}`);
    return "incerto";
  } finally {
    clearTimeout(relogio);
  }
}
