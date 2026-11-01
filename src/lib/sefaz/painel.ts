import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { chavePublicaRobo } from "./certificado";

// Painel da captura de NF-e em Configurações > Unidade (30/10/2026), só para master. Lê pelo
// servidor (as tabelas não têm grant para o app) e nunca seleciona o envelope.

export type RodadaResumo = { dia: string; situacao: "ok" | "erro"; erroCodigo: string | null; notasNovas: number; ciencias: number; filaZerou: boolean };
export type CertificadoPainel = {
  id: string;
  cnpj: string;
  uf: string;
  titular: string;
  validoAte: string;
  diasParaVencer: number;
  ultimaRodada: RodadaResumo | null;
  notas: { xmlSalvo: number; aguardando: number; semCiencia: number; cancelada: number; erro: number };
};
export type PainelSefaz = { ligada: boolean; certificados: CertificadoPainel[] };

const DIA_MS = 24 * 3600_000;

export async function carregarPainelSefaz(unidadeId: string, agora = new Date()): Promise<PainelSefaz> {
  const admin = createAdminClient();
  const { data: certs, error } = await admin
    .from("fin_sefaz_certificados")
    .select("id, cnpj, uf, titular, valido_ate")
    .eq("unidade_id", unidadeId)
    .eq("ativo", true)
    .order("criado_em");
  if (error) throw new Error("sefaz_painel_falhou");
  type Cert = { id: string; cnpj: string; uf: string; titular: string; valido_ate: string };
  const lista = (certs as Cert[] | null) ?? [];
  const ids = lista.map((c) => c.id);
  const [rodadas, notas] = ids.length
    ? await Promise.all([
        admin.from("fin_sefaz_rodadas").select("certificado_id, iniciado_em, situacao, erro_codigo, notas_novas, ciencias, fila_zerou")
          .in("certificado_id", ids).order("iniciado_em", { ascending: false }).limit(ids.length * 5),
        admin.from("fin_sefaz_notas").select("certificado_id, situacao").in("certificado_id", ids).limit(20000),
      ])
    : [{ data: [] }, { data: [] }];
  type Rodada = { certificado_id: string; iniciado_em: string; situacao: "ok" | "erro"; erro_codigo: string | null; notas_novas: number; ciencias: number; fila_zerou: boolean };
  const ultima = new Map<string, Rodada>();
  for (const r of (rodadas.data as Rodada[] | null) ?? []) if (!ultima.has(r.certificado_id)) ultima.set(r.certificado_id, r);
  const contagem = new Map<string, CertificadoPainel["notas"]>();
  for (const n of (notas.data as { certificado_id: string; situacao: string }[] | null) ?? []) {
    const c = contagem.get(n.certificado_id) ?? { xmlSalvo: 0, aguardando: 0, semCiencia: 0, cancelada: 0, erro: 0 };
    if (n.situacao === "xml_salvo") c.xmlSalvo++;
    else if (n.situacao === "resumo" || n.situacao === "ciencia") c.aguardando++;
    else if (n.situacao === "sem_ciencia") c.semCiencia++;
    else if (n.situacao === "cancelada") c.cancelada++;
    else c.erro++;
    contagem.set(n.certificado_id, c);
  }
  return {
    ligada: chavePublicaRobo() !== null,
    certificados: lista.map((c) => {
      const r = ultima.get(c.id);
      return {
        id: c.id,
        cnpj: c.cnpj,
        uf: c.uf,
        titular: c.titular,
        validoAte: hojeIsoBrasil(new Date(c.valido_ate)),
        diasParaVencer: Math.floor((Date.parse(c.valido_ate) - agora.getTime()) / DIA_MS),
        ultimaRodada: r
          ? { dia: hojeIsoBrasil(new Date(r.iniciado_em)), situacao: r.situacao, erroCodigo: r.erro_codigo, notasNovas: r.notas_novas, ciencias: r.ciencias, filaZerou: r.fila_zerou }
          : null,
        notas: contagem.get(c.id) ?? { xmlSalvo: 0, aguardando: 0, semCiencia: 0, cancelada: 0, erro: 0 },
      };
    }),
  };
}
