import type { EmailOtpType } from "@supabase/supabase-js";

/** Tipos de link de email que a rota /auth/confirmar aceita. Fora disso o
 * link é tratado como inválido (nada de repassar valor livre pro Supabase). */
export const TIPOS_ACEITOS = ["recovery", "invite", "signup", "email", "magiclink"] as const satisfies readonly EmailOtpType[];

export type TipoAceito = (typeof TIPOS_ACEITOS)[number];

export function tipoAceito(valor: string | null | undefined): TipoAceito | null {
  return TIPOS_ACEITOS.find((tipo) => tipo === valor) ?? null;
}

/** Destino depois de confirmar o link: só caminho interno do próprio app.
 * Mesma regra do /auth/callback - começa com "/" e não com "//" (que o
 * navegador leria como outro domínio). Qualquer outra coisa vira "/". */
export function destinoSeguro(valor: string | null | undefined): string {
  if (!valor) return "/";
  return valor.startsWith("/") && !valor.startsWith("//") ? valor : "/";
}
