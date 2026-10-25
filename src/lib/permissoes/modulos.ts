/** Permissões por módulo (Navegação V2, fase 6 - 25/10/2026). Regras puras, sem Next nem
 * Supabase, espelho das funções do banco em
 * `supabase/migrations/20261025090000_permissoes_por_modulo.sql`
 * (`permissao_nivel_padrao`, `permissao_nivel_maximo`, `permissao_chave_liberada`).
 *
 * A tabela `permissoes_modulo` guarda só exceções ao padrão do papel. Sem linha, a pessoa
 * continua exatamente como hoje. A barreira de verdade é o banco; aqui é o menu, as rotas e as
 * Server Actions falhando antes, com mensagem clara. */

export type NivelModulo = "sem_acesso" | "ver" | "editar";

export const NIVEIS: readonly NivelModulo[] = ["sem_acesso", "ver", "editar"];

export const ROTULO_NIVEL: Record<NivelModulo, string> = {
  sem_acesso: "Sem acesso",
  ver: "Ver",
  editar: "Editar",
};

export type ChaveModulo =
  | "estoque"
  | "vendas"
  | "financeiro"
  | "cardapio"
  | "garante"
  | "equipe"
  | "relatorios"
  | "cadastros"
  | "configuracoes";

export type ChaveAcao = "financeiro.apagar_lancamento" | "financeiro.fechar_mes" | "vendas.editar_dia_lancado";

export type ChavePermissao = ChaveModulo | ChaveAcao;

export type DefinicaoModulo = {
  chave: ChaveModulo;
  nome: string;
  /** O que o módulo cobre, em uma linha. */
  descricao: string;
  /** Já tem a barreira do banco (ou só existe pelo servidor) e pode ser alterado. */
  liberado: boolean;
};

/** Ordem do menu do piloto (Início fica sempre visível e não entra). */
export const MODULOS: readonly DefinicaoModulo[] = [
  { chave: "estoque", nome: "Estoque", descricao: "Contagem, pedidos, CMV Real e produtos", liberado: false },
  { chave: "vendas", nome: "Vendas", descricao: "Lançamento das vendas do dia", liberado: true },
  { chave: "financeiro", nome: "Financeiro", descricao: "Contas, lançamentos, cartões e conciliação", liberado: true },
  { chave: "cardapio", nome: "Cardápio", descricao: "Fichas técnicas e precificação", liberado: true },
  { chave: "garante", nome: "Garante", descricao: "Rotinas com foto, nota e planos de ação", liberado: false },
  { chave: "equipe", nome: "Equipe", descricao: "Quem usa o Zatti Hub e o que cada um acessa", liberado: true },
  { chave: "relatorios", nome: "Relatórios", descricao: "DRE, Fluxo de Caixa, DFC e Painel M.E.G.A.", liberado: true },
  { chave: "cadastros", nome: "Cadastros", descricao: "Produtos, setores, fornecedores e planos", liberado: false },
  { chave: "configuracoes", nome: "Configurações", descricao: "Dados da unidade e módulos ligados", liberado: true },
];

export type DefinicaoAcao = {
  chave: ChaveAcao;
  modulo: ChaveModulo;
  nome: string;
  descricao: string;
};

/** Ações sensíveis: liberadas para quem edita o módulo (como hoje, só gestão); o dono pode
 * tirar uma por uma. Liga/desliga, sem "ver". */
export const ACOES: readonly DefinicaoAcao[] = [
  {
    chave: "financeiro.apagar_lancamento",
    modulo: "financeiro",
    nome: "Apagar lançamento",
    descricao: "Excluir receita ou despesa (some do caixa e da DRE)",
  },
  {
    chave: "financeiro.fechar_mes",
    modulo: "financeiro",
    nome: "Fechar ou reabrir o mês",
    descricao: "Trava ou destrava os lançamentos de um mês",
  },
  {
    chave: "vendas.editar_dia_lancado",
    modulo: "vendas",
    nome: "Editar dia já lançado",
    descricao: "Corrigir as vendas de um dia que já foi gravado",
  },
];

export const CHAVES: readonly ChavePermissao[] = [...MODULOS.map((m) => m.chave), ...ACOES.map((a) => a.chave)];

export function ehChavePermissao(valor: unknown): valor is ChavePermissao {
  return typeof valor === "string" && (CHAVES as readonly string[]).includes(valor);
}

export function ehNivel(valor: unknown): valor is NivelModulo {
  return valor === "sem_acesso" || valor === "ver" || valor === "editar";
}

