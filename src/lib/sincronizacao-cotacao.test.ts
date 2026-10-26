import { describe, expect, it, vi } from "vitest";
import { criarSincronizadorCotacao } from "./sincronizacao-cotacao";

// Parecer do Codex (24/10/2026, ponto 2): a pendência da sincronização da
// cotação não pode desistir depois de 3 tentativas nem sumir quando o editor
// desmonta, e precisa retomar quando a conexão ou a aba voltam.

function montar(opcoes: { falhas?: number; online?: boolean } = {}) {
  vi.useFakeTimers();
  let falhasRestantes = opcoes.falhas ?? 0;
  const rede = { online: opcoes.online ?? true };
  const sincronizar = vi.fn(async () => {
    if (falhasRestantes > 0) {
      falhasRestantes -= 1;
      throw new Error("sem conexão");
    }
  });
  const s = criarSincronizadorCotacao({
    sincronizar,
    agendar: (fn, ms) => setTimeout(fn, ms),
    cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    online: () => rede.online,
    esperaMs: 2500,
    esperaFalhaMs: 5000,
    esperaFalhaMaxMs: 60000,
  });
  return { s, sincronizar, rede };
}

describe("sincronização da cotação", () => {
  it("junta vários cliques numa sincronização só, depois da pausa", async () => {
    const { s, sincronizar } = montar();
    s.marcarPendente();
    s.marcarPendente();
    s.marcarPendente();
    await vi.advanceTimersByTimeAsync(2499);
    expect(sincronizar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(sincronizar).toHaveBeenCalledTimes(1);
    expect(s.temPendencia()).toBe(false);
    vi.useRealTimers();
  });

  it("não desiste depois de 3 falhas: tenta de novo até dar certo", async () => {
    const { s, sincronizar } = montar({ falhas: 6 });
    s.marcarPendente();
    await vi.advanceTimersByTimeAsync(2500);
    // esperas 5s, 10s, 20s, 40s, 60s (teto), 60s
    for (const espera of [5000, 10000, 20000, 40000, 60000, 60000]) {
      expect(s.temPendencia()).toBe(true);
      await vi.advanceTimersByTimeAsync(espera);
    }
    expect(sincronizar).toHaveBeenCalledTimes(7);
    expect(s.temPendencia()).toBe(false);
    vi.useRealTimers();
  });

  it("a pendência sobrevive a quem marcou: sair da tela não zera nada", async () => {
    // O editor que marcou não existe mais; o mesmo objeto segue tentando.
    const { s, sincronizar } = montar({ falhas: 1 });
    s.marcarPendente();
    await s.sincronizarAgora(); // saída da tela: falha
    expect(s.temPendencia()).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sincronizar).toHaveBeenCalledTimes(2);
    expect(s.temPendencia()).toBe(false);
    vi.useRealTimers();
  });

  it("sem rede espera a conexão voltar e retoma na hora", async () => {
    const { s, sincronizar, rede } = montar({ falhas: 1 });
    s.marcarPendente();
    rede.online = false;
    await vi.advanceTimersByTimeAsync(2500); // falha sem rede
    await vi.advanceTimersByTimeAsync(10 * 60000);
    expect(sincronizar).toHaveBeenCalledTimes(1); // não fica martelando sem rede
    s.retomar(); // ainda offline: nada
    expect(sincronizar).toHaveBeenCalledTimes(1);
    rede.online = true;
    s.retomar(); // evento online
    await vi.advanceTimersByTimeAsync(0);
    expect(sincronizar).toHaveBeenCalledTimes(2);
    expect(s.temPendencia()).toBe(false);
    vi.useRealTimers();
  });

  it("aba que volta retoma sem esperar a espera crescente", async () => {
    const { s, sincronizar } = montar({ falhas: 3 });
    s.marcarPendente();
    await vi.advanceTimersByTimeAsync(2500); // falha 1, próxima em 5s
    await vi.advanceTimersByTimeAsync(5000); // falha 2, próxima em 10s
    await vi.advanceTimersByTimeAsync(10000); // falha 3, próxima em 20s
    s.retomar(); // visibilidade voltou
    await vi.advanceTimersByTimeAsync(0);
    expect(sincronizar).toHaveBeenCalledTimes(4);
    expect(s.temPendencia()).toBe(false);
    vi.useRealTimers();
  });

  it("confirmação feita durante a requisição continua pendente", async () => {
    vi.useFakeTimers();
    let liberar: () => void = () => {};
    const sincronizar = vi.fn(
      () =>
        new Promise<void>((ok) => {
          liberar = ok;
        })
    );
    const s = criarSincronizadorCotacao({
      sincronizar,
      agendar: (fn, ms) => setTimeout(fn, ms),
      cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
      online: () => true,
    });
    s.marcarPendente();
    const primeira = s.sincronizarAgora();
    await vi.advanceTimersByTimeAsync(0);
    s.marcarPendente(); // chegou no meio
    liberar();
    await primeira;
    expect(s.temPendencia()).toBe(true);
    await vi.advanceTimersByTimeAsync(2500);
    liberar();
    await vi.advanceTimersByTimeAsync(0);
    expect(sincronizar).toHaveBeenCalledTimes(2);
    expect(s.temPendencia()).toBe(false);
    vi.useRealTimers();
  });

  it("chamadas juntas não abrem duas requisições", async () => {
    const { s, sincronizar } = montar();
    s.marcarPendente();
    await Promise.all([s.sincronizarAgora(), s.sincronizarAgora(), s.sincronizarAgora()]);
    expect(sincronizar).toHaveBeenCalledTimes(1);
    s.retomar(); // nada pendente
    await vi.advanceTimersByTimeAsync(60000);
    expect(sincronizar).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
