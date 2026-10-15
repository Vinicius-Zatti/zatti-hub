import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracao/token";
import { contaDoToken } from "@/lib/assinatura/servidor";

// Vigência anual (15/10/2026). O Vini consulta a conta do link de renovação antes de abrir o
// pagamento: POST {token} -> {restaurante, vigencia_fim}. 404 = link que não é de nenhuma conta.

export const dynamic = "force-dynamic";

const TOKEN_RENOVACAO = /^[A-Za-z0-9_-]{24,64}$/;

export async function POST(request: NextRequest) {
  if (!(await tokenValido(request, "provisionamento"))) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const token = String(corpo?.token ?? "");
  if (!TOKEN_RENOVACAO.test(token)) return NextResponse.json({ erro: "token_invalido" }, { status: 400 });
  try {
    const conta = await contaDoToken(createAdminClient(), token);
    if (!conta) return NextResponse.json({ erro: "nao_encontrada" }, { status: 404 });
    return NextResponse.json({ restaurante: conta.nome, vigencia_fim: conta.vigencia_fim }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }
}
