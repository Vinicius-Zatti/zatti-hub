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
  | "trocar_organizacao"
  | "ficha_salvar"
  | "ficha_excluir"
  | "categoria_ficha_criar"
  | "conversao_produto_salvar"
  | "configuracao_financeira_salvar"
  | "ficha_preco_venda_salvar"
  | "categoria_ficha_editar"
  | "categoria_ficha_excluir"
  | "excluir_produto"
  | "ficha_precos_canal_salvar"
  | "fin_conta_financeira_salvar"
  | "fin_categoria_criar"
  | "fin_categoria_editar"
  | "fin_lancamento_criar"
  | "fin_lancamento_editar"
  | "fin_baixa_registrar"
  | "fin_baixa_estornar"
  | "fin_recorrencia_criar"
  | "fin_lancamento_excluir"
  | "fin_estoque_mensal_salvar";

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
