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

export function salvarRascunho<T extends object>(chave: string, dados: T): void {
  try {
    window.localStorage.setItem(chave, JSON.stringify({ ...dados, salvoEm: new Date().toISOString() }));
  } catch {
    // Sem armazenamento disponível: o rascunho só não fica guardado.
  }
}

export function limparRascunho(chave: string): void {
  try {
    window.localStorage.removeItem(chave);
  } catch {
    // Idem: nada a fazer.
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
