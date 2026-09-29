// Leitura completa paginada - o PostgREST corta toda resposta em `max_rows`
// linhas (1.000 em `supabase/config.toml`) sem avisar. Nasceu no Financeiro V1
// (DRE/Provisões/Caixa) e passou a servir também ao inventário (28/09/2026).

type RespostaConsulta = { data: unknown; error: { message: string } | null };

/** Tamanho pedido em cada página. A leitura não depende dele bater com o teto
 * real do servidor: se o servidor devolver menos, o próximo pedido começa de
 * onde a resposta parou. */
export const TAMANHO_PAGINA = 1000;

/** Quantos ids vão em cada `.in()` - evita URL gigante no PostgREST. */
export const TAMANHO_LOTE_IDS = 100;

/** Quantos lotes são lidos ao mesmo tempo em `buscarTudoEmLotes`. */
const LOTES_EM_PARALELO = 5;

/** Lê tudo, página por página, até vir uma página vazia. O offset avança pelo
 * número de linhas que de fato chegaram, então um teto do servidor menor que
 * `TAMANHO_PAGINA` não faz a leitura parar no meio. A consulta montada em
 * `montar` precisa de ordenação determinística terminando numa coluna única
 * (ex. `id`) - sem isso o banco pode repetir ou pular linhas entre uma página
 * e outra. Erro em qualquer página sobe como `Error`: nunca devolve parcial. */
export async function buscarTudo<T>(montar: (de: number, ate: number) => PromiseLike<RespostaConsulta>): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; ) {
    const { data, error } = await montar(de, de + TAMANHO_PAGINA - 1);
    if (error) throw new Error(error.message);
    const linhas = (data as T[] | null) ?? [];
    if (linhas.length === 0) return todas;
    todas.push(...linhas);
    de += linhas.length;
  }
}

/** `buscarTudo` para consultas com `.in()` de uma lista de ids que pode
 * crescer: quebra os ids em lotes de `TAMANHO_LOTE_IDS` e pagina cada lote
 * (um lote de ids não limita quantas linhas filhas ele traz). Devolve as
 * linhas na ordem dos lotes; quem precisa de ordem global reordena depois. */
export async function buscarTudoEmLotes<T>(
  ids: readonly string[],
  montar: (lote: string[], de: number, ate: number) => PromiseLike<RespostaConsulta>,
): Promise<T[]> {
  // Sem repetir id: o mesmo filho não pode vir em dois lotes.
  const unicos = Array.from(new Set(ids));
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += TAMANHO_LOTE_IDS) lotes.push(unicos.slice(i, i + TAMANHO_LOTE_IDS));

  const todas: T[] = [];
  for (let i = 0; i < lotes.length; i += LOTES_EM_PARALELO) {
    const resultados = await Promise.all(
      lotes.slice(i, i + LOTES_EM_PARALELO).map((lote) => buscarTudo<T>((de, ate) => montar(lote, de, ate))),
    );
    for (const linhas of resultados) todas.push(...linhas);
  }
  return todas;
}
