"use server";

import { createAdminClient } from "@/lib/supabase/admin";

type Resultado = { ok: true } | { erro: string };

const PROVISORIA_INVALIDA =
  "E-mail ou senha provisória incorretos (ou a provisória venceu). Confira a última mensagem no WhatsApp ou peça para a gestão reenviar.";

/** Na tela de login, depois de a senha não entrar: confere se é a senha
 * provisória de uma conta que ainda não fez o primeiro acesso. A conta
 * pendente não tem sessão nem consegue entrar (a senha do Auth é sorteada e
 * ninguém conhece). Tentativa errada conta no banco (10 travam até a gestão
 * reenviar); a resposta é a mesma para e-mail que não existe. */
export async function conferirProvisoriaAction(email: string, provisoria: string): Promise<{ primeiroAcesso: boolean }> {
  if (!email.trim() || !provisoria.trim() || provisoria.length > 64) return { primeiroAcesso: false };
  const { data, error } = await createAdminClient().rpc("equipe_conferir_provisoria", {
    p_email: email.trim(),
    p_provisoria: provisoria,
  });
  if (error) return { primeiroAcesso: false };
  return { primeiroAcesso: data === true };
}

/** Primeiro acesso, sem sessão (veredito do Codex, item 4 da Equipe): tudo
 * numa transação só no banco (`concluir_primeiro_acesso`): prova a senha
 * provisória, grava a senha nova no Auth (hash bcrypt), apaga a pendência,
 * limpa sessões, recuperação e links antigos, marca o corte de sessões e
 * ativa os vínculos. Enquanto a conta está pendente o banco recusa criar
 * sessão e trocar a senha por qualquer outro caminho, então não existe
 * requisição antiga que caia depois. A pessoa entra em seguida com a senha nova. */
export async function concluirPrimeiroAcessoAction(
  email: string,
  provisoria: string,
  senha: string,
  confirmacao: string,
): Promise<Resultado> {
  if (!email.trim() || !provisoria.trim()) return { erro: PROVISORIA_INVALIDA };
  if (senha.length < 12) return { erro: "A senha precisa ter pelo menos 12 caracteres." };
  // O Auth guarda a senha com bcrypt, que só lê 72 bytes (acento ocupa 2).
  if (Buffer.byteLength(senha, "utf8") > 72) return { erro: "A senha pode ter no máximo 72 caracteres (menos, se tiver acento)." };
  if (senha !== confirmacao) return { erro: "As senhas não são iguais." };
  if (senha.trim() === provisoria.trim()) return { erro: "Escolha uma senha diferente da provisória." };

  const { data, error } = await createAdminClient().rpc("concluir_primeiro_acesso", {
    p_email: email.trim(),
    p_provisoria: provisoria,
    p_senha_nova: senha,
  });
  if (error) {
    if (error.message.includes("senha_invalida")) return { erro: "Escolha outra senha (12 a 72 caracteres, diferente da provisória)." };
    return { erro: "Não foi possível salvar a senha. Tente de novo." };
  }
  if (data !== "ok") return { erro: PROVISORIA_INVALIDA };
  return { ok: true };
}
