// Freelancers (22/11/2026): regras puras, sem Next nem Supabase, usadas na tela, nas Server
// Actions e na página do QR. O banco confere tudo de novo (20261122130000_freelancers.sql).

export { normalizarWhatsapp } from "@/lib/avaliacoes/perguntas";

export type SituacaoFreelancer = "novo" | "ativo" | "inativo";
export type EstadoCheckin = "pendente" | "conferido" | "recusado";
export type AvisoTitulo = "financeiro_desligado" | "sem_conta_freelancers" | "mes_fechado" | "sem_conta_caixa" | "titulo_ja_pago" | "titulo_editado";

export const LIMITE_NOME = 80;
export const LIMITE_FUNCAO = 40;
export const DIARIA_MAXIMA = 10000;

/** Funções sugeridas no check-in e no cadastro (a pessoa pode escrever outra). */
export const FUNCOES_SUGERIDAS = ["Garçom", "Cozinha", "Chapeiro", "Pizzaiolo", "Caixa", "Entregador", "Limpeza", "Bar"] as const;

export type Freelancer = {
  id: string;
  nome: string;
  whatsapp: string;
  funcao: string | null;
  diaria: number | null;
  situacao: SituacaoFreelancer;
  criadoPeloQr: boolean;
};

export type Checkin = {
  id: string;
  freelancerId: string;
  nome: string;
  funcao: string | null;
  situacaoFreelancer: SituacaoFreelancer;
  /** Diária do cadastro (nula = padrão da unidade). */
  diariaCadastro: number | null;
  whatsapp: string;
  dia: string;
  entradaEm: string;
  origem: "qr" | "manual";
  nomeDigitado: string | null;
  aparelhoRepetido: boolean;
  estado: EstadoCheckin;
  valor: number | null;
  pagoNoCaixa: boolean;
  motivoRecusa: string | null;
  conferidoPorNome: string | null;
  lancamentoId: string | null;
  tituloGeradoEm: string | null;
  tituloARemover: string | null;
  tituloAviso: AvisoTitulo | null;
};

/** "5516999990001" -> "(16) 99999-0001". */
export function formatarWhatsapp(numero: string): string {
  const d = numero.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return numero;
}

