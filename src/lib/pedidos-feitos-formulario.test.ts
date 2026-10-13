import { describe, expect, it } from "vitest";
import {
  formularioDoPedido,
  pedidoMudouDesdeOFormulario,
  sincronizarFormularios,
} from "./pedidos-feitos-formulario";
import type { Pedido } from "@/lib/types";

function pedido(id: string, versao: number, quantidadeRecebida: number | null, observacao: string | null = null): Pedido {
  return {
    id,
    fornecedor: `F-${id}`,
    dataContagemBase: "2026-10-01",
    previsaoEntrega: null,
    observacaoEntrega: observacao,
    recebido: false,
    criadoEm: "2026-10-01T10:00:00Z",
    atualizadoEm: "2026-10-01T10:00:00Z",
    versaoItens: versao,
    itens: [
      {
        sku: "HORLIM001",
        nome: "limao",
        nomeCompra: "limao",
        unidadeBase: "UN",
        quantidadePedida: 5,
        quantidadeRecebida,
        precoAntigo: null,
        precoAtualizado: null,
        precoConfirmado: false,
        vencedorConfirmado: true,
      },
    ],
  };
}

describe("formulário de recebimento em Pedidos Feitos", () => {
  it("carrega a versão junto com os campos", () => {
    const f = formularioDoPedido(pedido("a", 3, 4, "faltou"));
    expect(f).toEqual({ versao: 3, editado: false, quantidades: { HORLIM001: "4,000" }, observacao: "faltou", recebido: false });
  });

  it("devolve o mesmo objeto quando nada mudou", () => {
    const pedidos = [pedido("a", 1, null), pedido("b", 2, null)];
    const atuais = sincronizarFormularios({}, pedidos);
    expect(sincronizarFormularios(atuais, pedidos)).toBe(atuais);
  });

  it("versão nova em formulário não editado recarrega os campos", () => {
    const atuais = sincronizarFormularios({}, [pedido("a", 1, null)]);
    const proximos = sincronizarFormularios(atuais, [pedido("a", 2, 3, "outra pessoa")]);
    expect(proximos.a).toMatchObject({ versao: 2, quantidades: { HORLIM001: "3,000" }, observacao: "outra pessoa" });
  });

  it("versão nova em formulário editado mantém campos e versão antigos (o banco recusa)", () => {
    const atuais = sincronizarFormularios({}, [pedido("a", 1, null), pedido("b", 1, null)]);
    const editado = { ...atuais, a: { ...atuais.a, observacao: "minha", editado: true } };
    const novaA = pedido("a", 2, 3, "outra pessoa");
    const proximos = sincronizarFormularios(editado, [novaA, pedido("b", 1, null)]);
    expect(proximos.a).toMatchObject({ versao: 1, observacao: "minha", editado: true });
    expect(pedidoMudouDesdeOFormulario(proximos.a, novaA)).toBe(true);
    expect(pedidoMudouDesdeOFormulario(proximos.b, pedido("b", 1, null))).toBe(false);
  });

  it("pedido novo nas props ganha formulário; pedido que sumiu sai", () => {
    const atuais = sincronizarFormularios({}, [pedido("a", 1, null)]);
    const proximos = sincronizarFormularios(atuais, [pedido("b", 1, null)]);
    expect(Object.keys(proximos)).toEqual(["b"]);
  });
});
