import { describe, expect, it } from "vitest";
import { criarFilaSerial, incorporarNovosPorSku } from "./fila-serial";

describe("fila serial", () => {
  it("roda uma tarefa por vez, na ordem de chegada", async () => {
    const enfileirar = criarFilaSerial();
    const eventos: string[] = [];
    let emAndamento = 0;
    let maximo = 0;
    const tarefa = (nome: string) => async () => {
      emAndamento++;
      maximo = Math.max(maximo, emAndamento);
      eventos.push(`inicio ${nome}`);
      await new Promise((r) => setTimeout(r, 5));
      eventos.push(`fim ${nome}`);
      emAndamento--;
      return nome;
    };
    const resultados = await Promise.all([1, 2, 3].map((n) => enfileirar(tarefa(String(n)))));
    expect(resultados).toEqual(["1", "2", "3"]);
    expect(maximo).toBe(1);
    expect(eventos).toEqual(["inicio 1", "fim 1", "inicio 2", "fim 2", "inicio 3", "fim 3"]);
  });

  it("erro de uma tarefa chega a quem enfileirou e não trava as próximas", async () => {
    const enfileirar = criarFilaSerial();
    const falha = enfileirar(async () => {
      throw new Error("rede");
    });
    const depois = enfileirar(async () => "ok");
    await expect(falha).rejects.toThrow("rede");
    await expect(depois).resolves.toBe("ok");
  });
});

describe("incorporar produtos novos na grade", () => {
  const preparar = (p: { sku: string; nome: string }) => ({ ...p, nome: p.nome + "*" });

  it("acrescenta só o SKU que ainda não estava, sem mexer na edição em andamento", () => {
    const mapa = { A: { sku: "A", nome: "editado" } };
    const resultado = incorporarNovosPorSku(mapa, [{ sku: "A", nome: "original" }, { sku: "B", nome: "novo" }], preparar);
    expect(resultado).toEqual({ A: { sku: "A", nome: "editado" }, B: { sku: "B", nome: "novo*" } });
  });

  it("devolve o mesmo objeto quando não chegou nada novo", () => {
    const mapa = { A: { sku: "A", nome: "x" } };
    expect(incorporarNovosPorSku(mapa, [{ sku: "A", nome: "x" }], preparar)).toBe(mapa);
  });
});
