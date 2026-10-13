import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracao/token";
import { hojeOperacao } from "@/lib/garante/regras";
import { montarMensagemAvisos, telefoneParaEnvio, type AvisoParaEnvio } from "@/lib/garante/avisos";

// Avisos do Checklist Garante pelo Vini (13/10/2026). O Vini chama a cada 10 min das 7h às 23h
// com o token do escopo 'garante'; o banco gera o que falta, revalida e reserva uma tentativa
// por unidade (`garante_avisos_reservar`); aqui só se monta o texto. O Vini manda cada
// `mensagem` para o `telefone` e confirma em /api/garante/avisos/enviados com o `tentativaId`.
// Reserva sem confirmação em 15 min vira "incerto" e não sai de novo. Sem token nada acontece.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Reserva = {
  unidade_id: string;
  unidade_nome: string;
  tentativa_id: string;
  telefone: string;
  destinatario_nome: string | null;
  avisos: AvisoParaEnvio[];
};

export async function GET(request: NextRequest) {
  if (!(await tokenValido(request, "garante"))) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  const { data, error } = await createAdminClient().rpc("garante_avisos_reservar");
  if (error) {
    console.error("garante_avisos_reservar_falhou", { codigo: error.code ?? null });
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }
  const hoje = hojeOperacao();
  const envios = ((data ?? []) as Reserva[]).map((r) => ({
    unidadeId: r.unidade_id,
    tentativaId: r.tentativa_id,
    telefone: telefoneParaEnvio(r.telefone),
    mensagem: montarMensagemAvisos({ nomeDestinatario: r.destinatario_nome, unidadeNome: r.unidade_nome, avisos: r.avisos ?? [], hoje }),
  }));
  return NextResponse.json({ envios }, { headers: { "Cache-Control": "no-store" } });
}
