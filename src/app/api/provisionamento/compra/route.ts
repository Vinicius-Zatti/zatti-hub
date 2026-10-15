import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracao/token";
import { validarPedido } from "@/lib/provisionamento/regras";
import { executarProvisionamento, pedidoParaReserva, type Registro } from "@/lib/provisionamento/servidor";

// Cadastro automático de quem compra o Zatti Hub (15/10/2026). Só o Vini chama, depois de
// conferir o pagamento aprovado no Mercado Pago, com o token do escopo 'provisionamento'.
// Um registro por pagamento (`zh_provisionamento_reservar`): repetir devolve o mesmo desfecho
// e nunca cria outra conta. Respostas para o Vini:
//   200 {status: 'concluido', envio}      conta criada; envio = aceito | falhou | incerto
//   200 {status: 'revisao_manual', motivo} nada criado (ex.: e-mail já tem conta)
//   409 em_andamento | 503 tentativa falhou: o Vini tenta de novo em 5 minutos
// Nunca devolve nem loga a senha provisória.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LIMITE_CORPO = 4 * 1024;

export async function POST(request: NextRequest) {
  if (!(await tokenValido(request, "provisionamento"))) {
    return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  }
  const bruto = await request.text();
  if (bruto.length > LIMITE_CORPO) return NextResponse.json({ erro: "corpo_grande" }, { status: 413 });
  let corpo: unknown;
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return NextResponse.json({ erro: "json_invalido" }, { status: 400 });
  }
  const validado = validarPedido(corpo);
  if (!validado.ok) return NextResponse.json({ erro: validado.erro }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("zh_provisionamento_reservar", { p_pedido: pedidoParaReserva(validado.pedido) });
  if (error) {
    console.error("[provisionamento] reserva falhou", { codigo: error.code ?? null });
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }
  const reserva = data as { acao: "executar" | "terminado" | "em_andamento"; registro?: Registro };
  const semCache = { headers: { "Cache-Control": "no-store" } };

  if (reserva.acao === "em_andamento") return NextResponse.json({ erro: "em_andamento" }, { status: 409 });
  if (reserva.acao === "terminado" && reserva.registro) {
    const r = reserva.registro;
    return NextResponse.json(
      r.status === "concluido"
        ? { status: "concluido", envio: r.envio, organizacao_id: r.organizacao_id, repetido: true }
        : { status: "revisao_manual", motivo: r.motivo, repetido: true },
      semCache,
    );
  }
  if (!reserva.registro) return NextResponse.json({ erro: "indisponivel" }, { status: 503 });

  const desfecho = await executarProvisionamento(admin, reserva.registro);
  if (desfecho.status === "concluido") {
    return NextResponse.json({ status: "concluido", envio: desfecho.envio, organizacao_id: desfecho.organizacaoId }, semCache);
  }
  if (desfecho.status === "revisao_manual") return NextResponse.json({ status: "revisao_manual", motivo: desfecho.motivo }, semCache);
  return NextResponse.json({ erro: desfecho.motivo }, { status: 503 });
}
