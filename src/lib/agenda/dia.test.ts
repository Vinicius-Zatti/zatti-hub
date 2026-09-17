import { describe, expect, it } from "vitest";
import { blocosDisponiveis, montarDia } from "@/lib/agenda/dia";
import type { RotinaAgenda, TarefaAgenda } from "@/lib/agenda/tipos";

function rotina(id: string, rotulo: string, tipo: RotinaAgenda["tipo"], ordem: number): RotinaAgenda {
  return {
    id,
    diaSemana: 2,
    chave: `ter-${id}`,
    ordem,
    horaInicio: "10:00",
    horaFim: "11:00",
    horarioTexto: "10h-11h",
    rotulo,
    tipo,
  };
}

function tarefa(id: string, titulo: string, prioridade: boolean, rotinaId: string | null): TarefaAgenda {
  return {
    id,
    data: "2026-09-15",
    titulo,
    detalhe: "",
    prioridade,
    prioridadePosicao: prioridade ? 1 : null,
    ordem: 0,
    situacao: "pendente",
    rotinaId,
  };
}

const ROTINAS = [
  rotina("r1", "Horizzon (fixo)", "bloco", 0),
  rotina("r2", "Relatórios Verato + entregas", "rotina", 1),
  rotina("r3", "Almoço família", "pessoal", 2),
  rotina("r4", "Reunião LK — FIXO", "compromisso", 3),
  rotina("r5", "Protegido", "bloco", 4),
];

describe("montarDia", () => {
  it("separa prioridade de tarefa solta e liga a tarefa ao bloco", () => {
    const dia = montarDia({
      rotinas: ROTINAS,
      tarefas: [tarefa("t1", "Contrato This Burguer", true, "r1"), tarefa("t2", "Responder e-mail", false, null)],
      execucoes: [],
      compromissos: [],
    });

    expect(dia.prioridades.map((t) => t.titulo)).toEqual(["Contrato This Burguer"]);
    expect(dia.tarefasSoltas.map((t) => t.titulo)).toEqual(["Responder e-mail"]);
    expect(dia.linhaDoDia.find((b) => b.rotina.id === "r1")?.tarefas).toHaveLength(1);
  });

  it("avisa quando a prioridade não tem bloco de execução", () => {
    const dia = montarDia({
      rotinas: ROTINAS,
      tarefas: [tarefa("t1", "Divergência LK", true, null)],
      execucoes: [],
      compromissos: [],
    });

    expect(dia.alertas).toEqual(['"Divergência LK" é prioridade do dia e ainda não tem bloco de execução.']);
  });

  it("avisa quando a tarefa caiu em faixa que não é de trabalho", () => {
    const dia = montarDia({
      rotinas: ROTINAS,
      tarefas: [tarefa("t1", "Revisar planilha", true, "r3")],
      execucoes: [],
      compromissos: [],
    });

    expect(dia.alertas).toContain('"Revisar planilha" está marcada em Almoço família, que não é horário de trabalho.');
  });

  it("avisa quando a tarefa ficou num bloco que saiu da agenda semanal", () => {
    // `r9` não está entre as faixas ativas do dia: foi retirada da grade. A
    // tarefa continua existindo e aparece, mas pede outro bloco.
    const dia = montarDia({
      rotinas: ROTINAS,
      tarefas: [tarefa("t1", "Proposta Adega", true, "r9"), tarefa("t2", "Ligar contador", false, "r9")],
      execucoes: [],
      compromissos: [],
    });

    expect(dia.prioridades.map((t) => t.titulo)).toEqual(["Proposta Adega"]);
    expect(dia.tarefasSoltas.map((t) => t.titulo)).toEqual(["Ligar contador"]);
    expect(dia.alertas).toEqual([
      '"Proposta Adega" estava num bloco que saiu da agenda semanal. Escolha outro bloco.',
      '"Ligar contador" estava num bloco que saiu da agenda semanal. Escolha outro bloco.',
    ]);
    expect(dia.linhaDoDia.every((b) => b.tarefas.length === 0)).toBe(true);
  });

  it("avisa quando passa do teto de 4 prioridades", () => {
    const cinco = ["a", "b", "c", "d", "e"].map((id) => tarefa(id, id, true, "r1"));
    const dia = montarDia({ rotinas: ROTINAS, tarefas: cinco, execucoes: [], compromissos: [] });
    expect(dia.alertas.some((a) => a.includes("5 prioridades"))).toBe(true);
  });

  it("lista só as rotinas na seção Rotinas, com a marcação do dia", () => {
    const dia = montarDia({
      rotinas: ROTINAS,
      tarefas: [],
      execucoes: [{ rotinaId: "r2", situacao: "feita", observacao: "enviado ao grupo" }],
      compromissos: [],
    });

    expect(dia.rotinas).toHaveLength(1);
    expect(dia.rotinas[0]).toMatchObject({ situacao: "feita", observacao: "enviado ao grupo" });
  });

  it("trata rotina sem marcação como pendente", () => {
    const dia = montarDia({ rotinas: ROTINAS, tarefas: [], execucoes: [], compromissos: [] });
    expect(dia.rotinas[0].situacao).toBe("pendente");
  });

  it("usa a reunião fixa da grade só quando o Calendar não pôde ser lido", () => {
    const comCalendar = montarDia({ rotinas: ROTINAS, tarefas: [], execucoes: [], compromissos: [] });
    expect(comCalendar.compromissosDaGrade).toHaveLength(0);

    const semCalendar = montarDia({ rotinas: ROTINAS, tarefas: [], execucoes: [], compromissos: null });
    expect(semCalendar.compromissosDaGrade.map((r) => r.rotulo)).toEqual(["Reunião LK — FIXO"]);
  });

  it("mantém a linha do dia na ordem da grade, inclusive o que não é trabalho", () => {
    const dia = montarDia({ rotinas: ROTINAS, tarefas: [], execucoes: [], compromissos: [] });
    expect(dia.linhaDoDia.map((b) => b.rotina.id)).toEqual(["r1", "r2", "r3", "r4", "r5"]);
    expect(dia.linhaDoDia.map((b) => b.disponivel)).toEqual([true, false, false, false, true]);
  });
});

