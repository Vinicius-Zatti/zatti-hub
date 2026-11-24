import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracao/token";

// Captura de NF-e pela SEFAZ (30/10/2026): o que o robô do Vini roda hoje. Só o token "sefaz".
// O certificado sai daqui só no envelope cifrado, que o Hub não sabe abrir (a chave privada fica
// só no robô). Nunca vai para log.
// Super alerta (24/11/2026): a Dona Ninguém ficou 3 dias sem nota e ninguém viu. Cada certificado leva a
// última busca que deu certo (ultimaOkEm) e a data de cadastro; `buscasOk` lista as outras unidades, para o
// alerta dizer se só esta está parada.

export const dynamic = "force-dynamic";

type Rodada = { certificado_id: string; iniciado_em: string };
type Cert = { id: string; unidade_id: string; criado_em: string; unidades: { nome: string } | null };

export async function GET(request: NextRequest) {
  if (!(await tokenValido(request, "sefaz"))) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fin_sefaz_pendencias");
  if (error) {
    console.error("sefaz_pendencias_falhou", { codigo: error.code ?? null });
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }
  const resposta = data as { certificados?: { id: string }[] } & Record<string, unknown>;
  // Leitura extra: se falhar, o robô segue como antes, só sem o super alerta.
  try {
    const [certs, rodadas] = await Promise.all([
      admin.from("fin_sefaz_certificados").select("id, unidade_id, criado_em, unidades(nome)").eq("ativo", true),
      admin
        .from("fin_sefaz_rodadas")
        .select("certificado_id, iniciado_em")
        .eq("situacao", "ok")
        .gte("iniciado_em", new Date(Date.now() - 60 * 24 * 3600_000).toISOString())
        .order("iniciado_em", { ascending: false })
        .limit(2000),
    ]);
    if (!certs.error && !rodadas.error) {
      const ultimaOk = new Map<string, string>();
      for (const r of (rodadas.data as Rodada[] | null) ?? []) if (!ultimaOk.has(r.certificado_id)) ultimaOk.set(r.certificado_id, r.iniciado_em);
      const lista = (certs.data as unknown as Cert[] | null) ?? [];
      const criado = new Map(lista.map((c) => [c.id, c.criado_em]));
      if (Array.isArray(resposta.certificados)) {
        resposta.certificados = resposta.certificados.map((c) => ({ ...c, ultimaOkEm: ultimaOk.get(c.id) ?? null, criadoEm: criado.get(c.id) ?? null }));
      }
      resposta.buscasOk = lista.map((c) => ({ certificadoId: c.id, unidadeNome: c.unidades?.nome ?? c.unidade_id, ultimaOkEm: ultimaOk.get(c.id) ?? null }));
    }
  } catch {
    console.error("sefaz_ultimas_buscas_falhou");
  }
  return NextResponse.json(resposta, { headers: { "Cache-Control": "no-store" } });
}