export function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Hora local de São Paulo ("09:42") de um instante ISO. */
export function horaBrasil(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** Valor que a conferência sugere: a diária do cadastro ou, sem ela, a padrão da unidade. */
export function valorSugerido(diariaCadastro: number | null, diariaPadrao: number | null): number | null {
  return diariaCadastro ?? diariaPadrao ?? null;
}

/** Diária válida para gravar (R$ 1 a R$ 10.000, centavos). */
export function diariaValida(valor: number | null): valor is number {
  return valor !== null && Number.isFinite(valor) && valor >= 1 && valor <= DIARIA_MAXIMA && Math.round(valor * 100) === valor * 100;
}

/** O nome que a pessoa digitou no QR é diferente do cadastro (sem acento e caixa)? */
export function nomeDiferente(cadastro: string, digitado: string | null): boolean {
  if (!digitado) return false;
  const limpar = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  const a = limpar(cadastro);
  const b = limpar(digitado);
  if (!b || a === b) return false;
  // Só o primeiro nome digitado, quando bate com o começo do cadastro, não é diferença.
  return !a.split(" ").includes(b.split(" ")[0]);
}

export type ResumoDia = {
  total: number;
  pendentes: number;
  conferidos: number;
  recusados: number;
  /** Soma das diárias conferidas. */
  valorConferido: number;
  /** Parte das conferidas que o caixa já pagou. */
  pagoNoCaixa: number;
  /** Conferidas que ainda vão ser pagas (título em aberto). */
  aPagar: number;
};

export function resumoDoDia(checkins: readonly Pick<Checkin, "estado" | "valor" | "pagoNoCaixa">[]): ResumoDia {
  const conferidos = checkins.filter((c) => c.estado === "conferido");
  const centavos = (v: number | null) => Math.round((v ?? 0) * 100);
  const total = conferidos.reduce((s, c) => s + centavos(c.valor), 0);
  const caixa = conferidos.filter((c) => c.pagoNoCaixa).reduce((s, c) => s + centavos(c.valor), 0);
  return {
    total: checkins.length,
    pendentes: checkins.filter((c) => c.estado === "pendente").length,
    conferidos: conferidos.length,
    recusados: checkins.filter((c) => c.estado === "recusado").length,
    valorConferido: total / 100,
    pagoNoCaixa: caixa / 100,
    aPagar: (total - caixa) / 100,
  };
}

/** Explicações do (i) de cada número da tela Hoje e do Histórico. */
export const DICAS = {
  pendentes: "Check-ins de hoje que ainda esperam a conferência do gerente. Diária pendente não vai para o Contas a Pagar.",
  conferidos: "Check-ins de hoje que o gerente confirmou: a pessoa trabalhou e o valor da diária está certo.",
  valorConferido: "Soma das diárias conferidas no período. Recusadas e pendentes ficam de fora.",
  pagoNoCaixa: "Soma das diárias conferidas que o caixa já pagou. Esses títulos nascem quitados no Contas a Pagar.",
  aPagar: "Diárias conferidas menos as pagas pelo caixa. Esses títulos ficam em aberto no Contas a Pagar, com vencimento no dia trabalhado.",
} as const;

/** Onde a diária está no Financeiro, em linguagem simples. */
export function situacaoTitulo(c: Pick<Checkin, "estado" | "lancamentoId" | "tituloGeradoEm" | "tituloAviso" | "pagoNoCaixa" | "tituloARemover">): string {
  if (c.estado === "pendente") return c.tituloARemover ? "Tirando o título do Contas a Pagar" : "Aguardando conferência";
  if (c.estado === "recusado") return "Recusado, sem título";
  if (c.lancamentoId) {
    // Desfazer não conseguiu tirar o título: ele ficou e a diária voltou a conferida.
    if (c.tituloAviso === "titulo_ja_pago") return "No Contas a Pagar, já pago. Não deu para desfazer: fale com quem cuida do Financeiro";
    if (c.tituloAviso === "mes_fechado") return "No Contas a Pagar, em mês fechado. Não deu para desfazer: fale com quem cuida do Financeiro";
    if (c.tituloAviso === "titulo_editado") return "No Contas a Pagar, alterado no Financeiro. Não deu para desfazer: fale com quem cuida do Financeiro";
    return c.pagoNoCaixa ? "No Contas a Pagar, já pago pelo caixa" : "No Contas a Pagar, em aberto";
  }
  if (c.tituloGeradoEm) return "Título apagado no Financeiro";
  switch (c.tituloAviso) {
    case "financeiro_desligado":
      return "Conferida. O Financeiro desta unidade está desligado: o título nasce quando ligar";
    case "sem_conta_freelancers":
      return "Conferida. Falta a conta Freelancers no Plano de Contas";
    case "mes_fechado":
      return "Conferida. O mês está fechado no Financeiro";
    case "sem_conta_caixa":
      return "Conferida. Escolha a conta do caixa em Configurar";
    default:
      return "Conferida. Lançando no Contas a Pagar";
  }
}

/** Mensagem dos códigos que as RPCs devolvem ou levantam. */
export function mensagemCodigo(codigo: string): string {
  const mapa: Record<string, string> = {
    sem_permissao: "Você não tem permissão para mudar os Freelancers desta unidade.",
    nome_invalido: "O nome deve ter de 2 a 80 letras.",
    whatsapp_invalido: "Esse WhatsApp não parece válido. Confira o DDD e o número.",
    whatsapp_repetido: "Já existe um freelancer com esse WhatsApp nesta unidade.",
    funcao_invalida: "A função deve ter de 2 a 40 letras.",
    diaria_invalida: "A diária deve ser de R$ 1,00 a R$ 10.000,00.",
    valor_invalido: "A diária deve ser de R$ 1,00 a R$ 10.000,00.",
    situacao_invalida: "Situação inválida. Recarregue a página.",
    nao_encontrado: "Não encontrei esse registro. Recarregue a página.",
    conta_invalida: "Essa conta não é uma conta de caixa ativa desta unidade.",
    sem_configuracao: "Crie o QR Code da unidade antes.",
    ja_conferido: "Esse check-in já foi conferido por outra pessoa. A tela foi atualizada.",
    mes_fechado: "O mês desse dia está fechado no Financeiro. Peça a quem cuida do Financeiro para reabrir antes de conferir.",
    sem_conta_caixa: "Para marcar como pago pelo caixa, escolha antes a conta do caixa em Freelancers > Configurar.",
    motivo_invalido: "Escreva o motivo da recusa (de 2 a 200 letras).",
    ja_pendente: "Esse check-in já está aguardando conferência.",
    ja_pago: "Essa diária tem pagamento registrado no Financeiro e não desfaz por aqui. Fale com quem cuida do Financeiro.",
    titulo_apagado: "O título dessa diária foi apagado no Financeiro. Fale com quem cuida do Financeiro.",
    aguarde: "O título anterior ainda está saindo do Contas a Pagar. Recarregue a página e tente de novo.",
    dia_invalido: "Escolha um dia de hoje até 31 dias atrás.",
    ja_existe: "Essa pessoa já tem diária nesse dia.",
  };
  return mapa[codigo] ?? "Não foi possível salvar. Tente de novo.";
}

// ── Página do QR ─────────────────────────────────────────────────────────

export function slugValido(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,39}$/.test(slug);
}

/** https://zatti-hub.vercel.app/freela/lucaskinhas-pinhal */
export function urlPublicaFreela(slug: string, base: string): string {
  if (!slugValido(slug)) throw new Error("Endereço do check-in inválido.");
  return `${base.replace(/\/+$/, "")}/freela/${slug}`;
}

/** Textos da arte do QR (10 x 15 cm), no mesmo desenho da arte das Avaliações. */
export const ARTE_FREELA = {
  titulo: "Check-in do freelancer",
  chamada: "Chegou para trabalhar? Faça seu check-in",
  subtitulo: "Aponte a câmera do celular para o código e confirme seu WhatsApp. Leva 10 segundos.",
} as const;

export function nomeArquivoArteFreela(slug: string, extensao: "png" | "pdf"): string {
  return `qr-checkin-freelancer-${slug}.${extensao}`;
}

/** Validação do check-in pelo QR, antes do banco (que confere de novo). */
export function validarCheckin(entrada: { whatsapp: string | null; nome: string; funcao: string }):
  | { ok: true; nome: string; funcao: string | null }
  | { ok: false; erro: string; campo: "whatsapp" | "nome" | "funcao" } {
  if (!entrada.whatsapp) return { ok: false, erro: mensagemCodigo("whatsapp_invalido"), campo: "whatsapp" };
  const nome = entrada.nome.replace(/\s+/g, " ").trim();
  if (nome.length < 2 || nome.length > LIMITE_NOME) return { ok: false, erro: "Escreva seu nome (de 2 a 80 letras).", campo: "nome" };
  const funcao = entrada.funcao.replace(/\s+/g, " ").trim();
  if (funcao && (funcao.length < 2 || funcao.length > LIMITE_FUNCAO)) return { ok: false, erro: mensagemCodigo("funcao_invalida"), campo: "funcao" };
  return { ok: true, nome, funcao: funcao || null };
}
