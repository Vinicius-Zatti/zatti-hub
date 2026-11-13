// Avaliações (12/11/2026): modelo fixo de perguntas. A gestão liga, desliga e muda o texto; o
// tipo, as opções e se é obrigatória vêm daqui. Espelho de `avaliacoes_validar_perguntas` e da
// validação de `avaliacoes_registrar` no banco (supabase/migrations/20261112180000_avaliacoes_qr.sql),
// que é a barreira de verdade. Funções puras: servem à página pública e ao painel.

export type ChavePergunta = "atendimento" | "comida" | "espera" | "nps" | "conheceu" | "comentario";
export type TipoPergunta = "estrelas" | "faixas" | "nps" | "escolha" | "texto";
// Três tipos de pesquisa (13/11/2026): consumo no local, delivery próprio e apps de entrega
// (iFood, 99 e afins). A gestão desliga o que não usar (`avaliacoes_pesquisas.origens`).
export type Origem = "salao" | "delivery" | "app";

export const ORIGENS: readonly Origem[] = ["salao", "delivery", "app"];
export const ROTULO_ORIGEM: Record<Origem, string> = { salao: "Salão", delivery: "Delivery próprio", app: "Apps de entrega" };
/** Explicação curta de cada tipo, na tela de configurar. */
export const DESCRICAO_ORIGEM: Record<Origem, string> = {
  salao: "Quem comeu no restaurante. O QR fica na mesa ou no balcão.",
  delivery: "Pedido feito direto com vocês (WhatsApp, site, telefone). O QR vai junto do pedido.",
  app: "Pedido pelo iFood, 99 ou outro app. O QR vai junto do pedido desses apps.",
};

export type Opcao = { valor: string; rotulo: string };

export type DefinicaoPergunta = {
  chave: ChavePergunta;
  tipo: TipoPergunta;
  /** Nome curto no painel, no CSV e na tela de configurar. */
  nome: string;
  textoPadrao: string;
  obrigatoria: boolean;
  opcoes?: readonly Opcao[];
};

export const OPCOES_ESPERA: readonly Opcao[] = [
  { valor: "ate_15", rotulo: "Até 15 min" },
  { valor: "de_15_a_30", rotulo: "De 15 a 30 min" },
  { valor: "de_30_a_45", rotulo: "De 30 a 45 min" },
  { valor: "mais_de_45", rotulo: "Mais de 45 min" },
];

export const OPCOES_CONHECEU: readonly Opcao[] = [
  { valor: "instagram", rotulo: "Instagram" },
  { valor: "google", rotulo: "Google" },
  { valor: "ifood", rotulo: "iFood" },
  { valor: "indicacao", rotulo: "Indicação de alguém" },
  { valor: "passando", rotulo: "Passando na frente" },
  { valor: "ja_cliente", rotulo: "Já era cliente" },
  { valor: "outro", rotulo: "Outro" },
];

export const CATALOGO: readonly DefinicaoPergunta[] = [
  { chave: "atendimento", tipo: "estrelas", nome: "Atendimento", textoPadrao: "Como foi o atendimento?", obrigatoria: true },
  { chave: "comida", tipo: "estrelas", nome: "Comida", textoPadrao: "Como estava a comida?", obrigatoria: true },
  { chave: "espera", tipo: "faixas", nome: "Tempo de espera", textoPadrao: "Quanto tempo você esperou?", obrigatoria: true, opcoes: OPCOES_ESPERA },
  {
    chave: "nps",
    tipo: "nps",
    nome: "Indicaria (0 a 10)",
    textoPadrao: "De 0 a 10, quanto você indicaria a gente para um amigo?",
    obrigatoria: true,
  },
  { chave: "conheceu", tipo: "escolha", nome: "Como conheceu", textoPadrao: "Como você conheceu a gente?", obrigatoria: false, opcoes: OPCOES_CONHECEU },
  { chave: "comentario", tipo: "texto", nome: "Comentário", textoPadrao: "Quer contar mais alguma coisa?", obrigatoria: false },
];

