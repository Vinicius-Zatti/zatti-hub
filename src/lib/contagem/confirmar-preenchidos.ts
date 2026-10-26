/** Quantidade digitada na contagem -> número gravável, ou null se inválida
 * (vazia, não numérica ou negativa). Aceita vírgula decimal. */
export function quantidadeDigitada(raw: string): number | null {
  const texto = raw.trim();
  if (texto === "") return null;
  const val = Number(texto.replace(",", "."));
  if (Number.isNaN(val) || val < 0) return null;
  return Number.isInteger(val) ? val : Number(val.toFixed(3));
}

/** "Confirmar preenchidos" da contagem: confirma todo item da contagem
 * inteira que tem valor digitado e ainda não foi confirmado. Recebe a lista
 * completa, nunca a filtrada pela busca - quem está buscando não pode deixar
 * itens escondidos sem confirmar. Devolve só o que muda. */
export function confirmarPreenchidos(
  itens: readonly { sku: string }[],
  valores: Record<string, string>,
  confirmados: Record<string, number>,
): { confirmados: Record<string, number>; valores: Record<string, string> } {
  const novosConfirmados: Record<string, number> = {};
  const novosValores: Record<string, string> = {};
  for (const item of itens) {
    if (confirmados[item.sku] !== undefined) continue;
    const qty = quantidadeDigitada(valores[item.sku] ?? "");
    if (qty === null) continue;
    novosConfirmados[item.sku] = qty;
    novosValores[item.sku] = String(qty);
  }
  return { confirmados: novosConfirmados, valores: novosValores };
}
