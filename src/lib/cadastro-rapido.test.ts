import { describe, expect, it } from "vitest";
import {
  AVISO_DEFINIR_SETOR,
  avisoInsumoFicha,
  avisoProdutoCotacao,
  configCadastroRapido,
  podeCadastrarProdutoPelaFicha,
  insumoPelaFichaRestrito,
  grupoEntraEmFicha,
  configCadastroRapidoFicha,
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

  it("ignora produto inativo ou sem confirmação, de qualquer grupo", () => {
    const inativo = produto({ sku: "PROFRA001", ativo: false });
    const semConfirmacao = produto({ sku: "PROLIN001" });
    expect(completarComItensConfirmados(itens, [inativo, semConfirmacao], { PROFRA001: 1 })).toBe(itens);
  });
});

describe("mesclarItensNovos", () => {
  const base = [produtoParaSugestaoCompra(produto({ sku: "PROCAR001" }))];
  const rucula = produtoParaSugestaoCompra(produto({ sku: "HORRUC001", grupo: "HOR" }));

  it("a linha nova entra, de qualquer grupo", () => {
    expect(mesclarItensNovos(base, [rucula]).map((i) => i.sku)).toEqual(["PROCAR001", "HORRUC001"]);
  });

  it("não duplica SKU que já veio do servidor", () => {
    expect(mesclarItensNovos(base, [base[0]])).toBe(base);
  });
});

describe("avisos do cadastro rápido", () => {
  it("cotação: produto novo pede a quantidade na linha do grupo, sem falar em filtro", () => {
    const texto = avisoProdutoCotacao({ nome: "rúcula", grupoNome: "Hortifrúti", podeDigitar: true, avisarSetor: false });
    expect(texto).toBe('"rúcula" cadastrado. Digite quanto comprar na linha marcada em Hortifrúti.');
    expect(texto).not.toMatch(/filtro|escopo/);
  });

  it("cotação: unidade com setor recebe a orientação de definir o setor", () => {
    const texto = avisoProdutoCotacao({ nome: "rúcula", grupoNome: "Hortifrúti", podeDigitar: true, avisarSetor: true });
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

describe("podeCadastrarProdutoPelaFicha (29/10/2026)", () => {
  const base = { unidadeId: "u", areaInterna: false, fichasTecnicasHabilitado: true };
  it("quem edita ficha (chef ou editar no Cardápio) cadastra insumo pela ficha", () => {
    expect(podeCadastrarProdutoPelaFicha({ ...base, permissoes: { cardapio: "chef" } })).toBe(true);
    expect(podeCadastrarProdutoPelaFicha({ ...base, permissoes: { cardapio: "editar" } })).toBe(true);
  });
  it("quem só vê o Cardápio não cadastra", () => {
    expect(podeCadastrarProdutoPelaFicha({ ...base, permissoes: { cardapio: "ver" } })).toBe(false);
    expect(podeCadastrarProdutoPelaFicha({ ...base, permissoes: { cardapio: "sem_acesso" } })).toBe(false);
  });
  it("sem Fichas Técnicas ou fora da Navegação V2, sem atalho", () => {
    expect(podeCadastrarProdutoPelaFicha({ ...base, fichasTecnicasHabilitado: false, permissoes: { cardapio: "chef" } })).toBe(false);
    expect(podeCadastrarProdutoPelaFicha({ ...base, areaInterna: true, permissoes: { cardapio: "editar" } })).toBe(false);
  });
});

describe("insumo pela ficha sem editar em Cadastros (30/10/2026)", () => {
  it("só gestão/master com editar em Cadastros ficam sem a restrição", () => {
    expect(insumoPelaFichaRestrito({ role: "gestao", permissoes: { cadastros: "editar" } })).toBe(false);
    expect(insumoPelaFichaRestrito({ role: "master", permissoes: { cadastros: "editar" } })).toBe(false);
    expect(insumoPelaFichaRestrito({ role: "gestao", permissoes: { cadastros: "ver" } })).toBe(true);
    expect(insumoPelaFichaRestrito({ role: "gestao", permissoes: { cadastros: "sem_acesso" } })).toBe(true);
    expect(insumoPelaFichaRestrito({ role: "operacional", permissoes: { cadastros: "editar" } })).toBe(true);
  });
  it("Limpeza, Operacional e grupo vazio não entram pela ficha", () => {
    expect(grupoEntraEmFicha("MER")).toBe(true);
    expect(grupoEntraEmFicha("PRE")).toBe(true);
    expect(grupoEntraEmFicha("LIM")).toBe(false);
    expect(grupoEntraEmFicha(" ope ")).toBe(false);
    expect(grupoEntraEmFicha("")).toBe(false);
    expect(grupoEntraEmFicha("XYZ")).toBe(false);
    expect(grupoEntraEmFicha("LIM	")).toBe(false);
  });
  it("a config da ficha leva a restrição junto", () => {
    const base = { unidadeId: "u", areaInterna: false, fichasTecnicasHabilitado: true, fonteDadosEstoque: "banco" };
    expect(
      configCadastroRapidoFicha({ ...base, role: "operacional", permissoes: { cardapio: "chef", cadastros: "ver" } }, true),
    ).toEqual({ avisarSetor: true, insumoRestrito: true });
    expect(
      configCadastroRapidoFicha({ ...base, role: "gestao", permissoes: { cardapio: "editar", cadastros: "editar" } }, false),
    ).toEqual({ avisarSetor: false, insumoRestrito: false });
    expect(
      configCadastroRapidoFicha({ ...base, role: "operacional", permissoes: { cardapio: "ver", cadastros: "ver" } }, true),
    ).toBeNull();
  });
});
