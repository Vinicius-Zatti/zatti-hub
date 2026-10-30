import { GRUPOS_FORA_DE_FICHA } from "@/lib/fichas-tecnicas";
import { GRUPO_NOMES } from "@/lib/grupos";
import { usaNavegacaoV2 } from "@/lib/navegacao/piloto";
import { rank, type NiveisCompletos } from "@/lib/permissoes/modulos";
import type { Produto, SugestaoCompra } from "@/lib/types";

/** Cadastro rápido no lugar onde se usa (Navegação V2, 24/10/2026): o produto
 * criado no modal entra direto na lista da tela aberta, sem recarregar e sem
 * perder o que já foi digitado. Funções puras de propósito - rodam no
 * componente client e no servidor, sem puxar `lib/banco/*` nem `lib/sheets/*`. */

/** Mesmo formato de `OpcaoProdutoFicha` (`listarProdutosParaFicha`). */
export type OpcaoProdutoCadastroRapido = {
  sku: string;
  nome: string;
  unidadeUso: string;
  custoUnitario: number | null;
  grupo: string;
};

/** Produto recém-criado como opção de componente de ficha técnica. Produto
 * novo ainda não tem conversão de unidade, então a unidade de uso é a base e o
 * custo é o preço unitário - igual `listarProdutosParaFicha` faria depois de
 * recarregar. `null` quando o produto nunca entra em receita (inativo ou grupo
 * de `GRUPOS_FORA_DE_FICHA`). */
export function produtoParaOpcaoFicha(produto: Produto): OpcaoProdutoCadastroRapido | null {
  if (!produto.ativo || GRUPOS_FORA_DE_FICHA.has(produto.grupo)) return null;
  return {
    sku: produto.sku,
    nome: produto.nome,
    unidadeUso: produto.unidadeBase,
    custoUnitario: produto.precoUnitario,
    grupo: produto.grupo,
  };
}

/** Acrescenta (ou troca, se o SKU já está na lista) sem duplicar. */
export function incluirPorSku<T extends { sku: string }>(lista: T[], item: T): T[] {
  return lista.some((i) => i.sku === item.sku) ? lista.map((i) => (i.sku === item.sku ? item : i)) : [...lista, item];
}

export const ALERTA_CADASTRADO_AGORA = "Cadastrado agora, sem contagem";

/** Produto que não estava na contagem como linha da Criar Cotação: estoque
 * "não contado", sem sugestão - quem comprou decide a quantidade à mão. */
export function produtoParaSugestaoCompra(produto: Produto, alerta = ALERTA_CADASTRADO_AGORA): SugestaoCompra {
  return {
    sku: produto.sku,
    grupo: produto.grupo,
    nome: produto.nome,
    unidadeBase: produto.unidadeBase,
    precoUnitario: produto.precoUnitario,
    precoNaContagem: null,
    estoqueAtual: null,
    estoqueNecessario: produto.estoqueNecessarioSemana,
    quantidadeSugerida: 0,
    precisaComprar: false,
    fornecedores: [produto.fornecedor1, produto.fornecedor2, produto.fornecedor3, produto.fornecedor4].filter(
      (f) => f && f.trim() !== "",
    ),
    nomeCompra: produto.nomeCompra,
    unidadeEmbalagemFornecedor: produto.unidadeEmbalagemFornecedor,
    qtdUnidadeBasePorEmbalagem: produto.qtdUnidadeBasePorEmbalagem,
    alerta,
    setoresQueNaoContaram: [],
    datasContagem: [],
  };
}

export const ALERTA_FORA_DA_CONTAGEM = "Confirmado fora da contagem";

/** Item confirmado com quantidade maior que zero na cotação que não faz parte
 * do escopo da contagem (ex.: produto cadastrado ali mesmo pelo atalho)
 * continua aparecendo depois de recarregar a página, com a etiqueta
 * `ALERTA_FORA_DA_CONTAGEM` - sem isso a quantidade ficava gravada, mas a
 * linha sumia da tela. Confirmado com zero não volta (não há compra a
 * mostrar). Ignora produto inativo ou já presente. */
export function completarComItensConfirmados(
  itens: SugestaoCompra[],
  produtos: Produto[],
  quantidadesSalvas: Record<string, number>,
): SugestaoCompra[] {
  const presentes = new Set(itens.map((i) => i.sku));
  const extras = produtos
    .filter((p) => p.ativo && !presentes.has(p.sku) && (quantidadesSalvas[p.sku] ?? 0) > 0)
    .map((p) => produtoParaSugestaoCompra(p, ALERTA_FORA_DA_CONTAGEM));
  return extras.length > 0 ? [...itens, ...extras] : itens;
}

/** Linhas cadastradas pelo atalho que entram na tela, sem duplicar SKU que já
 * veio do servidor. */
export function mesclarItensNovos(itens: SugestaoCompra[], novos: SugestaoCompra[]): SugestaoCompra[] {
  const presentes = new Set(itens.map((i) => i.sku));
  const extras = novos.filter((n) => !presentes.has(n.sku));
  return extras.length > 0 ? [...itens, ...extras] : itens;
}

/** Mesma orientação do produto criado a partir de uma pendência
 * (`produtos/actions.ts`): o cadastro rápido não designa setor. */
export const AVISO_DEFINIR_SETOR =
  "Defina o setor em Estoque > Setores para ele entrar na próxima contagem.";

