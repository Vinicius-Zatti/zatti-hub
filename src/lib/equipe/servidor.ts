import "server-only";
import { createHash } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** Hash da senha temporária guardado em `senhas_temporarias` (sha256 com o
 * id da pessoa). Serve só para recusar "senha nova igual à provisória"; a
 * senha de verdade quem guarda é o Auth. */
export function hashSenhaTemporaria(userId: string, senha: string): string {
  return createHash("sha256").update(`${userId}:${senha}`).digest("hex");
}

const PAGINAS_MAXIMAS = 20;

/** Procura conta do Auth pelo e-mail. A Admin API só pagina; o teto (20 mil
 * contas) é trava contra laço infinito. Bater no teto vira erro, nunca
 * "não encontrado" - senão criaríamos uma conta duplicada em silêncio. */
export async function buscarUsuarioPorEmail(admin: Admin, email: string) {
  const alvo = email.trim().toLowerCase();
  for (let page = 1; page <= PAGINAS_MAXIMAS; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Falha ao consultar usuários existentes: ${error.message}`);
    const achado = data.users.find((u) => u.email?.toLowerCase() === alvo);
    if (achado) return achado;
    if (data.users.length < 1000) return null;
  }
  throw new Error("Limite de consulta de contas atingido. Avise o suporte da Zatti.");
}

/** Erro do Auth com resposta clara de recusa (4xx): a senha certamente não
 * mudou e a trava pode ser liberada. Rede, tempo esgotado ou 5xx ficam
 * indeterminados: a trava espera vencer (15 min), para uma escrita atrasada
 * nunca cruzar com a próxima operação. */
export function recusaDefinitivaDoAuth(erro: { status?: number } | null): boolean {
  return Boolean(erro && typeof erro.status === "number" && erro.status >= 400 && erro.status < 500);
}

type ContaAuth = { id: string; app_metadata?: Record<string, unknown> | null };

/** A conta ainda não concluiu o primeiro acesso? Pendente = tem senha
 * provisória guardada OU foi criada pela Equipe e ainda não concluiu
 * (`app_metadata.zh_pendente`, que só o servidor grava). A marca no Auth
 * cobre a janela entre criar a conta e gravar a pendência no banco: na
 * dúvida, trata como pendente (falha fechada). */
export async function contaPendente(admin: Admin, conta: ContaAuth): Promise<boolean> {
  if (conta.app_metadata?.zh_pendente === true) return true;
  const { data, error } = await admin
    .from("senhas_temporarias")
    .select("user_id")
    .eq("user_id", conta.id)
    .maybeSingle();
  if (error) throw new Error("Falha ao conferir o primeiro acesso.");
  return Boolean(data);
}
