import type { Pedido, PedidoItem, Produto, SugestaoCompra } from "@/lib/types";
import { GRUPO_ORDEM } from "@/lib/grupos";

export const SEM_FORNECEDOR = "Sem fornecedor cadastrado";

function chaveNormalizada(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resolve o nome bruto de um fornecedor (texto copiado no momento da
 * seleção em Produtos, ou já salvo num Pedido antigo) pro nome canônico
 * atual do cadastro, se achar correspondência ignorando espaço/maiúscula -
 * sem isso, renomear um fornecedor (ou uma variação de digitação entre
 * produtos) deixa produto/pedido antigo "órfão" do nome atual. Sem
 * correspondência no cadastro, devolve o nome como veio (não inventa
 * fornecedor que não existe). */
export function nomeFornecedorCanonico(nome: string, fornecedoresCadastro: string[]): string {
  const chave = chaveNormalizada(nome);
  for (const candidato of fornecedoresCadastro) {
    if (chaveNormalizada(candidato) === chave) return candidato;
  }
  return nome;
}

/** Agrupa por fornecedor, pra montar a lista de cotação/pedido de cada um.
 * Sem fornecedor cadastrado só entra no grupo avulso se realmente precisa
 * comprar - senão o grupo vira ruído de produto que nem precisa de pedido.
 *
 * `fornecedoresCadastro` normaliza o nome bruto de cada produto contra o
 * cadastro atual antes de agrupar - achado real com "Sem Limite"
 * duplicado em Pedidos mesmo com só 1 registro em Fornecedores. Sem essa
 * lista (chamada sem o segundo argumento) agrupa pelo nome bruto mesmo,
 * igual antes.
 *
 * Funções puras (sem I/O) de propósito - usadas tanto no servidor quanto em
 * componente client, não podem puxar nada de `lib/sheets/*`. */
export function agruparPorFornecedor(
  itens: SugestaoCompra[],
  fornecedoresCadastro: string[] = []
): Record<string, SugestaoCompra[]> {
  const grupos: Record<string, SugestaoCompra[]> = {};
  for (const item of itens) {
    const fornecedores = item.fornecedores.length
      ? item.fornecedores
      : item.precisaComprar
        ? [SEM_FORNECEDOR]
        : [];
    // Set pra não duplicar a linha do item se, por engano, dois dos quatro
    // campos Fornecedor 1-4 do mesmo produto apontarem pro mesmo fornecedor
    // (direto ou via normalização acima).
    const nomesCanonicos = new Set(fornecedores.map((f) => nomeFornecedorCanonico(f, fornecedoresCadastro)));
    for (const f of nomesCanonicos) {
      if (!grupos[f]) grupos[f] = [];
      grupos[f].push(item);
    }
  }
  return grupos;
}

/** Reconcilia Pedidos já salvos com o nome canônico atual do fornecedor -
 * mesmo problema de `agruparPorFornecedor`, mas do lado do que já foi
 * confirmado: Pedido salvo grava o texto exato do fornecedor no momento da
 * confirmação, então uma variação de espaço/maiúscula (ou o fornecedor
 * renomeado no cadastro depois) deixava o pedido antigo "órfão" do nome
 * atual - Editor de Espelhos mostrava um bloco vazio com o nome certo (só
 * a sugestão fresca, sem o que já foi confirmado) ao lado de outro bloco
 * com o nome velho e o pedido de verdade dentro, os dois pro mesmo
 * fornecedor real. Se dois Pedidos salvos canonizarem pro mesmo nome (caso
 * raro, mas possível: nada impedia 2 grafias diferentes de cada uma ter
 * sua própria linha), une os itens dos dois em vez de mostrar só um e
 * esconder o outro - o Pedido mais recente (`atualizadoEm`) empresta
 * id/previsão de entrega/recebido pro bloco combinado. */
export function mesclarPedidosPorFornecedorCanonico(pedidos: Pedido[], fornecedoresCadastro: string[]): Pedido[] {
  const porCanonico = new Map<string, Pedido[]>();
  for (const pedido of pedidos) {
    const nome = nomeFornecedorCanonico(pedido.fornecedor, fornecedoresCadastro);
    const lista = porCanonico.get(nome) ?? [];
    lista.push(pedido);
    porCanonico.set(nome, lista);
  }

  const resultado: Pedido[] = [];
  for (const [fornecedor, lista] of porCanonico) {
    if (lista.length === 1) {
      resultado.push({ ...lista[0], fornecedor });
      continue;
    }
    const maisRecente = lista.reduce((a, b) => (b.atualizadoEm > a.atualizadoEm ? b : a));
    const itensPorSku = new Map<string, PedidoItem>();
    for (const p of [...lista].sort((a, b) => a.atualizadoEm.localeCompare(b.atualizadoEm))) {
      for (const item of p.itens) itensPorSku.set(item.sku, item);
    }
    resultado.push({ ...maisRecente, fornecedor, itens: Array.from(itensPorSku.values()) });
  }
  return resultado;
}

/** Fornecedores em ordem alfabética, com "Sem fornecedor cadastrado" sempre
 * primeiro - é o bloco que precisa de atenção antes dos outros (item sem
 * fornecedor não entra em cotação nenhuma até alguém escolher um), por
 * isso vem na frente em vez de disputar ordem alfabética com nome real. */
export function ordenarFornecedores(nomes: string[]): string[] {
  const semFornecedor = nomes.includes(SEM_FORNECEDOR);
  const resto = nomes.filter((n) => n !== SEM_FORNECEDOR).sort((a, b) => a.localeCompare(b, "pt-BR"));
  return semFornecedor ? [SEM_FORNECEDOR, ...resto] : resto;
}

/** Agrupa por Grupo de produto (Proteínas, Hortifrúti...), na mesma ordem
 * usada na Contagem - pra tabela de conferência do Pedido de Compras. */
export function agruparPorGrupo(itens: SugestaoCompra[]): Record<string, SugestaoCompra[]> {
  const grupos: Record<string, SugestaoCompra[]> = {};
  for (const item of itens) {
    if (!grupos[item.grupo]) grupos[item.grupo] = [];
    grupos[item.grupo].push(item);
  }
  return grupos;
}

export function ordenarGrupos(codigos: string[]): string[] {
  return [
    ...GRUPO_ORDEM.filter((g) => codigos.includes(g)),
    ...codigos.filter((g) => !GRUPO_ORDEM.includes(g)).sort((a, b) => a.localeCompare(b, "pt-BR")),
  ];
}

/** Ordena datas de contagem base (formato brasileiro DD/MM/AAAA, mesmo
 * texto salvo em `pedidos.data_contagem_base`), mais recente primeiro.
 * Comparar a string direto (`localeCompare`/ordem alfabética) dá resultado
 * errado nesse formato - dia vem antes do ano, então "05/08/2026" ficaria
 * antes de "17/07/2026" mesmo sendo posterior. */
export function ordenarDatasContagemBase(datas: string[]): string[] {
  function paraTimestamp(d: string): number {
    const [dia, mes, ano] = d.split("/").map(Number);
    if (!dia || !mes || !ano) return 0;
    return new Date(ano, mes - 1, dia).getTime();
  }
  return [...datas].sort((a, b) => paraTimestamp(b) - paraTimestamp(a));
}

/** Soma aos blocos do Editor de Espelhos os itens trazidos do Cadastro pelo
 * "+ Adicionar item". Item que já está no bloco (voltou pelo pedido salvo
 * depois do primeiro Confirmar) fica só uma vez, valendo o do bloco - sem
 * isso a linha duplicava na tabela e no Compartilhar (revisão de 23/10/2026). */
export function somarItensAvulsos(
  base: Record<string, SugestaoCompra[]>,
  avulsos: Record<string, SugestaoCompra[]>
): Record<string, SugestaoCompra[]> {
  const mapa: Record<string, SugestaoCompra[]> = { ...base };
  for (const [fornecedor, itens] of Object.entries(avulsos)) {
    const doBloco = mapa[fornecedor] ?? [];
    const skusDoBloco = new Set(doBloco.map((i) => i.sku));
    mapa[fornecedor] = [...doBloco, ...itens.filter((i) => !skusDoBloco.has(i.sku))];
  }
  return mapa;
}

const CAMPOS_FORNECEDOR = ["fornecedor1", "fornecedor2", "fornecedor3", "fornecedor4"] as const;

/** Liga o fornecedor ao produto na primeira vaga livre (Fornecedor 1 a 4),
 * quando o item entra num bloco pelo "+ Adicionar item" (Vinícius, 23/10/2026).
 * Devolve null se já estava ligado (nada a gravar) e "sem_vaga" se as 4 vagas
 * já têm outros fornecedores - nunca sobrescreve um vínculo existente. */
export function vincularFornecedorAoProduto(produto: Produto, fornecedor: string): Produto | null | "sem_vaga" {
  const chave = chaveNormalizada(fornecedor);
  if (CAMPOS_FORNECEDOR.some((campo) => chaveNormalizada(produto[campo] ?? "") === chave)) return null;
  const livre = CAMPOS_FORNECEDOR.find((campo) => !(produto[campo] ?? "").trim());
  if (!livre) return "sem_vaga";
  return { ...produto, [livre]: fornecedor };
}

/** Participação de um fornecedor na cotação de um item (tabela
 * `cotacao_participacoes`): nasce quando o item entra no pedido dele e não sai
 * quando outro fornecedor vence (parecer do Codex de 24/10/2026, ponto 3). */
export type ParticipacaoCotacao = { fornecedor: string; sku: string };

/** Devolve aos blocos do Editor de Espelhos o item de cada fornecedor que
 * participou da cotação dele mas não está mais no bloco (perdeu para o
 * vencedor e o fornecedor não está no Fornecedor 1 a 4 do Cadastro, caso do
 * "+ Adicionar item" sem vaga ou com vínculo falhado). Sem isso, depois de
 * recarregar, o desfazer vencedor não sabia que ele existia. O bloco continua
 * escondendo o item enquanto houver vencedor em outro fornecedor. Nome do
 * fornecedor resolvido pelo Cadastro como nos pedidos salvos; `itemDoSku`
 * devolve null para SKU que saiu do Cadastro (fica de fora). */
export function incluirParticipacoes(
  itensPorFornecedor: Record<string, SugestaoCompra[]>,
  participacoes: ParticipacaoCotacao[],
  fornecedoresCadastro: string[],
  itemDoSku: (sku: string) => SugestaoCompra | null
): Record<string, SugestaoCompra[]> {
  const mapa: Record<string, SugestaoCompra[]> = { ...itensPorFornecedor };
  for (const participacao of participacoes) {
    const fornecedor = nomeFornecedorCanonico(participacao.fornecedor, fornecedoresCadastro);
    const bloco = mapa[fornecedor] ?? [];
    if (bloco.some((i) => i.sku === participacao.sku)) continue;
    const item = itemDoSku(participacao.sku);
    if (!item) continue;
    mapa[fornecedor] = [...bloco, item];
  }
  return mapa;
}

/** Concorrentes que o desfazer vencedor recria: os que a tela mandou mais os
 * que participaram da cotação do item (gravados no banco), sem repetir o
 * mesmo fornecedor com grafia diferente e sem o vencedor atual. A tela pode
 * ter perdido um concorrente (recarregou, vínculo falhou); o banco não. */
export function unirConcorrentes(
  fornecedorAtual: string,
  daTela: string[],
  participantes: string[],
  fornecedoresCadastro: string[]
): string[] {
  const vistos = new Set([chaveNormalizada(fornecedorAtual)]);
  const resultado: string[] = [];
  for (const bruto of [...daTela, ...participantes]) {
    const nome = nomeFornecedorCanonico(bruto, fornecedoresCadastro);
    const chave = chaveNormalizada(nome);
    if (!nome.trim() || vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push(nome);
  }
  return resultado;
}
