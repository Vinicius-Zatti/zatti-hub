import { describe, expect, it } from "vitest";
import { comLimite, criarPrazo, RESERVA_PERSISTENCIA_MS } from "./prazo";

describe("prazo global da leitura", () => {
  it("desconta a reserva para gravar o resultado", () => {
    let agora = 1_000;
    const prazo = criarPrazo(95_000, () => agora);
    expect(prazo.restante()).toBe(95_000 - RESERVA_PERSISTENCIA_MS);
    agora += 90_000;
    expect(prazo.restante()).toBe(0);
  });

  it("tarefa lenta é interrompida pelo limite, rápida passa", async () => {
    const lenta = new Promise<string>((resolve) => setTimeout(() => resolve("tarde"), 500));
    expect(await comLimite(lenta, 20)).toBeNull();
    expect(await comLimite(Promise.resolve("ok"), 20)).toBe("ok");
  });

  it("sinal abortado corta na hora, sem esperar o limite", async () => {
    const controle = new AbortController();
    const nunca = new Promise<string>(() => undefined);
    const corrida = comLimite(nunca, 60_000, controle.signal);
    controle.abort();
    expect(await corrida).toBeNull();
    expect(await comLimite(Promise.resolve("x"), 1_000, controle.signal)).toBeNull();
  });
});
