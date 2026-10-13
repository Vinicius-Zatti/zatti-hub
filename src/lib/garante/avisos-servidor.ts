import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { motivoVinculoAvisos, type CandidatoAvisos, type ResponsavelAvisosAtual } from "./avisos";

// Leitura do responsável pelos avisos do Garante e de quem pode ser marcado, pelo client admin,
// sempre recortada pela unidade que a chamada já autorizou (requireGestaoGarante na tela da
// gestão; requireMaster em Acessos). O número de WhatsApp inteiro não vai para o navegador:
// só os 4 últimos dígitos, como na Equipe.

type VinculoBruto = {
  id: string;
  user_id: string;
  organizacao_id: string;
  unidade_id: string | null;
  role: string;
  status: string;
  whatsapp: string | null;
};

/** Responsável atual e candidatos da unidade. `incluirMaster` só em Acessos (a gestão do cliente
 * não escolhe gente da Zatti). */
export async function carregarResponsavelAvisos(params: {
  unidadeId: string;
  organizacaoId: string;
  incluirMaster: boolean;
  nomeUnidade: (id: string | null) => string;
}): Promise<{ atual: ResponsavelAvisosAtual | null; candidatos: CandidatoAvisos[] }> {
  const admin = createAdminClient();
  const [{ data: destinatario }, { data: vinculosOrg }, masters] = await Promise.all([
    admin.from("garante_avisos_destinatarios").select("vinculo_id").eq("unidade_id", params.unidadeId).eq("ativo", true).maybeSingle(),
    admin.from("vinculos").select("id, user_id, organizacao_id, unidade_id, role, status, whatsapp").eq("organizacao_id", params.organizacaoId).eq("role", "gestao").eq("status", "ativo"),
    params.incluirMaster
      ? admin.from("vinculos").select("id, user_id, organizacao_id, unidade_id, role, status, whatsapp").eq("role", "master").eq("status", "ativo")
      : Promise.resolve({ data: [] as VinculoBruto[] }),
  ]);
  const atualId = (destinatario as { vinculo_id: string } | null)?.vinculo_id ?? null;
  const elegiveis = [
    ...((vinculosOrg ?? []) as VinculoBruto[]).filter((v) => v.unidade_id === null || v.unidade_id === params.unidadeId),
    ...((masters.data ?? []) as VinculoBruto[]),
  ];
  let vinculoAtual = atualId ? elegiveis.find((v) => v.id === atualId) ?? null : null;
  if (atualId && !vinculoAtual) {
    const { data } = await admin.from("vinculos").select("id, user_id, organizacao_id, unidade_id, role, status, whatsapp").eq("id", atualId).maybeSingle();
    vinculoAtual = (data as VinculoBruto | null) ?? null;
  }
  const ids = [...new Set([...elegiveis.map((v) => v.user_id), ...(vinculoAtual ? [vinculoAtual.user_id] : [])])];
  const { data: perfis } = ids.length ? await admin.from("perfis").select("id, nome").in("id", ids) : { data: [] };
  const nome = new Map(((perfis ?? []) as { id: string; nome: string | null }[]).map((p) => [p.id, p.nome]));
  const nomeDe = (v: VinculoBruto) => nome.get(v.user_id)?.trim() || "Sem nome";

  const candidatos: CandidatoAvisos[] = elegiveis
    .map((v) => ({
      vinculoId: v.id,
      nome: nomeDe(v),
      papel: v.role === "master" ? ("master" as const) : ("gestao" as const),
      alcance: v.role === "master" ? "Zatti (master)" : v.unidade_id === null ? "Toda a organização" : params.nomeUnidade(v.unidade_id),
      whatsappFinal: v.whatsapp ? v.whatsapp.slice(-4) : null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const atual: ResponsavelAvisosAtual | null = vinculoAtual
    ? {
        vinculoId: vinculoAtual.id,
        nome: nomeDe(vinculoAtual),
        papel: vinculoAtual.role,
        whatsappFinal: vinculoAtual.whatsapp ? vinculoAtual.whatsapp.slice(-4) : null,
        motivo: motivoVinculoAvisos(
          { status: vinculoAtual.status, role: vinculoAtual.role, organizacaoId: vinculoAtual.organizacao_id, unidadeId: vinculoAtual.unidade_id, whatsapp: vinculoAtual.whatsapp },
          { id: params.unidadeId, organizacaoId: params.organizacaoId },
        ),
      }
    : null;
  return { atual, candidatos };
}
