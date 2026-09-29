import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";

// Relatório semanal do gasto com IA da Conciliação, para o Vini mandar a
// Vinícius toda segunda-feira no grupo ALERTAS VINI. Credencial própria:
// token no cabeçalho Authorization (nunca na URL), cujo SHA-256 fica numa
// tabela sem grant no banco. Devolve só o total da semana anterior (segunda
// a domingo, horário de Brasília), nada por cliente nem por documento.

export const dynamic = "force-dynamic";

type Resumo = {
  semana_inicio: string;
  semana_fim: string;
  custo_total_usd: number | string;
  chamadas: number;
  chamadas_sem_custo_conhecido: number;
};

function formatarUsd(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function GET(request: NextRequest) {
  const cabecalho = request.headers.get("authorization") ?? "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7).trim() : "";
  if (token.length < 32) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await supabase.rpc("fin_conciliacao_resumo_semanal_ia", { p_token: token });
  if (error) {
    const naoAutorizado = error.code === "42501";
    return NextResponse.json({ erro: naoAutorizado ? "nao_autorizado" : "indisponivel" }, { status: naoAutorizado ? 401 : 503 });
  }
  const r = data as Resumo;
  const custo = Number(r.custo_total_usd);
  const semCusto = r.chamadas_sem_custo_conhecido > 0 ? ` ${r.chamadas_sem_custo_conhecido} chamada(s) sem custo conhecido ficaram fora da soma.` : "";
  const mensagem =
    `Gasto com IA na Conciliação do Zatti Hub de ${formatarDataBr(r.semana_inicio)} a ${formatarDataBr(r.semana_fim)}: ` +
    `${formatarUsd(custo)} (estimativa pelo uso informado pela Anthropic, ${r.chamadas} chamada(s)).${semCusto}`;
  return NextResponse.json({ ...r, custo_total_usd: custo, mensagem }, { headers: { "Cache-Control": "no-store" } });
}
