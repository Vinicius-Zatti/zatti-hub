// Avaliações: perguntas. As do modelo têm tipo e opções fixos (a gestão liga, desliga por pesquisa,
// muda o texto e a ordem); desde 14/11/2026 a gestão também cria as próprias (estrelas, sim ou não,
// lista de opções ou texto). Espelho de `avaliacoes_pergunta_no_tipo`, `avaliacoes_validar_perguntas`,
// `avaliacoes_pergunta_vale` e `avaliacoes_registrar` no banco (migrações 20261113150000 e
// 20261114120000), que é a barreira de verdade.
// Funções puras: servem à página pública e ao painel.
//
// 13/11/2026: cada tipo de pesquisa ganhou as próprias perguntas (antes delivery e app perguntavam
// "quanto tempo você esperou?"), modeladas no Falaê. "Espera" em faixas sai do modelo; fica só para
// ler respostas antigas.

/** Perguntas do modelo (fixas). */
export type ChaveFixa =
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
/** Pergunta criada pela gestão (14/11/2026): "extra_" + 6 letras ou números. */
export type ChaveLivre = `extra_${string}`;
export type ChavePergunta = ChaveFixa | ChaveLivre;
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
  /** Criada pela gestão (tipo, opções e pesquisas editáveis; pode ser apagada). */
  livre?: boolean;
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
export const CHAVES_ESTRELAS = CATALOGO.filter((p) => p.tipo === "estrelas").map((p) => p.chave as ChaveFixa);

/** Texto do comentário conforme as notas: nota baixa pergunta o que aconteceu, nota alta o que
 * mais gostou; no meio vale o texto da gestão. */
export const TEXTO_COMENTARIO_RUIM = "Poxa, sentimos muito. O que aconteceu?";
export const TEXTO_COMENTARIO_OTIMO = "Que bom! O que você mais gostou?";

export const LIMITE_TEXTO_PERGUNTA = 200;
export const LIMITE_COMENTARIO = 1000;
export const LIMITE_CONHECEU_OUTRO = 80;
export const LIMITE_ATENDENTES = 30;
export const LIMITE_NOME_ATENDENTE = 40;
export const LIMITE_LIVRES = 10;
export const LIMITE_OPCOES = 8;
export const LIMITE_TEXTO_OPCAO = 40;

/** Tipos que a gestão escolhe ao criar uma pergunta. */
export type TipoLivre = "estrelas" | "simnao" | "escolha" | "texto";
export const TIPOS_LIVRES: readonly TipoLivre[] = ["estrelas", "simnao", "escolha", "texto"];

/** Configuração gravada em `avaliacoes_pesquisa_versoes.perguntas`, na ordem da página.
 * `origens`: em que pesquisas vale (do modelo: parte das do catálogo; sem o campo, todas as do
 * catálogo). `tipo`, `opcoes` e `obrigatoria` só nas perguntas da gestão. */
export type PerguntaConfig = {
  chave: ChavePergunta;
  texto: string;
  ativa: boolean;
  origens?: Origem[];
  tipo?: TipoLivre;
  opcoes?: string[];
  obrigatoria?: boolean;
};

/** Pergunta pronta para a página pública: definição + texto da unidade. */
export type PerguntaPublica = DefinicaoPergunta & { texto: string };

export function definicao(chave: ChaveFixa): DefinicaoPergunta {
  const d = CATALOGO.find((p) => p.chave === chave);
  if (!d) throw new Error(`Pergunta desconhecida: ${chave}`);
  return d;
}

export function ehChaveFixa(valor: unknown): valor is ChaveFixa {
  return typeof valor === "string" && CATALOGO.some((p) => p.chave === valor);
}

export function ehChaveLivre(valor: unknown): valor is ChaveLivre {
  return typeof valor === "string" && /^extra_[a-z0-9]{6}$/.test(valor);
}

export function ehChavePergunta(valor: unknown): valor is ChavePergunta {
  return ehChaveFixa(valor) || ehChaveLivre(valor);
}

