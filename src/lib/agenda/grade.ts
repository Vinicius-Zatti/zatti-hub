/** Leitura da grade semanal do Cérebro do Gestor
 * (`_conhecimento/agenda-semanal.md`) para publicação no Zatti Hub.
 *
 * O `.md` continua sendo a fonte oficial da rotina permanente - este módulo
 * só traduz as tabelas de cada dia para linhas de `zh_agenda_rotinas`. Toda a
 * regra em prosa da grade (natação do Vicente que varia de semana, Betones
 * que só vira reunião com evento no Calendar) não é interpretada de
 * propósito: o rótulo vai inteiro para a tela, com a ressalva escrita, em vez
 * de virar campo estruturado que mentiria sobre a condição.
 *
 * IDENTIDADE: cada linha de dia carrega um comentário invisível
 * `<!-- agenda-id:seg-horizzon-manha -->`, escrito à mão na grade. É ele que
 * prende tarefa e histórico de execução à faixa. Nada é derivado de texto,
 * horário ou posição, porque tudo isso muda com frequência na grade real
 * (a observação entre parênteses muda quase toda semana). Faltou id, id
 * repetido ou id fora do formato: a leitura devolve erro e a publicação não
 * acontece - falha fechada, nunca um id inventado.
 *
 * Funções puras e sem import de propósito: `scripts/publicar-agenda-semanal.mjs`
 * importa este arquivo direto no Node, que não resolve o alias `@/`. */

/** Ver comentário de `zh_agenda_rotinas.tipo` na migração. */
export type TipoRotina = "rotina" | "bloco" | "pessoal" | "compromisso";

/** Linha pronta para o parâmetro jsonb de `publicar_agenda_semanal`. */
export type FaixaPublicada = {
  dia_semana: number;
  /** O `agenda-id` escrito na grade - identidade permanente da faixa. */
  chave: string;
  ordem: number;
  hora_inicio: string | null;
  hora_fim: string | null;
  rotulo: string;
  horario_texto: string;
  tipo: TipoRotina;
};

const DIAS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

/** Formato do `agenda-id`: minúsculas, números e hífen ("qua-prep-reuniao-lk").
 * O banco repete a mesma regra no check de `zh_agenda_rotinas.chave`. */
export const PADRAO_AGENDA_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TAMANHO_MAXIMO_AGENDA_ID = 64;

const COMENTARIO_AGENDA_ID = /<!--\s*agenda-id:\s*(.*?)\s*-->/g;

const NOMES_DIA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** Tira acento e caixa para comparar título de seção ("Terça" -> "terca"). */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Remove negrito e espaço sobrando de uma célula. O marcador de atenção da
 * grade NÃO é removido do rótulo de propósito: ele marca a faixa que Vinícius
 * deixou em aberto, e a tela precisa mostrar isso. Só o horário o descarta,
 * logo abaixo, porque ali ele atrapalha a leitura da hora. */