export const LIMITE_TEXTO_PERGUNTA = 200;
export const LIMITE_COMENTARIO = 1000;
export const LIMITE_CONHECEU_OUTRO = 80;

/** Configuração gravada em `avaliacoes_pesquisa_versoes.perguntas`. */
export type PerguntaConfig = { chave: ChavePergunta; texto: string; ativa: boolean };

/** Pergunta pronta para a página pública: definição + texto da unidade. */
export type PerguntaPublica = DefinicaoPergunta & { texto: string };

export function definicao(chave: ChavePergunta): DefinicaoPergunta {
  const d = CATALOGO.find((p) => p.chave === chave);
  if (!d) throw new Error(`Pergunta desconhecida: ${chave}`);
  return d;
}

export function ehChavePergunta(valor: unknown): valor is ChavePergunta {
  return typeof valor === "string" && CATALOGO.some((p) => p.chave === valor);
}

/** Tipos ligados na ordem fixa; sem a coluna (antes da migração de 13/11) valem os três. */
export function lerOrigens(valor: unknown): Origem[] {
  if (!Array.isArray(valor)) return [...ORIGENS];
  const ligadas = ORIGENS.filter((o) => valor.includes(o));
  return ligadas.length ? ligadas : [...ORIGENS];
}

export function ehOrigem(valor: unknown): valor is Origem {
  return valor === "salao" || valor === "delivery" || valor === "app";
}

export function perguntasPadrao(): PerguntaConfig[] {
  return CATALOGO.map((p) => ({ chave: p.chave, texto: p.textoPadrao, ativa: true }));
}

/** Lê o JSON do banco (ou do formulário) na ordem do catálogo; chave faltando entra desligada
 * com o texto padrão. Nunca lança. */
export function lerPerguntas(bruto: unknown): PerguntaConfig[] {
  const lista = Array.isArray(bruto) ? bruto : [];
  return CATALOGO.map((def) => {
    const achada = lista.find((q) => q && typeof q === "object" && (q as { chave?: unknown }).chave === def.chave) as
      | { texto?: unknown; ativa?: unknown }
      | undefined;
    if (!achada) return { chave: def.chave, texto: def.textoPadrao, ativa: false };
    return {
      chave: def.chave,
      texto: typeof achada.texto === "string" && achada.texto.trim() ? achada.texto : def.textoPadrao,
      ativa: achada.ativa === true,
    };
  });
}

/** Mesmas regras de `avaliacoes_validar_perguntas`. Devolve a lista normalizada ou o erro. */
export function validarPerguntas(perguntas: PerguntaConfig[]): { ok: true; perguntas: PerguntaConfig[] } | { ok: false; erro: string } {
  if (perguntas.length !== CATALOGO.length) return { ok: false, erro: "Lista de perguntas incompleta. Recarregue a página." };
  const vistas = new Set<string>();
  const saida: PerguntaConfig[] = [];
  for (const p of perguntas) {
    if (!ehChavePergunta(p.chave) || vistas.has(p.chave) || typeof p.ativa !== "boolean") {
      return { ok: false, erro: "Lista de perguntas inválida. Recarregue a página." };
    }
    vistas.add(p.chave);
    const texto = (p.texto ?? "").trim();
    if (texto.length < 3 || texto.length > LIMITE_TEXTO_PERGUNTA) {
      return { ok: false, erro: `O texto de "${definicao(p.chave).nome}" deve ter de 3 a ${LIMITE_TEXTO_PERGUNTA} letras.` };
    }
    saida.push({ chave: p.chave, texto, ativa: p.ativa });
  }
  if (!saida.some((p) => p.ativa)) return { ok: false, erro: "Deixe ao menos uma pergunta ligada." };
  return { ok: true, perguntas: saida };
}

/** Perguntas ligadas, na ordem do catálogo, com o texto da unidade. */
export function perguntasAtivas(config: PerguntaConfig[]): PerguntaPublica[] {
  return config.filter((p) => p.ativa).map((p) => ({ ...definicao(p.chave), texto: p.texto }));
}

