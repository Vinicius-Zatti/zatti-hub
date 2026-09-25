import { describe, expect, it } from "vitest";
import { editarLancamentoFinanceiroEntradaSchema, editarRecorrenciaEntradaSchema } from "@/lib/validacao";
import { entradaEditarLancamento, entradaEditarRecorrencia, estadoInicialEdicaoLancamento, estadoInicialEdicaoRecorrencia } from "./formularios-lancamento";
import type { OcorrenciaRecorrencia } from "./recorrencia";
import type { Lancamento, Recorrencia } from "./tipos";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const LANCAMENTO: Lancamento = {
  id: ID(1),
  tipo: "despesa",
  categoriaId: ID(10),
  categoriaNome: "Folha salarial contábil",
  descricao: "Encargos",
  dataCompetencia: "2026-10-20",
  contaFinanceiraId: null,
  observacao: "",
  origem: "recorrencia",
  recorrenciaId: ID(99),
  criadoPorNome: "Vinícius",
  criadoEm: "2026-09-25T14:00:00Z",
  parcelas: [{ id: ID(2), lancamentoId: ID(1), numero: 1, totalParcelas: 1, valor: 316, dataPrevista: "2026-10-20", contaFinanceiraId: null, status: "aberto", valorBaixado: 0 }],
};

describe("payload dos formulários de edição (bug 5, 25/09)", () => {
  it("Editar apenas este: a categoria trocada na tela sai no payload e passa pela validação do servidor", () => {
    const estado = { ...estadoInicialEdicaoLancamento(LANCAMENTO), categoriaId: ID(11), dataCompetencia: "2026-09-20" };
    estado.parcelas[0].dataPrevista = "2026-09-20";
    const entrada = editarLancamentoFinanceiroEntradaSchema.parse(entradaEditarLancamento(LANCAMENTO.id, estado));
    expect(entrada.categoriaId).toBe(ID(11));
    expect(entrada.dataCompetencia).toBe("2026-09-20");
    expect(entrada.parcelas[0].dataPrevista).toBe("2026-09-20");
  });

  it("Editar pagamento recorrente: nasce preenchido com o que existe e a categoria trocada chega validada", () => {
    const recorrencia: Recorrencia = {
      id: ID(99),
      tipo: "despesa",
      categoriaId: ID(10),
      categoriaNome: "Folha salarial contábil",
      descricao: "Encargos",
      valor: 316,
      diaVencimento: 20,
      dataInicio: "2026-10-20",
      dataFim: null,
      quantidadeOcorrencias: 12,
      ativa: true,
      criadoEm: "",
    };
    const ocorrencias: OcorrenciaRecorrencia[] = [
      { lancamentoId: ID(1), parcelaId: ID(2), competencia: "2026-10-20", dataPrevista: "2026-10-20", valor: 316, categoriaId: ID(10), descricao: "Encargos", contaFinanceiraId: ID(50), status: "quitado", valorBaixado: 316 },
      { lancamentoId: ID(3), parcelaId: ID(4), competencia: "2026-11-20", dataPrevista: "2026-11-20", valor: 316, categoriaId: ID(10), descricao: "Encargos", contaFinanceiraId: ID(51), status: "aberto", valorBaixado: 0 },
    ];
    const estado = estadoInicialEdicaoRecorrencia(recorrencia, ocorrencias);
    expect(estado).toMatchObject({ categoriaId: ID(10), valor: 316, dataCompetencia: "2026-10-20", dataPrimeiroVencimento: "2026-10-20", modoFim: "quantidade", quantidadeOcorrencias: 12, contaFinanceiraId: ID(51) });

    const entrada = editarRecorrenciaEntradaSchema.parse(entradaEditarRecorrencia(recorrencia.id, { ...estado, categoriaId: ID(11) }));
    expect(entrada.categoriaId).toBe(ID(11));
    expect(entrada.fim).toEqual({ modo: "quantidade", quantidadeOcorrencias: 12 });
  });
});
