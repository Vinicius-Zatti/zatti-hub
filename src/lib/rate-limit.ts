import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";

/** Regras por ação - ajustar aqui se algum limite se mostrar apertado
 * demais no uso real. Ações de escrita comuns ficam generosas (uso normal
 * de UI - clique em "Salvar todos" numa grade grande, por exemplo - não
 * deveria bater no limite sem ser abuso); `sugerir_sku` fica bem mais
 * restrita por somar custo de API paga (Anthropic) a cada chamada;
 * `auth_callback` é por IP, não por usuário (roda antes de saber quem é). */
export const LIMITES = {
  escrita_padrao: { limite: 40, janelaSegundos: 60 },
  sugerir_sku: { limite: 20, janelaSegundos: 3600 },
  auth_callback: { limite: 20, janelaSegundos: 300 },
} as const;

export type AcaoLimitada = keyof typeof LIMITES;

export function chaveUsuario(userId: string): string {
  return `user:${userId}`;
}

/** IP de quem fez a requisição, pra limitar rota alcançável sem sessão
 * (ex: /auth/callback). `x-forwarded-for` é setado pela Vercel; fora dela
 * (dev local) cai no fallback fixo - não é um bypass real porque em dev
 * não tem tráfego de terceiro pra abusar do endpoint. */
export async function obterIp(): Promise<string> {
  const lista = (await headers()).get("x-forwarded-for");
  return lista?.split(",")[0]?.trim() || "desconhecido";
}

/** Fail-closed: qualquer problema (erro de rede, RPC falhando, projeto
 * ainda sem a migração de rate limit aplicada) devolve "bloqueado", nunca
 * "libera". Diferente de `registrarAuditoria` (que engole erro de
 * propósito - auditoria nunca pode derrubar a ação de verdade do usuário),
 * rate limit é uma barreira de segurança: se não dá pra confirmar que está
 * dentro do limite, a ação não acontece. */
async function verificarLimite(chave: string, acao: AcaoLimitada): Promise<boolean> {
  const regra = LIMITES[acao];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("checar_rate_limit", {
      p_chave: chave,
      p_acao: acao,
      p_limite: regra.limite,
      p_janela_segundos: regra.janelaSegundos,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/** Chamar no início de toda Server Action/rota sensível, depois de
 * resolver `acesso`/IP. Lança `ErroPublico` (mensagem já segura pro
 * cliente) quando estourou o limite - deixa o catch padrão da action
 * devolver isso pro usuário sem precisar de tratamento especial. */
export async function exigirLimite(chave: string, acao: AcaoLimitada): Promise<void> {
  const permitido = await verificarLimite(chave, acao);
  if (!permitido) {
    throw new ErroPublico("Muitas tentativas em pouco tempo. Espera um instante e tenta de novo.");
  }
}
