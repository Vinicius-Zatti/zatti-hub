import { describe, expect, it } from "vitest";
import { parearCalendario } from "@/lib/agenda/sincronizacao";
import type { CompromissoCalendario, RotinaAgenda } from "@/lib/agenda/tipos";

function rotina(
  id: string,
  rotulo: string,
  tipo: RotinaAgenda["tipo"],
  horaInicio: string | null,
  horaFim: string | null
): RotinaAgenda {
  return {
    id,
    diaSemana: 4,
    chave: `qui-${id}`,
    ordem: 0,
    horaInicio,
    horaFim,
    horarioTexto: horaInicio ?? "",
    rotulo,
    tipo,
  };
}

function evento(
  id: string,
  titulo: string,
  horaInicio: string | null,
  horaFim: string | null,
  recorrente: boolean
): CompromissoCalendario {
  return { id, titulo, horaInicio, horaFim, diaInteiro: false, recorrente };
}

/** Quinta reduzida da grade real (17/09/2026): bloco, almoço, reunião fixa,
 * rotina de follow-up e outra reunião fixa. */
const ROTINAS = [
  rotina("r-horizzon", "Horizzon (fixo)", "bloco", "09:00", "10:00"),
  rotina("r-gravacao", "Gravação de conteúdo Instagram", "bloco", "10:00", "12:00"),
  rotina("r-almoco", "Almoço família", "pessoal", "12:00", "13:00"),
  rotina("r-dq", "Reunião Ana Dom Quixote — FIXO", "compromisso", "13:00", "14:00"),
  rotina("r-follow", "Follow-up Dom Quixote (~15min)", "rotina", "14:00", "14:15"),
  rotina("r-lk", "Reunião LK — FIXO", "compromisso", "16:00", "17:00"),
];

/** Os três eventos que o Calendar de fato tinha nesta quinta. */
const CALENDAR_REAL = [
  evento("e-almoco", "Horário de almoço", "12:00", "13:00", true),
  evento("e-dq", "Reunião Dom Quixote & Zatti", "13:00", "14:00", true),
  evento("e-lk", "Reunião LK & Zatti", "16:00", "17:00", true),
];

describe("parearCalendario - deduplicação", () => {
  it("com o Calendar real da quinta: almoço sai, as duas reuniões ficam e não há aviso nenhum", () => {
    const resultado = parearCalendario(ROTINAS, CALENDAR_REAL);

    expect(resultado.compromissos.map((c) => c.titulo)).toEqual(["Reunião Dom Quixote & Zatti", "Reunião LK & Zatti"]);
    expect(resultado.espelhoPorRotina.has("r-almoco")).toBe(true);
    expect(resultado.sobreposicoes).toEqual([]);
  });

  it("série recorrente casada com rotina de operação também não vira compromisso", () => {
    const resultado = parearCalendario(ROTINAS, [evento("e2", "Follow-up DQ", "14:00", "14:15", true)]);
    expect(resultado.compromissos).toHaveLength(0);
    expect(resultado.espelhoPorRotina.has("r-follow")).toBe(true);
  });

  it("série que a grade não conhece aparece como compromisso, sem aviso de divergência", () => {
    const resultado = parearCalendario(ROTINAS, [evento("e4", "Reunião Adega do Alemão", "14:30", "15:30", true)]);

    expect(resultado.compromissos.map((c) => c.titulo)).toEqual(["Reunião Adega do Alemão"]);
    expect(resultado.sobreposicoes).toEqual([]);
  });

  it("evento esporádico nunca é escondido, mesmo casando o horário de um bloco", () => {
    // Proteção contra o pior defeito possível aqui: sumir com uma reunião de
    // verdade porque ela caiu no mesmo horário do bloco fixo de Horizzon.
    const resultado = parearCalendario(ROTINAS, [evento("e5", "Dentista", "09:00", "10:00", false)]);

    expect(resultado.compromissos.map((c) => c.titulo)).toEqual(["Dentista"]);
    expect(resultado.espelhoPorRotina.size).toBe(0);
  });

  it("reunião recorrente diferente no mesmo horário de um bloco continua visível", () => {
    // Regressão: o horário sozinho escondia a reunião, como se ela fosse o
    // espelho do bloco de Horizzon. Agora a atividade também precisa bater.
    const resultado = parearCalendario(ROTINAS, [evento("e14", "Reunião Adega do Alemão", "09:00", "10:00", true)]);

    expect(resultado.compromissos.map((c) => c.titulo)).toEqual(["Reunião Adega do Alemão"]);
    expect(resultado.espelhoPorRotina.size).toBe(0);
  });

  it("faixa aberta casa pelo início quando a grade não tem hora de fim", () => {
    const construcao = [rotina("r-const", "Construção", "bloco", "21:30", null)];
    const resultado = parearCalendario(construcao, [evento("e12", "Construção", "21:30", "23:30", true)]);
    expect(resultado.espelhoPorRotina.has("r-const")).toBe(true);
  });

  it("grade sem nenhuma série no Calendar não gera aviso", () => {
    // Na v1 o painel de sincronização não existe: faixa sem série não é
    // problema do dia e não pode virar lista diária de falso positivo.
    expect(parearCalendario(ROTINAS, []).sobreposicoes).toEqual([]);
  });
});

