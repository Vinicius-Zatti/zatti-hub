"use server";

import { createClient } from "@/lib/supabase/server";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { FORMATO_CODIGO_ERRO_NAVEGADOR, sanitizarTextoErroParaLog } from "@/lib/suporte";

/** Registra no log do servidor (Vercel) um erro que nasceu no navegador e
 * caiu no cartão de erro. O código `NAV-XXXXXX` é o mesmo da mensagem de
 * suporte, então dá para achar o registro pelo que o cliente mandou no
 * WhatsApp. Só log: não grava dado de negócio e nunca lança erro de volta
 * para a tela, que já está mostrando um erro. Só usuário logado, com limite
 * por usuário, e texto sanitizado (sem e-mail, número longo, token ou URL). */
export async function registrarErroNavegadorAction(dados: {
  codigo: string;
  tela: string;
  nome: string;
  mensagem: string;
}): Promise<void> {
  try {
    if (!FORMATO_CODIGO_ERRO_NAVEGADOR.test(String(dados.codigo))) return;
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await exigirLimiteRequisicao("erro_navegador_registrar");
    const tela = sanitizarTextoErroParaLog(String(dados.tela ?? "").split(/[?#]/)[0], 120);
    console.error(
      `[erro-navegador] ${dados.codigo} usuario=${data.user.id} tela=${tela} ` +
        `tipo=${sanitizarTextoErroParaLog(dados.nome, 60)} mensagem=${sanitizarTextoErroParaLog(dados.mensagem)}`,
    );
  } catch {
    // Registro é melhor esforço: limite estourado ou falha de sessão só não loga.
  }
}
