import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { hojeSP, linkRenovacao, situacaoAssinatura, type SituacaoAssinatura } from "./regras";

/** `teste` = conta em período de teste grátis (27/10/2026): `vigencia_fim` é o fim do teste. */
export type AssinaturaAtual = { situacao: SituacaoAssinatura; link: string | null; teste: boolean };

type Linha = { vigencia_fim: string | null; renovacao_token: string | null; periodo_teste?: boolean | null };

/** Situação da assinatura da organização escolhida, lida com a sessão de quem está logado.
 * Falha de leitura (inclusive coluna ainda não criada) conta como "sem vigência": o app nunca
 * trava um cliente por erro nosso. */
export const getAssinaturaAtual = cache(async (organizacaoId: string): Promise<AssinaturaAtual> => {
  const supabase = await createClient();
  const ler = (colunas: string) => supabase.from("organizacoes").select(colunas).eq("id", organizacaoId).maybeSingle();
  let { data, error } = await ler("vigencia_fim, renovacao_token, periodo_teste");
  // Coluna do período de teste ainda não criada: segue lendo a vigência como antes.
  if (error?.code === "42703") ({ data, error } = await ler("vigencia_fim, renovacao_token"));
  if (error || !data) return { situacao: { tipo: "sem_vigencia" }, link: null, teste: false };
  const linha = data as unknown as Linha;
  return {
    teste: linha.periodo_teste === true,
    situacao: situacaoAssinatura(linha.vigencia_fim, hojeSP()),
    link: linha.renovacao_token ? linkRenovacao(linha.renovacao_token) : null,
  };
});
