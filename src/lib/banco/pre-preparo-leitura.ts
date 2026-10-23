import { createClient } from "@/lib/supabase/server";

/** Leituras do pré-preparo vinculado sem depender de `fichas-tecnicas.ts`
 * (que importa daqui para montar a tela da ficha). */

/** Leitura à parte (fora de `getAcessoAtual`) de propósito: se o app subir
 * antes da migração, a coluna não existe e a resposta é "desligado", sem
 * derrubar o login de todo mundo. */
export async function prePreparoVinculadoHabilitado(unidadeId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .select("pre_preparo_vinculado_habilitado")
    .eq("id", unidadeId)
    .maybeSingle();
  if (error || !data) return false;
  return (data as { pre_preparo_vinculado_habilitado: boolean }).pre_preparo_vinculado_habilitado === true;
}

export type VinculoContagemFicha = {
  /** Produto da lista de contagem que é esta ficha, `null` se ainda não entrou. */
  produto: { sku: string; nome: string; unidadeBase: string } | null;
};

/** `null` quando não se aplica: unidade fora do piloto ou ficha de Venda. */
export async function vinculoContagemDaFicha(
  unidadeId: string,
  ficha: { id: string; camada: string },
): Promise<VinculoContagemFicha | null> {
  if (ficha.camada !== "PRE" || !(await prePreparoVinculadoHabilitado(unidadeId))) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("produtos")
    .select("sku, nome, unidade_base")
    .eq("unidade_id", unidadeId)
    .eq("ficha_pre_preparo_id", ficha.id)
    .maybeSingle();
  const produto = data as { sku: string; nome: string; unidade_base: string } | null;
  return { produto: produto ? { sku: produto.sku, nome: produto.nome, unidadeBase: produto.unidade_base } : null };
}
