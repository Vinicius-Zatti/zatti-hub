"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Troca qual organização aparece pra quem tem acesso a mais de uma (hoje,
 * só quem é "master"). Só grava uma preferência num cookie - não concede
 * acesso nenhum, `getAcessoAtual` sempre confere contra o banco de novo. */
export async function trocarOrganizacaoAction(formData: FormData) {
  const organizacaoId = String(formData.get("organizacaoId") ?? "");
  const cookieStore = await cookies();
  cookieStore.set("zh_org", organizacaoId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/estoque/produtos");
}
