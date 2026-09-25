import { beforeEach, describe, expect, it, vi } from "vitest";

// Banco em memória só com o que as funções de edição usam (select/insert/
// update/eq/in/gt/maybeSingle/single + embed de fin_parcelas e
// fin_categorias). Serve pra provar que o que a tela manda (ex: Plano de
// Contas trocado pra INSS) é o que chega ao UPDATE - bug 5 de 25/09.
type Linha = Record<string, unknown>;
const tabelas: Record<string, Linha[]> = {};
const updates: { tabela: string; valores: Linha; ids: unknown[] }[] = [];
let sequencia = 0;

function construtor(tabela: string) {
  let operacao: "select" | "insert" | "update" = "select";
  let colunas = "";
  let valores: Linha | Linha[] = {};
  const filtros: ((l: Linha) => boolean)[] = [];
  let unico: "maybe" | "single" | null = null;
  let selecionarDepois = false;

  const linhas = () => (tabelas[tabela] ??= []);
  const comEmbed = (l: Linha): Linha => {
    const r: Linha = { ...l };
    if (colunas.includes("fin_parcelas(")) r.fin_parcelas = (tabelas.fin_parcelas ?? []).filter((p) => p.lancamento_id === l.id);
    if (colunas.includes("fin_categorias(")) r.fin_categorias = { nome: (tabelas.fin_categorias ?? []).find((c) => c.id === l.categoria_id)?.nome ?? "" };
    return r;
  };
  function executar() {
    if (operacao === "insert") {
      const novas = (Array.isArray(valores) ? valores : [valores]).map((v) => ({ id: `novo_${++sequencia}`, status: "aberto", ...v }));
      linhas().push(...novas);
      return { data: selecionarDepois ? (unico ? novas[0] : novas) : null, error: null };
    }
    const alvo = linhas().filter((l) => filtros.every((f) => f(l)));
    if (operacao === "update") {
      for (const l of alvo) Object.assign(l, valores);
      updates.push({ tabela, valores: valores as Linha, ids: alvo.map((l) => l.id) });
      return { data: null, error: null };
    }
    const dados = alvo.map(comEmbed);
    return { data: unico ? (dados[0] ?? null) : dados, error: null };
  }
  const b = {
    select(c = "") {
      if (operacao === "select") colunas = c;
      else selecionarDepois = true;
      return b;
    },
    insert(v: Linha | Linha[]) {
      operacao = "insert";
      valores = v;
      return b;
    },
    update(v: Linha) {
      operacao = "update";
      valores = v;
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
    gt(campo: string, valor: string) {
      filtros.push((l) => String(l[campo]) > valor);
      return b;
    },
    order() {
      return b;
    },
    maybeSingle() {
      unico = "maybe";
      return Promise.resolve(executar());
    },
    single() {
      unico = "single";
      return Promise.resolve(executar());
    },
    then(resolver: (v: unknown) => void) {
      return Promise.resolve(executar()).then(resolver);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (t: string) => construtor(t) }) }));

const { editarLancamento, editarRecorrencia } = await import("./financeiro-gerencial");

const U = "adega-alemao";
function carregarBase() {
  for (const k of Object.keys(tabelas)) delete tabelas[k];
  updates.length = 0;
  tabelas.fin_categorias = [
    { id: "folha", unidade_id: U, nivel: "conta", papel_dre: "cmo", arquivado: false, nome: "Folha salarial contábil" },
    { id: "inss", unidade_id: U, nivel: "conta", papel_dre: "cmo", arquivado: false, nome: "INSS folha" },
  ];
  tabelas.fin_recorrencias = [
    { id: "rec", unidade_id: U, tipo: "despesa", categoria_id: "folha", descricao: "Encargos", valor: 316, dia_vencimento: 20, data_inicio: "2026-10-20", data_fim: null, quantidade_ocorrencias: 3, ativa: true, criado_em: "" },
  ];
  tabelas.fin_lancamentos = ["2026-10-20", "2026-11-20", "2026-12-20"].map((competencia, i) => ({
    id: `l${i}`,
    unidade_id: U,
    tipo: "despesa",
    origem: "recorrencia",
    recorrencia_id: "rec",
    categoria_id: "folha",
    descricao: "Encargos",
    data_competencia: competencia,
    conta_financeira_id: null,
    observacao: "",
    criado_por: "u1",
  }));
  tabelas.fin_parcelas = ["2026-10-20", "2026-11-20", "2026-12-20"].map((data, i) => ({
    id: `p${i}`,
    unidade_id: U,
    lancamento_id: `l${i}`,
    numero: 1,
    total_parcelas: 1,
    valor: 316,
    data_prevista: data,
    conta_financeira_id: null,
    status: i === 0 ? "quitado" : "aberto",
  }));
  tabelas.fin_baixas = [{ id: "b0", unidade_id: U, parcela_id: "p0", tipo: "baixa", valor: 316, data: "2026-09-25" }];
}

