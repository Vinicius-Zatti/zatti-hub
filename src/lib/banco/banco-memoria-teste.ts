// Banco em memória para testes que imita o PostgREST: toda resposta é cortada
// em `maxRows` linhas, sem erro (como `max_rows` em `supabase/config.toml`).
// Só o que as leituras paginadas usam: select/eq/in/not is null/gte/lte/
// order/range, mais os embeds do Financeiro Gerencial. Só para testes.

export type Linha = Record<string, unknown>;

export type BancoMemoria = {
  tabelas: Record<string, Linha[]>;
  /** Faixas pedidas por tabela, na ordem em que chegaram. */
  ranges: Record<string, [number, number][]>;
  maxRows: number;
  /** Faz a N-ésima leitura (1 = primeira) da tabela devolver erro. */
  falharNaLeitura: Record<string, number>;
  cliente: { from: (tabela: string) => unknown };
  limpar: () => void;
};

export function criarBancoMemoria(maxRows = 1000): BancoMemoria {
  const leituras: Record<string, number> = {};
  const banco: BancoMemoria = {
    tabelas: {},
    ranges: {},
    maxRows,
    falharNaLeitura: {},
    cliente: { from: (tabela: string) => construtor(tabela) },
    limpar() {
      for (const k of Object.keys(banco.tabelas)) delete banco.tabelas[k];
      for (const k of Object.keys(banco.ranges)) delete banco.ranges[k];
      for (const k of Object.keys(banco.falharNaLeitura)) delete banco.falharNaLeitura[k];
      for (const k of Object.keys(leituras)) delete leituras[k];
      banco.maxRows = maxRows;
    },
  };
  function comEmbed(tabela: string, colunas: string, l: Linha): Linha {
    const r: Linha = { ...l };
    const lancamento = (id: unknown) => (banco.tabelas.fin_lancamentos ?? []).find((x) => x.id === id);
    if (tabela === "fin_baixas" && colunas.includes("fin_parcelas!inner(")) {
      const parcela = (banco.tabelas.fin_parcelas ?? []).find((p) => p.id === l.parcela_id);
      r.fin_parcelas = { fin_lancamentos: { tipo: lancamento(parcela?.lancamento_id)?.tipo } };
    }
    if (tabela === "fin_parcelas" && colunas.includes("fin_lancamentos!inner(")) {
      r.fin_lancamentos = { tipo: lancamento(l.lancamento_id)?.tipo };
    }
    if (colunas.includes("fin_categorias(")) {
      r.fin_categorias = { nome: (banco.tabelas.fin_categorias ?? []).find((c) => c.id === l.categoria_id)?.nome ?? "" };
    }
    return r;
  }

  function construtor(tabela: string) {
    let colunas = "";
    const filtros: ((l: Linha) => boolean)[] = [];
    const ordens: { campo: string; asc: boolean }[] = [];
    let faixa: [number, number] | null = null;

    function executar() {
      leituras[tabela] = (leituras[tabela] ?? 0) + 1;
      if (banco.falharNaLeitura[tabela] === leituras[tabela]) {
        return { data: null, error: { message: `falha simulada em ${tabela}` } };
      }
      const alvo = (banco.tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
      alvo.sort((a, b) => {
        for (const { campo, asc } of ordens) {
          const x = a[campo] as string | number;
          const y = b[campo] as string | number;
          if (x < y) return asc ? -1 : 1;
          if (x > y) return asc ? 1 : -1;
        }
        return 0;
      });
      const [de, ate] = faixa ?? [0, alvo.length - 1];
      const fatia = alvo.slice(de, Math.min(ate + 1, de + banco.maxRows));
      return { data: fatia.map((l) => comEmbed(tabela, colunas, l)), error: null };
    }

    const b = {
      select(c = "") {
        colunas = c;
        return b;
      },
      eq(campo: string, valor: unknown) {
        filtros.push((l) => l[campo] === valor);
        return b;
      },
      in(campo: string, lista: unknown[]) {
        filtros.push((l) => lista.includes(l[campo]));
        return b;
      },
      not(campo: string, operador: string, valor: unknown) {
        if (operador !== "is" || valor !== null) throw new Error("not() não suportado no teste");
        filtros.push((l) => l[campo] !== null && l[campo] !== undefined);
        return b;
      },
      gte(campo: string, valor: string) {
        filtros.push((l) => String(l[campo]) >= valor);
        return b;
      },
      lte(campo: string, valor: string) {
        filtros.push((l) => String(l[campo]) <= valor);
        return b;
      },
      order(campo: string, opcoes?: { ascending?: boolean }) {
        ordens.push({ campo, asc: opcoes?.ascending !== false });
        return b;
      },
      range(de: number, ate: number) {
        faixa = [de, ate];
        (banco.ranges[tabela] ??= []).push([de, ate]);
        return b;
      },
      then<R>(ok: (v: ReturnType<typeof executar>) => R) {
        return Promise.resolve(executar()).then(ok);
      },
    };
    return b;
  }

  return banco;
}
