/** Regras puras do cadastro automático de quem compra o Zatti Hub (15/10/2026), testáveis sem
 * banco. Plano e decisões: _execucao/zatti-hub/compra-cadastro-automatico-plano.md. */

import { normalizarWhatsapp } from "@/lib/equipe/regras";
import { modulosUnidadeNova } from "@/lib/modulos-padrao";

export type PedidoProvisionamento = {
  pagamentoId: string;
  email: string;
  nome: string;
  /** E.164, como em `vinculos.whatsapp`. */
  whatsapp: string;
  restaurante: string;
  valor: number | null;
  leadSiteId: string | null;
};

export type ResultadoValidacao = { ok: true; pedido: PedidoProvisionamento } | { ok: false; erro: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const texto = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Valida o corpo que o Vini manda. Recusa campo estranho para a rota não virar cadastro livre. */
export function validarPedido(corpo: unknown): ResultadoValidacao {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { ok: false, erro: "pedido_invalido" };
  const c = corpo as Record<string, unknown>;
  const aceitos = new Set(["pagamento_id", "email", "nome", "whatsapp", "restaurante", "valor", "lead_id"]);
  if (Object.keys(c).some((k) => !aceitos.has(k))) return { ok: false, erro: "campo_nao_aceito" };

  const pagamentoId = String(c.pagamento_id ?? "");
  if (!/^[0-9]{1,20}$/.test(pagamentoId)) return { ok: false, erro: "pagamento_invalido" };
  const email = texto(c.email, 300).toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, erro: "email_invalido" };
  const nome = texto(c.nome, 200);
  if (nome.length < 2 || nome.length > 160) return { ok: false, erro: "nome_invalido" };
  const restaurante = texto(c.restaurante, 200);
  if (restaurante.length < 2 || restaurante.length > 120) return { ok: false, erro: "restaurante_invalido" };
  const whatsapp = normalizarWhatsapp(String(c.whatsapp ?? ""));
  if (!whatsapp) return { ok: false, erro: "whatsapp_invalido" };
  const valor = c.valor === undefined || c.valor === null ? null : Number(c.valor);
  if (valor !== null && (!Number.isFinite(valor) || valor < 0 || valor > 100_000)) return { ok: false, erro: "valor_invalido" };
  const lead = c.lead_id === undefined || c.lead_id === null ? null : texto(c.lead_id, 80);
  if (lead !== null && !/^[A-Za-z0-9-]{1,64}$/.test(lead)) return { ok: false, erro: "lead_invalido" };

  return { ok: true, pedido: { pagamentoId, email, nome, whatsapp, restaurante, valor, leadSiteId: lead } };
}

/** Primeiro id livre a partir do candidato: "burger-x", "burger-x-2", "burger-x-3"...
 * Diferente do painel /acessos (que bloqueia na colisão, porque ali há alguém olhando): aqui o
 * restaurante comprou sozinho e não pode ficar sem conta por coincidência de nome. */
export function idLivre(candidato: string, existentes: ReadonlySet<string>, limite = 50): string | null {
  if (!existentes.has(candidato)) return candidato;
  for (let n = 2; n <= limite; n++) {
    const id = `${candidato}-${n}`;
    if (!existentes.has(id)) return id;
  }
  return null;
}

/** Módulos que a unidade nova recebe: todos, desde 15/10/2026 (Vinícius: "todos os acessos a
 * partir de hoje têm todos os módulos"). A regra mora em `@/lib/modulos-padrao`, a mesma da
 * criação manual em /acessos. Marketing segue "em breve" no menu, sem flag. */
export const MODULOS_UNIDADE_NOVA = modulosUnidadeNova("banco");

/** WhatsApp do CRM (`zh_leads.whatsapp`): só dígitos, sem o 55. */
export function whatsappDoCrm(e164: string): string | null {
  const digitos = e164.replace(/\D/g, "");
  if (!digitos.startsWith("55")) return null;
  const nacional = digitos.slice(2);
  return /^[0-9]{10,11}$/.test(nacional) ? nacional : null;
}

/** Chave de idempotência do envio no Vini: muda a cada tentativa (senha nova a cada uma). */
export function chaveEnvio(pagamentoId: string, tentativa: number): string {
  return `compra-${pagamentoId}-${tentativa}`;
}
