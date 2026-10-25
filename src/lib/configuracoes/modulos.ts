import { ROTULO_CARDAPIO, ROTULO_VENDAS } from "@/lib/navegacao/menu-restaurante";

// Configurações > Módulos (Navegação V2, 24/10/2026). Lista pura dos módulos
// de uma unidade: o que cada um faz e qual chave do banco o liga. Ligar ou
// desligar é só master (regra comercial: módulo pode ser pago); o dono vê o
// estado. Nenhuma coluna nova: são as flags que o master já liga hoje no
// Supabase ou em /acessos.

/** Colunas de `unidades` que ligam um módulo. */
export type ColunaUnidade =
  | "consolidado_vendas_habilitado"
  | "financeiro_gerencial_habilitado"
  | "conciliacao_habilitada"
  | "fichas_tecnicas_habilitado"
  | "garante_habilitado"
  | "extrato_estoque_habilitado";

export type ChaveModulo =
  | "estoque"
  | "vendas"
  | "financeiro"
  | "conciliacao"
  | "cardapio"
  | "garante"
  | "extrato"
  | "equipe";

export type DefinicaoModulo = {
  chave: ChaveModulo;
  nome: string;
  descricao: string;
  /** Onde a chave mora. `null` = sempre ligado, sem chave. */
  ligadoPor: { tabela: "unidades"; coluna: ColunaUnidade } | { tabela: "organizacoes"; coluna: "equipe_habilitado" } | null;
  /** Só faz sentido com outro módulo ligado. */
  dependeDe?: ChaveModulo;
  /** Só existe com o estoque no banco do Zatti Hub (não na planilha). */
  soEstoqueNoBanco?: boolean;
};

export const MODULOS: readonly DefinicaoModulo[] = [
  {
    chave: "estoque",
    nome: "Estoque e Compras",
    descricao: "Produtos, contagem, pedidos de compra, fornecedores e CMV Real. Faz parte de todo acesso.",
    ligadoPor: null,
  },
  {
    chave: "vendas",
    nome: ROTULO_VENDAS,
    descricao: "Lançamento do faturamento do dia por canal (Salão, Delivery próprio, iFood e 99Food) e o Painel de vendas.",
    ligadoPor: { tabela: "unidades", coluna: "consolidado_vendas_habilitado" },
  },
  {
    chave: "financeiro",
    nome: "Financeiro",
    descricao: "Receitas, despesas, contas a pagar e receber, cartões, fechamento do mês e os relatórios DRE, Fluxo de Caixa, DFC e Painel M.E.G.A.",
    ligadoPor: { tabela: "unidades", coluna: "financeiro_gerencial_habilitado" },
  },
  {
    chave: "conciliacao",
    nome: "Conciliação",
    descricao: "Confere o extrato do banco com os lançamentos do Financeiro.",
    ligadoPor: { tabela: "unidades", coluna: "conciliacao_habilitada" },
    dependeDe: "financeiro",
  },
  {
    chave: "cardapio",
    nome: ROTULO_CARDAPIO,
    descricao: "Fichas técnicas dos pratos, Margem Ideal e Precificação.",
    ligadoPor: { tabela: "unidades", coluna: "fichas_tecnicas_habilitado" },
  },
  {
    chave: "garante",
    nome: "Garante",
    descricao: "Checklists da rotina com responsável, prazo e foto, planos de ação e a nota da equipe.",
    ligadoPor: { tabela: "unidades", coluna: "garante_habilitado" },
  },
  {
    chave: "extrato",
    nome: "Extrato do estoque",
    descricao: "Movimentações e Perdas: compras recebidas, perdas com motivo e a posição de cada contagem.",
    ligadoPor: { tabela: "unidades", coluna: "extrato_estoque_habilitado" },
    soEstoqueNoBanco: true,
  },
  {
    chave: "equipe",
    nome: "Equipe",
    descricao: "A gestão cadastra a própria equipe e define o papel de cada pessoa. Vale para todas as unidades da organização.",
    ligadoPor: { tabela: "organizacoes", coluna: "equipe_habilitado" },
  },
];

/** Estado lido do banco para a unidade da sessão. */
export type FlagsModulos = Record<ColunaUnidade, boolean> & {
  equipe_habilitado: boolean;
  /** Financeiro aberto à equipe do cliente (sem isso, só a Zatti vê). */
  financeiro_liberado_equipe: boolean;
  fonteEstoqueNoBanco: boolean;
};

export type EstadoModulo = DefinicaoModulo & {
  ligado: boolean;
  /** Master pode trocar a chave aqui (dono nunca). */
  alteravel: boolean;
  /** Frase curta quando há uma condição (ex.: só com estoque no banco). */
  observacao?: string;
};

export function ehChaveModulo(valor: unknown): valor is ChaveModulo {
  return typeof valor === "string" && MODULOS.some((m) => m.chave === valor);
}

export function definicaoModulo(chave: ChaveModulo): DefinicaoModulo {
  const def = MODULOS.find((m) => m.chave === chave);
  if (!def) throw new Error(`Módulo desconhecido: ${chave}`);
  return def;
}

/** Monta a lista da aba Módulos. `ehMaster` decide se há botão. */
export function estadoDosModulos(flags: FlagsModulos, ehMaster: boolean): EstadoModulo[] {
  return MODULOS.map((def) => {
    const ligado = def.ligadoPor === null ? true : flags[def.ligadoPor.coluna];
    let observacao: string | undefined;
    let alteravel = ehMaster && def.ligadoPor !== null;
    if (def.soEstoqueNoBanco && !flags.fonteEstoqueNoBanco) {
      observacao = "Só existe com o estoque no Zatti Hub (esta unidade usa a planilha).";
      // Desligar continua possível; ligar a action recusa.
      alteravel = alteravel && ligado;
    }
    if (def.chave === "financeiro" && ligado && !flags.financeiro_liberado_equipe) {
      observacao = "Ligado, mas hoje só a Zatti vê o Financeiro desta unidade.";
    }
    if (def.dependeDe && !ligado) {
      const base = definicaoModulo(def.dependeDe);
      const baseLigada = base.ligadoPor === null || flags[base.ligadoPor.coluna];
      if (!baseLigada) observacao = `Precisa do ${base.nome} ligado.`;
    }
    return { ...def, ligado, alteravel, observacao };
  });
}

/** Texto da confirmação antes de desligar (pedido de Vinícius, 24/10/2026). */
export function avisoDesligar(def: Pick<DefinicaoModulo, "nome" | "ligadoPor">): string {
  const alcance = def.ligadoPor?.tabela === "organizacoes" ? "desta organização" : "desta unidade";
  return `As telas de ${def.nome} somem para toda a equipe ${alcance}; nenhum dado é apagado.`;
}

export const FRASE_DONO_MODULOS = "Para ligar um módulo, fale com a Zatti";
