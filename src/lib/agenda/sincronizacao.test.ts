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

describe("parearCalendario - ajuste do dia (etapa 2)", () => {
  /** Quarta 30/09/2026 como estava no Calendar: natação movida de 11h45 para 8h15. */
  const QUARTA = [
    rotina("r-horizzon", "Horizzon (fixo)", "bloco", "09:00", "10:00"),
    rotina("r-natacao", "Natação", "pessoal", "11:45", "12:45"),
  ];
  const natacaoMovida: CompromissoCalendario = {
    ...evento("e-nat", "Natação", "08:15", "09:15", true),
    horaOriginal: "11:45",
  };

  it("ocorrência movida vira ajuste da faixa e sai da seção Agenda", () => {
    const resultado = parearCalendario(QUARTA, [natacaoMovida]);

    expect(resultado.compromissos).toEqual([]);
    expect(resultado.ajustePorRotina.get("r-natacao")).toEqual({ horaInicio: "08:15", horaFim: "09:15" });
  });

  it("faixa movida para cima de outra gera aviso com o horário do dia", () => {
    const resultado = parearCalendario(QUARTA, [natacaoMovida]);
    expect(resultado.sobreposicoes).toEqual(["Natação foi para 08:15-09:15 hoje e se sobrepõe a Horizzon (fixo)."]);
  });

  it("bloco encolhido só no fim também é ajuste do dia", () => {
    const encolhido = { ...evento("e-hzz", "Horizzon", "09:00", "09:30", true), horaOriginal: "09:00" };
    const resultado = parearCalendario(QUARTA, [encolhido]);
    expect(resultado.ajustePorRotina.get("r-horizzon")).toEqual({ horaInicio: "09:00", horaFim: "09:30" });
    expect(resultado.compromissos).toEqual([]);
  });

  it("série de outra atividade que veio do horário da faixa continua compromisso", () => {
    const reuniao = { ...evento("e-r", "Reunião Adega do Alemão", "15:00", "16:00", true), horaOriginal: "11:45" };
    const resultado = parearCalendario(QUARTA, [reuniao]);
    expect(resultado.compromissos.map((c) => c.titulo)).toEqual(["Reunião Adega do Alemão"]);
    expect(resultado.ajustePorRotina.size).toBe(0);
  });

  it("série que já nasce em horário diferente da grade não vira ajuste", () => {
    // Divergência permanente entre série e grade fica para o painel de
    // sincronização. Sem isso, toda ocorrência viraria "mudou hoje".
    const outraSerie = { ...evento("e-nat2", "Natação", "07:00", "08:00", true), horaOriginal: "07:00" };
    const resultado = parearCalendario(QUARTA, [outraSerie]);
    expect(resultado.compromissos).toHaveLength(1);
    expect(resultado.ajustePorRotina.size).toBe(0);
  });

  it("ocorrência virada em dia inteiro continua compromisso visível", () => {
    const diaInteiro: CompromissoCalendario = {
      ...evento("e-di", "Natação", null, null, true),
      diaInteiro: true,
      horaOriginal: "11:45",
    };
    const resultado = parearCalendario(QUARTA, [diaInteiro]);
    expect(resultado.compromissos).toHaveLength(1);
    expect(resultado.ajustePorRotina.size).toBe(0);
  });

  it("ocorrência trazida de outro dia nunca é escondida, nem no horário exato da faixa", () => {
    const deOntem = { ...evento("e-on", "Natação", "11:45", "12:45", true), deOutroDia: true };
    const resultado = parearCalendario(QUARTA, [deOntem]);
    expect(resultado.compromissos).toHaveLength(1);
    expect(resultado.espelhoPorRotina.size).toBe(0);
  });

  it("com duas faixas da mesma atividade, a movida fica com a faixa de origem", () => {
    const duas = [
      rotina("r-n1", "Natação", "pessoal", "08:15", "09:15"),
      rotina("r-n2", "Natação", "pessoal", "11:45", "12:45"),
    ];
    const resultado = parearCalendario(duas, [natacaoMovida]);
    expect(resultado.ajustePorRotina.get("r-n2")).toEqual({ horaInicio: "08:15", horaFim: "09:15" });
    expect(resultado.espelhoPorRotina.has("r-n1")).toBe(false);
  });

  it("ocorrência no horário de sempre não gera ajuste", () => {
    const normal = { ...evento("e-n", "Natação", "11:45", "12:45", true), horaOriginal: "11:45" };
    const resultado = parearCalendario(QUARTA, [normal]);
    expect(resultado.espelhoPorRotina.has("r-natacao")).toBe(true);
    expect(resultado.ajustePorRotina.size).toBe(0);
  });

  it("avulso nunca vira ajuste, mesmo com o nome da faixa", () => {
    const avulso = evento("e-av", "Natação", "08:15", "09:15", false);
    expect(parearCalendario(QUARTA, [avulso]).compromissos).toHaveLength(1);
  });
});
