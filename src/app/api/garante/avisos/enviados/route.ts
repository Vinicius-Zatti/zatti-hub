import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracao/token";
import { RESULTADOS_ENVIO } from "@/lib/garante/avisos";

// O Vini confirma a tentativa de envio dos avisos do Garante: 'enviado' fecha, 'incerto' fecha
// sem repetir, 'falhou' (recusa clara) volta à fila até 3 tentativas. A atualização é
// condicional no banco (só o que ainda está reservado nessa tentativa): repetir é inócuo.

export const dynamic = "force-dynamic";

const entrada = z.object({ tentativaId: z.string().uuid(), resultado: z.enum(RESULTADOS_ENVIO) }).strict();

export async function POST(request: NextRequest) {
  if (!(await tokenValido(request, "garante"))) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  let corpo: z.infer<typeof entrada>;
  try {
    corpo = entrada.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "entrada_invalida" }, { status: 400 });
  }
  const { data, error } = await createAdminClient().rpc("garante_avisos_confirmar", { p_tentativa_id: corpo.tentativaId, p_resultado: corpo.resultado });
  if (error) {
    console.error("garante_avisos_confirmar_falhou", { codigo: error.code ?? null });
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, avisos: Number(data ?? 0) });
}
