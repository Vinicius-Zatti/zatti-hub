import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracao/token";
import { lerEntrada, receberArquivo } from "@/lib/caixa-entrada/processar";
import { chaveDaNfe } from "@/lib/caixa-entrada/nfe-xml";
import { ErroPublico } from "@/lib/erros";

// Entrada de notas, boletos e recibos vinda do Vini (WhatsApp de número cadastrado ou pasta do
// Drive da unidade) e, desde 30/10/2026, o XML que o robô da SEFAZ baixou (canal "sefaz", token
// próprio). Só guarda e lê; quem lança é uma pessoa na tela da Caixa de Entrada.
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
  z.object({
    canal: z.literal("sefaz"),
    certificadoId: z.string().uuid(),
    chave: z.string().regex(/^\d{44}$/),
    nomeArquivo: z.string().min(1).max(200),
    base64: z.string().min(4),
  }).strict(),
]);

export async function POST(request: NextRequest) {
  const tokenCaixa = await tokenValido(request, "caixa_entrada");
  const tokenSefaz = !tokenCaixa && (await tokenValido(request, "sefaz"));
  if (!tokenCaixa && !tokenSefaz) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  let corpo: z.infer<typeof entrada>;
  try {
    corpo = entrada.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "entrada_invalida" }, { status: 400 });
  }
  // Cada token só serve o seu canal.
  if ((corpo.canal === "sefaz") !== tokenSefaz) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
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
  } else if (corpo.canal === "sefaz") {
    const { data } = await admin.from("fin_sefaz_certificados").select("unidade_id, cnpj").eq("id", corpo.certificadoId).eq("ativo", true).maybeSingle();
    const c = data as { unidade_id: string; cnpj: string } | null;
    if (!c) return NextResponse.json({ erro: "certificado_nao_cadastrado" }, { status: 404 });
    // O XML tem de ser a nota anunciada; o leitor confere a chave de novo ao registrar.
    if (chaveDaNfe(Buffer.from(corpo.base64, "base64").toString("utf8")) !== corpo.chave) {
      return NextResponse.json({ erro: "chave_nao_confere" }, { status: 422 });
    }
    unidadeId = c.unidade_id;
    remetente = `SEFAZ (CNPJ final ${c.cnpj.slice(-6)})`;
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
    if (r.novo || r.situacao === "recebido") after(() => lerEntrada(r.id, null).catch(() => undefined));
    return NextResponse.json(
      { ok: true, novo: r.novo, unidadeNome: (un as { nome: string } | null)?.nome ?? "" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    if (erro instanceof ErroPublico) return NextResponse.json({ erro: "arquivo_recusado", mensagem: erro.message }, { status: 422 });
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }
}
