import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import type { ConsolidadoVenda } from "@/lib/types";

export type EntradaConsolidado = {
  credito: number;
  debito: number;
  pix: number;
  dinheiro: number;
  valeAlimentacao: number;
  salao: number;
  deliveryProprio: number;
  ifood: number;
  food99: number;
};

export type TotaisConsolidado = {
  totalFormasPagamento: number;
  totalCanais: number;
  totalMarketplaces: number;
  faturamentoTotal: number;
  diferenca: number;
  status: "conferido" | "divergente";
};

function paraCentavos(v: number): number {
  return Math.round(v * 100);
}

/** Único lugar que decide se um lançamento bate ou não - a Server Action
 * chama isso primeiro pra saber se mostra o aviso de divergência antes de
 * gravar, e `criarConsolidado`/`editarConsolidado` chamam de novo antes de
 * persistir, nunca confiando em total pronto vindo de fora. Soma em centavos
 * pra não pegar erro de arredondamento de float comparando reais direto
 * (0.1 + 0.2 !== 0.3 em ponto flutuante). */
export function calcularTotais(valores: EntradaConsolidado): TotaisConsolidado {
  const formasCents =
    paraCentavos(valores.credito) +
    paraCentavos(valores.debito) +
    paraCentavos(valores.pix) +
    paraCentavos(valores.dinheiro) +
    paraCentavos(valores.valeAlimentacao);
  const canaisCents = paraCentavos(valores.salao) + paraCentavos(valores.deliveryProprio);
  const marketplacesCents = paraCentavos(valores.ifood) + paraCentavos(valores.food99);
  const diferencaCents = Math.abs(formasCents - canaisCents);
  return {
    totalFormasPagamento: formasCents / 100,
    totalCanais: canaisCents / 100,
    totalMarketplaces: marketplacesCents / 100,
    faturamentoTotal: (canaisCents + marketplacesCents) / 100,
    diferenca: diferencaCents / 100,
    status: diferencaCents === 0 ? "conferido" : "divergente",
  };
}

type ConsolidadoRow = {
  id: string;
  data: string;
  credito: number;
  debito: number;
  pix: number;
  dinheiro: number;
  vale_alimentacao: number;
  salao: number;
  delivery_proprio: number;
  ifood: number;
  food99: number;
  total_formas_pagamento: number;
  total_canais: number;
  total_marketplaces: number;
  faturamento_total: number;
  diferenca: number;
  status: "conferido" | "divergente";
  criado_por: string;
  criado_em: string;
  atualizado_por: string | null;
  atualizado_em: string;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Resolve user_id -> nome via `perfis`, com fallback pra quem ainda não tem
 * nome cadastrado (convite recente) - nunca deixa a tela quebrar por falta de
 * perfil preenchido. */
async function nomesPorUserId(supabase: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const idsUnicos = Array.from(new Set(userIds));
  if (idsUnicos.length === 0) return new Map();
  const { data } = await supabase.from("perfis").select("id, nome").in("id", idsUnicos);
  const mapa = new Map<string, string>();
  for (const p of (data as { id: string; nome: string | null }[] | null) ?? []) {
    mapa.set(p.id, p.nome?.trim() || "Usuário");
  }
  return mapa;
}

function rowToConsolidado(row: ConsolidadoRow, nomes: Map<string, string>): ConsolidadoVenda {
  return {
    id: row.id,
    data: row.data,
    credito: Number(row.credito),
    debito: Number(row.debito),
    pix: Number(row.pix),
    dinheiro: Number(row.dinheiro),
    valeAlimentacao: Number(row.vale_alimentacao),
    salao: Number(row.salao),
    deliveryProprio: Number(row.delivery_proprio),
    ifood: Number(row.ifood),
    food99: Number(row.food99),
    totalFormasPagamento: Number(row.total_formas_pagamento),
    totalCanais: Number(row.total_canais),
    totalMarketplaces: Number(row.total_marketplaces),
    faturamentoTotal: Number(row.faturamento_total),
    diferenca: Number(row.diferenca),
    status: row.status,
    criadoPorNome: nomes.get(row.criado_por) ?? "Usuário",
    criadoEm: row.criado_em,
    atualizadoPorNome: row.atualizado_por ? (nomes.get(row.atualizado_por) ?? "Usuário") : null,
    atualizadoEm: row.atualizado_em,
  };
}

function valoresToRow(valores: EntradaConsolidado, totais: TotaisConsolidado) {
  return {
    credito: valores.credito,
    debito: valores.debito,
    pix: valores.pix,
    dinheiro: valores.dinheiro,
    vale_alimentacao: valores.valeAlimentacao,
    salao: valores.salao,
    delivery_proprio: valores.deliveryProprio,
    ifood: valores.ifood,
    food99: valores.food99,
    total_formas_pagamento: totais.totalFormasPagamento,
    total_canais: totais.totalCanais,
    total_marketplaces: totais.totalMarketplaces,
    faturamento_total: totais.faturamentoTotal,
    diferenca: totais.diferenca,
    status: totais.status,
  };
}

/** Lançamento já salvo pra essa data, se existir - base do aviso de "já
 * existe" na criação e da tela de edição. */
export async function getConsolidadoPorData(unidadeId: string, data: string): Promise<ConsolidadoVenda | null> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("consolidados_vendas")
    .select("*")
    .eq("unidade_id", unidadeId)
    .eq("data", data)
    .maybeSingle();
  if (!row) return null;
  const nomes = await nomesPorUserId(supabase, [row.criado_por, row.atualizado_por].filter(Boolean) as string[]);
  return rowToConsolidado(row as ConsolidadoRow, nomes);
}

