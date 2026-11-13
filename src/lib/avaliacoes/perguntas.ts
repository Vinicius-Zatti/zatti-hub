// Avaliações: modelo fixo de perguntas. A gestão liga, desliga e muda o texto; o tipo, as opções,
// se é obrigatória e em que tipo de pesquisa vale vêm daqui. Espelho de `avaliacoes_pergunta_no_tipo`,
// `avaliacoes_validar_perguntas` e `avaliacoes_registrar` no banco
// (supabase/migrations/20261113150000_avaliacoes_perguntas_por_tipo.sql), que é a barreira de verdade.
// Funções puras: servem à página pública e ao painel.
//
// 13/11/2026: cada tipo de pesquisa ganhou as próprias perguntas (antes delivery e app perguntavam
// "quanto tempo você esperou?"), modeladas no Falaê. "Espera" em faixas sai do modelo; fica só para
// ler respostas antigas.

export type ChavePergunta =
  | "atendimento"
  | "pedido_certo"
  | "comida"
  | "embalagem"
  | "tempo"
  | "entrega"
  | "atendimento_pedido"
  | "ambiente"
  | "atendente"
  | "nps"
  | "comentario"
  | "conheceu"
  | "espera";
export type TipoPergunta = "estrelas" | "simnao" | "atendente" | "faixas" | "nps" | "escolha" | "texto";
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
  /** Linha menor embaixo da pergunta, fixa. */
  ajuda?: string;
  obrigatoria: boolean;
  /** Em que tipo de pesquisa a pergunta aparece. Vazio = só respostas antigas. */
  origens: readonly Origem[];
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

/** Resposta "não lembro o nome" de quem atendeu. */
export const NAO_LEMBRO = "nao_lembro";

const TODAS: readonly Origem[] = ORIGENS;

/** Ordem de exibição na página. */
export const CATALOGO: readonly DefinicaoPergunta[] = [
  { chave: "atendimento", tipo: "estrelas", nome: "Atendimento", textoPadrao: "Como você avalia o nosso atendimento?", obrigatoria: true, origens: ["salao"] },
  { chave: "pedido_certo", tipo: "simnao", nome: "Pedido certo", textoPadrao: "Seu pedido chegou certinho, sem faltar nada?", obrigatoria: true, origens: ["delivery", "app"] },
  { chave: "comida", tipo: "estrelas", nome: "Comida", textoPadrao: "E o sabor da comida?", obrigatoria: true, origens: TODAS },
  { chave: "embalagem", tipo: "estrelas", nome: "Temperatura e embalagem", textoPadrao: "Chegou quentinho e bem embalado?", obrigatoria: true, origens: ["delivery", "app"] },
  { chave: "tempo", tipo: "estrelas", nome: "Tempo até a mesa", textoPadrao: "E o tempo até o pedido chegar na mesa?", obrigatoria: true, origens: ["salao"] },
  { chave: "entrega", tipo: "estrelas", nome: "Tempo de entrega", textoPadrao: "E o tempo de entrega?", obrigatoria: true, origens: ["delivery"] },
  {
    chave: "atendimento_pedido",
    tipo: "estrelas",
    nome: "Atendimento no pedido",
    textoPadrao: "Como foi o atendimento no pedido?",
    ajuda: "No WhatsApp, no telefone ou no site.",
    obrigatoria: true,
    origens: ["delivery"],
  },
  { chave: "ambiente", tipo: "estrelas", nome: "Ambiente", textoPadrao: "E o nosso ambiente?", ajuda: "Limpeza, conforto, música.", obrigatoria: true, origens: ["salao"] },
  { chave: "atendente", tipo: "atendente", nome: "Quem atendeu", textoPadrao: "Quem atendeu você?", obrigatoria: false, origens: ["salao"] },
  {
    chave: "nps",
    tipo: "nps",
    nome: "Indicaria (0 a 10)",
    textoPadrao: "De 0 a 10, quanto você indicaria a gente para um amigo?",
    obrigatoria: true,
    origens: TODAS,
  },
  { chave: "comentario", tipo: "texto", nome: "Comentário", textoPadrao: "Ajude a gente a entender o que precisamos melhorar para ganhar um 9 ou 10.", obrigatoria: false, origens: TODAS },
  { chave: "conheceu", tipo: "escolha", nome: "Como conheceu", textoPadrao: "Como você conheceu a gente?", obrigatoria: false, origens: ["salao"], opcoes: OPCOES_CONHECEU },
  { chave: "espera", tipo: "faixas", nome: "Tempo de espera (antiga)", textoPadrao: "Quanto tempo você esperou?", obrigatoria: true, origens: [], opcoes: OPCOES_ESPERA },
];

