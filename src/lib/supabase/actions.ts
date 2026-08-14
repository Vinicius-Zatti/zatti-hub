"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { organizacaoIdSchema, validarEntrada } from "@/lib/validacao";

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete("zh_org");
  redirect("/login");
}

/** Troca qual organização aparece pra quem tem acesso a mais de uma (hoje,
 * só quem é "master"). Só grava uma preferência num cookie - não concede
 * acesso nenhum, `getAcessoAtual` sempre confere contra o banco de novo. */
export async function trocarOrganizacaoAction(formData: FormData) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/login");

  await exigirLimiteRequisicao("trocar_organizacao");
  const organizacaoId = validarEntrada(
    organizacaoIdSchema,
    String(formData.get("organizacaoId") ?? ""),
  );

  // A consulta passa pelo RLS: um id inventado ou de outro cliente nao fica
  // salvo nem como preferencia. Nao usa getAcessoAtual para permitir que um
  // master saia de uma organizacao ainda sem planilha configurada.
  const { data: organizacao } = await supabase
    .from("organizacoes")
    .select("id")
    .eq("id", organizacaoId)
    .eq("ativo", true)
    .maybeSingle();
  if (!organizacao) redirect("/sem-acesso");

  const cookieStore = await cookies();
  cookieStore.set("zh_org", organizacaoId, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/estoque/produtos");
}
