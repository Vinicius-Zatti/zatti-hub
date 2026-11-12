import { createHmac } from "node:crypto";

// Hash do IP e do aparelho de quem avalia (só para o limite antispam). O banco nunca recebe o IP
// puro: recebe HMAC-SHA256 com uma chave que só o servidor tem. Sem `AVALIACAO_HASH_SALT`, a chave
// deriva da service role (já existe em todo ambiente com banco); trocar a chave só zera os limites.
// O hash do IP muda a cada dia (minimização): dois dias de avaliações do mesmo IP não se ligam.

export function chaveHash(env: Record<string, string | undefined> = process.env): string | null {
  const sal = env.AVALIACAO_HASH_SALT ?? "";
  if (sal.length >= 16) return sal;
  const servico = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return servico.length >= 16 ? createHmac("sha256", servico).update("zatti-hub/avaliacoes/hash").digest("hex") : null;
}

export function hashAnonimo(chave: string, tipo: "ip" | "dispositivo", valor: string, dia: string): string {
  const conteudo = tipo === "ip" ? `ip|${dia}|${valor}` : `dispositivo|${valor}`;
  return createHmac("sha256", chave).update(conteudo, "utf8").digest("hex");
}

/** Vercel preenche x-forwarded-for (primeiro endereço = quem acessou) e x-real-ip. */
export function ipDaRequisicao(cabecalhos: { get(nome: string): string | null }): string {
  const primeiro = cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (primeiro || cabecalhos.get("x-real-ip")?.trim() || "desconhecido").slice(0, 64);
}

/** Identificador aleatório do aparelho (guardado no navegador). Formato estranho vira
 * "sem-dispositivo" e cai só no limite por IP. */
export function dispositivoValido(valor: unknown): string {
  return typeof valor === "string" && /^[A-Za-z0-9-]{16,64}$/.test(valor) ? valor : "sem-dispositivo";
}
