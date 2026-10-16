import { describe, expect, it } from "vitest";
import { abaAtiva } from "@/components/escritorio/abas-escritorio";
import {
  SEM_CLIENTE,
  agruparPorColuna,
  agruparTarefasPorEstado,
  dataHoraBr,
  dataIsoBrasil,
  diaBr,
  diasParado,
  filtrarItens,
  filtrarTarefas,
  indicadoresQuadro,
  indicadoresTarefas,
  opcoesCliente,
  prazoComoData,
  rotuloSelo,
  tarefaVencida,
  textoDiasParado,
} from "@/lib/operacao/quadro";
import type { ItemOperacao, TarefaCliente } from "@/lib/operacao/tipos";

const ms = (iso: string) => Date.parse(iso);

function item(parcial: Partial<ItemOperacao>): ItemOperacao {
  return {
    chave: "demanda:TH-001",
    tipo: "demanda",
    subtipo: null,
    codigo: "TH-001",
    cliente: "The House",
    sigla: "TH",
    titulo: "Pedido",
    resumo: "",
    coluna: "nova",
    colunaManual: false,
    criadoEm: null,
    desdeEm: null,
    encerradoEm: null,
    nota: "",
    acoes: [],
    detalhe: { tipo: "acao", texto: "" },
    ...parcial,
  };
}

function tarefa(parcial: Partial<TarefaCliente>): TarefaCliente {
  return {
    id: "ATA-012#1",
    ataCodigo: "ATA-012",
    cliente: "The House",
    sigla: "TH",
    responsavel: "Ana",
    lado: "cliente",
    tarefa: "Mandar extrato",
    prazo: "",
    estado: "a_fazer",
    atualizadoEm: null,
    reuniaoEm: "2026-10-10",
    ...parcial,
  };
}

describe("datas no fuso de Brasília", () => {
  it("23h de Brasília continua no mesmo dia (UTC já é o dia seguinte)", () => {
    expect(dataIsoBrasil(ms("2026-10-17T02:00:00Z"))).toBe("2026-10-16");
    expect(dataHoraBr(ms("2026-10-17T02:05:00Z"))).toBe("16/10/2026 23:05");
    expect(dataHoraBr(null)).toBe("");
    expect(diaBr("2026-10-05")).toBe("05/10/2026");
  });

  it("dias parado conta dias de calendário em Brasília", () => {
    expect(diasParado(ms("2026-10-13T12:00:00Z"), "2026-10-16")).toBe(3);
    expect(diasParado(ms("2026-10-17T01:00:00Z"), "2026-10-16")).toBe(0);
    expect(diasParado(null, "2026-10-16")).toBeNull();
    expect(textoDiasParado(0)).toBe("Entrou na coluna hoje");
    expect(textoDiasParado(1)).toBe("1 dia parado");
    expect(textoDiasParado(4)).toBe("4 dias parado");
  });
});

describe("quadro", () => {
  const itens = [
    item({ chave: "demanda:TH-001", coluna: "esperando_voce", desdeEm: ms("2026-10-15T12:00:00Z") }),
    item({ chave: "demanda:TH-002", coluna: "esperando_voce", desdeEm: ms("2026-10-10T12:00:00Z") }),
    item({ chave: "ata:ATA-001", tipo: "ata", sigla: "LK", cliente: "Lucaskinhas", coluna: "nova", desdeEm: ms("2026-10-12T12:00:00Z") }),
    item({ chave: "alerta:sdr|1", tipo: "alerta", subtipo: "sdr", sigla: null, cliente: null, coluna: "resolvida", desdeEm: ms("2026-10-01T12:00:00Z") }),
  ];

  it("agrupa nas cinco colunas, o mais antigo parado primeiro", () => {
    const g = agruparPorColuna(itens);
    expect(g.map((x) => x.coluna)).toEqual(["nova", "andamento", "esperando_cliente", "esperando_voce", "resolvida"]);
    expect(g[3].itens.map((i) => i.chave)).toEqual(["demanda:TH-002", "demanda:TH-001"]);
    expect(g[1].itens).toHaveLength(0);
  });

  it("filtra por tipo e por cliente, inclusive sem cliente", () => {
    expect(filtrarItens(itens, { tipo: "ata", cliente: "" })).toHaveLength(1);
    expect(filtrarItens(itens, { tipo: "", cliente: "TH" })).toHaveLength(2);
    expect(filtrarItens(itens, { tipo: "", cliente: SEM_CLIENTE }).map((i) => i.chave)).toEqual(["alerta:sdr|1"]);
    expect(opcoesCliente(itens)).toEqual([
      { valor: "LK", rotulo: "LK - Lucaskinhas" },
      { valor: "TH", rotulo: "TH - The House" },
      { valor: SEM_CLIENTE, rotulo: "Sem cliente" },
    ]);
  });

  it("indicadores ignoram Resolvida", () => {
    expect(indicadoresQuadro(itens, "2026-10-16")).toEqual({ abertos: 3, esperandoVoce: 2, paradas: 2 });
  });

  it("selo mostra o subtipo do alerta", () => {
    expect(rotuloSelo({ tipo: "alerta", subtipo: "orcamento" })).toBe("Alerta: orcamento");
    expect(rotuloSelo({ tipo: "acao", subtipo: null })).toBe("Ação");
  });
});

