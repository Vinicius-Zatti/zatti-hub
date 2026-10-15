import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracao/token";
import { hojeSP, type Marco } from "@/lib/assinatura/regras";
import { avisosPendentes, marcarAviso } from "@/lib/assinatura/servidor";

// Vigência anual (15/10/2026). Só o Vini chama, com o token do escopo 'provisionamento'.
//   GET  avisos de renovação que valem hoje e ainda não saíram (30, 7, 1 dia antes e no dia)
//   POST {organizacao_id, marco, vigencia_fim}: marca como enviado (repetir não faz nada)

export const dynamic = "force-dynamic";

const semCache = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest) {
  if (!(await tokenValido(request, "provisionamento"))) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  try {
    return NextResponse.json({ hoje: hojeSP(), avisos: await avisosPendentes(createAdminClient(), hojeSP()) }, semCache);
  } catch (erro) {
    console.error("[assinatura] avisos falharam", { motivo: (erro as Error).message });
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }
}

const MARCOS = new Set<Marco>(["d30", "d7", "d1", "d0"]);

export async function POST(request: NextRequest) {
  if (!(await tokenValido(request, "provisionamento"))) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const organizacaoId = String(corpo?.organizacao_id ?? "");
  const marco = String(corpo?.marco ?? "") as Marco;
  const vigenciaFim = String(corpo?.vigencia_fim ?? "");
  if (!/^[a-z0-9-]{1,80}$/.test(organizacaoId) || !MARCOS.has(marco) || !/^\d{4}-\d{2}-\d{2}$/.test(vigenciaFim)) {
    return NextResponse.json({ erro: "pedido_invalido" }, { status: 400 });
  }
  try {
    await marcarAviso(createAdminClient(), { organizacao_id: organizacaoId, marco, vigencia_fim: vigenciaFim });
    return NextResponse.json({ ok: true }, semCache);
  } catch {
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }
}
