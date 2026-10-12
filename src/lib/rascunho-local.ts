/** Rascunho de formulário guardado no navegador da pessoa (localStorage).
 * Serve só para não perder o que foi digitado quando a página recarrega ou a
 * chamada ao servidor falha - nunca é fonte de verdade: o que vale continua
 * sendo o que o servidor gravou. Todo acesso fica em try/catch: modo
 * privado, armazenamento cheio ou bloqueado simplesmente não guarda, e a
 * tela segue funcionando. */

const PREFIXO = "zatti-hub:rascunho:v1";

export function chaveRascunho(...partes: string[]): string {
  return [PREFIXO, ...partes.map((p) => encodeURIComponent(p))].join(":");
}

/** Texto cru guardado (ou null). Estável por valor: serve de snapshot do
 * `useSyncExternalStore` para saber, sem divergir da renderização do
 * servidor, se existe rascunho. */
export function lerRascunhoBruto(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function lerRascunho<T>(chave: string): (T & { salvoEm: string }) | null {
  try {
    const bruto = window.localStorage.getItem(chave);
    if (!bruto) return null;
    const valor = JSON.parse(bruto) as unknown;
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
    return valor as T & { salvoEm: string };
  } catch {
    return null;
  }
}

/** Devolve `true` só quando a gravação foi confirmada (lida de volta igual).
 * Com armazenamento bloqueado ou cheio devolve `false`, e a tela não pode
 * dizer que os números estão guardados. */
export function salvarRascunho<T extends object>(chave: string, dados: T): boolean {
  try {
    const texto = JSON.stringify({ ...dados, salvoEm: new Date().toISOString() });
    window.localStorage.setItem(chave, texto);
    return window.localStorage.getItem(chave) === texto;
  } catch {
    return false;
  }
}

export function limparRascunho(chave: string): void {
  try {
    window.localStorage.removeItem(chave);
  } catch {
    // Idem: nada a fazer.
  }
}

/** Apaga todos os rascunhos do app neste navegador. Chamada no "Sair": o
 * próximo a entrar no mesmo aparelho não herda nada. */
export function limparTodosRascunhos(): void {
  try {
    const chaves: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const chave = window.localStorage.key(i);
      if (chave?.startsWith(`${PREFIXO}:`)) chaves.push(chave);
    }
    chaves.forEach((chave) => window.localStorage.removeItem(chave));
  } catch {
    // Sem armazenamento: não há o que limpar.
  }
}

/** "11/10 às 12:04", para avisar de quando é o rascunho recuperado. */
export function quandoFoiSalvo(salvoEm: string): string {
  const d = new Date(salvoEm);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} às ${hh}:${mi}`;
}