export function rank(nivel: NivelModulo): number {
  return nivel === "editar" ? 2 : nivel === "ver" ? 1 : 0;
}

export type PapelPermissao = "master" | "gestao" | "operacional";

/** Padrão do papel = o que a pessoa faz hoje, sem exceção. `orgInteira` = vínculo sem unidade
 * (dono). Igual a `permissao_nivel_padrao` no banco. */
export function nivelPadrao(role: PapelPermissao, orgInteira: boolean, chave: ChavePermissao): NivelModulo {
  if (role === "master") return "editar";
  if (chave === "configuracoes") return role === "gestao" && orgInteira ? "ver" : "sem_acesso";
  if (chave === "relatorios") return "ver";
  if (role === "gestao") return "editar";
  if (chave === "estoque" || chave === "vendas" || chave === "financeiro" || chave === "garante") return "editar";
  if (chave === "cardapio") return "ver";
  return "sem_acesso";
}

/** Teto da exceção: nunca acima do papel, menos Configurações "ver" para gestão. Igual a
 * `permissao_nivel_maximo` no banco. */
export function nivelMaximo(role: PapelPermissao, orgInteira: boolean, chave: ChavePermissao): NivelModulo {
  if (role === "gestao" && chave === "configuracoes") return "ver";
  return nivelPadrao(role, orgInteira, chave);
}

export function chaveLiberada(chave: ChavePermissao): boolean {
  if (chave.includes(".")) return true;
  return MODULOS.find((m) => m.chave === chave)?.liberado ?? false;
}

export type Excecoes = Partial<Record<ChavePermissao, NivelModulo>>;
export type NiveisCompletos = Record<ChavePermissao, NivelModulo>;

/** Nível efetivo de cada chave: exceção (limitada ao teto) ou padrão. Ação sensível só vale
 * com o módulo em "editar". */
export function niveisEfetivos(role: PapelPermissao, orgInteira: boolean, excecoes: Excecoes): NiveisCompletos {
  const saida = {} as NiveisCompletos;
  for (const chave of CHAVES) {
    const maximo = nivelMaximo(role, orgInteira, chave);
    const pedido = excecoes[chave] ?? nivelPadrao(role, orgInteira, chave);
    saida[chave] = rank(pedido) > rank(maximo) ? maximo : pedido;
  }
  for (const acao of ACOES) {
    if (saida[acao.modulo] !== "editar") saida[acao.chave] = "sem_acesso";
  }
  return saida;
}

/** A restrição vence (mesma regra de `unidades_modulo_negadas` no banco): cada exceção de
 * qualquer vínculo que cobre a unidade só baixa o nível. Ação sensível cai junto com o módulo. */
export function restringirPorVinculos(base: NiveisCompletos, excecoesPorVinculo: readonly Excecoes[]): NiveisCompletos {
  const saida = { ...base };
  for (const excecoes of excecoesPorVinculo) {
    for (const chave of CHAVES) {
      const nivel = excecoes[chave];
      if (nivel && rank(nivel) < rank(saida[chave])) saida[chave] = nivel;
    }
  }
  for (const acao of ACOES) {
    if (saida[acao.modulo] !== "editar") saida[acao.chave] = "sem_acesso";
  }
  return saida;
}

/** Converte linhas do banco em exceções (ignora chave ou nível desconhecido). */
export function excecoesDasLinhas(linhas: readonly { modulo: string; nivel: string }[] | null | undefined): Excecoes {
  const saida: Excecoes = {};
  for (const l of linhas ?? []) {
    if (ehChavePermissao(l.modulo) && ehNivel(l.nivel)) saida[l.modulo] = l.nivel;
  }
  return saida;
}

/** Só o que difere do padrão (o que o banco grava). */
export function apenasExcecoes(role: PapelPermissao, orgInteira: boolean, niveis: Partial<NiveisCompletos>): Excecoes {
  const saida: Excecoes = {};
  for (const chave of CHAVES) {
    const nivel = niveis[chave];
    if (nivel && nivel !== nivelPadrao(role, orgInteira, chave)) saida[chave] = nivel;
  }
  return saida;
}

/** Estado inicial da tela: exceções salvas por cima do padrão, ajustadas ao que a função
 * permite hoje (exceção antiga acima do teto, depois de trocar a função, cai no teto). */
export function rascunhoInicial(role: PapelPermissao, orgInteira: boolean, excecoes: Excecoes): NiveisCompletos {
  const bruto = {} as NiveisCompletos;
  for (const chave of CHAVES) bruto[chave] = excecoes[chave] ?? nivelPadrao(role, orgInteira, chave);
  return copiarNiveis({ role, orgInteira }, bruto);
}

