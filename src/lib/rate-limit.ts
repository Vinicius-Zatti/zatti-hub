import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";

export type ChaveLimiteRequisicao =
  | "sugerir_sku"
  | "registrar_contagem"
  | "corrigir_contagem"
  | "salvar_produtos"
  | "salvar_fornecedores"
  | "pedidos_cotacao"
  | "recebimento"
  | "consolidado_criar"
  | "consolidado_editar"
  | "trocar_organizacao";

/** Consome um limite persistente no Supabase. Falha fechada: se a funcao do
 * banco estiver indisponivel, a mutacao nao continua sem protecao. */
export async function exigirLimiteRequisicao(chave: ChaveLimiteRequisicao): Promise<void> {
  const supabase = await createClient();
  const { data: permitido, error } = await supabase.rpc("consumir_limite_requisicao", {
    p_chave: chave,
  });

  if (error) throw new Error("Nao foi possivel validar o limite de requisicoes");
  if (!permitido) {
    throw new ErroPublico("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
  }
}
