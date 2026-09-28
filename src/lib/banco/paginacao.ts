// Leitura completa paginada - o PostgREST corta toda resposta em 1.000 linhas
// (`max_rows` em `supabase/config.toml`) sem avisar. Nasceu no Financeiro V1
// (DRE/Provisões/Caixa) e passou a servir também ao inventário (28/09/2026).

type RespostaConsulta = { data: unknown; error: { message: string } | null };

/** Tamanho de cada página. Não pode passar do `max_rows`: acima disso o
 * servidor corta a resposta e a leitura acharia que a lista acabou. */
export const TAMANHO_PAGINA = 1000;

/** Lê tudo, 1000 linhas por vez, até vir uma página incompleta. A consulta
 * montada em `montar` precisa de ordenação determinística terminando numa
 * coluna única (ex. `id`) - sem isso o banco pode repetir ou pular linhas
 * entre uma página e outra. Erro do banco sobe como `Error`. */
export async function buscarTudo<T>(montar: (de: number, ate: number) => PromiseLike<RespostaConsulta>): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await montar(de, de + TAMANHO_PAGINA - 1);
    if (error) throw new Error(error.message);
    const linhas = (data as T[] | null) ?? [];
    todas.push(...linhas);
    if (linhas.length < TAMANHO_PAGINA) return todas;
  }
}
