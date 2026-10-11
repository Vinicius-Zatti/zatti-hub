import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarTudo, buscarTudoEmLotes } from "@/lib/banco/paginacao";
import { tokenValido } from "@/lib/integracao/token";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { montarAlertaDiario, type ContaDoDia } from "@/lib/financeiro-gerencial/alerta-diario";

// Alerta diário de contas a pagar (Financeiro V2, 11/10/2026). O Vini chama às 8h, manda cada
// `mensagem` para o `telefone` e confirma em /api/financeiro/alertas/enviados. Só leitura; quem já
// recebeu hoje não volta na lista. Saldo aberto líquido (sem canceladas nem quitadas), dia de São Paulo.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Parcela = {
  id: string;
  unidade_id: string;
  valor: number | string;
  data_prevista: string;
  vencimento_documento: number | null;
  fin_lancamentos: { tipo: string; descricao: string; documento_id: string | null; fin_contrapartes: { nome: string } | null; fin_documentos: { numero: string | null; descricao: string } | null };
};

export async function GET(request: NextRequest) {
  if (!(await tokenValido(request, "alertas"))) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  const hoje = hojeIsoBrasil();
  const admin = createAdminClient();

  const [destinatarios, enviados] = await Promise.all([
    admin.from("fin_alerta_destinatarios").select("unidade_id, telefone, nome").eq("ativo", true),
    admin.from("fin_alertas_enviados").select("unidade_id, telefone").eq("data", hoje).eq("tipo", "pagamentos_dia"),
  ]);
  if (destinatarios.error || enviados.error) return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  const jaEnviado = new Set(((enviados.data as { unidade_id: string; telefone: string }[]) ?? []).map((e) => `${e.unidade_id}:${e.telefone}`));
  const pendentes = ((destinatarios.data as { unidade_id: string; telefone: string; nome: string }[]) ?? []).filter(
    (d) => !jaEnviado.has(`${d.unidade_id}:${d.telefone}`),
  );
  const unidades = Array.from(new Set(pendentes.map((d) => d.unidade_id)));
  if (unidades.length === 0) return NextResponse.json({ data: hoje, envios: [] }, { headers: { "Cache-Control": "no-store" } });

  const { data: un } = await admin.from("unidades").select("id, nome").in("id", unidades);
  const nomeUnidade = new Map(((un as { id: string; nome: string }[]) ?? []).map((u) => [u.id, u.nome]));

  const parcelas = await buscarTudo<Parcela>((de, ate) =>
    admin
      .from("fin_parcelas")
      .select(
        "id, unidade_id, valor, data_prevista, vencimento_documento, fin_lancamentos!inner(tipo, descricao, documento_id, fin_contrapartes(nome), fin_documentos(numero, descricao))",
      )
      .in("unidade_id", unidades)
      .eq("fin_lancamentos.tipo", "despesa")
      .in("status", ["aberto", "parcial"])
      .lte("data_prevista", hoje)
      .order("id")
      .range(de, ate),
  );
  const baixas = await buscarTudoEmLotes<{ parcela_id: string; valor: number | string; tipo: string }>(
    parcelas.map((p) => p.id),
    (lote, de, ate) => admin.from("fin_baixas").select("id, parcela_id, valor, tipo").in("parcela_id", lote).order("id").range(de, ate),
  );
  const baixado = new Map<string, number>();
  for (const b of baixas) baixado.set(b.parcela_id, (baixado.get(b.parcela_id) ?? 0) + (b.tipo === "estorno" ? -1 : 1) * Math.round(Number(b.valor) * 100));

  const [{ data: parados }, { data: fechados }] = await Promise.all([
    admin
      .from("fin_movimentos_importados")
      .select("unidade_id")
      .in("unidade_id", unidades)
      .in("estado", ["pendente", "revisar"])
      .lt("criado_em", new Date(Date.now() - 3 * 86_400_000).toISOString()),
    admin.from("fin_fechamentos").select("unidade_id").in("unidade_id", unidades).eq("fechado", true).eq("competencia", mesAnterior(hoje)),
  ]);
  const paradosPorUnidade = new Map<string, number>();
  for (const p of (parados as { unidade_id: string }[]) ?? []) paradosPorUnidade.set(p.unidade_id, (paradosPorUnidade.get(p.unidade_id) ?? 0) + 1);
  const mesFechado = new Set(((fechados as { unidade_id: string }[]) ?? []).map((f) => f.unidade_id));
  const temFinanceiro = new Set(parcelas.map((p) => p.unidade_id));

  const envios = pendentes.flatMap((d) => {
    const daUnidade = parcelas.filter((p) => p.unidade_id === d.unidade_id);
    // Documento rateado vira uma conta só por vencimento.
    const hojeAgrupado = new Map<string, ContaDoDia>();
    let vencidasQtd = 0;
    let vencidasTotal = 0;
    let maisAntiga: string | null = null;
    const vencidasVistas = new Set<string>();
    for (const p of daUnidade) {
      const saldo = Math.round(Number(p.valor) * 100) - (baixado.get(p.id) ?? 0);
      if (saldo <= 0) continue;
      const l = p.fin_lancamentos;
      const chave = l.documento_id ? `${l.documento_id}:${p.vencimento_documento}` : p.id;
      if (p.data_prevista === hoje) {
        const atual = hojeAgrupado.get(chave);
        if (atual) atual.saldoCentavos += saldo;
        else
          hojeAgrupado.set(chave, {
            contraparte: l.fin_contrapartes?.nome ?? null,
            descricao: l.fin_documentos?.descricao ?? l.descricao,
            numero: l.fin_documentos?.numero ?? null,
            saldoCentavos: saldo,
          });
      } else {
        if (!vencidasVistas.has(chave)) vencidasQtd++;
        vencidasVistas.add(chave);
        vencidasTotal += saldo;
        if (!maisAntiga || p.data_prevista < maisAntiga) maisAntiga = p.data_prevista;
      }
    }
    const diaDoMes = Number(hoje.slice(8, 10));
    const mensagem = montarAlertaDiario({
      nomeDestinatario: d.nome,
      unidadeNome: nomeUnidade.get(d.unidade_id) ?? d.unidade_id,
      data: hoje,
      vencendoHoje: Array.from(hojeAgrupado.values()),
      vencidas: { quantidade: vencidasQtd, totalCentavos: vencidasTotal, maisAntiga },
      movimentosParados: paradosPorUnidade.get(d.unidade_id) ?? 0,
      mesAnteriorAberto: diaDoMes >= 10 && temFinanceiro.has(d.unidade_id) && !mesFechado.has(d.unidade_id) ? mesAnterior(hoje).slice(5, 7) + "/" + mesAnterior(hoje).slice(0, 4) : null,
    });
    return mensagem ? [{ unidadeId: d.unidade_id, telefone: d.telefone, mensagem }] : [];
  });
  return NextResponse.json({ data: hoje, envios }, { headers: { "Cache-Control": "no-store" } });
}

function mesAnterior(hoje: string): string {
  const [a, m] = hoje.split("-").map(Number);
  const ano = m === 1 ? a - 1 : a;
  const mes = m === 1 ? 12 : m - 1;
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}
