import "server-only";

/** Pede ao Vini (Railway) que mande o acesso da pessoa pelo WhatsApp de
 * Vinícius. A rota do Vini só aceita este formato e monta o texto ela
 * mesma, para não virar disparo genérico; token próprio, só para ela.
 * Nunca loga o corpo (leva a senha temporária). */

export type TipoEnvioAcesso = "conta_nova" | "conta_existente";

export type ResultadoEnvio = "aceito" | "falhou" | "incerto";

const TEMPO_LIMITE_MS = 15_000;

export async function enviarAcessoPeloVini(dados: {
  tipo: TipoEnvioAcesso;
  idempotencia: string;
  whatsapp: string;
  nome: string;
  email: string;
  organizacaoNome: string;
  senhaTemporaria?: string;
  validaAte?: Date;
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

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const resposta = await fetch(`${url.replace(/\/+$/, "")}/zatti-hub/acesso-equipe`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-envio-token": token },
      body: JSON.stringify({
        tipo: dados.tipo,
        idempotencia: dados.idempotencia,
        phone: dados.whatsapp,
        nome: dados.nome,
        email: dados.email,
        organizacao: dados.organizacaoNome,
        senha: dados.senhaTemporaria,
        validaAte: dados.validaAte?.toISOString(),
      }),
      signal: controle.signal,
      cache: "no-store",
      redirect: "manual",
    });
    if (resposta.ok) return "aceito";
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
