"use server";

import { createClient } from "@/lib/supabase/server";
import { ehModuloTour } from "./passos";

/**
 * Marca o tour do módulo como visto para quem está logado. O user_id vem da
 * sessão, nunca do navegador; a RLS de `tours_vistos` só deixa inserir a
 * própria linha. Já visto (23505) conta como sucesso. Falha (ex.: migration
 * ainda não aplicada) só loga: o tour não pode quebrar a tela.
 */
export async function marcarTourVistoAction(modulo: string): Promise<{ ok: boolean }> {
  if (!ehModuloTour(modulo)) return { ok: false };
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims.sub;
    if (!userId) return { ok: false };
    const { error } = await supabase.from("tours_vistos").insert({ user_id: userId, modulo });
    if (error && error.code !== "23505") {
      console.error("[tour] não gravou tour visto", modulo, error.code, error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (erro) {
    console.error("[tour] não gravou tour visto", modulo, erro);
    return { ok: false };
  }
}
