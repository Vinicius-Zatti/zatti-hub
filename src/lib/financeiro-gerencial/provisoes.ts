import { somarValores } from "./parcelas";
import {
  PAPEL_POR_TIPO_PROVISAO,
  type CategoriaFinanceira,
  type LancamentoBase,
  type ParametrosProvisao,
  type ParametrosProvisaoRegistro,
  type PapelDre,
  type ReversaoProvisao,
  type TipoProvisao,
} from "./tipos";
import type { LinhaDreAnual } from "./dre-anual";

/** Padrão da planilha Financeiro Zatti (aba DRE, bloco "Provisionamento"),
 * com F = Folha salarial contábil, G = FGTS e I = INSS folha do mês:
 * - Provisão Férias = F/12 + (F/12)/3 + I/12 + G/12
 * - Provisão 13º    = F/12 + I/12 + G/12
 * - Provisão Multa FGTS = G/2
 * Os percentuais ficam configuráveis por Gestão/master, com histórico. */
export const PARAMETROS_PADRAO_PLANILHA: ParametrosProvisao = {
  percentualFerias: 8.333333,
  percentualAdicionalTerco: 33.333333,
  percentualEncargosFerias: 8.333333,
  percentualDecimoTerceiro: 8.333333,
  percentualEncargosDecimoTerceiro: 8.333333,
  percentualMultaFgts: 50,
};

export const TIPOS_PROVISAO: TipoProvisao[] = ["ferias", "decimo_terceiro", "multa_fgts"];

export const ROTULO_TIPO_PROVISAO: Record<TipoProvisao, string> = {
  ferias: "Férias (com 1/3 e encargos)",
  decimo_terceiro: "13º salário (com encargos)",
  multa_fgts: "Multa do FGTS",
};

const CODIGO_BASE = {
  folha: "cmo_folha_salarial",
  fgts: "cmo_fgts",
  inss: "cmo_inss_folha",
} as const;

function arredondar2(v: number): number {
  return Math.round(v * 100) / 100;
}

function pct(base: number, percentual: number): number {
  return arredondar2((base * percentual) / 100);
}

export type BaseProvisao = { folha: number; fgts: number; inss: number };

export type ProvisaoCalculadaMes = {
  ferias: number;
  adicionalTerco: number;
  encargosFerias: number;
  decimoTerceiro: number;
  encargosDecimoTerceiro: number;
  multaFgts: number;
  porTipo: Record<TipoProvisao, number>;
};

/** As 6 provisões obrigatórias do mês, agrupadas nos 3 baldes que viram as
 * 3 linhas de CMO da DRE. */
export function calcularProvisaoMes(base: BaseProvisao, p: ParametrosProvisao): ProvisaoCalculadaMes {
  const encargosBase = somarValores([base.inss, base.fgts]);
  const ferias = pct(base.folha, p.percentualFerias);
  const adicionalTerco = pct(ferias, p.percentualAdicionalTerco);
  const encargosFerias = pct(encargosBase, p.percentualEncargosFerias);
  const decimoTerceiro = pct(base.folha, p.percentualDecimoTerceiro);
  const encargosDecimoTerceiro = pct(encargosBase, p.percentualEncargosDecimoTerceiro);
  const multaFgts = pct(base.fgts, p.percentualMultaFgts);
  return {
    ferias,
    adicionalTerco,
    encargosFerias,
    decimoTerceiro,
    encargosDecimoTerceiro,
    multaFgts,
    porTipo: {
      ferias: somarValores([ferias, adicionalTerco, encargosFerias]),
      decimo_terceiro: somarValores([decimoTerceiro, encargosDecimoTerceiro]),
      multa_fgts: multaFgts,
    },
  };
}

/** Linha mais recente com `vigenteDesde <= competência` (AAAA-MM); sem
 * nenhuma, o padrão da planilha. */
export function parametrosVigentes(registros: ParametrosProvisaoRegistro[], competencia: string): ParametrosProvisao {
  const validos = registros
    .filter((r) => r.vigenteDesde.slice(0, 7) <= competencia)
    .sort((a, b) => (a.vigenteDesde === b.vigenteDesde ? b.criadoEm.localeCompare(a.criadoEm) : b.vigenteDesde.localeCompare(a.vigenteDesde)));
  return validos[0] ?? PARAMETROS_PADRAO_PLANILHA;
}

function valorLancamento(l: LancamentoBase): number {
  return somarValores(l.parcelas.map((p) => p.valor));
}

const TIPO_POR_PAPEL: Partial<Record<PapelDre, TipoProvisao>> = {
  cmo_ferias: "ferias",
  cmo_decimo_terceiro: "decimo_terceiro",
  cmo_multa_fgts: "multa_fgts",
};