describe("montarDia com o Calendar", () => {
  it("repassa o aviso de sobreposição e não gera divergência", () => {
    const dia = montarDia({
      rotinas: ROTINAS,
      tarefas: [],
      execucoes: [],
      compromissos: [
        { id: "e1", titulo: "Dentista", horaInicio: "10:30", horaFim: "11:30", diaInteiro: false, recorrente: false },
      ],
    });

    expect(dia.compromissos.map((c) => c.titulo)).toEqual(["Dentista"]);
    expect(dia.sobreposicoes).toHaveLength(1);
    expect(dia).not.toHaveProperty("divergencias");
  });

  it("marca na linha do dia a faixa que já tem série no Calendar", () => {
    const dia = montarDia({
      rotinas: ROTINAS,
      tarefas: [],
      execucoes: [],
      compromissos: [
        { id: "e2", titulo: "Horizzon", horaInicio: "10:00", horaFim: "11:00", diaInteiro: false, recorrente: true },
      ],
    });

    expect(dia.linhaDoDia.find((b) => b.rotina.id === "r1")?.espelhadoNoCalendar).toBe(true);
    expect(dia.linhaDoDia.find((b) => b.rotina.id === "r5")?.espelhadoNoCalendar).toBe(false);
    expect(dia.compromissos).toHaveLength(0);
  });

  it("sem Calendar, não inventa aviso e usa a reunião fixa da grade", () => {
    const dia = montarDia({ rotinas: ROTINAS, tarefas: [], execucoes: [], compromissos: null });
    expect(dia.sobreposicoes).toHaveLength(0);
    expect(dia.compromissosDaGrade.map((r) => r.rotulo)).toEqual(["Reunião LK — FIXO"]);
  });
});

describe("blocosDisponiveis", () => {
  it("oferece só faixa de trabalho para encaixar prioridade", () => {
    expect(blocosDisponiveis(ROTINAS).map((r) => r.rotulo)).toEqual(["Horizzon (fixo)", "Protegido"]);
  });
});
