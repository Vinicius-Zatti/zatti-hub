import { describe, expect, it } from "vitest";
import {
  AVISO_DEFINIR_SETOR,
  avisoInsumoFicha,
  avisoProdutoCotacao,
  configCadastroRapido,
  mesclarItensNovos,
  ALERTA_CADASTRADO_AGORA,
  ALERTA_FORA_DA_CONTAGEM,
  completarComItensConfirmados,
  incluirPorSku,
  produtoParaOpcaoFicha,
  produtoParaSugestaoCompra,
} from "@/lib/cadastro-rapido";
import type { Produto, SugestaoCompra } from "@/lib/types";

function produto(parcial: Partial<Produto> = {}): Produto {
  return {
    sku: "PROCAR001",
    posicao: null,
    grupo: "PRO",
    nome: "costela bovina",
    unidadeBase: "KG",
    precoUnitario: 42.5,
    estoqueNecessarioSemana: null,
    estoqueMinimo: null,
    nomeCompra: "",
    unidadeEmbalagemFornecedor: "",
    qtdUnidadeBasePorEmbalagem: null,
    precoFornecedor: null,
    fornecedor1: "",
    fornecedor2: "",
    fornecedor3: "",
    fornecedor4: "",
    observacoes: "",
    ativo: true,
    revenda: false,
    ...parcial,
  };
}

describe("produtoParaOpcaoFicha", () => {
  it("usa a unidade base e o preço unitário como custo", () => {
    expect(produtoParaOpcaoFicha(produto())).toEqual({
      sku: "PROCAR001",
      nome: "costela bovina",
      unidadeUso: "KG",
      custoUnitario: 42.5,
      grupo: "PRO",
    });
  });

  it("produto sem preço fica com custo nulo", () => {
    expect(produtoParaOpcaoFicha(produto({ precoUnitario: null }))?.custoUnitario).toBeNull();
  });

  it("grupo que nunca entra em receita e produto inativo ficam de fora", () => {
    expect(produtoParaOpcaoFicha(produto({ grupo: "LIM" }))).toBeNull();
    expect(produtoParaOpcaoFicha(produto({ grupo: "OPE" }))).toBeNull();
    expect(produtoParaOpcaoFicha(produto({ ativo: false }))).toBeNull();
  });
});

describe("incluirPorSku", () => {
  it("acrescenta no fim quando o SKU é novo", () => {
    expect(incluirPorSku([{ sku: "A" }], { sku: "B" })).toEqual([{ sku: "A" }, { sku: "B" }]);
  });

  it("troca no lugar quando o SKU já existe, sem duplicar", () => {
    const lista = [
      { sku: "A", n: 1 },
      { sku: "B", n: 1 },
    ];
    expect(incluirPorSku(lista, { sku: "A", n: 2 })).toEqual([
      { sku: "A", n: 2 },
      { sku: "B", n: 1 },
    ]);
  });
});

describe("produtoParaSugestaoCompra", () => {
  it("entra como não contado, sem sugestão e com os fornecedores preenchidos", () => {
    const item = produtoParaSugestaoCompra(produto({ fornecedor1: "Frigo Sul", fornecedor3: " " }));
    expect(item.estoqueAtual).toBeNull();
    expect(item.quantidadeSugerida).toBe(0);
    expect(item.precisaComprar).toBe(false);
    expect(item.fornecedores).toEqual(["Frigo Sul"]);
    expect(item.alerta).toBe(ALERTA_CADASTRADO_AGORA);
  });
});

