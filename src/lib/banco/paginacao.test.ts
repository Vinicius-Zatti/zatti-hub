import { describe, expect, it } from "vitest";
import { buscarTudo, buscarTudoEmLotes } from "./paginacao";

// Fonte falsa que imita o PostgREST: devolve a faixa pedida, mas nunca mais
// que `teto` linhas por resposta, sem avisar.
function fonte(total: number, teto = 1000, falharNaChamada?: number) {
  const linhas = Array.from({ length: total }, (_, i) => ({ id: `r${String(i).padStart(5, "0")}` }));
  const chamadas: [number, number][] = [];
  const montar = (de: number, ate: number) => {
    chamadas.push([de, ate]);
    if (chamadas.length === falharNaChamada) return Promise.resolve({ data: null, error: { message: "banco caiu" } });
    return Promise.resolve({ data: linhas.slice(de, Math.min(ate + 1, de + teto)), error: null });
  };
  return { linhas, chamadas, montar };
}

describe("buscarTudo - sem teto de linhas", () => {
  it.each([0, 999, 1000, 1001, 2000])("lê %i linhas inteiras, sem pular nem repetir", async (total) => {
    const { linhas, montar } = fonte(total);
    const lidas = await buscarTudo<{ id: string }>(montar);
    expect(lidas).toEqual(linhas);
  });

  it("para só na página vazia", async () => {
    const { chamadas, montar } = fonte(1001);
    await buscarTudo(montar);
    expect(chamadas).toEqual([
      [0, 999],
      [1000, 1999],
      [1001, 2000],
    ]);
  });

  it("teto do servidor menor que 1000 (500) ainda lê tudo", async () => {
    const { linhas, chamadas, montar } = fonte(1234, 500);
    const lidas = await buscarTudo<{ id: string }>(montar);
    expect(lidas).toEqual(linhas);
    expect(chamadas.map(([de]) => de)).toEqual([0, 500, 1000, 1234]);
  });

  it("erro na segunda página lança erro, nunca devolve parcial", async () => {
    const { montar } = fonte(1500, 1000, 2);
    await expect(buscarTudo(montar)).rejects.toThrow("banco caiu");
  });
});

describe("buscarTudoEmLotes - .in() de ids em lotes, cada lote paginado", () => {
  // Filhos por pai; cada consulta respeita o lote e o teto.
  function filhos(pais: string[], porPai: number, teto = 1000) {
    const todos = pais.flatMap((pai) =>
      Array.from({ length: porPai }, (_, i) => ({ id: `${pai}-${String(i).padStart(5, "0")}`, pai })),
    );
    const lotesPedidos: string[][] = [];
    const montar = (lote: string[], de: number, ate: number) => {
      if (de === 0) lotesPedidos.push(lote);
      const alvo = todos.filter((f) => lote.includes(f.pai));
      return Promise.resolve({ data: alvo.slice(de, Math.min(ate + 1, de + teto)), error: null });
    };
    return { todos, lotesPedidos, montar };
  }

  it("muitos filhos para poucos ids: 3 pais com 2.500 filhos cada", async () => {
    const { todos, montar } = filhos(["a", "b", "c"], 2500);
    const lidas = await buscarTudoEmLotes<{ id: string }>(["a", "b", "c"], montar);
    expect(lidas).toHaveLength(7500);
    expect(new Set(lidas.map((l) => l.id)).size).toBe(7500);
    expect(lidas).toEqual(todos);
  });

  it("quebra 250 ids em lotes de até 100 e não repete id duplicado", async () => {
    const pais = Array.from({ length: 250 }, (_, i) => `p${i}`);
    const { lotesPedidos, montar } = filhos(pais, 5, 500);
    const lidas = await buscarTudoEmLotes<{ id: string }>([...pais, "p0", "p1"], montar);
    expect(lotesPedidos.map((l) => l.length)).toEqual([100, 100, 50]);
    expect(lidas).toHaveLength(1250);
    expect(new Set(lidas.map((l) => l.id)).size).toBe(1250);
  });

  it("sem ids não consulta nada", async () => {
    const { lotesPedidos, montar } = filhos([], 1);
    expect(await buscarTudoEmLotes([], montar)).toEqual([]);
    expect(lotesPedidos).toEqual([]);
  });

  it("erro em qualquer lote lança erro", async () => {
    const montar = (lote: string[]) =>
      Promise.resolve(
        lote.includes("p150")
          ? { data: null, error: { message: "lote falhou" } }
          : { data: [], error: null },
      );
    const ids = Array.from({ length: 200 }, (_, i) => `p${i}`);
    await expect(buscarTudoEmLotes(ids, montar)).rejects.toThrow("lote falhou");
  });
});
