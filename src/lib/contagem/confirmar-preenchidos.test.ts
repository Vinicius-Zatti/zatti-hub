import { describe, expect, it } from "vitest";
import { filtrarPorNomeOuSku } from "@/lib/busca-lista";
import { confirmarPreenchidos, quantidadeDigitada } from "./confirmar-preenchidos";

const todos = [
  { sku: "A1", nome: "Açúcar" },
  { sku: "B2", nome: "Bacon" },
  { sku: "C3", nome: "Cebola" },
  { sku: "D4", nome: "Detergente" },
];

describe("busca da contagem e o digitado", () => {
  it("filtrar e limpar a busca não mexe no que foi digitado nem no confirmado", () => {
    const valores = { A1: "2", B2: "1,5", C3: "" };
    const confirmados = { D4: 7 };
    const copiaValores = structuredClone(valores);
    const copiaConfirmados = structuredClone(confirmados);

    const filtrados = filtrarPorNomeOuSku(todos, "acucar");
    expect(filtrados.map((i) => i.sku)).toEqual(["A1"]);
    const limpos = filtrarPorNomeOuSku(todos, "");
    expect(limpos.map((i) => i.sku)).toEqual(["A1", "B2", "C3", "D4"]);

    expect(valores).toEqual(copiaValores);
    expect(confirmados).toEqual(copiaConfirmados);
    // Ao voltar, cada item reaparece com o mesmo valor, porque o valor mora no estado pelo SKU.
    expect(limpos.map((i) => valores[i.sku as keyof typeof valores] ?? "")).toEqual(["2", "1,5", "", ""]);
  });

  it("confirmar preenchidos vale para a contagem inteira, inclusive o que a busca esconde", () => {
    const valores = { A1: "2", B2: "1,5", C3: "", D4: "-1" };
    // A busca mostra só o Açúcar, mas o botão recebe a lista completa.
    expect(filtrarPorNomeOuSku(todos, "açúcar")).toHaveLength(1);
    const r = confirmarPreenchidos(todos, valores, {});
    expect(r.confirmados).toEqual({ A1: 2, B2: 1.5 });
    expect(r.valores).toEqual({ A1: "2", B2: "1.5" });
  });

  it("não reconfirma o que já estava confirmado", () => {
    const r = confirmarPreenchidos(todos, { A1: "9", B2: "3" }, { A1: 2 });
    expect(r.confirmados).toEqual({ B2: 3 });
  });

  it("quantidadeDigitada aceita vírgula e recusa vazio e negativo", () => {
    expect(quantidadeDigitada("1,25")).toBe(1.25);
    expect(quantidadeDigitada(" ")).toBeNull();
    expect(quantidadeDigitada("-2")).toBeNull();
    expect(quantidadeDigitada("abc")).toBeNull();
    expect(quantidadeDigitada("0")).toBe(0);
  });
});