export type MovimentoProvisaoMes = {
  saldoInicial: number;
  provisao: number;
  reversoes: number;
  liquidacoes: number;
  /** Parte da liquidação que passou do saldo provisionado - só ela entra na DRE. */
  excesso: number;
  saldoFinal: number;
  /** Valor da linha de CMO na DRE: provisão + excesso - reversões. */
  valorDre: number;
};

export type ProvisoesDoMes = {
  competencia: string;
  base: BaseProvisao;
  calculo: ProvisaoCalculadaMes;
  porTipo: Record<TipoProvisao, MovimentoProvisaoMes>;
};

function proximaCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

/** Motor de provisões, mês a mês desde o primeiro dado até `ateCompetencia`
 * (AAAA-MM). Por balde: saldo + provisão - reversões - liquidações; se a
 * liquidação passar do saldo, só o excesso vai pra DRE daquele mês. A
 * liquidação (despesa com origem `liquidacao_provisao`) conta pela
 * competência do lançamento; o caixa dela anda pelas parcelas/baixas. */
export function calcularProvisoes(params: {
  lancamentos: LancamentoBase[];
  categorias: CategoriaFinanceira[];
  parametros: ParametrosProvisaoRegistro[];
  reversoes: ReversaoProvisao[];
  ateCompetencia: string;
}): Map<string, ProvisoesDoMes> {
  const { lancamentos, categorias, parametros, reversoes, ateCompetencia } = params;
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const resultado = new Map<string, ProvisoesDoMes>();

  const competencias = [
    ...lancamentos.map((l) => l.dataCompetencia.slice(0, 7)),
    ...reversoes.map((r) => r.competencia.slice(0, 7)),
  ].filter((c) => c <= ateCompetencia);
  if (competencias.length === 0) return resultado;

  const baseMes = new Map<string, BaseProvisao>();
  const liquidacaoMes = new Map<string, number>();
  for (const l of lancamentos) {
    const categoria = porId.get(l.categoriaId);
    if (!categoria) continue;
    const comp = l.dataCompetencia.slice(0, 7);
    if (l.origem === "liquidacao_provisao") {
      const tipo = categoria.papelDre ? TIPO_POR_PAPEL[categoria.papelDre] : undefined;
      if (tipo) liquidacaoMes.set(`${comp}|${tipo}`, somarValores([liquidacaoMes.get(`${comp}|${tipo}`) ?? 0, valorLancamento(l)]));
      continue;
    }
    const chave = (Object.keys(CODIGO_BASE) as (keyof BaseProvisao)[]).find((k) => CODIGO_BASE[k] === categoria.codigoSistema);
    if (!chave) continue;
    const atual = baseMes.get(comp) ?? { folha: 0, fgts: 0, inss: 0 };
    atual[chave] = somarValores([atual[chave], valorLancamento(l)]);
    baseMes.set(comp, atual);
  }

  const saldo: Record<TipoProvisao, number> = { ferias: 0, decimo_terceiro: 0, multa_fgts: 0 };
  let competencia = competencias.sort()[0];
  while (competencia <= ateCompetencia) {
    const base = baseMes.get(competencia) ?? { folha: 0, fgts: 0, inss: 0 };
    const calculo = calcularProvisaoMes(base, parametrosVigentes(parametros, competencia));
    const porTipo = {} as Record<TipoProvisao, MovimentoProvisaoMes>;
    for (const tipo of TIPOS_PROVISAO) {
      const saldoInicial = saldo[tipo];
      const provisao = calculo.porTipo[tipo];
      const reversoesMes = somarValores(reversoes.filter((r) => r.tipo === tipo && r.competencia.startsWith(competencia)).map((r) => r.valor));
      const liquidacoes = liquidacaoMes.get(`${competencia}|${tipo}`) ?? 0;
      const disponivel = somarValores([saldoInicial, provisao, -reversoesMes]);
      const excesso = arredondar2(Math.max(0, liquidacoes - Math.max(0, disponivel)));
      const saldoFinal = somarValores([disponivel, -liquidacoes, excesso]);
      saldo[tipo] = saldoFinal;
      porTipo[tipo] = {
        saldoInicial,
        provisao,
        reversoes: reversoesMes,
        liquidacoes,
        excesso,
        saldoFinal,
        valorDre: somarValores([provisao, excesso, -reversoesMes]),
      };
    }
    resultado.set(competencia, { competencia, base, calculo, porTipo });
    competencia = proximaCompetencia(competencia);
  }
  return resultado;
}

/** Valor por conta (id da categoria) que a DRE usa nas 3 linhas de provisão
 * do mês - substitui qualquer soma de lançamento nessas contas. */
export function valoresDreProvisao(provisoes: ProvisoesDoMes | undefined, categorias: CategoriaFinanceira[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const tipo of TIPOS_PROVISAO) {
    const conta = categorias.find((c) => c.nivel === "conta" && c.papelDre === PAPEL_POR_TIPO_PROVISAO[tipo]);
    if (conta) mapa.set(conta.id, provisoes?.porTipo[tipo].valorDre ?? 0);
  }
  return mapa;
}