export async function getConsolidadoPorId(unidadeId: string, id: string): Promise<ConsolidadoVenda | null> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("consolidados_vendas")
    .select("*")
    .eq("unidade_id", unidadeId)
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;
  const nomes = await nomesPorUserId(supabase, [row.criado_por, row.atualizado_por].filter(Boolean) as string[]);
  return rowToConsolidado(row as ConsolidadoRow, nomes);
}

/** Cria um lançamento novo. O chamador (`criarConsolidadoAction`) já deve ter
 * checado `getConsolidadoPorData` antes pra decidir a mensagem certa por
 * perfil - a constraint `unique(unidade_id, data)` aqui é só a rede de
 * segurança final contra corrida (duas pessoas salvando a mesma data ao
 * mesmo tempo). */
export async function criarConsolidado(params: {
  unidadeId: string;
  data: string;
  valores: EntradaConsolidado;
  criadoPor: string;
}): Promise<{ ok: true; consolidado: ConsolidadoVenda } | { ok: false; erro: "ja_existe" }> {
  const supabase = await createClient();
  const totais = calcularTotais(params.valores);

  const { data: novo, error } = await supabase
    .from("consolidados_vendas")
    .insert({
      unidade_id: params.unidadeId,
      data: params.data,
      ...valoresToRow(params.valores, totais),
      criado_por: params.criadoPor,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, erro: "ja_existe" };
    console.error("[consolidado-vendas:criarConsolidado]", error);
    throw new ErroPublico("Não foi possível salvar o lançamento agora. Tenta de novo em instantes.");
  }
  if (!novo) throw new ErroPublico("Não foi possível salvar o lançamento agora. Tenta de novo em instantes.");

  const salvo = await getConsolidadoPorId(params.unidadeId, novo.id);
  if (!salvo) throw new ErroPublico("Lançamento salvo, mas não foi possível confirmar a leitura. Recarrega a página.");
  return { ok: true, consolidado: salvo };
}

/** Só chamado atrás de `requireGestao()` na Server Action - recalcula tudo de
 * novo a partir dos valores brutos recebidos. */
export async function editarConsolidado(params: {
  unidadeId: string;
  id: string;
  valores: EntradaConsolidado;
  atualizadoPor: string;
}): Promise<ConsolidadoVenda> {
  const supabase = await createClient();
  const totais = calcularTotais(params.valores);

  // `.eq("unidade_id", ...)` além do id: além do RLS, a query só deve
  // afetar linha da unidade autorizada - `.select("id")` devolve as linhas
  // realmente afetadas, pra distinguir "0 linhas porque o id é de outra
  // unidade/não existe" de "gravou certo".
  const { data: atualizado, error } = await supabase
    .from("consolidados_vendas")
    .update({
      ...valoresToRow(params.valores, totais),
      atualizado_por: params.atualizadoPor,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", params.id)
    .eq("unidade_id", params.unidadeId)
    .select("id");

  if (error) {
    console.error("[consolidado-vendas:editarConsolidado]", error);
    throw new ErroPublico("Não foi possível salvar a edição agora. Tenta de novo em instantes.");
  }
  if (!atualizado || atualizado.length === 0) {
    throw new ErroPublico("Esse lançamento não foi encontrado para a sua unidade.");
  }

  const salvo = await getConsolidadoPorId(params.unidadeId, params.id);
  if (!salvo) throw new ErroPublico("Lançamento salvo, mas não foi possível confirmar a leitura. Recarrega a página.");
  return salvo;
}

/** Base do Histórico (com filtro) e do Dashboard (sem filtro de status,
 * período amplo). Mais recente primeiro. */
export async function listConsolidados(
  unidadeId: string,
  filtro?: { de?: string; ate?: string; status?: "conferido" | "divergente" }
): Promise<ConsolidadoVenda[]> {
  const supabase = await createClient();
  let query = supabase
    .from("consolidados_vendas")
    .select("*")
    .eq("unidade_id", unidadeId)
    .order("data", { ascending: false });

  if (filtro?.de) query = query.gte("data", filtro.de);
  if (filtro?.ate) query = query.lte("data", filtro.ate);
  if (filtro?.status) query = query.eq("status", filtro.status);

  const { data: rows } = await query;
  const lista = (rows as ConsolidadoRow[] | null) ?? [];
  if (lista.length === 0) return [];

  const idsUsuarios = lista.flatMap((r) => [r.criado_por, r.atualizado_por].filter(Boolean) as string[]);
  const nomes = await nomesPorUserId(supabase, idsUsuarios);
  return lista.map((r) => rowToConsolidado(r, nomes));
}
