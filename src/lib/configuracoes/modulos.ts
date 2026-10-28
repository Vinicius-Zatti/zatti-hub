import { ROTULO_CARDAPIO, ROTULO_VENDAS } from "@/lib/navegacao/menu-restaurante";

// Configurações > Módulos (Navegação V2, 24/10/2026). Lista pura dos módulos
// de uma unidade: o que cada um faz e qual chave do banco o liga. Ligar ou
// desligar é só master (regra comercial: módulo pode ser pago); o dono vê o
// estado. Exceção: a "Contagem por setor" (28/10/2026) é modo de trabalho, não
// módulo pago, e o dono e a gestão também trocam (`gestaoAltera`).

/** Colunas de `unidades` que ligam um módulo. */
export type ColunaUnidade =
  | "consolidado_vendas_habilitado"
  | "financeiro_gerencial_habilitado"
  | "conciliacao_habilitada"
  | "fichas_tecnicas_habilitado"
  | "garante_habilitado"
  | "extrato_estoque_habilitado"
  | "contagem_por_setor_habilitada";

export type ChaveModulo =
  | "estoque"
  | "vendas"
  | "financeiro"
  | "conciliacao"
  | "cardapio"
  | "garante"
  | "extrato"
  | "contagem_setor"
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
  /** Dono e gestão também ligam e desligam (não só master). */
  gestaoAltera?: boolean;
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
    chave: "contagem_setor",
    nome: "Contagem por setor",
    descricao:
      "A contagem é feita por setor (bar, cozinha, estoque), cada um com a sua lista. Desligada, a contagem segue sem setor e os setores cadastrados ficam guardados.",
    ligadoPor: { tabela: "unidades", coluna: "contagem_por_setor_habilitada" },
    soEstoqueNoBanco: true,
    gestaoAltera: true,
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
  /** Situação da contagem por setor (`situacao_contagem_por_setor`); só com estoque no banco. */
  situacaoSetor?: SituacaoContagemSetor | null;
};

export type SituacaoContagemSetor = {
  produtosSemSetor: number;
  setoresAtivos: number;
  /** Datas (DD/MM/AAAA) abertas por setor com algum setor ainda não enviado. */
  emAndamento: string[];
};

export type EstadoModulo = DefinicaoModulo & {
  ligado: boolean;
  /** Quem está vendo pode trocar a chave aqui (master; dono e gestão só onde `gestaoAltera`). */
  alteravel: boolean;
  /** Frase curta quando há uma condição (ex.: só com estoque no banco). */
  observacao?: string;
  /** Motivo de a troca estar travada agora; o botão aparece desabilitado. */
  bloqueio?: string;
  /** Aviso mostrado na confirmação antes de ligar. */
  avisoLigar?: { texto: string; link?: { href: string; rotulo: string } };
};

export function ehChaveModulo(valor: unknown): valor is ChaveModulo {
  return typeof valor === "string" && MODULOS.some((m) => m.chave === valor);
}

export function definicaoModulo(chave: ChaveModulo): DefinicaoModulo {
  const def = MODULOS.find((m) => m.chave === chave);
  if (!def) throw new Error(`Módulo desconhecido: ${chave}`);
  return def;
}

/** Desligar a contagem por setor com data aberta e setor por enviar tiraria
 * a contagem do meio do caminho: a troca espera (o banco recusa igual). Ligar
 * não trava: desligada, a contagem não deixa nada aberto no banco. */
export function bloqueioContagemPorSetor(ligado: boolean, emAndamento: readonly string[]): string | undefined {
  if (!ligado || emAndamento.length === 0) return undefined;
  const datas = emAndamento.join(", ");
  return `Há contagem por setor em andamento (${datas}). Envie todos os setores ${
    emAndamento.length > 1 ? "dessas datas" : "dessa data"
  } antes de desligar.`;
}

/** Confirmação antes de ligar: quem fica fora da contagem. */
export function avisoLigarContagemPorSetor(s: Pick<SituacaoContagemSetor, "produtosSemSetor" | "setoresAtivos">): {
  texto: string;
  link: { href: string; rotulo: string };
} {
  const link = { href: "/estoque/setores", rotulo: "Ir para Setores" };
  if (s.setoresAtivos === 0) {
    return { texto: "Ainda não há setor ativo: até criar os setores, a contagem continua sem setor.", link };
  }
  if (s.produtosSemSetor === 0) {
    return { texto: "Todos os produtos ativos já têm setor.", link };
  }
  const n = s.produtosSemSetor;
  return {
    texto: `${n} ${n === 1 ? "produto sem setor fica" : "produtos sem setor ficam"} fora da contagem até você designar.`,
    link,
  };
}

/** Monta a lista da aba Módulos. `ehMaster` decide se há botão; `ehGestao`
 * (dono ou gestão que vê Configurações) só vale onde `gestaoAltera`. */
export function estadoDosModulos(flags: FlagsModulos, ehMaster: boolean, ehGestao = false): EstadoModulo[] {
  return MODULOS.map((def) => {
    const ligado = def.ligadoPor === null ? true : flags[def.ligadoPor.coluna];
    let observacao: string | undefined;
    let bloqueio: string | undefined;
    let avisoLigar: EstadoModulo["avisoLigar"];
    let alteravel = (ehMaster || (ehGestao && def.gestaoAltera === true)) && def.ligadoPor !== null;
    if (def.soEstoqueNoBanco && !flags.fonteEstoqueNoBanco) {
      observacao = "Só existe com o estoque no Zatti Hub (esta unidade usa a planilha).";
      // Desligar continua possível; ligar a action recusa.
      alteravel = alteravel && ligado;
    }
    if (def.chave === "financeiro" && ligado && !flags.financeiro_liberado_equipe) {
      observacao = "Ligado, mas hoje só a Zatti vê o Financeiro desta unidade.";
    }
    if (def.chave === "contagem_setor" && flags.situacaoSetor) {
      bloqueio = bloqueioContagemPorSetor(ligado, flags.situacaoSetor.emAndamento);
      if (!ligado) avisoLigar = avisoLigarContagemPorSetor(flags.situacaoSetor);
    }
    if (def.dependeDe && !ligado) {
      const base = definicaoModulo(def.dependeDe);
      const baseLigada = base.ligadoPor === null || flags[base.ligadoPor.coluna];
      if (!baseLigada) observacao = `Precisa do ${base.nome} ligado.`;
    }
    return { ...def, ligado, alteravel, observacao, bloqueio, avisoLigar };
  });
}

/** Texto da confirmação antes de desligar (pedido de Vinícius, 24/10/2026). */
export function avisoDesligar(def: Pick<DefinicaoModulo, "nome" | "ligadoPor"> & { chave?: ChaveModulo }): string {
  if (def.chave === "contagem_setor") {
    return "A próxima contagem desta unidade volta a ser sem setor, com todos os produtos ativos. Os setores e a designação ficam guardados; as contagens já feitas não mudam.";
  }
  const alcance = def.ligadoPor?.tabela === "organizacoes" ? "desta organização" : "desta unidade";
  return `As telas de ${def.nome} somem para toda a equipe ${alcance}; nenhum dado é apagado.`;
}

export const FRASE_DONO_MODULOS = "Para ligar um módulo, fale com a Zatti";

/** Complemento para quem não é master: a única chave que a própria unidade troca. */
export const FRASE_DONO_CONTAGEM_SETOR = "A Contagem por setor você mesmo liga e desliga aqui";
