import { describe, expect, it } from "vitest";
import {
  classificarRotulo,
  diaDaSemanaIso,
  horaCurta,
  interpretarGradeSemanal,
  interpretarHorario,
  limparCelula,
  type FaixaPublicada,
} from "@/lib/agenda/grade";

/** Trecho real de `_conhecimento/agenda-semanal.md` (15/09/2026), com os
 * formatos que existem de verdade: negrito, marcador de atenção, faixa
 * aberta, limite "até", seção que não é dia e o `agenda-id` de cada linha. */
const GRADE = `# Agenda Semanal

## Regras fixas

- **Até 8h:** tempo com Vicente

| Isto | não é dia |
|------|-----------|
| 9h-10h | Não pode entrar |

---

## Segunda

| Horário | Atividade |
|---------|-----------|
| até 8h | Vicente <!-- agenda-id:seg-vicente --> |
| 8h-9h | Transição <!-- agenda-id:seg-transicao --> |
| **9h-10h** | **Horizzon (fixo)** <!-- agenda-id:seg-horizzon-manha --> |
| 10h-11h45 | Protegido (prioridade da semana) <!-- agenda-id:seg-protegido-manha --> |
| 11h45-13h15 | Natação (Vinícius) <!-- agenda-id:seg-natacao --> |
| 13h15-13h45 | Almoço família (30min) <!-- agenda-id:seg-almoco --> |
| 16h30-17h | Protegido (Betones não é fixo, só vira prep se houver reunião) <!-- agenda-id:seg-protegido-fim-tarde --> |
| 17h-21h30 | Família <!-- agenda-id:seg-familia --> |
| 22h | Pós-graduação <!-- agenda-id:seg-pos-graduacao --> |

---

## Terça

| Horário | Atividade |
|---------|-----------|
| **9h-10h** | **Natação do Vicente** (cede o horário do Horizzon fixo) <!-- agenda-id:ter-natacao-vicente --> |
| 10h-11h | Horizzon (fixo) <!-- agenda-id:ter-horizzon-manha --> |
| 11h-12h | Relatórios Verato + entregas ⚠️ deadline 11h não cabe mais <!-- agenda-id:ter-relatorios-verato --> |
| 21h30 | Construção (fila-construcao.md) <!-- agenda-id:ter-construcao --> |

---

## Quinta

| Horário | Atividade |
|---------|-----------|
| 13h-14h | Reunião Ana Dom Quixote — FIXO <!-- agenda-id:qui-reuniao-dom-quixote --> |
| 14h-14h15 | Follow-up Dom Quixote (~15min) <!-- agenda-id:qui-follow-up-dom-quixote --> |

## Notas

- **Betones:** reunião não é fixa.
`;

function ler(markdown: string): FaixaPublicada[] {
  const { faixas, erros } = interpretarGradeSemanal(markdown);
  expect(erros).toEqual([]);
  return faixas;
}

function porId(markdown: string): Map<string, FaixaPublicada> {
  return new Map(ler(markdown).map((f) => [f.chave, f]));
}

describe("interpretarHorario", () => {
  it("lê faixa comum", () => {
    expect(interpretarHorario("9h-10h")).toEqual({ horaInicio: "09:00", horaFim: "10:00" });
    expect(interpretarHorario("11h45-13h15")).toEqual({ horaInicio: "11:45", horaFim: "13:15" });
    expect(interpretarHorario("16h09-16h30")).toEqual({ horaInicio: "16:09", horaFim: "16:30" });
  });

  it("lê limite, abertura e ponto único", () => {
    expect(interpretarHorario("até 8h")).toEqual({ horaInicio: null, horaFim: "08:00" });
    expect(interpretarHorario("21h30+")).toEqual({ horaInicio: "21:30", horaFim: null });
    expect(interpretarHorario("22h")).toEqual({ horaInicio: "22:00", horaFim: null });
  });

  it("ignora negrito e marcador de atenção", () => {
    expect(interpretarHorario("**14h-15h**")).toEqual({ horaInicio: "14:00", horaFim: "15:00" });
    expect(interpretarHorario("15h45-17h ⚠️")).toEqual({ horaInicio: "15:45", horaFim: "17:00" });
  });
});

