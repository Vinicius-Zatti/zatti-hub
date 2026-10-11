import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracao/token";
import { lerEntrada, receberArquivo } from "@/lib/caixa-entrada/processar";
import { ErroPublico } from "@/lib/erros";

// Entrada de notas, boletos e recibos vinda do Vini (WhatsApp de número cadastrado ou pasta do
// Drive da unidade). Só guarda e lê; quem lança é uma pessoa na tela da Caixa de Entrada.
// Corpo limitado pela Vercel (4,5 MB): o arquivo vai em base64 até ~3 MB.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const entrada = z.discriminatedUnion("canal", [
  z.object({ canal: z.literal("whatsapp"), telefone: z.string().regex(/^\d{10,13}$/), nomeArquivo: z.string().min(1).max(200), base64: z.string().min(4) }).strict(),
  z.object({
    canal: z.literal("drive"),
    unidadeId: z.string().min(1).max(80),
    pastaId: z.string().regex(/^[A-Za-z0-9_-]{10,100}$/),
    nomeArquivo: z.string().min(1).max(200),
    base64: z.string().min(4),
  }).strict(),
]);

export async function POST(request: NextRequest) {
  if (!(await tokenValido(request, "caixa_entrada"))) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  let corpo: z.infer<typeof entrada>;
  try {
    corpo = entrada.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "entrada_invalida" }, { status: 400 });
  }
  const admin = createAdminClient();
  let unidadeId: string;
  let remetente: string;
  if (corpo.canal === "whatsapp") {
    const tel = corpo.telefone.length <= 11 ? `55${corpo.telefone}` : corpo.telefone;
    const { data } = await admin.from("fin_caixa_entrada_remetentes").select("unidade_id, nome").eq("telefone", tel).eq("ativo", true).maybeSingle();
    const r = data as { unidade_id: string; nome: string } | null;
    if (!r) return NextResponse.json({ erro: "remetente_nao_cadastrado" }, { status: 404 });
    unidadeId = r.unidade_id;
    remetente = `${r.nome} (WhatsApp final ${tel.slice(-4)})`;
  } else {
    const { data } = await admin
      .from("fin_caixa_entrada_pastas")
      .select("unidade_id")
      .eq("unidade_id", corpo.unidadeId)
      .eq("pasta_id", corpo.pastaId)
      .eq("situacao", "ativa")
      .maybeSingle();
    if (!data) return NextResponse.json({ erro: "pasta_nao_cadastrada" }, { status: 404 });
    unidadeId = corpo.unidadeId;
    remetente = "Pasta do Google Drive";
  }
  const { data: un } = await admin.from("unidades").select("nome").eq("id", unidadeId).single();
  const bytes = new Uint8Array(Buffer.from(corpo.base64, "base64"));
  try {
    const r = await receberArquivo({ unidadeId, canal: corpo.canal, remetente, nomeArquivo: corpo.nomeArquivo, bytes, criadoPor: null });
    if (r.novo) after(() => lerEntrada(r.id, null).catch(() => undefined));
    return NextResponse.json(
      { ok: true, novo: r.novo, unidadeNome: (un as { nome: string } | null)?.nome ?? "" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    if (erro instanceof ErroPublico) return NextResponse.json({ erro: "arquivo_recusado", mensagem: erro.message }, { status: 422 });
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }
}
