import { redirect } from "next/navigation";
import { DICAS_BLOCO_CONTAGEM } from "@/components/navegacao-v2/bloco-contagem";
import { DashboardAreas, type AreaDashboard } from "@/components/navegacao-v2/dashboard-areas";
import { carregarResumoGarantePainel } from "@/app/(app)/garante/dados";
import { requireGestao } from "@/lib/acesso";
import { listarCategorias, listarContasFinanceiras, listarEstoqueMensal } from "@/lib/banco/financeiro-gerencial";
import { carregarBaseFinanceira, listarParametrosProvisao, listarReversoesProvisao } from "@/lib/banco/financeiro-gerencial-v1";
import { listarMetasUnidade } from "@/lib/banco/financeiro-metas";
import { DICA_PEDIDOS_PENDENTES, resumirEstoque } from "@/lib/estoque/resumo";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { MESES_POR_EXTENSO } from "@/lib/financeiro-gerencial/dre-avisos";
import { montarDreAnualDaUnidade } from "@/lib/financeiro-gerencial/dre-unidade";
import { EXPLICACAO_CALCULO } from "@/lib/financeiro-gerencial/explicacoes-dre";
import { caixaProjetadoEmDias, montarPainelMega } from "@/lib/financeiro-gerencial/painel-mega";
import { DICA_CARD_GARANTE } from "@/lib/garante/planos";
import { textoNota } from "@/lib/garante/nota";
import { usaNavegacaoV2 } from "@/lib/navegacao/piloto";
import { listPedidosFeitos } from "@/lib/pedidos";
import { listInventario } from "@/lib/sheets/inventario";
import { listProdutos } from "@/lib/sheets/produtos";
import type { AcessoAtual } from "@/lib/acesso";

export const dynamic = "force-dynamic";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatarMoeda(valor: number | null): string {
  return valor === null ? "-" : moeda.format(valor);
}