describe("classificarRotulo", () => {
  it("separa as quatro categorias da Agenda v2", () => {
    expect(classificarRotulo("Horizzon (fixo)")).toBe("bloco");
    expect(classificarRotulo("Protegido (prioridade da semana)")).toBe("bloco");
    expect(classificarRotulo("Relatórios Verato + entregas")).toBe("rotina");
    expect(classificarRotulo("Reunião Ana Dom Quixote — FIXO")).toBe("compromisso");
    expect(classificarRotulo("Natação (Vinícius)")).toBe("pessoal");
    expect(classificarRotulo("Almoço família (30min)")).toBe("pessoal");
  });

  it("dá precedência a rotina quando o rótulo mistura termos", () => {
    // "Follow-up Reunião LK (~15min) + transição" tem termo de compromisso e
    // de pessoal no meio, mas é acompanhamento recorrente.
    expect(classificarRotulo("Follow-up Reunião LK (~15min) + transição")).toBe("rotina");
    expect(classificarRotulo("Prep Reunião LK (quinta 16h)")).toBe("rotina");
  });

  it("não se perde na explicação que vem depois do nome da faixa", () => {
    // Caso real da segunda 16h30: é bloco Protegido, mesmo citando "prep",
    // "reunião" e "natação" no texto da condição.
    expect(
      classificarRotulo(
        "Protegido (Betones não é fixo, só vira prep se houver reunião marcada essa semana; encolhido de 1h15 pra 30min pela natação mais longa)"
      )
    ).toBe("bloco");
    expect(classificarRotulo("Protegido (vira Reunião Betones só se houver evento marcado no Calendar)")).toBe("bloco");
  });
});

