import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracao/token";

// Captura de NF-e pela SEFAZ (30/10/2026): o robô conta cada lote lido, cada Ciência e o fim da
// rodada. O NSU só anda para frente e só depois dos XMLs do lote gravados (regra no banco).

export const dynamic = "force-dynamic";

const chave = z.string().regex(/^\d{44}$/);
const nsu = z.string().regex(/^\d{1,15}$/);
const progresso = z.object({
  certificadoId: z.string().uuid(),
  ultNsu: nsu.optional(),
  maxNsu: nsu.optional(),
  bloqueadoAte: z.string().datetime().optional(),
  resumos: z.array(z.object({
    chave,
    emitenteCnpj: z.string().max(20).nullable().optional(),
    emitenteNome: z.string().max(400).nullable().optional(),
    emissao: z.string().max(10).nullable().optional(),
    valorCentavos: z.number().int().min(0).max(1e12).optional(),
    situacaoNfe: z.string().max(1).nullable().optional(),
  }).strict()).max(60).optional(),
  xmlSalvos: z.array(chave).max(60).optional(),
  ciencias: z.array(z.object({ chave, ok: z.boolean(), cStat: z.string().max(3).nullable().optional() }).strict()).max(20).optional(),
  tentativas: z.array(z.object({ chave, cStat: z.string().max(3).nullable().optional() }).strict()).max(20).optional(),
  fim: z.object({
    situacao: z.enum(["ok", "erro"]),
    erroCodigo: z.string().max(60).nullable().optional(),
    iniciadoEm: z.string().datetime().optional(),
    notasNovas: z.number().int().min(0).optional(),
    resumos: z.number().int().min(0).optional(),
    ciencias: z.number().int().min(0).optional(),
    cienciasRecusadas: z.number().int().min(0).optional(),
    chamadas: z.number().int().min(0).optional(),
    filaZerou: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export async function POST(request: NextRequest) {
  if (!(await tokenValido(request, "sefaz"))) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  let corpo: z.infer<typeof progresso>;
  try {
    corpo = progresso.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "entrada_invalida" }, { status: 400 });
  }
  const { certificadoId, ...dados } = corpo;
  const { error } = await createAdminClient().rpc("fin_sefaz_progresso", { p_certificado: certificadoId, p_dados: dados });
  if (error) {
    console.error("sefaz_progresso_falhou", { codigo: error.code ?? null });
    return NextResponse.json({ erro: error.code === "P0002" ? "certificado_nao_cadastrado" : "indisponivel" }, { status: error.code === "P0002" ? 404 : 503 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
