import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import { normalizarPeca, type CamposPeca, type Peca } from "@/lib/conteudo/pecas";

/** Acesso ao banco do Conteúdo (calendário editorial). O RLS (`usuario_e_master()`) é a barreira
 * da leitura; toda escrita passa pela RPC `conteudo_hub_salvar`, que confere master, valida os
 * campos, controla a versão e grava a auditoria (origem hub) na mesma transação. */

function falhou(error: unknown, contexto: string): never {
  console.error(`conteudo: ${contexto}`, error);
  throw new Error(contexto);
}

/** Todas as peças (o calendário tem poucas centenas); a tela filtra semana e status. */
export async function carregarPecas(): Promise<Peca[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conteudo_pecas")
    .select("*")
    .order("data", { ascending: false, nullsFirst: false })
    .limit(5000);
  if (error) falhou(error, "carregar peças");
  return (data ?? []).map((l) => normalizarPeca(l as Record<string, unknown>));
}

/** Cria (id null) ou edita com a versão lida. Versão divergente vira mensagem para recarregar. */
export async function salvarPeca(id: string | null, versao: number | null, campos: CamposPeca): Promise<Peca> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("conteudo_hub_salvar", { p_id: id, p_versao: versao, p_campos: campos });
  if (error) {
    if (error.code === "PT409" || error.message?.includes("Versao divergente")) {
      throw new ErroPublico("Esta peça mudou em outro lugar (Vini ou outra aba). A tela foi atualizada: confira e salve de novo.");
    }
    if (error.code === "P0002") throw new ErroPublico("Peça não encontrada.");
    if (error.code === "42501") throw new ErroPublico("Sem permissão.");
    if (error.code === "22023") {
      const campo = /Campo (?:invalido|nao permitido): (\w+)/.exec(error.message ?? "")?.[1];
      throw new ErroPublico(campo ? `Campo inválido: ${campo}.` : "Dados inválidos.");
    }
    falhou(error, "salvar peça");
  }
  return normalizarPeca(((data as { peca: Record<string, unknown> }) ?? { peca: {} }).peca);
}
