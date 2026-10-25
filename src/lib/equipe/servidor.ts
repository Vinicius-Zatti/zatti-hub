import "server-only";
import { createHash } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { expiracaoSenhaTemporaria, gerarSenhaTemporaria } from "@/lib/equipe/regras";

type Admin = ReturnType<typeof createAdminClient>;

/** Hash da senha provisória guardado em `senhas_temporarias` (sha256 de
 * "<id>:<senha>", igual a `equipe_hash_provisoria` no banco). A provisória só
 * existe assim: a senha do Auth da conta pendente é sorteada. */
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

/** Gera a senha provisória de uma conta que já existe (Equipe ou Acessos).
 * Sorteia a provisória aqui e manda só o hash; o banco confere de novo o
 * papel de `ator` (lido da sessão pelo chamador, nunca do formulário), a
 * regra de organização e o limite, e faz a troca inteira numa transação.
 * Devolve o código do banco e, só com "ok", a provisória em texto. */
export async function gerarSenhaProvisoriaNoBanco(
  admin: Admin,
  params: {
    atorId: string;
    vinculoId: string;
    alvoUserId: string;
    escopo: "master" | "equipe";
    organizacaoId: string | null;
  },
): Promise<{ codigo: string; senha: string | null; validaAte: Date }> {
  const senha = gerarSenhaTemporaria();
  const validaAte = expiracaoSenhaTemporaria(new Date());
  const { data, error } = await admin.rpc("gerar_senha_provisoria_conta", {
    p_ator: params.atorId,
    p_vinculo_id: params.vinculoId,
    p_escopo: params.escopo,
    p_organizacao_id: params.organizacaoId,
    p_hash: hashSenhaTemporaria(params.alvoUserId, senha),
    p_expira_em: validaAte.toISOString(),
  });
  if (error) {
    console.error("[equipe] falha ao gerar senha provisória", { codigo: error.code });
    return { codigo: "erro", senha: null, validaAte };
  }
  const codigo = String(data);
  return { codigo, senha: codigo === "ok" ? senha : null, validaAte };
}

/** Troca papel e unidade de um vínculo sem revogar (Equipe ou Acessos). O
 * banco confere de novo o papel de `ator` (lido da sessão pelo chamador),
 * organização, unidade, duplicata e última gestão, faz a troca e grava a
 * auditoria numa transação só. Devolve o código do banco. */
export async function editarVinculoNoBanco(
  admin: Admin,
  params: {
    atorId: string;
    vinculoId: string;
    escopo: "master" | "equipe";
    organizacaoId: string | null;
    role: string;
    unidadeId: string | null;
  },
): Promise<string> {
  const { data, error } = await admin.rpc("editar_vinculo_acesso", {
    p_ator: params.atorId,
    p_vinculo_id: params.vinculoId,
    p_escopo: params.escopo,
    p_organizacao_id: params.organizacaoId,
    p_novo_role: params.role,
    p_nova_unidade_id: params.unidadeId,
  });
  if (error) {
    console.error("[acessos] falha ao editar vínculo", { codigo: error.code });
    return "erro";
  }
  return String(data);
}
