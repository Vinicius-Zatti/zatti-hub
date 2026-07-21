import type { Fornecedor } from "@/lib/types";

/** Único cadastro obrigatório de fornecedor: Nome Fantasia, Vendedor e
 * WhatsApp. O resto (Razão Social, condições de pagamento, limite de
 * crédito etc.) é opcional. Função pura - usada no servidor e em componente
 * client, não pode puxar nada de `lib/sheets/*`. */
export function fornecedorIncompleto(f: Fornecedor): boolean {
  return !f.nomeFantasia.trim() || !f.nomeVendedor.trim() || !f.whatsapp.trim();
}