function formatarPercentual(valor: number | null): string {
  if (valor === null) return "-";
  return valor.toLocaleString("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Uma área fora do ar não derruba o Dashboard: o cartão dela avisa e os outros aparecem. */
async function ouNull<T>(rotulo: string, promessa: Promise<T>): Promise<T | null> {
  try {
    return await promessa;
  } catch (erro) {
    console.error(`[dashboard] falha ao carregar ${rotulo}:`, erro);
    return null;
  }
}

async function carregarEstoque(acesso: AcessoAtual) {
  const [produtos, inventario, pedidos] = await Promise.all([
    listProdutos(acesso.spreadsheetId),
    listInventario(acesso.spreadsheetId),
    listPedidosFeitos(acesso.unidadeId),
  ]);
  return resumirEstoque(produtos, inventario, pedidos);
}

/** Exatamente o cálculo da página do Painel M.E.G.A. para o mês atual. */
async function carregarPainelMega(acesso: AcessoAtual, hoje: string) {
  const [ano, mes] = hoje.slice(0, 7).split("-").map(Number);
  const [{ lancamentos: todosLancamentos, baixas }, categorias, contas, estoques, parametros, reversoes, metas] = await Promise.all([
    carregarBaseFinanceira(acesso.unidadeId),
    listarCategorias(acesso.unidadeId),
    listarContasFinanceiras(acesso.unidadeId),
    listarEstoqueMensal(acesso.unidadeId),
    listarParametrosProvisao(acesso.unidadeId),
    listarReversoesProvisao(acesso.unidadeId),
    listarMetasUnidade(acesso.unidadeId),
  ]);
  const { dreAnual, receitaVendasProdutosPorMes } = montarDreAnualDaUnidade({ ano, todosLancamentos, categorias, estoques, parametros, reversoes });
  return montarPainelMega({
    dreAnual,
    mesIndice: mes - 1,
    receitaVendasProdutosPorMes,
    metas,
    caixaProjetado30Dias: caixaProjetadoEmDias({ hoje, dias: 30, lancamentos: todosLancamentos, baixas, contas }),
    hoje,
    lancamentos: todosLancamentos,
    categorias,
  });
}

/** Dashboard por área (Navegação V2, fase 3, 24/10/2026): aba do Início do
 * piloto, só gestão/master (`requireGestao`, que aceita os dois). Usa só
 * números que o app já calcula: Estoque (`resumirEstoque`, o do Painel geral
 * e da Visão geral), Financeiro (`montarPainelMega`, o do Painel M.E.G.A.) e
 * Garante (`carregarResumoGarantePainel`, o do Painel geral). Vendas e
 * Cardápio não têm resumo pronto: entram como proposta, sem número. Fora do
 * piloto a rota volta para o Painel geral. */
export default async function DashboardPage() {
  const acesso = await requireGestao();
  if (!usaNavegacaoV2(acesso)) redirect("/painel");
  const hoje = hojeIsoBrasil();
  const nomeMes = `${MESES_POR_EXTENSO[Number(hoje.slice(5, 7)) - 1]}/${hoje.slice(0, 4)}`;

  const [estoque, painel, garante] = await Promise.all([
    ouNull("estoque", carregarEstoque(acesso)),
    acesso.financeiroGerencialHabilitado ? ouNull("financeiro", carregarPainelMega(acesso, hoje)) : undefined,
    acesso.garanteHabilitado ? ouNull("garante", carregarResumoGarantePainel(acesso)) : undefined,
  ]);

  const areas: AreaDashboard[] = [];

  const baseEstoque = { area: "Estoque", icone: "estoque" as const, href: "/estoque/visao-geral", rotuloLink: "Abrir Estoque" };
  if (!estoque) areas.push({ ...baseEstoque, tipo: "erro" });
  else
    areas.push({
      ...baseEstoque,
      tipo: "dados",
      contexto: estoque.ultimaContagem ? `Última contagem em ${estoque.ultimaContagem}` : "Ainda sem contagem",
      numeros: [
        { rotulo: "Valor em estoque", valor: formatarMoeda(estoque.ultimaContagem ? estoque.valorEstoque : null), dica: DICAS_BLOCO_CONTAGEM.valor },
        {
          rotulo: "Itens que pedem compra",
          valor: String(estoque.alertasCompra),
          dica: DICAS_BLOCO_CONTAGEM.compra,
          alerta: estoque.alertasCompra > 0,
        },
        { rotulo: "Itens contados", valor: String(estoque.itensContados), dica: DICAS_BLOCO_CONTAGEM.itens },
        {
          rotulo: "Pedidos aguardando receber",
          valor: String(estoque.pedidosPendentes),
          dica: DICA_PEDIDOS_PENDENTES,
          alerta: estoque.pedidosPendentes > 0,
        },
      ],
    });

  if (painel !== undefined) {
    const baseFinanceiro = {
      area: "Financeiro",
      icone: "financeiroGerencial" as const,
      href: "/financeiro-gerencial/painel-mega",
      rotuloLink: "Abrir Painel M.E.G.A.",
    };
    if (!painel) areas.push({ ...baseFinanceiro, tipo: "erro" });
    else {
      const cmvFechado = painel.cmvPercentual.percentualCmvFechado;
      areas.push({
        ...baseFinanceiro,
        tipo: "dados",
        contexto: `Painel M.E.G.A. de ${nomeMes}${cmvFechado ? "" : " (CMV provisório)"}`,
        numeros: [
          { rotulo: "Faturamento", valor: formatarMoeda(painel.faturamento.valor), dica: EXPLICACAO_CALCULO.painel_faturamento },
          {
            rotulo: cmvFechado ? "% CMV" : "% CMC (provisório)",
            valor: formatarPercentual(painel.cmvPercentual.valor),
            dica: EXPLICACAO_CALCULO.painel_cmv_percentual,
          },
          {
            rotulo: "Resultado",
            valor: formatarMoeda(painel.resultado.valor),
            dica: EXPLICACAO_CALCULO.painel_resultado,
            alerta: (painel.resultado.valor ?? 0) < 0,
          },
          {
            rotulo: "Caixa projetado em 30 dias",
            valor: formatarMoeda(painel.caixaProjetado30Dias.saldo),
            dica: EXPLICACAO_CALCULO.painel_caixa_30,
            alerta: painel.caixaProjetado30Dias.saldo < 0,
          },
        ],
      });
    }
  }

  if (garante !== undefined) {
    const baseGarante = { area: "Garante", icone: "tarefas" as const, href: "/garante/quadro", rotuloLink: "Abrir Quadro do dia" };
    if (!garante) areas.push({ ...baseGarante, tipo: "erro" });
    else
      areas.push({
        ...baseGarante,
        tipo: "dados",
        contexto: "Rotina da unidade: últimos 7 dias e hoje",
        numeros: [
          { rotulo: "Nota 7 dias", valor: textoNota(garante.nota), dica: DICA_CARD_GARANTE.nota },
          { rotulo: "Atrasados hoje", valor: String(garante.atrasadosHoje), dica: DICA_CARD_GARANTE.atrasados, alerta: garante.atrasadosHoje > 0 },
          {
            rotulo: "Críticos fora da meta (7 dias)",
            valor: String(garante.criticosFora),
            dica: DICA_CARD_GARANTE.criticos,
            alerta: garante.criticosFora > 0,
          },
          {
            rotulo: garante.planosAtrasados > 0 ? `Planos abertos (${garante.planosAtrasados} atrasados)` : "Planos abertos",
            valor: String(garante.planosAbertos),
            dica: DICA_CARD_GARANTE.planos,
            alerta: garante.planosAtrasados > 0,
          },
        ],
      });
  }

  if (acesso.consolidadoVendasHabilitado)
    areas.push({
      area: "Vendas",
      icone: "financeiro",
      href: "/financeiro/consolidado/dashboard",
      rotuloLink: "Abrir Painel de vendas",
      tipo: "proposta",
      itens: [
        "Faturamento da semana por canal: Salão, Delivery próprio, iFood e 99Food",
        "Comparação com a mesma semana do mês anterior",
        "Dias sem lançamento no Consolidado de vendas",
      ],
    });

  if (acesso.fichasTecnicasHabilitado)
    areas.push({
      area: "Cardápio",
      icone: "fichas",
      href: "/fichas-tecnicas",
      rotuloLink: "Abrir Fichas técnicas",
      tipo: "proposta",
      itens: [
        "Fichas com margem abaixo da Margem Ideal",
        "Fichas com insumo sem preço (custo incompleto)",
        "Insumos que mais subiram de preço na última cotação",
      ],
    });

  return <DashboardAreas areas={areas} mes={nomeMes} />;
}
