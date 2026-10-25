import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Módulos cujo tour o usuário já viu (`tours_vistos`, RLS: só as próprias
 * linhas). Devolve null quando a leitura falha (ex.: migration ainda não
 * aplicada em produção): o app segue normal e o tour não aparece.
 */
export async function lerToursVistos(userId: string): Promise<string[] | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("tours_vistos").select("modulo").eq("user_id", userId);
    if (error) {
      console.error("[tour] leitura de tours_vistos falhou; tour desligado nesta tela", error.code, error.message);
      return null;
    }
    return (data ?? []).map((linha) => linha.modulo as string);
  } catch (erro) {
    console.error("[tour] leitura de tours_vistos falhou; tour desligado nesta tela", erro);
    return null;
  }
}
