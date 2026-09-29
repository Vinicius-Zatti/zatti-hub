import { centavosParaTexto } from "./dinheiro";
import { descricaoParaBusca, normalizarDescricao, prepararDescricaoOriginal, VERSAO_NORMALIZACAO } from "./normalizacao";
import { identificarNatureza } from "./natureza";
import { categoriaCompativel, sugerirDeterministico, VERSAO_MOTOR, type CategoriaMotor, type RegraMotor } from "./classificacao";
import { MODELO_IA_CONCILIACAO } from "./ia-custo";
import { faixaDeValor, VERSAO_PROMPT_CLASSIFICACAO, type ItemClassificacaoIa } from "./ia";
import { SEM_SUGESTAO, type LeituraOk, type Sugestao } from "./tipos";

// Da leitura ao payload atestado: máscara, normalização, natureza e
// sugestão. Puro e testável; a IA de classificação entra só pelos índices
// que o motor determinístico deixou sem sugestão.

export type MovimentoPreparado = {
  posicao: number;
  data: string;
  direcao: "entrada" | "saida";
  valorCentavos: number;
  descricaoOriginal: string;
  descricaoNormalizada: string;
  favorecido: string | null;
  natureza: ReturnType<typeof identificarNatureza>["natureza"];
  idBanco: string | null;
  conferido: boolean;
  sugestao: Sugestao | null;
};

export function prepararMovimentos(leitura: LeituraOk, categorias: CategoriaMotor[], regras: RegraMotor[]): MovimentoPreparado[] {
  const preparados: MovimentoPreparado[] = [];
  for (const l of leitura.linhas) {
    if (l.tipo !== "movimento") continue;
    const descricaoOriginal = prepararDescricaoOriginal(l.descricaoOriginal);
    const descricaoNormalizada = normalizarDescricao(descricaoOriginal).slice(0, 300) || "sem descricao";
    const favorecido = descricaoParaBusca(descricaoNormalizada);
    const { natureza } = identificarNatureza(descricaoNormalizada, l.direcao);
    const sugestao = sugerirDeterministico({ direcao: l.direcao, natureza, descricaoNormalizada }, regras, categorias, VERSAO_NORMALIZACAO);
    preparados.push({
      posicao: l.posicao,
      data: l.data,
      direcao: l.direcao,
      valorCentavos: l.valorCentavos,
      descricaoOriginal: descricaoOriginal || "sem descricao",
      descricaoNormalizada,
      favorecido: favorecido && favorecido !== descricaoNormalizada ? favorecido.slice(0, 200) : null,
      natureza,
      idBanco: l.idBanco,
      conferido: l.conferido,
      sugestao,
    });
  }
  return preparados;
}

/** Só descrição normalizada e mascarada, direção e faixa de valor vão para a
 * IA. Nada de data, conta, valor exato ou identificador. */
export function itensParaIa(movimentos: MovimentoPreparado[]): ItemClassificacaoIa[] {
  return movimentos
    .filter((m) => m.sugestao === null && (m.natureza === "entrada" || m.natureza === "saida"))
    .map((m) => ({ indice: m.posicao, descricao: m.descricaoNormalizada, direcao: m.direcao, faixaValor: faixaDeValor(m.valorCentavos) }));
}

export function aplicarSugestoesIa(
  movimentos: MovimentoPreparado[],
  ia: Map<number, { contaId: string; confianca: "media" | "baixa" }>,
  categorias: CategoriaMotor[],
): MovimentoPreparado[] {
  const porId = new Map(categorias.map((c) => [c.id, c]));
  return movimentos.map((m) => {
    if (m.sugestao !== null) return m;
    const s = ia.get(m.posicao);
    // Revalida: a IA nunca contorna a regra de direção.
    if (!s || !categoriaCompativel(porId.get(s.contaId), m.direcao)) return m;
    return {
      ...m,
      sugestao: {
        ...SEM_SUGESTAO,
        categoriaId: s.contaId,
        confianca: s.confianca,
        fonte: "ia",
        motivoCodigo: "ia_sugestao",
        modeloIa: MODELO_IA_CONCILIACAO,
        versaoPrompt: VERSAO_PROMPT_CLASSIFICACAO,
      },
    };
  });
}

export function montarConteudoRegistro(params: {
  importacao: string;
  tentativa: number;
  nonce: string;
  leitura: LeituraOk;
  movimentos: MovimentoPreparado[];
}): Record<string, unknown> {
  const porPosicao = new Map(params.movimentos.map((m) => [m.posicao, m]));
  const linhas = params.leitura.linhas.map((l) => {
    if (l.tipo === "saldo") return { posicao: l.posicao, tipo: "saldo" };
    if (l.tipo === "erro") return { posicao: l.posicao, tipo: "erro", codigo_erro: l.codigo };
    const m = porPosicao.get(l.posicao)!;
    const s = m.sugestao ?? SEM_SUGESTAO;
    return {
      posicao: m.posicao,
      tipo: "movimento",
      data: m.data,
      direcao: m.direcao,
      valor_centavos: centavosParaTexto(m.valorCentavos),
      descricao_original: m.descricaoOriginal,
      descricao_normalizada: m.descricaoNormalizada,
      favorecido_normalizado: m.favorecido,
      id_banco: m.idBanco,
      natureza: m.natureza,
      conferido: m.conferido,
      sugestao: {
        categoria_id: s.categoriaId,
        confianca: s.confianca,
        fonte: s.fonte,
        motivo_codigo: s.motivoCodigo,
        evidencias: s.evidencias,
        regra_id: s.regraId,
        regra_versao: s.regraVersao,
        modelo_ia: s.modeloIa,
        versao_prompt: s.versaoPrompt,
      },
    };
  });
  return {
    importacao: params.importacao,
    tentativa: params.tentativa,
    nonce: params.nonce,
    versao_parser: params.leitura.versaoParser,
    versao_motor: VERSAO_MOTOR,
    versao_normalizacao: VERSAO_NORMALIZACAO,
    fonte_extracao: params.leitura.fonte,
    conferencia_aritmetica: params.leitura.conferencia,
    periodo_inicio: params.leitura.periodoInicio,
    periodo_fim: params.leitura.periodoFim,
    erro_global: null,
    linhas,
  };
}