describe("completarComItensConfirmados", () => {
  const naContagem = produtoParaSugestaoCompra(produto({ sku: "PROCAR001" }));
  const itens: SugestaoCompra[] = [naContagem];

  it("devolve a mesma lista quando nada confirmado está fora dela", () => {
    expect(completarComItensConfirmados(itens, [produto()], { PROCAR001: 3 })).toBe(itens);
  });

  it("confirmado com zero não volta para a tela", () => {
    const novo = produto({ sku: "HORALF001", grupo: "HOR" });
    expect(completarComItensConfirmados(itens, [novo], { HORALF001: 0 })).toBe(itens);
  });

  it("acrescenta produto confirmado que ficou fora do escopo da contagem", () => {
    const novo = produto({ sku: "HORALF001", grupo: "HOR", nome: "alface" });
    const resultado = completarComItensConfirmados(itens, [produto(), novo], { HORALF001: 2 });
    expect(resultado.map((i) => i.sku)).toEqual(["PROCAR001", "HORALF001"]);
    expect(resultado[1].alerta).toBe(ALERTA_FORA_DA_CONTAGEM);
  });

  it("respeita o filtro de grupos e ignora produto inativo ou sem confirmação", () => {
    const hortifruti = produto({ sku: "HORALF001", grupo: "HOR" });
    const inativo = produto({ sku: "PROFRA001", ativo: false });
    const semConfirmacao = produto({ sku: "PROLIN001" });
    const resultado = completarComItensConfirmados(
      itens,
      [hortifruti, inativo, semConfirmacao],
      { HORALF001: 2, PROFRA001: 1 },
      ["PRO"],
    );
    expect(resultado).toBe(itens);
  });
});

describe("mesclarItensNovos", () => {
  const base = [produtoParaSugestaoCompra(produto({ sku: "PROCAR001" }))];
  const rucula = produtoParaSugestaoCompra(produto({ sku: "HORRUC001", grupo: "HOR" }));

  it("sem filtro de grupos, a linha nova entra", () => {
    expect(mesclarItensNovos(base, [rucula]).map((i) => i.sku)).toEqual(["PROCAR001", "HORRUC001"]);
  });

  it("com filtro, linha de grupo fora do filtro não entra", () => {
    expect(mesclarItensNovos(base, [rucula], ["PRO"])).toBe(base);
    expect(mesclarItensNovos(base, [rucula], ["HOR"]).map((i) => i.sku)).toEqual(["PROCAR001", "HORRUC001"]);
  });

  it("não duplica SKU que já veio do servidor", () => {
    expect(mesclarItensNovos(base, [base[0]])).toBe(base);
  });
});

describe("avisos do cadastro rápido", () => {
  it("cotação: produto fora do filtro avisa o grupo", () => {
    expect(
      avisoProdutoCotacao({ nome: "rúcula", grupoNome: "Hortifrúti", foraDoFiltro: true, podeDigitar: true, avisarSetor: false }),
    ).toContain('cadastrado em Hortifrúti, que está fora do filtro');
  });

  it("cotação: unidade com setor recebe a orientação de definir o setor", () => {
    const texto = avisoProdutoCotacao({ nome: "rúcula", grupoNome: "Hortifrúti", foraDoFiltro: false, podeDigitar: true, avisarSetor: true });
    expect(texto).toContain("Digite quanto comprar");
    expect(texto.endsWith(AVISO_DEFINIR_SETOR)).toBe(true);
  });

  it("ficha: sem setor e insumo escolhido não precisa de aviso", () => {
    expect(avisoInsumoFicha({ nome: "cheddar", grupo: "LAT", entrouNaFicha: true, avisarSetor: false })).toBeNull();
  });

  it("ficha: grupo fora de receita avisa, e com setor acrescenta a orientação", () => {
    expect(avisoInsumoFicha({ nome: "detergente", grupo: "LIM", entrouNaFicha: false, avisarSetor: false })).toContain(
      "não entra em ficha técnica",
    );
    expect(avisoInsumoFicha({ nome: "cheddar", grupo: "LAT", entrouNaFicha: true, avisarSetor: true })).toContain(AVISO_DEFINIR_SETOR);
  });

  it("config: sem liberação não há atalho; setor só na fonte banco", () => {
    expect(configCadastroRapido(false, true, "banco")).toBeNull();
    expect(configCadastroRapido(true, true, "banco")).toEqual({ avisarSetor: true });
    expect(configCadastroRapido(true, true, "planilha")).toEqual({ avisarSetor: false });
    expect(configCadastroRapido(true, false, "banco")).toEqual({ avisarSetor: false });
  });
});
