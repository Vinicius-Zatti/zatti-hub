"use server";

import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarTitulos } from "@/lib/banco/financeiro-documentos";
import type { TipoLancamento } from "@/lib/financeiro-gerencial/tipos";

// Caixa de Entrada: busca leve de lançamentos para "Anexar a lançamento existente".
// Só leitura pela sessão (RLS); reaproveita `listarTitulos` e junta as parcelas por lançamento.

export type LancamentoParaAnexar = {
  lancamentoId: string;
  tipo: TipoLancamento;
  descricao: string;
  contraparteNome: string | null;
  categoriaNome: string;
  documentoNumero: string | null;
  primeiraData: string;
  valor: number;
  quitado: boolean;
};

export async function listarLancamentosParaAnexarAction(): Promise<LancamentoParaAnexar[]> {
  const acesso = await requireFinanceiroGerencial();
  const [despesas, receitas] = await Promise.all([listarTitulos(acesso.unidadeId, "despesa"), listarTitulos(acesso.unidadeId, "receita")]);
  const porLancamento = new Map<string, LancamentoParaAnexar & { centavos: number }>();
  for (const t of [...despesas, ...receitas]) {
    const atual = porLancamento.get(t.lancamentoId);
    if (!atual) {
      porLancamento.set(t.lancamentoId, {
        lancamentoId: t.lancamentoId,
        tipo: t.tipo,
        descricao: t.descricao,
        contraparteNome: t.contraparteNome,
        categoriaNome: t.categoriaNome,
        documentoNumero: t.documentoNumero,
        primeiraData: t.dataPrevista,
        valor: 0,
        quitado: t.status === "quitado",
        centavos: Math.round(t.valor * 100),
      });
    } else {
      atual.centavos += Math.round(t.valor * 100);
      if (t.dataPrevista < atual.primeiraData) atual.primeiraData = t.dataPrevista;
      atual.quitado = atual.quitado && t.status === "quitado";
    }
  }
  return [...porLancamento.values()]
    .map(({ centavos, ...l }) => ({ ...l, valor: centavos / 100 }))
    .sort((a, b) => b.primeiraData.localeCompare(a.primeiraData));
}
