import { describe, expect, it } from "vitest";
import { caminhoCategoria, listarContasLancaveis, montarArvoreCategorias } from "./categorias";
import type { CategoriaFinanceira } from "./tipos";

function categoria(parcial: Partial<CategoriaFinanceira> & { id: string }): CategoriaFinanceira {
  return {
    parentId: null,
    nivel: "conta",
    papelDre: null,
    nome: parcial.id,
    codigoSistema: null,
    padrao: true,
    ordem: 0,
    arquivado: false,
    ...parcial,
  };
}

describe("montarArvoreCategorias", () => {
  it("monta grupo principal > subgrupo > conta", () => {
    const lista: CategoriaFinanceira[] = [
      categoria({ id: "cmo", nivel: "grupo_principal", ordem: 1 }),
      categoria({ id: "cmo-ferias", parentId: "cmo", nivel: "conta", papelDre: "cmo_ferias", ordem: 1 }),
      categoria({ id: "receita", nivel: "grupo_principal", ordem: 0 }),
      categoria({ id: "receita-salao", parentId: "receita", nivel: "conta", papelDre: "receita", ordem: 1 }),
    ];

    const arvore = montarArvoreCategorias(lista);

    expect(arvore.map((n) => n.id)).toEqual(["receita", "cmo"]); // ordenado por `ordem`
    expect(arvore[1].filhos.map((n) => n.id)).toEqual(["cmo-ferias"]);
  });

  it("categoria própria (padrao=false) sempre aparece depois das padrão do mesmo pai", () => {
    const lista: CategoriaFinanceira[] = [
      categoria({ id: "grupo", nivel: "grupo_principal" }),
      categoria({ id: "propria", parentId: "grupo", padrao: false, ordem: 0 }),
      categoria({ id: "padrao-2", parentId: "grupo", ordem: 2 }),
      categoria({ id: "padrao-1", parentId: "grupo", ordem: 1 }),
    ];

    const arvore = montarArvoreCategorias(lista);

    expect(arvore[0].filhos.map((n) => n.id)).toEqual(["padrao-1", "padrao-2", "propria"]);
  });
});

describe("listarContasLancaveis", () => {
  it("exclui contas alimentadas só por provisão", () => {
    const lista: CategoriaFinanceira[] = [
      categoria({ id: "cmo-normal", papelDre: "cmo" }),
      categoria({ id: "cmo-ferias", papelDre: "cmo_ferias" }),
      categoria({ id: "cmo-13", papelDre: "cmo_decimo_terceiro" }),
      categoria({ id: "cmo-multa", papelDre: "cmo_multa_fgts" }),
    ];

    expect(listarContasLancaveis(lista).map((c) => c.id)).toEqual(["cmo-normal"]);
  });

  it("exclui categoria arquivada e nó que não é folha", () => {
    const lista: CategoriaFinanceira[] = [
      categoria({ id: "grupo", nivel: "grupo_principal" }),
      categoria({ id: "arquivada", papelDre: "cmo", arquivado: true }),
      categoria({ id: "ativa", papelDre: "cmo" }),
    ];

    expect(listarContasLancaveis(lista).map((c) => c.id)).toEqual(["ativa"]);
  });
});

describe("caminhoCategoria", () => {
  it("sobe até o grupo principal quando não há subgrupo (CMO > conta)", () => {
    const lista: CategoriaFinanceira[] = [
      categoria({ id: "cmo", nivel: "grupo_principal", nome: "CMO" }),
      categoria({ id: "folha", parentId: "cmo", papelDre: "cmo", nome: "Folha salarial contábil" }),
    ];

    expect(caminhoCategoria("folha", lista)).toBe("CMO > Folha salarial contábil");
  });

  it("passa pelo subgrupo quando existe (grupo > subgrupo > conta)", () => {
    const lista: CategoriaFinanceira[] = [
      categoria({ id: "op", nivel: "grupo_principal", nome: "Custos Operacionais" }),
      categoria({ id: "ocupacao", parentId: "op", nivel: "subgrupo", nome: "Custos de Ocupação" }),
      categoria({ id: "aluguel", parentId: "ocupacao", papelDre: "custo_ocupacao", nome: "Aluguel" }),
    ];

    expect(caminhoCategoria("aluguel", lista)).toBe("Custos Operacionais > Custos de Ocupação > Aluguel");
  });
});