/** Respostas como vão para a RPC: notas em número, escolhas em texto. */
export type RespostasEnvio = Partial<Record<ChavePergunta, number | string>> & { conheceu_outro?: string };

export type ResultadoRespostas = { ok: true; respostas: RespostasEnvio } | { ok: false; erro: string; chave: ChavePergunta };

// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function inteiro(bruto: unknown): number | null {
  if (typeof bruto === "number" && Number.isInteger(bruto)) return bruto;
  if (typeof bruto === "string" && /^\d{1,2}$/.test(bruto.trim())) return Number(bruto.trim());
  return null;
}

/** Valida as respostas do formulário (texto cru) contra as perguntas ligadas. O banco valida de
 * novo; aqui é para a pessoa ver o erro na hora e para a RPC receber tipos certos. */
export function validarRespostas(perguntas: PerguntaPublica[], brutas: Record<string, unknown>): ResultadoRespostas {
  const respostas: RespostasEnvio = {};
  for (const p of perguntas) {
    const bruto = brutas[p.chave];
    const vazio = bruto === undefined || bruto === null || (typeof bruto === "string" && bruto.trim() === "");
    if (vazio) {
      if (p.obrigatoria) return { ok: false, erro: "Responda todas as perguntas marcadas.", chave: p.chave };
      continue;
    }
    if (p.tipo === "estrelas" || p.tipo === "nps") {
      const n = inteiro(bruto);
      const [min, max] = p.tipo === "nps" ? [0, 10] : [1, 5];
      if (n === null || n < min || n > max) return { ok: false, erro: "Há uma nota fora do intervalo.", chave: p.chave };
      respostas[p.chave] = n;
    } else if (p.tipo === "faixas" || p.tipo === "escolha") {
      const valor = typeof bruto === "string" ? bruto : "";
      if (!(p.opcoes ?? []).some((o) => o.valor === valor)) return { ok: false, erro: "Há uma opção inválida.", chave: p.chave };
      respostas[p.chave] = valor;
      if (p.chave === "conheceu" && valor === "outro") {
        const outro = typeof brutas.conheceu_outro === "string" ? brutas.conheceu_outro.replace(CONTROLE, " ").trim() : "";
        if (outro.length > LIMITE_CONHECEU_OUTRO) return { ok: false, erro: `Escreva até ${LIMITE_CONHECEU_OUTRO} letras em "Outro".`, chave: p.chave };
        if (outro) respostas.conheceu_outro = outro;
      }
    } else {
      if (typeof bruto !== "string") return { ok: false, erro: "Texto inválido.", chave: p.chave };
      const texto = bruto.replace(CONTROLE, "").trim();
      if (texto.length > LIMITE_COMENTARIO) return { ok: false, erro: `O comentário pode ter até ${LIMITE_COMENTARIO} letras.`, chave: p.chave };
      if (texto) respostas[p.chave] = texto;
    }
  }
  return { ok: true, respostas };
}

/** WhatsApp como o banco guarda: 55 + DDD + número (10 ou 11 dígitos depois do 55). Nulo = inválido. */
export function normalizarWhatsapp(bruto: string): string | null {
  let digitos = bruto.replace(/\D/g, "");
  if (/^[1-9]\d{9,10}$/.test(digitos)) digitos = `55${digitos}`;
  return /^55[1-9]\d{9,10}$/.test(digitos) ? digitos : null;
}

/** Nota baixa (vira alerta): atendimento ou comida até 2, ou indicaria até 6. Igual ao banco. */
export function ehNotaBaixa(n: { atendimento: number | null; comida: number | null; nps: number | null }): boolean {
  return (n.atendimento !== null && n.atendimento <= 2) || (n.comida !== null && n.comida <= 2) || (n.nps !== null && n.nps <= 6);
}

export function rotuloOpcao(chave: "espera" | "conheceu", valor: string | null | undefined): string {
  if (!valor) return "";
  const lista = chave === "espera" ? OPCOES_ESPERA : OPCOES_CONHECEU;
  return lista.find((o) => o.valor === valor)?.rotulo ?? valor;
}
