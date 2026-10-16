import { describe, expect, it } from "vitest";
import { ErroPublico } from "@/lib/erros";
import {
  acaoOperacaoSchema,
  lerRespostaOperacao,
  paraDiaIso,
  paraMs,
  tarefaOperacaoSchema,
  validarEntradaOperacao,
} from "@/lib/operacao/validacao";

const valida = (e: unknown) => acaoOperacaoSchema.safeParse(e).success;

describe("entrada das actions", () => {
  it("aceita as ações do contrato", () => {
    expect(valida({ chave: "demanda:TH-004", acao: "aprovar" })).toBe(true);
    expect(valida({ chave: "ata:ATA-012", acao: "coluna", coluna: "andamento" })).toBe(true);
    expect(valida({ chave: "alerta:orcamento|xyz", acao: "resolver" })).toBe(true);
    expect(valida({ chave: "demanda:TH-004", acao: "enviar_texto", texto: "Oi, tudo certo." })).toBe(true);
    expect(valida({ chave: "demanda:TH-004", acao: "nota", texto: "" })).toBe(true);
  });

  it("recusa entrada fora do contrato", () => {
    expect(valida({ chave: "TH-004", acao: "aprovar" })).toBe(false);
    expect(valida({ chave: "demanda:TH-004", acao: "apagar" })).toBe(false);
    expect(valida({ chave: "demanda:TH-004", acao: "coluna" })).toBe(false);
    expect(valida({ chave: "demanda:TH-004", acao: "coluna", coluna: "lixo" })).toBe(false);
    expect(valida({ chave: "demanda:TH-004", acao: "aprovar", coluna: "nova" })).toBe(false);
    expect(valida({ chave: "demanda:TH-004", acao: "enviar_texto", texto: "   " })).toBe(false);
    expect(valida({ chave: "demanda:TH-004", acao: "nota" })).toBe(false);
    expect(valida({ chave: "demanda:TH-004", acao: "nota", texto: "x".repeat(1001) })).toBe(false);
    expect(valida({ chave: "demanda:TH-004", acao: "aprovar", extra: 1 })).toBe(false);
    expect(valida({ chave: "demanda:TH\n-004", acao: "aprovar" })).toBe(false);
  });

  it("tarefa exige id da ata e estado válido", () => {
    expect(tarefaOperacaoSchema.safeParse({ id: "ATA-012#3", estado: "fazendo" }).success).toBe(true);
    expect(tarefaOperacaoSchema.safeParse({ id: "ATA-012", estado: "fazendo" }).success).toBe(false);
    expect(tarefaOperacaoSchema.safeParse({ id: "ATA-012#3", estado: "pronto" }).success).toBe(false);
  });

  it("erro de validação é público e não revela o schema", () => {
    expect(() => validarEntradaOperacao(tarefaOperacaoSchema, { id: "x", estado: "feito" })).toThrow(ErroPublico);
    expect(() => validarEntradaOperacao(tarefaOperacaoSchema, { id: "x", estado: "feito" })).toThrow("Campo inválido: id");
  });
});

describe("leitura do Vini", () => {
  it("converte datas sem puxar o dia no fuso", () => {
    expect(paraMs(1760620800000)).toBe(1760620800000);
    expect(paraMs("1760620800000")).toBe(1760620800000);
    expect(paraMs("2026-10-16T12:00:00Z")).toBe(Date.parse("2026-10-16T12:00:00Z"));
    expect(paraMs(null)).toBeNull();
    expect(paraMs("ontem")).toBeNull();
    expect(paraDiaIso("2026-10-16")).toBe("2026-10-16");
    expect(paraDiaIso(Date.parse("2026-10-17T02:00:00Z"))).toBe("2026-10-16");
  });

  it("lê o contrato e deixa de fora só o registro malformado", () => {
    const r = lerRespostaOperacao({
      geradoEm: 1760620800000,
      itens: [
        {
          chave: "demanda:TH-004",
          tipo: "demanda",
          codigo: "TH-004",
          cliente: "The House",
          sigla: "TH",
          titulo: "Troca de fornecedor",
          resumo: "Pediu ajuda",
          coluna: "esperando_voce",
          colunaManual: false,
          criadoEm: 1760620800000,
          desdeEm: 1760620800000,
          encerradoEm: null,
          nota: "",
          acoes: ["aprovar", "enviar_texto", "inventada"],
          detalhe: {
            autor: "Ana",
            canalNome: "TH Gestão",
            area: "compras",
            mensagens: [{ autor: "Ana", texto: "Oi", em: 1760620800000, equipe: false }],
            resposta: { texto: "Olá Ana", situacao: "pronta", vez: 1, motivo: null },
          },
        },
        { chave: "ata:ATA-012", tipo: "ata", coluna: "nova", detalhe: { reuniaoEm: "2026-10-15", tarefas: [{ tarefa: "x", lado: "zatti" }] } },
        { chave: "sem-tipo", tipo: "demanda", coluna: "nova" },
        { chave: "pauta:PAUTA-1", tipo: "pauta", coluna: "coluna-que-nao-existe" },
      ],
      tarefas: [{ id: "ATA-012#1", estado: "fazendo", lado: "zatti", tarefa: "x" }, { estado: "feito" }],
    });
    expect(r).not.toBeNull();
    expect(r!.itens.map((i) => i.chave)).toEqual(["demanda:TH-004", "ata:ATA-012"]);
    expect(r!.ignorados).toBe(3);
    expect(r!.itens[0].acoes).toEqual(["aprovar", "enviar_texto"]);
    const d = r!.itens[0].detalhe;
    expect(d.tipo === "demanda" && d.resposta?.texto).toBe("Olá Ana");
    const ata = r!.itens[1];
    expect(ata.codigo).toBe("ATA-012");
    expect(ata.detalhe.tipo === "ata" && ata.detalhe.tarefas[0].lado).toBe("zatti");
    expect(r!.tarefas[0]).toMatchObject({ id: "ATA-012#1", estado: "fazendo", lado: "zatti" });
  });

  it("envelope errado vira null", () => {
    expect(lerRespostaOperacao(null)).toBeNull();
    expect(lerRespostaOperacao({ itens: [] })).toBeNull();
    expect(lerRespostaOperacao("oi")).toBeNull();
  });
});
