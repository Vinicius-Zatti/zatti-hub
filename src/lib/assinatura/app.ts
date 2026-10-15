import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { hojeSP, linkRenovacao, situacaoAssinatura, type SituacaoAssinatura } from "./regras";

export type AssinaturaAtual = { situacao: SituacaoAssinatura; link: string | null };

/** Situação da assinatura da organização escolhida, lida com a sessão de quem está logado.
 * Falha de leitura (inclusive coluna ainda não criada) conta como "sem vigência": o app nunca
 * trava um cliente por erro nosso. */
export const getAssinaturaAtual = cache(async (organizacaoId: string): Promise<AssinaturaAtual> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizacoes")
    .select("vigencia_fim, renovacao_token")
    .eq("id", organizacaoId)
    .maybeSingle();
  if (error || !data) return { situacao: { tipo: "sem_vigencia" }, link: null };
  const linha = data as { vigencia_fim: string | null; renovacao_token: string | null };
  return {
    situacao: situacaoAssinatura(linha.vigencia_fim, hojeSP()),
    link: linha.renovacao_token ? linkRenovacao(linha.renovacao_token) : null,
  };
});
