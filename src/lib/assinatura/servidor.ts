import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { diasAteFim, linkRenovacao, marcoDoDia, type Marco } from "./regras";

// Vigência anual (15/10/2026): o que o Vini precisa para avisar o cliente e Vinícius. Só service
// role (as tabelas não têm grant para o app). O contato é o comprador guardado na compra.

type Admin = ReturnType<typeof createAdminClient>;

export type AvisoPendente = {
  organizacao_id: string;
  restaurante: string;
  nome: string;
  whatsapp: string;
  vigencia_fim: string;
  dias: number;
  marco: Marco;
  link: string;
};

type OrgVigencia = { id: string; nome: string; vigencia_fim: string; renovacao_token: string | null };

/** Organizações com vigência, ativas e com contato da compra. */
async function organizacoesComVigencia(admin: Admin) {
  const { data: orgs, error } = await admin
    .from("organizacoes")
    .select("id, nome, vigencia_fim, renovacao_token")
    .not("vigencia_fim", "is", null)
    .eq("ativo", true);
  if (error) throw new Error("não leu as organizações");
  const lista = (orgs ?? []) as OrgVigencia[];
  if (!lista.length) return { lista, contatos: new Map<string, { nome: string; whatsapp: string }>() };
  const { data: compras, error: erroCompras } = await admin
    .from("zh_provisionamentos")
    .select("organizacao_id, nome, whatsapp, concluido_em")
    .in("organizacao_id", lista.map((o) => o.id))
    .eq("status", "concluido")
    .order("concluido_em", { ascending: false });
  if (erroCompras) throw new Error("não leu os contatos da compra");
  const contatos = new Map<string, { nome: string; whatsapp: string }>();
  for (const c of (compras ?? []) as { organizacao_id: string; nome: string; whatsapp: string }[]) {
    if (!contatos.has(c.organizacao_id)) contatos.set(c.organizacao_id, { nome: c.nome, whatsapp: c.whatsapp });
  }
  return { lista, contatos };
}

/** Avisos que valem hoje e ainda não saíram. */
export async function avisosPendentes(admin: Admin, hoje: string): Promise<AvisoPendente[]> {
  const { lista, contatos } = await organizacoesComVigencia(admin);
  const candidatos = lista
    .map((o) => ({ o, marco: marcoDoDia(o.vigencia_fim, hoje) }))
    .filter((c): c is { o: OrgVigencia; marco: Marco } => c.marco !== null && Boolean(c.o.renovacao_token) && contatos.has(c.o.id));
  if (!candidatos.length) return [];
  const { data: feitos, error } = await admin
    .from("zh_assinatura_avisos")
    .select("organizacao_id, marco, vigencia_fim")
    .in("organizacao_id", candidatos.map((c) => c.o.id));
  if (error) throw new Error("não leu os avisos enviados");
  const enviados = new Set(((feitos ?? []) as { organizacao_id: string; marco: string; vigencia_fim: string }[]).map((f) => `${f.organizacao_id}|${f.marco}|${f.vigencia_fim}`));
  return candidatos
    .filter((c) => !enviados.has(`${c.o.id}|${c.marco}|${c.o.vigencia_fim}`))
    .map(({ o, marco }) => {
      const contato = contatos.get(o.id)!;
      return {
        organizacao_id: o.id,
        restaurante: o.nome,
        nome: contato.nome,
        whatsapp: contato.whatsapp,
        vigencia_fim: o.vigencia_fim,
        dias: diasAteFim(o.vigencia_fim, hoje),
        marco,
        link: linkRenovacao(o.renovacao_token!),
      };
    });
}

/** Marca o aviso como enviado (repetir não faz nada). */
export async function marcarAviso(admin: Admin, aviso: { organizacao_id: string; marco: Marco; vigencia_fim: string }) {
  const { error } = await admin
    .from("zh_assinatura_avisos")
    .upsert(aviso, { onConflict: "organizacao_id,marco,vigencia_fim", ignoreDuplicates: true });
  if (error) throw new Error("não marcou o aviso");
}

/** Conta do link de renovação: nome e vigência, para a página do site. */
export async function contaDoToken(admin: Admin, token: string) {
  const { data, error } = await admin
    .from("organizacoes")
    .select("id, nome, vigencia_fim")
    .eq("renovacao_token", token)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw new Error("não leu a conta");
  return data as { id: string; nome: string; vigencia_fim: string | null } | null;
}

/** Contato da compra de uma organização (para o Vini confirmar a renovação ao cliente). */
export async function contatoDaConta(admin: Admin, organizacaoId: string) {
  const { data } = await admin
    .from("zh_provisionamentos")
    .select("nome, whatsapp")
    .eq("organizacao_id", organizacaoId)
    .eq("status", "concluido")
    .order("concluido_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { nome: string; whatsapp: string } | null) ?? null;
}

export type AssinaturaResumo = { organizacao_id: string; restaurante: string; vigencia_fim: string; dias: number };

/** Para o Início da área interna: vencendo em até 30 dias e vencidas (mais urgentes primeiro). */
export async function assinaturasParaAcompanhar(admin: Admin, hoje: string): Promise<AssinaturaResumo[]> {
  const { data, error } = await admin
    .from("organizacoes")
    .select("id, nome, vigencia_fim")
    .not("vigencia_fim", "is", null)
    .eq("ativo", true);
  if (error) throw new Error("não leu as assinaturas");
  return ((data ?? []) as { id: string; nome: string; vigencia_fim: string }[])
    .map((o) => ({ organizacao_id: o.id, restaurante: o.nome, vigencia_fim: o.vigencia_fim, dias: diasAteFim(o.vigencia_fim, hoje) }))
    .filter((o) => o.dias <= 30)
    .sort((a, b) => a.dias - b.dias);
}