describe("interpretarGradeSemanal", () => {
  const faixas = ler(GRADE);

  it("ignora tabela que não está sob um título de dia", () => {
    expect(faixas.some((f) => f.rotulo === "Não pode entrar")).toBe(false);
  });

  it("descarta cabeçalho e linha de separação", () => {
    expect(faixas.some((f) => f.rotulo === "Atividade")).toBe(false);
    expect(faixas.every((f) => f.rotulo.trim().length > 0)).toBe(true);
  });

  it("numera a ordem por dia, começando do zero", () => {
    const segunda = faixas.filter((f) => f.dia_semana === 1);
    expect(segunda.map((f) => f.ordem)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(segunda[0].rotulo).toBe("Vicente");
    expect(segunda[2]).toMatchObject({
      chave: "seg-horizzon-manha",
      hora_inicio: "09:00",
      hora_fim: "10:00",
      rotulo: "Horizzon (fixo)",
      tipo: "bloco",
    });
  });

  it("usa o agenda-id escrito na grade e tira o comentário do rótulo", () => {
    const verato = faixas.find((f) => f.chave === "ter-relatorios-verato");
    expect(verato?.rotulo).toBe("Relatórios Verato + entregas ⚠️ deadline 11h não cabe mais");
    expect(faixas.every((f) => !f.rotulo.includes("agenda-id") && !f.rotulo.includes("<!--"))).toBe(true);
  });

  it("guarda o texto original do horário", () => {
    const ate8 = faixas.find((f) => f.rotulo === "Vicente");
    expect(ate8?.horario_texto).toBe("até 8h");
    expect(ate8?.hora_inicio).toBeNull();
  });

  it("mapeia terça e quinta para os dias certos da semana", () => {
    expect(faixas.find((f) => f.rotulo.startsWith("Relatórios Verato"))?.dia_semana).toBe(2);
    expect(faixas.find((f) => f.rotulo.startsWith("Reunião Ana"))?.dia_semana).toBe(4);
  });

  it("mantém o Horizzon da terça às 10h, como manda a regra fixa", () => {
    const horizzonTerca = faixas.find((f) => f.dia_semana === 2 && f.rotulo.startsWith("Horizzon"));
    expect(horizzonTerca).toMatchObject({ hora_inicio: "10:00", hora_fim: "11:00" });
  });

  it("preserva o marcador de atenção no rótulo e descarta no horário", () => {
    // O marcador é a sinalização do próprio Vinícius de faixa em aberto - some
    // do horário (senão a hora não é lida) e fica no rótulo, que vai pra tela.
    const verato = faixas.find((f) => f.rotulo.startsWith("Relatórios Verato"));
    expect(verato?.rotulo).toContain("⚠");
    expect(interpretarHorario("15h45-17h ⚠️")).toEqual({ horaInicio: "15:45", horaFim: "17:00" });
  });
});

describe("helpers de data", () => {
  it("acha o dia da semana sem escorregar de fuso", () => {
    expect(diaDaSemanaIso("2026-09-15")).toBe(2); // terça
    expect(diaDaSemanaIso("2026-09-18")).toBe(5); // sexta
    expect(diaDaSemanaIso("2026-09-13")).toBe(0); // domingo
  });

  it("encurta a hora no formato da grade", () => {
    expect(horaCurta("09:00")).toBe("9h");
    expect(horaCurta("11:45")).toBe("11h45");
    expect(horaCurta(null)).toBe("");
  });

  it("limpa célula com negrito e espaço duplicado", () => {
    expect(limparCelula("  **Horizzon   (fixo)** ")).toBe("Horizzon (fixo)");
  });
});

/** A mesma segunda em várias versões, como a grade real muda de uma semana
 * para outra. O id é o que tem que sobreviver a todas elas. */
const SEGUNDA_ORIGINAL = `## Segunda

| Horário | Atividade |
|---------|-----------|
| 9h-10h | Horizzon (fixo) <!-- agenda-id:seg-horizzon-manha --> |
| 10h-11h45 | Protegido (prioridade da semana) <!-- agenda-id:seg-protegido-manha --> |
| 13h45-14h45 | Zatti estratégico <!-- agenda-id:seg-zatti-estrategico --> |
| 16h30-17h | Protegido <!-- agenda-id:seg-protegido-fim-tarde --> |
`;

describe("identidade da faixa pelo agenda-id", () => {
  const antes = porId(SEGUNDA_ORIGINAL);

  it("mudar o texto ou a observação mantém o mesmo id", () => {
    // Caso real: a observação do Relatórios Verato mudou de semana pra semana
    // e, com chave derivada do texto, isso apagava o histórico da rotina.
    const depois = porId(
      SEGUNDA_ORIGINAL.replace(
        "Protegido (prioridade da semana)",
        "Protegido ⚠️ (Betones só vira prep se houver reunião; encolhido pela natação)"
      )
    );

    expect([...depois.keys()]).toEqual([...antes.keys()]);
    expect(depois.get("seg-protegido-manha")?.rotulo).toContain("Betones");
  });

  it("mudar o horário mantém o mesmo id e troca só a hora", () => {
    const depois = porId(SEGUNDA_ORIGINAL.replace("| 13h45-14h45 | Zatti", "| 14h-15h30 | Zatti"));

    expect(depois.get("seg-zatti-estrategico")).toMatchObject({ hora_inicio: "14:00", hora_fim: "15:30" });
    expect(antes.get("seg-zatti-estrategico")).toMatchObject({ hora_inicio: "13:45", hora_fim: "14:45" });
  });

  it("trocar a ordem das linhas muda só a ordem de exibição", () => {
    const linhas = SEGUNDA_ORIGINAL.split("\n");
    // Troca Horizzon (índice 4) e Zatti (índice 6) de lugar.
    [linhas[4], linhas[6]] = [linhas[6], linhas[4]];
    const depois = porId(linhas.join("\n"));

    expect(new Set(depois.keys())).toEqual(new Set(antes.keys()));
    expect(antes.get("seg-horizzon-manha")?.ordem).toBe(0);
    expect(depois.get("seg-horizzon-manha")?.ordem).toBe(2);
    expect(depois.get("seg-horizzon-manha")?.rotulo).toBe("Horizzon (fixo)");
  });

  it("faixa nova no meio do dia não mexe no id das outras", () => {
    const depois = porId(
      SEGUNDA_ORIGINAL.replace(
        "| 10h-11h45 |",
        "| 10h-10h30 | Café com o Beto <!-- agenda-id:seg-cafe-beto --> |\n| 10h30-11h45 |"
      )
    );

    for (const [id, faixa] of antes) {
      expect(depois.get(id)?.rotulo).toBe(faixa.rotulo);
    }
    expect(depois.get("seg-cafe-beto")?.ordem).toBe(1);
  });

  it("faixa retirada some da leitura sem mexer no id das que ficaram", () => {
    const depois = porId(SEGUNDA_ORIGINAL.replace(/\| 13h45-14h45 .*\n/, ""));

    expect(depois.has("seg-zatti-estrategico")).toBe(false);
    expect([...depois.keys()]).toEqual(["seg-horizzon-manha", "seg-protegido-manha", "seg-protegido-fim-tarde"]);
  });

  it("rótulo igual no mesmo dia é separado pelo id, não pela posição", () => {
    const repetido = `## Terça

| Horário | Atividade |
|---------|-----------|
| 9h-10h | Protegido <!-- agenda-id:ter-protegido-manha --> |
| 15h-17h | Protegido <!-- agenda-id:ter-protegido-tarde --> |
`;
    const invertido = `## Terça

| Horário | Atividade |
|---------|-----------|
| 15h-17h | Protegido <!-- agenda-id:ter-protegido-tarde --> |
| 9h-10h | Protegido <!-- agenda-id:ter-protegido-manha --> |
`;
    expect(porId(repetido).get("ter-protegido-tarde")?.hora_inicio).toBe("15:00");
    expect(porId(invertido).get("ter-protegido-tarde")?.hora_inicio).toBe("15:00");
  });
});

describe("falha fechada no agenda-id", () => {
  it("linha sem id vira erro e não vira faixa", () => {
    const { faixas, erros } = interpretarGradeSemanal(SEGUNDA_ORIGINAL.replace(" <!-- agenda-id:seg-zatti-estrategico -->", ""));

    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("Zatti estratégico");
    expect(erros[0]).toContain("falta o <!-- agenda-id");
    expect(faixas.some((f) => f.rotulo === "Zatti estratégico")).toBe(false);
  });

  it("id repetido vira erro, mesmo em dias diferentes", () => {
    const grade = `${SEGUNDA_ORIGINAL}
## Quarta

| Horário | Atividade |
|---------|-----------|
| 9h-10h | Horizzon (fixo) <!-- agenda-id:seg-horizzon-manha --> |
`;
    const { erros } = interpretarGradeSemanal(grade);

    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain('agenda-id "seg-horizzon-manha" repetido');
  });

  it("id fora do formato vira erro", () => {
    const { erros } = interpretarGradeSemanal(
      SEGUNDA_ORIGINAL.replace("agenda-id:seg-zatti-estrategico", "agenda-id:Seg Zatti!")
    );

    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("inválido");
  });

  it("dois ids na mesma linha viram erro", () => {
    const { erros } = interpretarGradeSemanal(
      SEGUNDA_ORIGINAL.replace(
        "<!-- agenda-id:seg-zatti-estrategico -->",
        "<!-- agenda-id:seg-zatti-estrategico --> <!-- agenda-id:seg-zatti-2 -->"
      )
    );

    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("mais de um agenda-id");
  });

  it("junta todos os problemas numa leitura só, para corrigir de uma vez", () => {
    const semNenhumId = SEGUNDA_ORIGINAL.replace(/ <!-- agenda-id:[a-z0-9-]+ -->/g, "");
    const { faixas, erros } = interpretarGradeSemanal(semNenhumId);

    expect(erros).toHaveLength(4);
    expect(faixas).toHaveLength(0);
  });
});
