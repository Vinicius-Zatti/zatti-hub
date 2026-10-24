import { describe, expect, it } from "vitest";
import type { ItemInventario, Pedido, Produto } from "@/lib/types";
import { resumirEstoque, tipoDaContagem } from "./resumo";

const produto = (p: Partial<Produto>) => ({ ativo: true, grupo: "G1", precoUnitario: 1, ...p }) as unknown as Produto;
const item = (i: Partial<ItemInventario>) => ({ data: "03/08/2026", total: 10, alerta: "", ...i }) as unknown as ItemInventario;
const pedido = (recebido: boolean, confirmados: boolean[]) =>
  ({
    recebido,
    itens: confirmados.map((c) => ({ vencedorConfirmado: c, quantidadePedida: 2, precoAtualizado: 5, precoAntigo: null })),
  }) as unknown as Pedido;

describe("resumirEstoque (mesmos números do Painel geral)", () => {
  it("conta pela última contagem, produtos ativos e pedidos confirmados não recebidos", () => {
    const resumo = resumirEstoque(
      [produto({}), produto({ grupo: "G2", precoUnitario: null }), produto({ ativo: false })],
      [
        item({ data: "28/07/2026", alerta: "Comprar emergencial" }),
        item({ alerta: "Comprar emergencial" }),
        item({ alerta: "Possível erro de contagem", total: null }),
      ],
      [pedido(false, [true, false]), pedido(true, [true]), pedido(false, [false])],
    );
    expect(resumo).toEqual({
      produtosAtivos: 2,
      grupos: 2,
      ultimaContagem: "03/08/2026",
      itensContados: 2,
      valorEstoque: 10,
      alertasCompra: 1,
      possiveisErros: 1,
      produtosSemPreco: 1,
      pedidosPendentes: 1,
      valorPedidosPendentes: 10,
    });
  });

  it("sem contagem", () => {
    expect(resumirEstoque([], [], [])).toMatchObject({ ultimaContagem: null, itensContados: 0, alertasCompra: 0 });
  });
});

describe("tipoDaContagem", () => {
  const setor = (situacao: "pendente" | "concluido") => ({
    setorId: situacao,
    setorNome: situacao,
    situacao,
    enviadoEm: null,
    enviadoPor: null,
  });

  it("contagem por setor: completa ou parcial, pela mesma regra da Conferência", () => {
    expect(tipoDaContagem("setor", [setor("concluido")])).toBe("Por setor (completa)");
    expect(tipoDaContagem("setor", [setor("concluido"), setor("pendente")])).toBe("Por setor (parcial)");
    expect(tipoDaContagem("setor", [])).toBe("Por setor (parcial)");
    expect(tipoDaContagem(undefined, [setor("concluido")])).toBe("Por setor (completa)");
  });

  it("fluxo antigo (completa ou por grupos) não grava o tipo: fica vazio", () => {
    expect(tipoDaContagem("legada", [])).toBe("");
    expect(tipoDaContagem(undefined, [])).toBe("");
  });
});
