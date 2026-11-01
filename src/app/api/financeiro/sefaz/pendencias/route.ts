import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracao/token";

// Captura de NF-e pela SEFAZ (30/10/2026): o que o robô do Vini roda hoje. Só o token "sefaz".
// O certificado sai daqui só no envelope cifrado, que o Hub não sabe abrir (a chave privada fica
// só no robô). Nunca vai para log.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await tokenValido(request, "sefaz"))) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  const { data, error } = await createAdminClient().rpc("fin_sefaz_pendencias");
  if (error) {
    console.error("sefaz_pendencias_falhou", { codigo: error.code ?? null });
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
