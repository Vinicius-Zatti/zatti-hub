import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { rpcDoEvento } from "@/lib/comercial/conversa";

// Entrada do Vini no Comercial (CRM de leads): formulário do site, pagamento
// aprovado e, depois, etapas do SDR. Credencial própria no cabeçalho
// Authorization (nunca na URL), cujo SHA-256 fica em `zh_leads_segredos`, sem
// grant - mesmo padrão de /api/conciliacao/uso-ia. Toda regra (um lead por
// WhatsApp, nada sobrescrito, etapa só para frente, idempotência pela chave
// do evento) mora na RPC `zh_leads_registrar_evento`. Mensagens da conversa
// do SDR (tipo "mensagem", 17/11) vão para `zh_leads_registrar_mensagem`, que
// só arquiva na linha do tempo: não cria lead nem mexe em etapa. Tipo "negociacao"
// (18/11, SDR-142) vai para `zh_leads_registrar_negociacao`: depois da reunião, o
// Vini move o card até a reunião de diagnóstico e escreve a próxima ação.

export const dynamic = "force-dynamic";

// 16 KB: mensagem do SDR com até 1000 caracteres pode chegar com acentos e
// emojis escapados (\uXXXX), que ocupam até 6 vezes mais no corpo.
const LIMITE_CORPO = 16 * 1024;

export async function POST(request: NextRequest) {
  const cabecalho = request.headers.get("authorization") ?? "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7).trim() : "";
  if (token.length < 32) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });

  const bruto = await request.text();
  if (bruto.length > LIMITE_CORPO) return NextResponse.json({ erro: "corpo_grande" }, { status: 413 });
  let evento: unknown;
  try {
    evento = JSON.parse(bruto);
  } catch {
    return NextResponse.json({ erro: "json_invalido" }, { status: 400 });
  }
  if (!evento || typeof evento !== "object" || Array.isArray(evento)) {
    return NextResponse.json({ erro: "evento_invalido" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await supabase.rpc(rpcDoEvento(evento), { p_token: token, p_evento: evento });
  if (error) {
    if (error.code === "42501") return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
    if (error.code === "22023" || error.code === "22007" || error.code === "22008" || error.code === "22P02") {
      return NextResponse.json({ erro: "evento_invalido" }, { status: 400 });
    }
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
