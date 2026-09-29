import { descricaoParaBusca } from "./normalizacao";
import { SEM_SUGESTAO, type Direcao, type Natureza, type Sugestao } from "./tipos";

// Motor determinístico de sugestão, na ordem aprovada: regra da unidade ->
// fornecedor -> histórico elegível -> regra organizacional -> descrição ->
// IA -> sem evidência. Fornecedor e histórico ainda não existem nesta fatia
// (sem vínculo fornecedor-conta e sem decisões confirmadas): ficam
// indisponíveis sem mudar a precedência. Nunca sugere categoria que
// contrarie a direção: entrada só recebe conta de receita, saída nunca.

export const VERSAO_MOTOR = "motor-1";

export type CategoriaMotor = {
  id: string;
  codigoSistema: string | null;
  nivel: string;
  papelDre: string | null;
  arquivado: boolean;
};

export type RegraMotor = {
  id: string;
  escopo: "unidade" | "organizacao";
  padraoNormalizado: string;
  versaoNormalizacao: number;
  direcao: Direcao;
  categoriaId: string | null;
  codigoSistemaAlvo: string | null;
  situacao: "ativa" | "suspensa" | "conflitante";
  versao: number;
};

export type MovimentoMotor = { direcao: Direcao; natureza: Natureza; descricaoNormalizada: string };

const PAPEIS_SOMENTE_PROVISAO = new Set(["cmo_ferias", "cmo_decimo_terceiro", "cmo_multa_fgts"]);

export function categoriaCompativel(categoria: CategoriaMotor | undefined, direcao: Direcao): boolean {
  if (!categoria || categoria.nivel !== "conta" || categoria.arquivado) return false;
  if (categoria.papelDre && PAPEIS_SOMENTE_PROVISAO.has(categoria.papelDre)) return false;
  return direcao === "entrada" ? categoria.papelDre === "receita" : categoria.papelDre !== "receita";
}

// "Correspondência de descrição": só termos bancários inequívocos, por
// código do plano padrão. Fornecedor genérico nunca entra aqui.
const DESCRICOES: { regex: RegExp; direcao: Direcao; codigoSistema: string; motivo: string }[] = [
  { regex: /\btarifa\b|\bcesta de servicos\b|\bpacote de servicos\b/, direcao: "saida", codigoSistema: "ca_tarifas_bancarias", motivo: "descricao_tarifa_bancaria" },
];

export function sugerirDeterministico(
  movimento: MovimentoMotor,
  regras: RegraMotor[],
  categorias: CategoriaMotor[],
  versaoNormalizacao: number,
): Sugestao | null {
  if (movimento.natureza !== "entrada" && movimento.natureza !== "saida") {
    return { ...SEM_SUGESTAO, fonte: "natureza", motivoCodigo: `natureza_${movimento.natureza}` };
  }
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const porCodigo = new Map(categorias.filter((c) => c.codigoSistema).map((c) => [c.codigoSistema as string, c]));
  const padrao = descricaoParaBusca(movimento.descricaoNormalizada);
  const daMesmaVersao = regras.filter(
    (r) => r.versaoNormalizacao === versaoNormalizacao && r.direcao === movimento.direcao && r.padraoNormalizado === padrao,
  );

  // 1. Regra da unidade. Conflitante bloqueia a sugestão até a Gestão resolver.
  const locais = daMesmaVersao.filter((r) => r.escopo === "unidade");
  if (locais.some((r) => r.situacao === "conflitante")) {
    return { ...SEM_SUGESTAO, motivoCodigo: "regra_conflitante" };
  }
  const local = locais.find((r) => r.situacao === "ativa");
  if (local && local.categoriaId && categoriaCompativel(porId.get(local.categoriaId), movimento.direcao)) {
    return {
      ...SEM_SUGESTAO,
      categoriaId: local.categoriaId,
      confianca: "alta",
      fonte: "regra_unidade",
      motivoCodigo: "regra_unidade_exata",
      evidencias: { regra_id: local.id },
      regraId: local.id,
      regraVersao: local.versao,
    };
  }

  // 2 e 3. Fornecedor e histórico: indisponíveis nesta fatia.

  // 4. Regra organizacional, resolvida pelo código do plano na unidade.
  const organizacionais = daMesmaVersao.filter((r) => r.escopo === "organizacao");
  if (organizacionais.some((r) => r.situacao === "conflitante")) {
    return { ...SEM_SUGESTAO, motivoCodigo: "regra_conflitante" };
  }
  const org = organizacionais.find((r) => r.situacao === "ativa");
  const alvoOrg = org?.codigoSistemaAlvo ? porCodigo.get(org.codigoSistemaAlvo) : undefined;
  if (org && alvoOrg && categoriaCompativel(alvoOrg, movimento.direcao)) {
    return {
      ...SEM_SUGESTAO,
      categoriaId: alvoOrg.id,
      confianca: "media",
      fonte: "regra_organizacao",
      motivoCodigo: "regra_organizacao_exata",
      evidencias: { regra_id: org.id },
      regraId: org.id,
      regraVersao: org.versao,
    };
  }

  // 5. Descrição bancária inequívoca.
  for (const d of DESCRICOES) {
    if (d.direcao !== movimento.direcao || !d.regex.test(movimento.descricaoNormalizada)) continue;
    const alvo = porCodigo.get(d.codigoSistema);
    if (alvo && categoriaCompativel(alvo, movimento.direcao)) {
      return { ...SEM_SUGESTAO, categoriaId: alvo.id, confianca: "baixa", fonte: "descricao", motivoCodigo: d.motivo };
    }
  }

  // 6 e 7: IA (fora deste módulo) ou sem evidência.
  return null;
}
