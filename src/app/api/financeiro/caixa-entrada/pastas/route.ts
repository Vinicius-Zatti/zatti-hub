import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracao/token";

// O Vini avisa que criou a pasta do Drive pedida pela unidade (id e link).

export const dynamic = "force-dynamic";

const entrada = z
  .object({
    unidadeId: z.string().min(1).max(80),
    pastaId: z.string().regex(/^[A-Za-z0-9_-]{10,100}$/),
    link: z.string().url().regex(/^https:\/\/drive\.google\.com\//),
  })
  .strict();

export async function POST(request: NextRequest) {
  if (!(await tokenValido(request, "caixa_entrada"))) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  let corpo: z.infer<typeof entrada>;
  try {
    corpo = entrada.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "entrada_invalida" }, { status: 400 });
  }
  const { data, error } = await createAdminClient()
    .from("fin_caixa_entrada_pastas")
    .update({ situacao: "ativa", pasta_id: corpo.pastaId, link: corpo.link, atualizado_em: new Date().toISOString() })
    .eq("unidade_id", corpo.unidadeId)
    .in("situacao", ["solicitada", "ativa"])
    .select("unidade_id");
  if (error) return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  if (!data || data.length === 0) return NextResponse.json({ erro: "pasta_nao_solicitada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