/** Chave nova para pergunta da gestão, sem repetir as que já existem. */
export function novaChaveLivre(existentes: readonly string[], aleatorio: () => number = Math.random): ChaveLivre {
  const letras = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (;;) {
    let sufixo = "";
    for (let i = 0; i < 6; i++) sufixo += letras[Math.floor(aleatorio() * letras.length) % letras.length];
    const chave: ChaveLivre = `extra_${sufixo}`;
    if (!existentes.includes(chave)) return chave;
  }
}

/** Em que pesquisas a pergunta pode valer (do modelo: as do catálogo; da gestão: as três). */
export function origensPossiveis(chave: ChavePergunta): readonly Origem[] {
  return ehChaveFixa(chave) ? definicao(chave).origens : ORIGENS;
}

/** Em que pesquisas a pergunta aparece hoje (ligada e marcada). */
export function origensDaPergunta(p: PerguntaConfig): Origem[] {
  if (!p.ativa) return [];
  return origensPossiveis(p.chave).filter((o) => (p.origens ? p.origens.includes(o) : !ehChaveLivre(p.chave)));
}

/** Definição completa: a do catálogo ou a montada da pergunta da gestão. */
export function definicaoDe(p: PerguntaConfig): DefinicaoPergunta {
  if (ehChaveFixa(p.chave)) return definicao(p.chave);
  const tipo = p.tipo ?? "estrelas";
  return {
    chave: p.chave,
    tipo,
    nome: p.texto.length > 48 ? `${p.texto.slice(0, 47)}…` : p.texto,
    textoPadrao: p.texto,
    obrigatoria: p.obrigatoria === true,
    origens: p.origens ?? [],
    opcoes: tipo === "escolha" ? (p.opcoes ?? []).map((o) => ({ valor: o, rotulo: o })) : undefined,
    livre: true,
  };
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

function lerOrigensDaPergunta(valor: unknown, possiveis: readonly Origem[]): Origem[] | undefined {
  if (!Array.isArray(valor)) return undefined;
  return possiveis.filter((o) => valor.includes(o));
}

/** Lê o JSON do banco na ordem gravada (a ordem da página). Pergunta do modelo que falta entra
 * desligada no fim; a "espera" antiga e o que não se reconhece saem. Nunca lança. */
export function lerPerguntas(bruto: unknown): PerguntaConfig[] {
  const lista = Array.isArray(bruto) ? (bruto as Record<string, unknown>[]) : [];
  const saida: PerguntaConfig[] = [];
  const vistas = new Set<string>();
  for (const q of lista) {
    if (!q || typeof q !== "object" || vistas.has(String(q.chave))) continue;
    const chave = q.chave;
    if (ehChaveFixa(chave)) {
      const def = definicao(chave);
      if (def.origens.length === 0) continue;
      vistas.add(chave);
      const origens = lerOrigensDaPergunta(q.origens, def.origens);
      saida.push({
        chave,
        texto: typeof q.texto === "string" && q.texto.trim() ? q.texto : def.textoPadrao,
        ativa: q.ativa === true,
        ...(origens ? { origens } : {}),
      });
    } else if (ehChaveLivre(chave) && typeof q.texto === "string" && (TIPOS_LIVRES as readonly unknown[]).includes(q.tipo)) {
      vistas.add(chave);
      const tipo = q.tipo as TipoLivre;
      saida.push({
        chave,
        texto: q.texto,
        ativa: q.ativa === true,
        origens: lerOrigensDaPergunta(q.origens, ORIGENS) ?? [],
        tipo,
        obrigatoria: q.obrigatoria === true,
        ...(tipo === "escolha" ? { opcoes: Array.isArray(q.opcoes) ? q.opcoes.filter((o): o is string => typeof o === "string") : [] } : {}),
      });
    }
  }
  for (const def of CATALOGO_EDITAVEL) {
    if (!vistas.has(def.chave)) saida.push({ chave: def.chave, texto: def.textoPadrao, ativa: false });
  }
  return saida;
}

const INVALIDA = { ok: false as const, erro: "Lista de perguntas inválida. Recarregue a página." };

/** Mesmas regras de `avaliacoes_validar_perguntas`: as do modelo uma vez cada (todas), as da
 * gestão com tipo, opções e pesquisas. Recebe dado cru (vem do navegador) e devolve a lista
 * normalizada, só com os campos que o banco aceita, ou o erro. */
export function validarPerguntas(perguntas: unknown): { ok: true; perguntas: PerguntaConfig[] } | { ok: false; erro: string } {
  if (!Array.isArray(perguntas) || perguntas.length === 0 || perguntas.length > CATALOGO_EDITAVEL.length + LIMITE_LIVRES) return INVALIDA;
  const vistas = new Set<string>();
  const saida: PerguntaConfig[] = [];
  let livres = 0;
  for (const bruta of perguntas as Record<string, unknown>[]) {
    if (!bruta || typeof bruta !== "object") return INVALIDA;
    const chave = bruta.chave;
    if (!ehChavePergunta(chave) || chave === "espera" || vistas.has(chave) || typeof bruta.ativa !== "boolean") return INVALIDA;
    vistas.add(chave);
    const texto = (typeof bruta.texto === "string" ? bruta.texto : "").trim();
    const possiveis = origensPossiveis(chave);
    let origens: Origem[] | undefined;
    if (bruta.origens !== undefined) {
      const lista = bruta.origens;
      if (!Array.isArray(lista) || lista.some((o) => !ehOrigem(o) || !possiveis.includes(o)) || new Set(lista).size !== lista.length) return INVALIDA;
      origens = possiveis.filter((o) => lista.includes(o));
    }
    if (ehChaveLivre(chave)) {
      livres++;
      const tipo = bruta.tipo as TipoLivre;
      if (!TIPOS_LIVRES.includes(tipo) || typeof bruta.obrigatoria !== "boolean") return INVALIDA;
      if (texto.length < 3 || texto.length > LIMITE_TEXTO_PERGUNTA) return { ok: false, erro: `O texto da pergunta deve ter de 3 a ${LIMITE_TEXTO_PERGUNTA} letras.` };
      if (!origens || origens.length === 0) return { ok: false, erro: `Escolha em que pesquisa aparece "${texto}".` };
      const nova: PerguntaConfig = { chave, texto, ativa: bruta.ativa, origens, tipo, obrigatoria: bruta.obrigatoria };
      if (tipo === "escolha") {
        const opcoes = Array.isArray(bruta.opcoes) ? bruta.opcoes.map((o) => (typeof o === "string" ? o.trim() : "")) : [];
        if (opcoes.length < 2 || opcoes.length > LIMITE_OPCOES) return { ok: false, erro: `"${texto}" precisa de 2 a ${LIMITE_OPCOES} opções.` };
        if (opcoes.some((o) => !o || o.length > LIMITE_TEXTO_OPCAO)) return { ok: false, erro: `Cada opção pode ter de 1 a ${LIMITE_TEXTO_OPCAO} letras.` };
        if (new Set(opcoes.map((o) => o.toLowerCase())).size !== opcoes.length) return { ok: false, erro: `"${texto}" tem opção repetida.` };
        nova.opcoes = opcoes;
      }
      saida.push(nova);
    } else {
      if (texto.length < 3 || texto.length > LIMITE_TEXTO_PERGUNTA) {
        return { ok: false, erro: `O texto de "${definicao(chave).nome}" deve ter de 3 a ${LIMITE_TEXTO_PERGUNTA} letras.` };
      }
      saida.push({ chave, texto, ativa: bruta.ativa, ...(origens ? { origens } : {}) });
    }
  }
  if (CATALOGO_EDITAVEL.some((d) => !vistas.has(d.chave))) return { ok: false, erro: "Lista de perguntas incompleta. Recarregue a página." };
  if (livres > LIMITE_LIVRES) return { ok: false, erro: `Crie até ${LIMITE_LIVRES} perguntas próprias.` };
  if (!saida.some((p) => p.ativa)) return { ok: false, erro: "Deixe ao menos uma pergunta ligada." };
  return { ok: true, perguntas: saida };
}

/** Liga ou desliga a pergunta só nesta pesquisa (as outras ficam como estão). */
export function alternarNaOrigem(p: PerguntaConfig, origem: Origem, ligar: boolean): PerguntaConfig {
  const atuais = origensDaPergunta(p);
  const possiveis = origensPossiveis(p.chave);
  const novas = ligar ? possiveis.filter((o) => o === origem || atuais.includes(o)) : atuais.filter((o) => o !== origem);
  const livre = ehChaveLivre(p.chave);
  if (novas.length === 0) return livre ? { ...p, ativa: false } : { chave: p.chave, texto: p.texto, ativa: false };
  if (!livre && novas.length === possiveis.length) return { chave: p.chave, texto: p.texto, ativa: true };
  return { ...p, ativa: true, origens: novas };
}

/** Sobe ou desce a pergunta passando a vizinha que aparece na mesma pesquisa. A lista é uma só
 * para os três tipos; entre as duas pode haver perguntas de outros tipos, e quem pula por cima
 * delas é a que não divide pesquisa com elas, para a ordem dos outros tipos não mudar. */
export function moverNaOrigem(lista: PerguntaConfig[], chave: ChavePergunta, origem: Origem, direcao: "subir" | "descer"): PerguntaConfig[] {
  const visiveis = lista.map((p, i) => ({ p, i })).filter(({ p }) => origensDaPergunta(p).includes(origem) && p.chave !== "comentario");
  const pos = visiveis.findIndex(({ p }) => p.chave === chave);
  const vizinha = visiveis[direcao === "subir" ? pos - 1 : pos + 1];
  if (pos < 0 || !vizinha) return lista;
  const de = visiveis[pos].i;
  const ate = vizinha.i;
  const [ini, fim] = de < ate ? [de, ate] : [ate, de];
  const entre = lista.slice(ini + 1, fim);
  const conflita = (p: PerguntaConfig) => entre.some((q) => origensDaPergunta(q).some((o) => origensDaPergunta(p).includes(o)));
  // Quem pula: a pergunta movida (padrão) ou a vizinha, se só ela pode pular sem bagunçar outro tipo.
  const pulaVizinha = conflita(lista[de]) && !conflita(lista[ate]);
  const [quem, destino] = pulaVizinha ? [ate, de] : [de, ate];
  const nova = [...lista];
  const [item] = nova.splice(quem, 1);
  const alvo = nova.indexOf(lista[destino]);
  // Fica antes do destino quando vai para cima dele, depois quando vai para baixo.
  nova.splice(quem > destino ? alvo : alvo + 1, 0, item);
  return nova;
}

/** Perguntas que valem neste tipo de pesquisa, na ordem gravada. "Quem atendeu" só entra com ao
 * menos um nome cadastrado. */
export function perguntasDoTipo(config: PerguntaConfig[], origem: Origem, atendentes: readonly string[] = []): PerguntaPublica[] {
  return config
    .filter((p) => origensDaPergunta(p).includes(origem))
    .map((p) => ({ ...definicaoDe(p), texto: p.texto }))
    .filter((p) => p.tipo !== "atendente" || atendentes.length > 0);
}

/** Respostas como vão para a RPC: notas em número, sim/não em booleano, escolhas em texto. */
export type RespostasEnvio = { [chave: string]: number | string | boolean | undefined };

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
export type NotasAvaliacao = { [chave: string]: number | boolean | string | null | undefined };

/** Nota baixa (vira alerta): qualquer estrela até 2 (do modelo ou das perguntas da gestão),
 * indicaria até 6 ou pedido que veio errado. Igual ao banco. Nas perguntas da gestão só as
 * estrelas chegam aqui como número. */
export function ehNotaBaixa(n: NotasAvaliacao): boolean {
  const estrelaBaixa = Object.entries(n).some(
    ([c, v]) => typeof v === "number" && v <= 2 && ((CHAVES_ESTRELAS as readonly string[]).includes(c) || ehChaveLivre(c)),
  );
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
