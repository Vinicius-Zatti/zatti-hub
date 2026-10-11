import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracao/token";

// O Vini lê aqui quais números podem mandar documentos e quais pastas do Drive ler ou criar.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await tokenValido(request, "caixa_entrada"))) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  const admin = createAdminClient();
  const [rem, pastas, unidades] = await Promise.all([
    admin.from("fin_caixa_entrada_remetentes").select("telefone, unidade_id").eq("ativo", true),
    admin.from("fin_caixa_entrada_pastas").select("unidade_id, situacao, pasta_id, email_compartilhar").in("situacao", ["solicitada", "ativa"]),
    admin.from("unidades").select("id, nome"),
  ]);
  if (rem.error || pastas.error || unidades.error) return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  const nome = new Map(((unidades.data as { id: string; nome: string }[]) ?? []).map((u) => [u.id, u.nome]));
  type Pasta = { unidade_id: string; situacao: string; pasta_id: string | null; email_compartilhar: string | null };
  return NextResponse.json(
    {
      remetentes: ((rem.data as { telefone: string; unidade_id: string }[]) ?? []).map((r) => ({
        telefone: r.telefone,
        unidadeNome: nome.get(r.unidade_id) ?? "",
      })),
      pastas: ((pastas.data as Pasta[]) ?? []).map((p) => ({
        unidadeId: p.unidade_id,
        unidadeNome: nome.get(p.unidade_id) ?? p.unidade_id,
        situacao: p.situacao,
        pastaId: p.pasta_id,
        emailCompartilhar: p.email_compartilhar,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
