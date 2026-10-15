import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracao/token";
import { contatoDaConta } from "@/lib/assinatura/servidor";

// Vigência anual (15/10/2026). Só o Vini chama, depois de conferir o pagamento de renovação
// aprovado no Mercado Pago: POST {token, pagamento_id, valor}. Estende a vigência em 12 meses a
// partir do maior entre hoje e o fim atual. Um registro por pagamento: repetir devolve o mesmo.
//   200 {organizacao_id, restaurante, fim_anterior, fim_novo, repetido, contato}
//   404 link de nenhuma conta (vira alerta para Vinícius) | 503 o Vini tenta de novo

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await tokenValido(request, "provisionamento"))) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const token = String(corpo?.token ?? "");
  const pagamentoId = String(corpo?.pagamento_id ?? "");
  const valor = corpo?.valor === undefined || corpo?.valor === null ? null : Number(corpo.valor);
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token) || !/^[0-9]{1,20}$/.test(pagamentoId) || (valor !== null && !Number.isFinite(valor))) {
    return NextResponse.json({ erro: "pedido_invalido" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("zh_assinatura_renovar", { p_token: token, p_pagamento_id: pagamentoId, p_valor: valor });
  if (error) {
    if (error.code === "P0002") return NextResponse.json({ erro: "nao_encontrada" }, { status: 404 });
    console.error("[assinatura] renovação falhou", { codigo: error.code ?? null });
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }
  const r = data as { organizacao_id: string };
  const contato = await contatoDaConta(admin, r.organizacao_id).catch(() => null);
  return NextResponse.json({ ...r, contato }, { headers: { "Cache-Control": "no-store" } });
}