/** Perguntas que a gestão vê e edita (a "espera" antiga fica de fora). */
export const CATALOGO_EDITAVEL = CATALOGO.filter((p) => p.origens.length > 0);
/** Desligadas de fábrica. */
const DESLIGADAS_PADRAO: readonly ChavePergunta[] = ["atendente"];
/** Notas de 1 a 5 (entram na nota baixa e nas médias). */
export const CHAVES_ESTRELAS = CATALOGO.filter((p) => p.tipo === "estrelas").map((p) => p.chave);

/** Texto do comentário conforme as notas: nota baixa pergunta o que aconteceu, nota alta o que
 * mais gostou; no meio vale o texto da gestão. */
export const TEXTO_COMENTARIO_RUIM = "Poxa, sentimos muito. O que aconteceu?";
export const TEXTO_COMENTARIO_OTIMO = "Que bom! O que você mais gostou?";

export const LIMITE_TEXTO_PERGUNTA = 200;
export const LIMITE_COMENTARIO = 1000;
export const LIMITE_CONHECEU_OUTRO = 80;
export const LIMITE_ATENDENTES = 30;
export const LIMITE_NOME_ATENDENTE = 40;

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
  return CATALOGO_EDITAVEL.map((p) => ({ chave: p.chave, texto: p.textoPadrao, ativa: !DESLIGADAS_PADRAO.includes(p.chave) }));
}

/** Lê o JSON do banco (ou do formulário) na ordem do catálogo editável; chave faltando entra
 * desligada com o texto padrão. Nunca lança. */
