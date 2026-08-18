import type { SugestaoCompra } from "@/lib/types";
import { GRUPO_ORDEM } from "@/lib/grupos";

export const SEM_FORNECEDOR = "Sem fornecedor cadastrado";

function chaveNormalizada(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Agrupa por fornecedor, pra montar a lista de cotação/pedido de cada um.
 * Sem fornecedor cadastrado só entra no grupo avulso se realmente precisa
 * comprar - senão o grupo vira ruído de produto que nem precisa de pedido.
 *
 * `fornecedoresCadastro` (nomes vindos do cadastro de Fornecedores, mesmo
 * texto usado no seletor de Produtos) normaliza o nome bruto de cada
 * produto contra ele antes de agrupar - Fornecedor 1-4 é texto copiado na
 * hora da seleção, não uma referência viva ao cadastro, então renomear um
 * fornecedor (ou um espaço/maiúscula digitado diferente entre produtos)
 * deixava produto antigo apontando pro nome velho, e Pedidos mostrava dois
 * blocos pro mesmo fornecedor - achado real com "Sem Limite" duplicado
 * mesmo com só 1 registro em Fornecedores. Sem essa lista (chamada sem o
 * segundo argumento) agrupa pelo nome bruto mesmo, igual antes.
 *
 * Funções puras (sem I/O) de propósito - usadas tanto no servidor quanto em
 * componente client, não podem puxar nada de `lib/sheets/*`. */
export function agruparPorFornecedor(
  itens: SugestaoCompra[],
  fornecedoresCadastro: string[] = []
): Record<string, SugestaoCompra[]> {
  const canonicoPorChave = new Map(fornecedoresCadastro.map((nome) => [chaveNormalizada(nome), nome]));
  function canonico(nome: string): string {
    return canonicoPorChave.get(chaveNormalizada(nome)) ?? nome;
  }

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
    const nomesCanonicos = new Set(fornecedores.map(canonico));
    for (const f of nomesCanonicos) {
      if (!grupos[f]) grupos[f] = [];
      grupos[f].push(item);
    }
  }
  return grupos;
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
