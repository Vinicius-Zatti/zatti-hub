import { describe, expect, it } from "vitest";
import {
  gerarCsvExtrato,
  lerFiltroExtrato,
  linhaDaView,
  mensagemRecebimento,
  numeroCsv,
  saldoDaView,
  situacaoLinha,
  totalPaginas,
  type LinhaExtrato,
} from "@/lib/extrato";
import { perdaEstoqueSchema } from "@/lib/validacao";

function linha(parcial: Partial<LinhaExtrato> = {}): LinhaExtrato {
  return {
    linhaId: "mov:1",
    movimentacaoId: "1",
    data: "2026-10-13",
    natureza: "movimento",
    tipo: "compra",
    origem: "recebimento",
    sku: "HORLTA001",
    nome: "limão; tahiti",
    unidadeBase: "KG",
    quantidade: 2.5,
    quantidadeSinal: 2.5,
    custoUnitario: 10,
    valor: 25,
    quantidadeConferida: true,
    motivo: null,
    observacao: null,
    fornecedor: "Ceasa",
    canceladoEm: null,
    motivoCancelamento: null,
    ...parcial,
  };
}

describe("lerFiltroExtrato", () => {
  it("ignora valores inválidos e nunca confia na URL", () => {
    const f = lerFiltroExtrato({ de: "2026-02-31", ate: "x", tipo: "venda", sku: "a b", pagina: "-3" });
    expect(f).toEqual({ de: null, ate: null, tipo: null, sku: null, incluirCancelados: false, pagina: 1 });
  });

  it("aceita filtros válidos, normaliza SKU e inverte período trocado", () => {
    const f = lerFiltroExtrato({ de: "2026-10-31", ate: "2026-10-01", tipo: "perda", sku: " horlta001 ", pagina: "3", cancelados: "1" });
    expect(f).toEqual({ de: "2026-10-01", ate: "2026-10-31", tipo: "perda", sku: "HORLTA001", incluirCancelados: true, pagina: 3 });
  });
});

describe("totalPaginas", () => {
  it("tem pelo menos uma página", () => {
    expect(totalPaginas(0)).toBe(1);
    expect(totalPaginas(50)).toBe(1);
    expect(totalPaginas(51)).toBe(2);
  });
});

describe("situacaoLinha", () => {
  it("compra sem preço fica pendente, nunca vira zero", () => {
    expect(situacaoLinha(linha({ custoUnitario: null }))).toBe("Preço pendente");
  });
  it("quantidade em branco no recebimento aparece como não conferida", () => {
    expect(situacaoLinha(linha({ quantidadeConferida: false }))).toBe("Quantidade não conferida");
  });
  it("cancelado vence o resto e posição não tem situação", () => {
    expect(situacaoLinha(linha({ canceladoEm: "2026-10-13T10:00:00Z", custoUnitario: null }))).toBe("Cancelado");
    expect(situacaoLinha(linha({ natureza: "posicao", custoUnitario: null }))).toBe("");
  });
});

describe("CSV do extrato", () => {
  it("tem BOM, separador ; e escapa texto com ;", () => {
    const csv = gerarCsvExtrato([linha()]);
    expect(csv.startsWith("﻿Data;Tipo;SKU")).toBe(true);
    expect(csv).toContain('13/10/2026;Compra;HORLTA001;"limão; tahiti";KG;2,5;10;25;Ceasa');
  });

  it("perda sai negativa e custo desconhecido sai em branco", () => {
    const csv = gerarCsvExtrato([
      linha({ tipo: "perda", origem: "manual", quantidadeSinal: -1, quantidade: 1, custoUnitario: null, valor: null, motivo: "erro_preparo", fornecedor: null }),
    ]);
    expect(csv).toContain(";Perda;HORLTA001;");
    expect(csv).toContain(";KG;-1;;;;Erro de preparo;;Preço pendente;");
  });

  it("numeroCsv não usa ponto de milhar", () => {
    expect(numeroCsv(1234.5)).toBe("1234,5");
    expect(numeroCsv(null)).toBe("");
  });
});

describe("conversão das views", () => {
  it("números do PostgREST viram número e nulos continuam nulos", () => {
    const l = linhaDaView({
      linha_id: "pos:a:b", movimentacao_id: null, data: "2026-10-11", natureza: "posicao", tipo: "posicao",
      origem: null, sku: "X", nome: "x", unidade_base: "UN", quantidade: "4", quantidade_sinal: null,
      custo_unitario: null, valor: null, quantidade_conferida: true,
    });
    expect(l.quantidade).toBe(4);
    expect(l.valor).toBeNull();
    expect(l.natureza).toBe("posicao");
  });

  it("saldo sem posição fica nulo (indeterminado), nunca zero", () => {
    const s = saldoDaView({ produto_id: "p", sku: "X", nome: "x", unidade_base: "UN", ativo: true, saldo: null, entradas: "3", saidas: "0" });
    expect(s.saldo).toBeNull();
    expect(s.entradas).toBe(3);
  });
});

describe("mensagemRecebimento", () => {
  it("só fala do extrato quando há pendência", () => {
    expect(mensagemRecebimento({ sem_preco: 0, pendencias: [] })).toBe("Salvo.");
    expect(mensagemRecebimento({ sem_preco: 2, pendencias: [{ sku: "ABC", motivo: "Produto não encontrado no cadastro" }] })).toBe(
      "Salvo. 2 itens entraram no extrato sem preço (ficam pendentes em Movimentações). Fora do extrato: ABC (produto não encontrado no cadastro).",
    );
  });
});

describe("perdaEstoqueSchema", () => {
  const base = { produtoId: "00000000-0000-4000-8000-000000000001", quantidade: 1, data: "2026-10-13", motivo: "vencido", observacao: null };
  it("aceita perda com motivo da lista", () => {
    expect(perdaEstoqueSchema.safeParse(base).success).toBe(true);
  });
  it("recusa quantidade zero, motivo fora da lista e 'outro' sem texto", () => {
    expect(perdaEstoqueSchema.safeParse({ ...base, quantidade: 0 }).success).toBe(false);
    expect(perdaEstoqueSchema.safeParse({ ...base, motivo: "furto" }).success).toBe(false);
    expect(perdaEstoqueSchema.safeParse({ ...base, motivo: "outro", observacao: " " }).success).toBe(false);
    expect(perdaEstoqueSchema.safeParse({ ...base, motivo: "outro", observacao: "caiu no chão" }).success).toBe(true);
  });
});
