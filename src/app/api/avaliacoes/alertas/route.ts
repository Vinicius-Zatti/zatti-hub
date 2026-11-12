import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracao/token";
import { montarMensagemAlertas, telefoneParaEnvio, type AlertaParaEnvio } from "@/lib/avaliacoes/alertas";

// Alerta de nota baixa das Avaliações pelo Vini (12/11/2026). Mesmo contrato e mesmo token (escopo
// 'garante') dos avisos do Garante: o Vini chama a cada 10 min; o banco expira o velho e reserva
// uma tentativa por unidade só das 7h às 23h e só com destinatário válido
// (`avaliacoes_alertas_reservar`); aqui só se monta o texto. O Vini manda cada `mensagem` para o
// `telefone` e confirma em /api/avaliacoes/alertas/enviados com o `tentativaId`. Reserva sem
// confirmação em 15 min vira "incerto" e não sai de novo. Sem token nada acontece.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Reserva = {
  unidade_id: string;
  unidade_nome: string;
  tentativa_id: string;
  telefone: string;
  destinatario_nome: string | null;
  alertas: AlertaParaEnvio[];
};

export async function GET(request: NextRequest) {
  if (!(await tokenValido(request, "garante"))) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  const { data, error } = await createAdminClient().rpc("avaliacoes_alertas_reservar");
  if (error) {
    console.error("avaliacoes_alertas_reservar_falhou", { codigo: error.code ?? null });
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }
  const envios = ((data ?? []) as Reserva[]).map((r) => ({
    unidadeId: r.unidade_id,
    tentativaId: r.tentativa_id,
    telefone: telefoneParaEnvio(r.telefone),
    mensagem: montarMensagemAlertas({ nomeDestinatario: r.destinatario_nome, unidadeNome: r.unidade_nome, alertas: r.alertas ?? [] }),
  }));
  return NextResponse.json({ envios }, { headers: { "Cache-Control": "no-store" } });
}
