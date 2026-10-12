import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { erroRpcParaHttp, validarCorpoAtualizar, validarCorpoCriar, validarPeriodo } from "@/lib/conteudo/pecas";

// Calendário editorial (Escritório > Conteúdo) para o Vini e a migração do Notion. Credencial
// própria no cabeçalho Authorization (nunca na URL), cujo SHA-256 fica em `conteudo_segredos`, sem
// grant - mesmo padrão de /api/leads/eventos. A validação abaixo devolve o erro cedo; o token, os
// campos, as listas, os limites e a versão são conferidos de novo dentro das RPCs `conteudo_api_*`.
// Contrato: `_execucao/zatti-hub/conteudo-calendario-v1.md` ("Contrato da API").

export const dynamic = "force-dynamic";

const LIMITE_CORPO_BYTES = 128 * 1024;

type Erro = { erro: string };
const SEM_CACHE = { "Cache-Control": "no-store" };

function erro(status: number, mensagem: string) {
  return NextResponse.json<Erro>({ erro: mensagem }, { status, headers: SEM_CACHE });
}

function tokenDe(request: NextRequest): string {
  const cabecalho = request.headers.get("authorization") ?? "";
  return cabecalho.startsWith("Bearer ") ? cabecalho.slice(7).trim() : "";
}

function cliente() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

function traduzirErroRpc(e: { code?: string; message?: string }) {
  const r = erroRpcParaHttp(e);
  return erro(r.status, r.erro);
}

/** Lê o corpo com teto em bytes (413) e faz o parse (400). */
async function lerCorpo(request: NextRequest): Promise<{ ok: true; corpo: unknown } | { ok: false; resposta: NextResponse }> {
  const declarado = Number(request.headers.get("content-length") ?? "0");
  if (declarado > LIMITE_CORPO_BYTES) return { ok: false, resposta: erro(413, "corpo grande demais") };
  // Lê o stream aos pedaços e para no teto, mesmo sem Content-Length.
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    const leitor = request.body?.getReader();
    while (leitor) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMITE_CORPO_BYTES) {
        await leitor.cancel().catch(() => {});
        return { ok: false, resposta: erro(413, "corpo grande demais") };
      }
      partes.push(value);
    }
  } catch {
    return { ok: false, resposta: erro(400, "corpo ilegível") };
  }
  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { bytes.set(p, pos); pos += p.byteLength; }
  try {
    return { ok: true, corpo: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, resposta: erro(400, "json inválido") };
  }
}

export async function GET(request: NextRequest) {
  const token = tokenDe(request);
  if (token.length < 32) return erro(401, "não autorizado");
  const periodo = validarPeriodo(request.nextUrl.searchParams.get("de"), request.nextUrl.searchParams.get("ate"));
  if (!periodo.ok) return erro(400, periodo.erro);
  const supabase = cliente();
  if (!supabase) return erro(503, "indisponível");
  const { data, error } = await supabase.rpc("conteudo_api_listar", {
    p_token: token,
    p_de: periodo.valor.de,
    p_ate: periodo.valor.ate,
  });
  if (error) return traduzirErroRpc(error);
  return NextResponse.json({ pecas: (data as { pecas?: unknown[] } | null)?.pecas ?? [] }, { headers: SEM_CACHE });
}

export async function POST(request: NextRequest) {
  const token = tokenDe(request);
  if (token.length < 32) return erro(401, "não autorizado");
  const lido = await lerCorpo(request);
  if (!lido.ok) return lido.resposta;
  const v = validarCorpoCriar(lido.corpo);
  if (!v.ok) return erro(400, v.erro);
  const supabase = cliente();
  if (!supabase) return erro(503, "indisponível");
  const { data, error } = await supabase.rpc("conteudo_api_criar", { p_token: token, p_peca: v.valor });
  if (error) return traduzirErroRpc(error);
  const r = data as { peca: unknown; existente: boolean };
  // Já existia (mesmo origem_notion_id): 200 com a peça atual, sem sobrescrever. Nova: 201.
  return NextResponse.json({ peca: r.peca, existente: r.existente }, { status: r.existente ? 200 : 201, headers: SEM_CACHE });
}

export async function PATCH(request: NextRequest) {
  const token = tokenDe(request);
  if (token.length < 32) return erro(401, "não autorizado");
  const lido = await lerCorpo(request);
  if (!lido.ok) return lido.resposta;
  const v = validarCorpoAtualizar(lido.corpo);
  if (!v.ok) return erro(400, v.erro);
  const supabase = cliente();
  if (!supabase) return erro(503, "indisponível");
  const { data, error } = await supabase.rpc("conteudo_api_atualizar", {
    p_token: token,
    p_id: v.valor.id,
    p_versao: v.valor.versao,
    p_campos: v.valor.campos,
  });
  if (error) return traduzirErroRpc(error);
  return NextResponse.json({ peca: (data as { peca: unknown }).peca }, { headers: SEM_CACHE });
}