export function limparCelula(texto: string): string {
  return texto
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "9h" -> "09:00", "11h45" -> "11:45". Devolve null no que não for hora. */
function horaDoTexto(texto: string): string | null {
  const encontrado = texto.trim().match(/^(\d{1,2})h(\d{2})?$/);
  if (!encontrado) return null;
  const hora = Number(encontrado[1]);
  const minuto = Number(encontrado[2] ?? 0);
  if (hora > 23 || minuto > 59) return null;
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

/** Interpreta a coluna Horário da grade. Os quatro formatos que existem hoje:
 * faixa ("9h-10h"), limite ("até 8h"), abertura ("21h30+") e ponto ("22h"). */
export function interpretarHorario(textoOriginal: string): { horaInicio: string | null; horaFim: string | null } {
  const texto = limparCelula(textoOriginal).replace(/⚠️|⚠/g, "").trim();

  const ate = texto.match(/^at[ée]\s+(.+)$/i);
  if (ate) return { horaInicio: null, horaFim: horaDoTexto(ate[1]) };

  if (texto.endsWith("+")) return { horaInicio: horaDoTexto(texto.slice(0, -1)), horaFim: null };

  const partes = texto.split("-");
  if (partes.length === 2) {
    return { horaInicio: horaDoTexto(partes[0]), horaFim: horaDoTexto(partes[1]) };
  }

  return { horaInicio: horaDoTexto(texto), horaFim: null };
}

/** Classifica a faixa pelas categorias da Agenda v2.
 *
 * Quase tudo é ancorado no começo do rótulo, porque a grade explica a condição
 * logo depois do nome da faixa e essas explicações citam outras categorias:
 * "Protegido (Betones ... só vira prep ... pela natação mais longa)" é bloco,
 * não rotina nem pessoal. A ordem também importa: "Follow-up Reunião LK
 * (~15min) + transição" é rotina, não compromisso nem pessoal. */
export function classificarRotulo(rotulo: string): TipoRotina {
  const texto = normalizar(rotulo);

  if (/^follow-up|^prep\b|^relatorios|^revisao semanal|^check de infra|^abrir a semana/.test(texto)) {
    return "rotina";
  }
  if (/^reuniao/.test(texto)) return "compromisso";
  if (/^vicente|^natacao|^almoco|^familia|^pos-graduacao|^transicao/.test(texto)) return "pessoal";
  return "bloco";
}

export type LeituraDaGrade = {
  faixas: FaixaPublicada[];
  /** Qualquer erro aqui impede a publicação inteira. */
  erros: string[];
};

/** Lê o markdown inteiro da grade e devolve uma linha por faixa de horário.
 * Só as tabelas sob um título de dia entram; "Regras fixas", "Notas" e
 * "Sincronização com o Google Calendar" são ignoradas. */
export function interpretarGradeSemanal(markdown: string): LeituraDaGrade {
  const faixas: FaixaPublicada[] = [];
  const erros: string[] = [];
  const ordemPorDia = new Map<number, number>();
  const ondeApareceu = new Map<string, string>();
  let diaAtual: number | null = null;

  for (const linhaOriginal of markdown.split(/\r?\n/)) {
    const titulo = linhaOriginal.match(/^##\s+(.+?)\s*$/);
    if (titulo) {
      const dia = DIAS[normalizar(titulo[1])];
      diaAtual = dia === undefined ? null : dia;
      continue;
    }

    if (diaAtual === null || !linhaOriginal.trimStart().startsWith("|")) continue;

    // O comentário sai antes de separar as células: ele não pode aparecer no
    // rótulo da tela nem atrapalhar a leitura do horário.
    const ids = [...linhaOriginal.matchAll(COMENTARIO_AGENDA_ID)].map((m) => m[1]);
    const linha = linhaOriginal.replace(COMENTARIO_AGENDA_ID, "");

    const celulas = linha.split("|").slice(1, -1);
    if (celulas.length < 2) continue;

    const horario = limparCelula(celulas[0]);
    const rotulo = limparCelula(celulas.slice(1).join(" | "));

    // Cabeçalho da tabela e linha de separação não são faixas.
    if (/^[\s:-]*$/.test(horario)) continue;
    if (normalizar(horario) === "horario") continue;
    if (!rotulo) continue;

    const onde = `${nomeDiaSemana(diaAtual)} ${horario} "${rotulo}"`;

    if (ids.length === 0) {
      erros.push(`${onde}: falta o <!-- agenda-id:... -->.`);
      continue;
    }
    if (ids.length > 1) {
      erros.push(`${onde}: tem mais de um agenda-id.`);
      continue;
    }

    const id = ids[0];
    if (!PADRAO_AGENDA_ID.test(id) || id.length > TAMANHO_MAXIMO_AGENDA_ID) {
      erros.push(`${onde}: agenda-id "${id}" inválido. Use só letras minúsculas, números e hífen.`);
      continue;
    }

    const anterior = ondeApareceu.get(id);
    if (anterior) {
      erros.push(`agenda-id "${id}" repetido: ${anterior} e ${onde}.`);
      continue;
    }
    ondeApareceu.set(id, onde);

    const { horaInicio, horaFim } = interpretarHorario(horario);
    const ordem = ordemPorDia.get(diaAtual) ?? 0;
    ordemPorDia.set(diaAtual, ordem + 1);

    faixas.push({
      dia_semana: diaAtual,
      chave: id,
      ordem,
      hora_inicio: horaInicio,
      hora_fim: horaFim,
      rotulo,
      horario_texto: horario,
      tipo: classificarRotulo(rotulo),
    });
  }

  return { faixas, erros };
}

/** Dia da semana de uma data ISO (0 = domingo), sem passar por fuso: o
 * `Date.UTC` evita o clássico "cai no dia anterior" de `new Date("...")`. */
export function diaDaSemanaIso(dataIso: string): number {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

export function nomeDiaSemana(diaSemana: number): string {
  return NOMES_DIA[diaSemana] ?? "";
}

/** "09:00" -> "9h", "11:45" -> "11h45" - formato curto que a grade já usa. */
export function horaCurta(hora: string | null): string {
  if (!hora) return "";
  const [h, m] = hora.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}