describe("parearCalendario - sobreposição", () => {
  it("compromisso em cima de uma faixa gera um aviso simples, sem pedir decisão", () => {
    const resultado = parearCalendario(ROTINAS, [evento("e6", "Cliente novo", "10:30", "11:30", false)]);

    expect(resultado.sobreposicoes).toEqual(['"Cliente novo" (10:30-11:30) se sobrepõe a Gravação de conteúdo Instagram.']);
    expect(resultado.compromissos.map((c) => c.titulo)).toEqual(["Cliente novo"]);
  });

  it("compromisso que atravessa várias faixas lista todas num aviso só", () => {
    const resultado = parearCalendario(ROTINAS, [evento("e7", "Visita à obra", "11:30", "14:10", false)]);

    expect(resultado.sobreposicoes).toHaveLength(1);
    expect(resultado.sobreposicoes[0]).toContain("Gravação de conteúdo Instagram, Almoço família, Follow-up Dom Quixote");
  });

  it("dois compromissos no mesmo horário geram aviso", () => {
    const resultado = parearCalendario(ROTINAS, [
      evento("e-lk", "Reunião LK & Zatti", "16:00", "17:00", true),
      evento("e8", "Call fornecedor", "16:30", "17:00", false),
    ]);

    expect(resultado.sobreposicoes).toEqual([
      '"Reunião LK & Zatti" (16:00-17:00) e "Call fornecedor" (16:30-17:00) se sobrepõem.',
    ]);
  });

  it("reunião do Calendar não é avisada contra a própria reunião fixa da grade", () => {
    const resultado = parearCalendario(ROTINAS, [evento("e-dq", "Reunião Dom Quixote & Zatti", "13:00", "14:00", true)]);
    expect(resultado.sobreposicoes).toEqual([]);
  });

  it("encostar no fim da faixa não é sobreposição", () => {
    const resultado = parearCalendario(ROTINAS, [evento("e9", "Café", "08:30", "09:00", false)]);
    expect(resultado.sobreposicoes).toEqual([]);
  });

  it("evento de dia inteiro entra na Agenda sem gerar aviso", () => {
    const feriado: CompromissoCalendario = {
      id: "e13",
      titulo: "Feriado",
      horaInicio: null,
      horaFim: null,
      diaInteiro: true,
      recorrente: false,
    };
    const resultado = parearCalendario(ROTINAS, [feriado]);

    expect(resultado.compromissos).toHaveLength(1);
    expect(resultado.sobreposicoes).toEqual([]);
  });
});