describe("edição de lançamento recorrente chega ao banco (bug 5, 25/09)", () => {
  beforeEach(carregarBase);

  it("Editar apenas este: o Plano de Contas escolhido (INSS) é o que vai no UPDATE, junto com competência e data de pagamento", async () => {
    await editarLancamento({
      unidadeId: U,
      id: "l1",
      categoriaId: "inss",
      descricao: "Encargos",
      dataCompetencia: "2026-10-01",
      contaFinanceiraId: null,
      observacao: "",
      parcelas: [{ id: "p1", valor: 316, dataPrevista: "2026-10-20", contaFinanceiraId: null }],
    });
    const lancamento = tabelas.fin_lancamentos.find((l) => l.id === "l1")!;
    expect(lancamento.categoria_id).toBe("inss");
    expect(lancamento.data_competencia).toBe("2026-10-01");
    // As outras ocorrências não mudam.
    expect(tabelas.fin_lancamentos.find((l) => l.id === "l2")!.categoria_id).toBe("folha");
  });

  it("Editar pagamento recorrente: troca o Plano de Contas e as datas em todas as ocorrências sem baixa e no modelo, nunca na paga", async () => {
    const plano = await editarRecorrencia({
      unidadeId: U,
      recorrenciaId: "rec",
      criadoPor: "u1",
      modelo: {
        categoriaId: "inss",
        descricao: "Encargos",
        contaFinanceiraId: null,
        valor: 320,
        dataCompetencia: "2026-09-01",
        dataPrimeiroVencimento: "2026-09-20",
        fim: { modo: "quantidade", quantidadeOcorrencias: 4 },
      },
    });
    const porId = (id: string) => tabelas.fin_lancamentos.find((l) => l.id === id)!;
    // Paga: intacta, e avisada como conflito.
    expect(porId("l0").categoria_id).toBe("folha");
    expect(plano.conflitos.map((c) => c.lancamentoId)).toEqual(["l0"]);
    // Sem baixa: nova regra (posições 2 e 3 do calendário novo).
    expect(porId("l1")).toMatchObject({ categoria_id: "inss", data_competencia: "2026-10-01" });
    expect(porId("l2")).toMatchObject({ categoria_id: "inss", data_competencia: "2026-11-01" });
    expect(tabelas.fin_parcelas.find((p) => p.id === "p1")).toMatchObject({ valor: 320, data_prevista: "2026-10-20" });
    // Quantidade 3 -> 4: cria a que falta.
    const criada = tabelas.fin_lancamentos.find((l) => String(l.id).startsWith("novo_"))!;
    expect(criada).toMatchObject({ categoria_id: "inss", data_competencia: "2026-12-01", origem: "recorrencia", recorrencia_id: "rec" });
    expect(tabelas.fin_recorrencias[0]).toMatchObject({ categoria_id: "inss", valor: 320, dia_vencimento: 20, quantidade_ocorrencias: 4 });
  });

  it("Editar pagamento recorrente com menos parcelas: a que sobra sem baixa é cancelada (lógico), nunca apagada", async () => {
    const plano = await editarRecorrencia({
      unidadeId: U,
      recorrenciaId: "rec",
      criadoPor: "u1",
      modelo: {
        categoriaId: "folha",
        descricao: "Encargos",
        contaFinanceiraId: null,
        valor: 316,
        dataCompetencia: "2026-10-20",
        dataPrimeiroVencimento: "2026-10-20",
        fim: { modo: "quantidade", quantidadeOcorrencias: 2 },
      },
    });
    expect(plano.cancelar.map((c) => c.lancamentoId)).toEqual(["l2"]);
    expect(tabelas.fin_parcelas.find((p) => p.id === "p2")!.status).toBe("cancelado");
    expect(tabelas.fin_lancamentos).toHaveLength(3);
    expect(plano.conflitos).toEqual([]); // a paga bate com a regra, sem aviso
  });
});
