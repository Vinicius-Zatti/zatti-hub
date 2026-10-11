"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient, createAdminClientComTempoLimite } from "@/lib/supabase/admin";
import { hashSenhaTemporaria, recusaDefinitivaDoAuth } from "@/lib/equipe/servidor";

type Resultado = { ok: true } | { erro: string };

/** Troca a senha provisória e libera o acesso (vereditos do Codex):
 * 1) prova a senha provisória vigente e pega a trava no banco, com token
 *    próprio (`iniciar_primeiro_acesso`) - reenvio e outra troca esperam;
 * 2) troca a senha no Auth e tira a marca de pendência;
 * 3) `concluir_primeiro_acesso` apaga a pendência, invalida as sessões
 *    anteriores (`sessoes_validas_desde`, conferido por sessão em
 *    `sessao_vigente()`) e ativa os vínculos, numa transação só. Falha no
 *    Auth libera a trava.
 * Depois encerra todas as sessões: entra de novo com a senha nova. */
export async function concluirPrimeiroAcessoAction(
  senhaProvisoria: string,
  senha: string,
  confirmacao: string,
): Promise<Resultado> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { erro: "Sua sessão expirou. Entre de novo com a senha provisória." };

  if (senha.length < 12) return { erro: "A senha precisa ter pelo menos 12 caracteres." };
  if (senha.length > 128) return { erro: "A senha pode ter no máximo 128 caracteres." };
  if (senha !== confirmacao) return { erro: "As senhas não são iguais." };
  if (senha === senhaProvisoria) return { erro: "Escolha uma senha diferente da provisória." };

  const admin = createAdminClient();
  const { data: pendente, error } = await admin
    .from("senhas_temporarias")
    .select("expira_em")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { erro: "Não foi possível conferir seu acesso. Tente de novo." };
  if (!pendente) {
    const { data: conta, error: erroConta } = await admin.auth.admin.getUserById(userId);
    if (erroConta || !conta.user) return { erro: "Não foi possível conferir seu acesso. Tente de novo." };
    // Conta marcada como pendente sem senha provisória no banco: cadastro
    // incompleto. Falha fechada, nunca libera.
    if (conta.user.app_metadata?.zh_pendente === true) {
      return { erro: "Seu cadastro ficou incompleto. Peça para a gestão cadastrar você de novo." };
    }
    return { ok: true };
  }
  if (new Date(pendente.expira_em as string).getTime() < Date.now()) {
    return { erro: "Sua senha provisória venceu. Peça para a gestão reenviar o acesso." };
  }

  const { data: trava, error: erroInicio } = await admin.rpc("iniciar_primeiro_acesso", {
    p_user_id: userId,
    p_hash: hashSenhaTemporaria(userId, senhaProvisoria.trim()),
  });
  if (erroInicio) return { erro: "Não foi possível conferir seu acesso. Tente de novo." };
  if (!trava) {
    return {
      erro: "Senha provisória incorreta ou já substituída. Confira a última mensagem no WhatsApp (ou espere 2 minutos se acabou de tentar).",
    };
  }

  // Tempo limite de 10 s. Resultado indeterminado: a trava fica até vencer
  // (15 min), para uma escrita atrasada no Auth nunca cruzar com outra.
  const { error: erroAuth } = await createAdminClientComTempoLimite().auth.admin.updateUserById(userId, {
    password: senha,
    app_metadata: { zh_pendente: false },
  });
  if (erroAuth) {
    if (recusaDefinitivaDoAuth(erroAuth)) {
      await admin.rpc("liberar_trava_senha", { p_user_id: userId, p_token: trava });
      return { erro: "Não foi possível salvar essa senha. Tente outra, mais longa ou menos comum." };
    }
    return { erro: "Não deu para confirmar a troca. Espere 15 minutos e tente de novo." };
  }

  const { data: concluiu, error: erroConclusao } = await admin.rpc("concluir_primeiro_acesso", {
    p_user_id: userId,
    p_token: trava,
  });
  if (erroConclusao || !concluiu) {
    return { erro: "Senha salva, mas o acesso não foi liberado. Entre de novo com a senha nova e repita este passo." };
  }

  // Derruba todas as sessões (refresh tokens). Mesmo se falhar, sessão
  // aberta antes do corte já não passa no banco (`sessao_vigente()`).
  const { data: sessao } = await supabase.auth.getSession();
  if (sessao.session?.access_token) {
    const { error: erroSaida } = await admin.auth.admin.signOut(sessao.session.access_token, "global");
    if (erroSaida) console.error("[primeiro-acesso] falha ao encerrar sessões antigas", { userId });
  }
  await supabase.auth.signOut({ scope: "local" });
  return { ok: true };
}
