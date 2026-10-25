import { requireRelatorioFinanceiro, temPermissao } from "@/lib/acesso";
import { listarCategorias, listarEstoqueMensal, listarSaidasSemReceita } from "@/lib/banco/financeiro-gerencial";
import { carregarBaseFinanceira, listarParametrosProvisao, listarReversoesProvisao } from "@/lib/banco/financeiro-gerencial-v1";
import { carregarSugestoesEstoqueContagem } from "@/lib/banco/financeiro-contagem";
import { montarDreAnualDaUnidade } from "@/lib/financeiro-gerencial/dre-unidade";
import { DreVisualizacao } from "@/components/financeiro-gerencial/dre-visualizacao";

export const dynamic = "force-dynamic";

// `?visao=` (Realizada/Projetada/Completa) saiu em 25/09 - link antigo com ele
// continua abrindo, o parâmetro só é ignorado.
export default async function DrePage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const acesso = await requireRelatorioFinanceiro();
  const { ano: anoParam } = await searchParams;
  const ano = anoParam && /^\d{4}$/.test(anoParam) ? Number(anoParam) : new Date().getFullYear();
  const podeGerir = acesso.role !== "operacional" && temPermissao(acesso, "financeiro", "editar");

  // Carga completa (não só o ano): o saldo das provisões depende do
  // histórico inteiro da unidade.
  const [{ lancamentos: todosLancamentos }, categorias, estoques, saidasSemReceita, parametros, reversoes, sugestoesContagem] = await Promise.all([
    carregarBaseFinanceira(acesso.unidadeId),
    listarCategorias(acesso.unidadeId),
    listarEstoqueMensal(acesso.unidadeId),
    listarSaidasSemReceita(acesso.unidadeId),
    listarParametrosProvisao(acesso.unidadeId),
    listarReversoesProvisao(acesso.unidadeId),
    // Fase 3 (13/10): sugestão de estoque final vinda da Contagem, só leitura.
    carregarSugestoesEstoqueContagem(acesso, ano),
  ]);

  // Mesmo cálculo do Painel M.E.G.A. (função compartilhada, sem fórmula nova).
  const { dreAnual, estoquesDoAno } = montarDreAnualDaUnidade({ ano, todosLancamentos, categorias, estoques, parametros, reversoes });

  const saidasSemReceitaDoAno = saidasSemReceita.filter((s) => s.competencia.startsWith(`${ano}-`));

  return (
    <DreVisualizacao
      dreAnual={dreAnual}
      ano={ano}
      estoquesDoAno={estoquesDoAno}
      sugestoesContagem={sugestoesContagem}
      saidasSemReceitaDoAno={saidasSemReceitaDoAno}
      podeGerir={podeGerir}
    />
  );
}
