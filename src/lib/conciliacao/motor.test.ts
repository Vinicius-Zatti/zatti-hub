import { describe, expect, it } from "vitest";
import { mascararDocumentos, normalizarDescricao, descricaoParaBusca, prepararDescricaoOriginal } from "./normalizacao";
import { identificarNatureza } from "./natureza";
import { sugerirDeterministico, type CategoriaMotor, type RegraMotor } from "./classificacao";
import { pontuarCandidato } from "./candidatos";
import { custoEstimadoUsd } from "./ia-custo";

describe("normalização e máscara", () => {
  it("mascara CPF, CNPJ, raiz de CNPJ e sequências longas", () => {
    expect(mascararDocumentos("Ana CPF: 121.323.806-43")).toBe("Ana CPF: ***.***.***-43");
    expect(mascararDocumentos("CNPJ: 52.087.151/0001-22")).toBe("CNPJ: **.***.***/****-22");
    expect(mascararDocumentos("Pix recebido - 54.775.562 Joao")).toBe("Pix recebido - **.***.*** Joao");
    expect(mascararDocumentos("Jeferson 12323899600")).toBe("Jeferson *********00");
  });
  it("normaliza igual ao motor da DQ e tira o prefixo bancário", () => {
    const n = normalizarDescricao("Pagamento de conta - Sem Limite Distribuidora");
    expect(n).toBe("pagamento de conta sem limite distribuidora");
    expect(descricaoParaBusca(n)).toBe("sem limite distribuidora");
  });
  it("descrição gravada sai mascarada e sem caracteres de controle", () => {
    expect(prepararDescricaoOriginal("Pix\u0000 enviado   12345678901")).toBe("Pix enviado *********01");
  });
});

describe("natureza: entrada versus saída", () => {
  it("venda no cartão é repasse, nunca receita nova, e só em entrada", () => {
    expect(identificarNatureza(normalizarDescricao("Vendas - Disponivel DEBITO MASTERCARD"), "entrada").natureza).toBe("repasse_cartao");
    expect(identificarNatureza(normalizarDescricao("Vendas - Disponivel DEBITO MASTERCARD"), "saida")).toEqual({
      natureza: "desconhecido",
      motivo: "direcao_contraditoria",
    });
  });
  it("99 Food na entrada é repasse; na saída é despesa comum", () => {
    expect(identificarNatureza(normalizarDescricao("99 Food"), "entrada").natureza).toBe("repasse_plataforma");
    expect(identificarNatureza(normalizarDescricao("QR Code Pix enviado - 99 Food"), "saida").natureza).toBe("saida");
  });
  it("aplicação em CDB não é descartada: vira natureza própria", () => {
    expect(identificarNatureza(normalizarDescricao("Renda Fixa - Aplicação em CDB"), "saida").natureza).toBe("aplicacao_resgate");
  });
});

const categorias: CategoriaMotor[] = [
  { id: "rec", codigoSistema: "receita_salao", nivel: "conta", papelDre: "receita", arquivado: false },
  { id: "tar", codigoSistema: "ca_tarifas_bancarias", nivel: "conta", papelDre: "custo_administrativo", arquivado: false },
  { id: "cmc", codigoSistema: "cmc_compras_mercadorias", nivel: "conta", papelDre: "cmc_mercadorias", arquivado: false },
];
const regra = (parcial: Partial<RegraMotor>): RegraMotor => ({
  id: "r1",
  escopo: "unidade",
  padraoNormalizado: "bemdita carnes",
  versaoNormalizacao: 1,
  direcao: "saida",
  categoriaId: "cmc",
  codigoSistemaAlvo: null,
  situacao: "ativa",
  versao: 1,
  ...parcial,
});

describe("motor determinístico", () => {
  const saida = { direcao: "saida" as const, natureza: "saida" as const, descricaoNormalizada: "pagamento de conta bemdita carnes" };
  it("regra da unidade sugere com confiança alta", () => {
    expect(sugerirDeterministico(saida, [regra({})], categorias, 1)).toMatchObject({ categoriaId: "cmc", fonte: "regra_unidade", confianca: "alta" });
  });
  it("regra conflitante suspende a sugestão", () => {
    expect(sugerirDeterministico(saida, [regra({ situacao: "conflitante" })], categorias, 1)).toMatchObject({ categoriaId: null, motivoCodigo: "regra_conflitante" });
  });
  it("entrada nunca recebe conta de despesa, mesmo com regra apontando para ela", () => {
    const entrada = { direcao: "entrada" as const, natureza: "entrada" as const, descricaoNormalizada: "pix recebido bemdita carnes" };
    expect(sugerirDeterministico(entrada, [regra({ direcao: "entrada" })], categorias, 1)).toBeNull();
  });
  it("regra de outra versão de normalização não vale", () => {
    expect(sugerirDeterministico(saida, [regra({ versaoNormalizacao: 2 })], categorias, 1)).toBeNull();
  });
  it("repasse e transferência não recebem categoria", () => {
    expect(sugerirDeterministico({ ...saida, direcao: "entrada", natureza: "repasse_cartao" }, [], categorias, 1)).toMatchObject({
      categoriaId: null,
      fonte: "natureza",
    });
  });
  it("tarifa bancária por descrição, confiança baixa", () => {
    expect(sugerirDeterministico({ ...saida, descricaoNormalizada: "tarifa pacote de servicos" }, [], categorias, 1)).toMatchObject({
      categoriaId: "tar",
      confianca: "baixa",
    });
  });
});

describe("pontuação de candidato", () => {
  it("Bemdita R$ 2.000 no mesmo dia soma valor e data", () => {
    const p = pontuarCandidato(
      { data: "2026-09-29", valorCentavos: 200000, contaFinanceiraId: "c1" },
      { grupo: "aberta", parcelaId: "p", lancamentoId: "l", descricao: "Bemdita", categoriaNome: "x", dataPrevista: "2026-09-29", valor: 2000, saldoAberto: 2000, status: "aberto", numero: 1, totalParcelas: 1, contaFinanceiraId: null },
    );
    expect(p.pontos).toBe(80);
    expect(p.diferencaCentavos).toBe(0);
  });
});

describe("custo de IA", () => {
  it("Haiku 4.5: US$ 1 por milhão de entrada e US$ 5 por milhão de saída", () => {
    expect(custoEstimadoUsd("claude-haiku-4-5", { entrada: 10_000, saida: 6_000, cacheEscrita: 0, cacheLeitura: 0 })).toBe(0.04);
    expect(() => custoEstimadoUsd("modelo-desconhecido", { entrada: 1, saida: 1, cacheEscrita: 0, cacheLeitura: 0 })).toThrow();
  });
});
