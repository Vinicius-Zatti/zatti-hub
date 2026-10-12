import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracao/token";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";

// O Vini confirma o envio do alerta diário: a mesma pessoa não recebe duas vezes no dia.

export const dynamic = "force-dynamic";

const entrada = z.object({ unidadeId: z.string().min(1).max(80), telefone: z.string().regex(/^\d{12,13}$/) }).strict();

export async function POST(request: NextRequest) {
  if (!(await tokenValido(request, "alertas"))) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  let corpo: z.infer<typeof entrada>;
  try {
    corpo = entrada.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "entrada_invalida" }, { status: 400 });
  }
  const { error } = await createAdminClient()
    .from("fin_alertas_enviados")
    .upsert({ unidade_id: corpo.unidadeId, telefone: corpo.telefone, data: hojeIsoBrasil(), tipo: "pagamentos_dia" }, { onConflict: "unidade_id,telefone,data,tipo", ignoreDuplicates: true });
  if (error) return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
