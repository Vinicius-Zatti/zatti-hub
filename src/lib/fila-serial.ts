/** Fila que roda uma tarefa por vez, na ordem em que chegaram. Usada para
 * que vários cliques seguidos em "Sugerir grupo + SKU" não disparem chamadas
 * de IA em paralelo: cada clique entra na fila e espera a anterior terminar.
 * Falha de uma tarefa não trava as seguintes - quem enfileirou recebe o erro. */
export function criarFilaSerial() {
  let ultima: Promise<unknown> = Promise.resolve();
  return function enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
    const resultado = ultima.then(tarefa, tarefa);
    ultima = resultado.catch(() => undefined);
    return resultado;
  };
}

/** Acrescenta ao mapa da grade os produtos que chegaram depois que a tela
 * abriu (ex.: pendência salva ou produto criado por outra pessoa, trazidos
 * pelo recarregamento da página). Quem já está no mapa não é tocado, para não
 * perder edição em andamento. Devolve o mesmo objeto quando não há novidade. */
export function incorporarNovosPorSku<P extends { sku: string }>(
  mapa: Record<string, P>,
  produtos: P[],
  preparar: (p: P) => P,
): Record<string, P> {
  let novo: Record<string, P> | null = null;
  for (const produto of produtos) {
    if (produto.sku in mapa) continue;
    novo ??= { ...mapa };
    novo[produto.sku] = preparar(produto);
  }
  return novo ?? mapa;
}