export function lerPerguntas(bruto: unknown): PerguntaConfig[] {
  const lista = Array.isArray(bruto) ? bruto : [];
  return CATALOGO_EDITAVEL.map((def) => {
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

/** Mesmas regras de `avaliacoes_validar_perguntas` para a lista do editor (todas as editáveis,
 * cada uma uma vez). Devolve a lista normalizada ou o erro. */
export function validarPerguntas(perguntas: PerguntaConfig[]): { ok: true; perguntas: PerguntaConfig[] } | { ok: false; erro: string } {
  if (perguntas.length !== CATALOGO_EDITAVEL.length) return { ok: false, erro: "Lista de perguntas incompleta. Recarregue a página." };
  const vistas = new Set<string>();
  const saida: PerguntaConfig[] = [];
  for (const p of perguntas) {
    if (!ehChavePergunta(p.chave) || p.chave === "espera" || vistas.has(p.chave) || typeof p.ativa !== "boolean") {
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

/** Perguntas ligadas que valem neste tipo de pesquisa, na ordem do catálogo. "Quem atendeu" só
 * entra com ao menos um nome cadastrado. */
export function perguntasDoTipo(config: PerguntaConfig[], origem: Origem, atendentes: readonly string[] = []): PerguntaPublica[] {
  return config
    .filter((p) => p.ativa)
    .map((p) => ({ ...definicao(p.chave), texto: p.texto }))
    .filter((p) => p.origens.includes(origem) && (p.tipo !== "atendente" || atendentes.length > 0));
}

/** Respostas como vão para a RPC: notas em número, sim/não em booleano, escolhas em texto. */
export type RespostasEnvio = Partial<Record<ChavePergunta, number | string | boolean>> & { conheceu_outro?: string };

export type ResultadoRespostas = { ok: true; respostas: RespostasEnvio } | { ok: false; erro: string; chave: ChavePergunta };

// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function inteiro(bruto: unknown): number | null {
  if (typeof bruto === "number" && Number.isInteger(bruto)) return bruto;
  if (typeof bruto === "string" && /^\d{1,2}$/.test(bruto.trim())) return Number(bruto.trim());
  return null;
}

/** Valida as respostas (texto cru) contra as perguntas do tipo. O banco valida de novo; aqui é
 * para a pessoa ver o erro na hora e para a RPC receber tipos certos. */
export function validarRespostas(perguntas: PerguntaPublica[], brutas: Record<string, unknown>, atendentes: readonly string[] = []): ResultadoRespostas {
  const respostas: RespostasEnvio = {};
  for (const p of perguntas) {
    const bruto = brutas[p.chave];
    const vazio = bruto === undefined || bruto === null || (typeof bruto === "string" && bruto.trim() === "");
    if (vazio) {
      if (p.obrigatoria) return { ok: false, erro: "Responda todas as perguntas.", chave: p.chave };
      continue;
    }
    if (p.tipo === "estrelas" || p.tipo === "nps") {
      const n = inteiro(bruto);
      const [min, max] = p.tipo === "nps" ? [0, 10] : [1, 5];
      if (n === null || n < min || n > max) return { ok: false, erro: "Há uma nota fora do intervalo.", chave: p.chave };
      respostas[p.chave] = n;
    } else if (p.tipo === "simnao") {
      if (bruto !== "sim" && bruto !== "nao") return { ok: false, erro: "Há uma opção inválida.", chave: p.chave };
      respostas[p.chave] = bruto === "sim";
    } else if (p.tipo === "atendente") {
      if (typeof bruto !== "string" || !(bruto === NAO_LEMBRO || atendentes.includes(bruto))) {
        return { ok: false, erro: "Há uma opção inválida.", chave: p.chave };
      }
      respostas[p.chave] = bruto;
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

/** Notas de uma avaliação, como o banco e a página usam para a nota baixa. */
export type NotasAvaliacao = Partial<Record<ChavePergunta, number | boolean | string | null>>;

/** Nota baixa (vira alerta): qualquer estrela até 2, indicaria até 6 ou pedido que veio errado.
 * Igual ao banco. */
export function ehNotaBaixa(n: NotasAvaliacao): boolean {
  const estrelaBaixa = CHAVES_ESTRELAS.some((c) => typeof n[c] === "number" && (n[c] as number) <= 2);
  return estrelaBaixa || (typeof n.nps === "number" && n.nps <= 6) || n.pedido_certo === false;
}

/** Tom da pergunta final, pela nota de indicação (Vinícius, 13/11/2026: "deu nota 7 e você fala
 * poxa, sentimos muito... não é pra um poxa"). 0 a 6: ruim ("o que aconteceu?"); 7 ou 8: médio
 * ("o que melhorar para ganhar 9 ou 10"); 9 ou 10 sem nada ruim: ótimo ("o que mais gostou").
 * Sem a pergunta de indicação, vale a nota baixa das outras. O alerta segue `ehNotaBaixa`. */
export function humorDaAvaliacao(n: NotasAvaliacao): "ruim" | "otimo" | "medio" {
  if (typeof n.nps === "number") {
    if (n.nps <= 6) return "ruim";
    if (n.nps <= 8) return "medio";
    return ehNotaBaixa(n) ? "medio" : "otimo";
  }
  return ehNotaBaixa(n) ? "ruim" : "medio";
}

export function rotuloOpcao(chave: "espera" | "conheceu", valor: string | null | undefined): string {
  if (!valor) return "";
  const lista = chave === "espera" ? OPCOES_ESPERA : OPCOES_CONHECEU;
  return lista.find((o) => o.valor === valor)?.rotulo ?? valor;
}

/** "Não lembra" ou o nome. */
export function rotuloAtendente(valor: string | null | undefined): string {
  if (!valor) return "";
  return valor === NAO_LEMBRO ? "Não lembra o nome" : valor;
}

/** Lista de nomes de quem atende: sem espaços sobrando, sem vazio e sem repetir (maiúscula não
 * conta). Mesmas regras de `avaliacoes_salvar_extras`. */
export function normalizarAtendentes(nomes: readonly string[]): { ok: true; nomes: string[] } | { ok: false; erro: string } {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const bruto of nomes) {
    const nome = String(bruto ?? "").replace(/\s+/g, " ").trim();
    if (!nome || vistos.has(nome.toLowerCase())) continue;
    if (nome.length > LIMITE_NOME_ATENDENTE) return { ok: false, erro: `Cada nome pode ter até ${LIMITE_NOME_ATENDENTE} letras.` };
    if (nome.toLowerCase() === NAO_LEMBRO) return { ok: false, erro: "Nome inválido." };
    vistos.add(nome.toLowerCase());
    saida.push(nome);
  }
  if (saida.length > LIMITE_ATENDENTES) return { ok: false, erro: `Cadastre até ${LIMITE_ATENDENTES} nomes.` };
  return { ok: true, nomes: saida };
}