describe("prazo das tarefas", () => {
  it("reconhece dd/mm, dd/mm/aa, dd/mm/aaaa e ISO", () => {
    expect(prazoComoData("20/10", "2026-10-10")).toBe("2026-10-20");
    expect(prazoComoData("até 5/11", "2026-10-10")).toBe("2026-11-05");
    expect(prazoComoData("20/10/26", "2026-10-10")).toBe("2026-10-20");
    expect(prazoComoData("20/10/2027", "2026-10-10")).toBe("2027-10-20");
    expect(prazoComoData("2026-10-20", "2026-10-10")).toBe("2026-10-20");
  });

  it("sem ano e antes da reunião vira o ano seguinte", () => {
    expect(prazoComoData("05/01", "2026-12-15")).toBe("2027-01-05");
  });

  it("texto livre e data impossível não viram data", () => {
    expect(prazoComoData("semana que vem", "2026-10-10")).toBeNull();
    expect(prazoComoData("20/10 ou depois da reunião", "2026-10-10")).toBeNull();
    expect(prazoComoData("31/02", "2026-10-10")).toBeNull();
    expect(prazoComoData("2026-13-01", "2026-10-10")).toBeNull();
    expect(prazoComoData("", "2026-10-10")).toBeNull();
  });

  it("vencida só com data antes de hoje e fora de Feito", () => {
    expect(tarefaVencida(tarefa({ prazo: "15/10" }), "2026-10-16")).toBe(true);
    expect(tarefaVencida(tarefa({ prazo: "16/10" }), "2026-10-16")).toBe(false);
    expect(tarefaVencida(tarefa({ prazo: "15/10", estado: "feito" }), "2026-10-16")).toBe(false);
    expect(tarefaVencida(tarefa({ prazo: "o quanto antes" }), "2026-10-16")).toBe(false);
    expect(tarefaVencida(tarefa({ prazo: "15/10", reuniaoEm: null }), "2026-10-16")).toBe(true);
  });

  it("filtra por lado e cliente, agrupa por estado e conta vencidas", () => {
    const lista = [
      tarefa({ id: "ATA-1#1", lado: "cliente", prazo: "01/10" }),
      tarefa({ id: "ATA-1#2", lado: "zatti", estado: "fazendo" }),
      tarefa({ id: "ATA-2#1", lado: "zatti", sigla: "LK", estado: "feito", prazo: "01/10" }),
    ];
    expect(filtrarTarefas(lista, { cliente: "", lado: "zatti" })).toHaveLength(2);
    expect(filtrarTarefas(lista, { cliente: "LK", lado: "" }).map((t) => t.id)).toEqual(["ATA-2#1"]);
    expect(agruparTarefasPorEstado(lista).map((g) => g.tarefas.length)).toEqual([1, 1, 1]);
    expect(indicadoresTarefas(lista, "2026-10-16")).toEqual({ abertas: 2, vencidas: 1 });
  });
});

describe("menu", () => {
  it("aba Operação fica ativa nas suas páginas", () => {
    expect(abaAtiva("/escritorio/operacao")).toBe("/escritorio/operacao");
    expect(abaAtiva("/escritorio")).toBe("/escritorio");
  });
});