/** Só a unidade com contagem por setor (fonte banco) precisa do aviso. */
export function precisaAvisoSetor(contagemPorSetorAtiva: boolean, fonteDadosEstoque: string): boolean {
  return contagemPorSetorAtiva && fonteDadosEstoque === "banco";
}

export function comAvisoSetor(texto: string, avisarSetor: boolean): string {
  return avisarSetor ? `${texto} ${AVISO_DEFINIR_SETOR}` : texto;
}

/** Aviso depois de cadastrar pelo atalho da Criar Cotação. */
export function avisoProdutoCotacao(opcoes: {
  nome: string;
  grupoNome: string;
  podeDigitar: boolean;
  avisarSetor: boolean;
}): string {
  const { nome, grupoNome, podeDigitar, avisarSetor } = opcoes;
  const texto = podeDigitar
    ? `"${nome}" cadastrado. Digite quanto comprar na linha marcada em ${grupoNome}.`
    : `"${nome}" cadastrado e incluído em ${grupoNome}.`;
  return comAvisoSetor(texto, avisarSetor);
}

/** Aviso depois de cadastrar pelo atalho da ficha técnica. `entrouNaFicha`
 * falso = grupo que nunca entra em receita (LIM, OPE). */
export function avisoInsumoFicha(opcoes: {
  nome: string;
  grupo: string;
  entrouNaFicha: boolean;
  avisarSetor: boolean;
}): string | null {
  const { nome, grupo, entrouNaFicha, avisarSetor } = opcoes;
  if (!entrouNaFicha) {
    return comAvisoSetor(`"${nome}" foi cadastrado no Estoque, mas o grupo ${grupo} não entra em ficha técnica.`, avisarSetor);
  }
  return avisarSetor ? comAvisoSetor(`"${nome}" cadastrado e escolhido na linha.`, true) : null;
}

/** O que a tela recebe para mostrar os atalhos. `null` = sem atalho (fora do
 * piloto ou papel que não cadastra produto). `insumoRestrito` só vale no "+ Novo insumo" da
 * ficha: ver `insumoPelaFichaRestrito`. */
export type ConfigCadastroRapido = { avisarSetor: boolean; insumoRestrito?: boolean };

export function configCadastroRapido(
  liberado: boolean,
  contagemPorSetorAtiva: boolean,
  fonteDadosEstoque: string,
): ConfigCadastroRapido | null {
  return liberado ? { avisarSetor: precisaAvisoSetor(contagemPorSetorAtiva, fonteDadosEstoque) } : null;
}

/** Insumo novo pela ficha técnica (decisão de Vinícius, 29/10/2026): quem edita ficha (Cardápio
 * "chef" ou mais, inclusive a operação com a exceção de chef) cadastra produto novo pelo "+ Novo
 * insumo", mesmo sem "editar" em Cadastros. Só criar: editar e excluir produto e a tela de
 * Produtos seguem de Cadastros. Fora da Navegação V2 não há atalho. O banco repete a regra
 * (`usuario_pode_criar_produto_pela_ficha`). */
export function podeCadastrarProdutoPelaFicha(acesso: {
  unidadeId: string;
  areaInterna: boolean;
  fichasTecnicasHabilitado: boolean;
  permissoes: Pick<NiveisCompletos, "cardapio">;
}): boolean {
  return (
    acesso.fichasTecnicasHabilitado &&
    usaNavegacaoV2(acesso) &&
    rank(acesso.permissoes.cardapio) >= rank("chef")
  );
}

/** Decisão de Vinícius (30/10/2026): quem cria SÓ pelo caminho da ficha, sem "editar" em
 * Cadastros (o chef, o gerente chef, a gestão que só vê Cadastros), cria apenas insumo de grupo
 * que entra em ficha e sem estoque mínimo nem estoque necessário da semana (nascem vazios).
 * Gestão/master com "editar" em Cadastros seguem com todos os campos. O banco repete a regra
 * no gatilho `exigir_permissao_criar_produto`. */
export function insumoPelaFichaRestrito(acesso: {
  role: string;
  permissoes: Pick<NiveisCompletos, "cadastros">;
}): boolean {
  const gestao = acesso.role === "gestao" || acesso.role === "master";
  return !(gestao && rank(acesso.permissoes.cadastros) >= rank("editar"));
}

/** Grupo que pode nascer pelo "+ Novo insumo" no modo restrito (fora LIM e OPE). */
export function grupoEntraEmFicha(grupo: string): boolean {
  // Lista de grupos conhecidos, não lista negra: grupo inventado ou com caractere invisível não passa.
  const codigo = grupo.trim().toUpperCase();
  return codigo in GRUPO_NOMES && !GRUPOS_FORA_DE_FICHA.has(codigo);
}

export const MENSAGEM_GRUPO_FORA_DA_FICHA =
  "Pela ficha técnica só se cadastra insumo de grupo que entra em ficha. Limpeza e Operacional ficam em Cadastros.";

/** Atalho "+ Novo insumo" das telas de ficha técnica. */
export function configCadastroRapidoFicha(
  acesso: Parameters<typeof podeCadastrarProdutoPelaFicha>[0] &
    Parameters<typeof insumoPelaFichaRestrito>[0] & { fonteDadosEstoque: string },
  contagemPorSetorAtiva: boolean,
): ConfigCadastroRapido | null {
  const base = configCadastroRapido(
    podeCadastrarProdutoPelaFicha(acesso),
    contagemPorSetorAtiva,
    acesso.fonteDadosEstoque,
  );
  return base && { ...base, insumoRestrito: insumoPelaFichaRestrito(acesso) };
}