/** "Copiar de...": níveis efetivos da outra pessoa, ajustados ao papel de quem recebe (nunca
 * acima do teto; chave ainda travada fica no padrão). */
export function copiarNiveis(
  destino: { role: PapelPermissao; orgInteira: boolean },
  origem: NiveisCompletos,
): NiveisCompletos {
  const saida = {} as NiveisCompletos;
  for (const chave of CHAVES) {
    const padrao = nivelPadrao(destino.role, destino.orgInteira, chave);
    if (!chaveLiberada(chave)) {
      saida[chave] = padrao;
      continue;
    }
    const maximo = nivelMaximo(destino.role, destino.orgInteira, chave);
    let nivel = origem[chave];
    if (chave.includes(".") && nivel === "ver") nivel = "sem_acesso";
    saida[chave] = rank(nivel) > rank(maximo) ? maximo : nivel;
  }
  return saida;
}

/** Opções que a pessoa pode escolher numa chave (o resto aparece desabilitado). */
export function niveisPermitidos(role: PapelPermissao, orgInteira: boolean, chave: ChavePermissao): NivelModulo[] {
  if (!chaveLiberada(chave)) return [nivelPadrao(role, orgInteira, chave)];
  const maximo = nivelMaximo(role, orgInteira, chave);
  const opcoes = chave.includes(".") ? (["sem_acesso", "editar"] as NivelModulo[]) : [...NIVEIS];
  return opcoes.filter((n) => rank(n) <= rank(maximo));
}

export function nomeChave(chave: ChavePermissao): string {
  return MODULOS.find((m) => m.chave === chave)?.nome ?? ACOES.find((a) => a.chave === chave)?.nome ?? chave;
}

/** Diferenças entre dois estados (para o botão Salvar dizer o efeito). */
export function mudancas(antes: NiveisCompletos, depois: NiveisCompletos): ChavePermissao[] {
  return CHAVES.filter((c) => antes[c] !== depois[c]);
}

function textoNivel(chave: ChavePermissao, nivel: NivelModulo): string {
  if (chave.includes(".")) return nivel === "editar" ? "liberado" : "bloqueado";
  return nivel === "sem_acesso" ? "sem acesso" : nivel === "ver" ? "só ver" : "editar";
}

/** Rótulo do botão de salvar, dizendo o efeito: "Salvar: Ana fica com Financeiro só ver e
 * Vendas sem acesso". Mais de 3 mudanças resume o resto. */
export function textoSalvarPermissoes(nome: string, antes: NiveisCompletos, depois: NiveisCompletos): string {
  const lista = mudancas(antes, depois);
  if (lista.length === 0) return "Nada mudou";
  const partes = lista.slice(0, 3).map((c) => `${nomeChave(c)} ${textoNivel(c, depois[c])}`);
  const resto = lista.length > 3 ? ` e mais ${lista.length - 3}` : "";
  const juntas = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}` : partes[0];
  return `Salvar: ${nome} fica com ${juntas}${resto}`;
}

/** Respostas de `salvar_permissoes_modulo`. `null` = deu certo. Desconhecida = erro genérico. */
export function mensagemSalvarPermissoes(codigo: unknown): string | null {
  switch (codigo) {
    case "ok":
      return null;
    case "sem_mudanca":
      return "Nada mudou: essas já são as permissões dessa pessoa.";
    case "pedido_invalido":
      return "Pedido inválido. Recarregue a página e tente de novo.";
    case "sem_permissao":
      return "Só o dono (gestão de todas as unidades) ou a Zatti mudam permissões.";
    case "fora_do_piloto":
      return "Permissões por módulo ainda estão em teste e não valem para este cliente.";
    case "nao_encontrado":
      return "Acesso não encontrado.";
    case "proprio_vinculo":
      return "Você não pode mudar as suas próprias permissões. Peça para a Zatti.";
    case "revogado":
      return "Esse acesso foi tirado. Devolva o acesso antes de mudar permissões.";
    case "alvo_dono":
      return "Permissões de outro dono (gestão de todas as unidades) só a Zatti muda.";
    case "acima_do_papel":
      return "Essa função não permite esse nível. Mude a função em \"Editar acesso\" primeiro.";
    case "modulo_indisponivel":
      return "Esse módulo ainda não pode ser alterado: segue o padrão da função.";
    default:
      return "Não foi possível salvar as permissões.";
  }
}