/** Saldo disponível de um balde no fim de uma competência (pra validar
 * reversão: nunca maior que o saldo). */
export function saldoProvisaoAte(provisoes: Map<string, ProvisoesDoMes>, tipo: TipoProvisao, competencia: string): number {
  const meses = Array.from(provisoes.keys()).filter((c) => c <= competencia).sort();
  const ultimo = meses[meses.length - 1];
  return ultimo ? provisoes.get(ultimo)!.porTipo[tipo].saldoFinal : 0;
}

// ── Quadro anual (tela de Provisões) ────────────────────────────────────────

function linhaAnual(id: string, rotulo: string, nivel: 0 | 1 | 2, valores: number[], saldo: "inicio" | "fim" | null, extras?: Partial<LinhaDreAnual>): LinhaDreAnual {
  return {
    id,
    rotulo,
    nivel,
    valoresPorMes: valores,
    total: saldo === "inicio" ? valores[0] : saldo === "fim" ? valores[valores.length - 1] : somarValores(valores),
    media: null,
    ...extras,
  };
}

/** Quadro do ano: base de cálculo, um bloco por balde (saldo inicial,
 * provisão com o detalhe das 6, liquidações, excesso, reversões, saldo final)
 * e o valor que vai pra DRE. Mês sem nada calculado = 0. */
export function montarQuadroProvisoesAnual(ano: number, provisoes: Map<string, ProvisoesDoMes>): LinhaDreAnual[] {
  const meses = Array.from({ length: 12 }, (_, i) => provisoes.get(`${ano}-${String(i + 1).padStart(2, "0")}`));
  const serie = (f: (p: ProvisoesDoMes) => number) => meses.map((p) => (p ? f(p) : 0));

  const base = linhaAnual("base", "Base de cálculo (folha + FGTS + INSS)", 0, serie((p) => somarValores([p.base.folha, p.base.fgts, p.base.inss])), null, {
    filhos: [
      linhaAnual("base_folha", "Folha salarial contábil", 1, serie((p) => p.base.folha), null),
      linhaAnual("base_fgts", "FGTS", 1, serie((p) => p.base.fgts), null),
      linhaAnual("base_inss", "INSS folha", 1, serie((p) => p.base.inss), null),
    ],
  });

  const detalhe: Record<TipoProvisao, LinhaDreAnual[]> = {
    ferias: [
      linhaAnual("det_ferias", "Férias", 2, serie((p) => p.calculo.ferias), null),
      linhaAnual("det_terco", "Adicional de 1/3", 2, serie((p) => p.calculo.adicionalTerco), null),
      linhaAnual("det_enc_ferias", "Encargos sobre férias", 2, serie((p) => p.calculo.encargosFerias), null),
    ],
    decimo_terceiro: [
      linhaAnual("det_13", "13º salário", 2, serie((p) => p.calculo.decimoTerceiro), null),
      linhaAnual("det_enc_13", "Encargos sobre 13º", 2, serie((p) => p.calculo.encargosDecimoTerceiro), null),
    ],
    multa_fgts: [],
  };

  const blocos = TIPOS_PROVISAO.map((tipo) => {
    const mov = (f: (m: MovimentoProvisaoMes) => number) => serie((p) => f(p.porTipo[tipo]));
    return linhaAnual(`saldo_${tipo}`, `Saldo - ${ROTULO_TIPO_PROVISAO[tipo]}`, 0, mov((m) => m.saldoFinal), "fim", {
      destaque: true,
      filhos: [
        linhaAnual(`${tipo}_ini`, "Saldo inicial", 1, mov((m) => m.saldoInicial), "inicio"),
        linhaAnual(`${tipo}_prov`, "(+) Provisão do mês", 1, mov((m) => m.provisao), null, detalhe[tipo].length ? { filhos: detalhe[tipo].map((d) => ({ ...d, id: `${tipo}_${d.id}` })) } : {}),
        linhaAnual(`${tipo}_liq`, "(-) Liquidações (guias pagas)", 1, mov((m) => m.liquidacoes), null),
        linhaAnual(`${tipo}_exc`, "(+) Excesso da guia sobre o saldo (vai pra DRE)", 1, mov((m) => m.excesso), null),
        linhaAnual(`${tipo}_rev`, "(-) Reversões", 1, mov((m) => m.reversoes), null),
      ],
    });
  });

  const dre = linhaAnual("dre", "Na DRE (CMO) - provisão + excesso - reversão", 0, serie((p) => somarValores(TIPOS_PROVISAO.map((t) => p.porTipo[t].valorDre))), null, {
    filhos: TIPOS_PROVISAO.map((t) => linhaAnual(`dre_${t}`, ROTULO_TIPO_PROVISAO[t], 1, serie((p) => p.porTipo[t].valorDre), null)),
  });

  return [base, ...blocos, dre];
}
