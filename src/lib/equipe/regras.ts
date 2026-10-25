/** Regras puras do cadastro de equipe pelo cliente (sem Next.js nem Supabase),
 * testáveis isoladas. A Server Action em `src/app/(app)/equipe/actions.ts`
 * chama todas antes de qualquer escrita - o formulário nunca é a única
 * barreira. Desenho em `_execucao/zatti-hub/equipe-cliente-v1.md`. */

import { randomInt } from "node:crypto";
import type { Role } from "@/lib/acesso";

/** Papéis que o gestor do cliente pode conceder. Master nunca. */
export type PapelEquipe = Extract<Role, "gestao" | "operacional">;

/** Validade da senha temporária enviada no cadastro ou no reenvio. */
export const DIAS_VALIDADE_SENHA_TEMPORARIA = 7;

/** Normaliza o WhatsApp para E.164. Aceita número brasileiro com ou sem DDI
 * (10 ou 11 dígitos com DDD, ou 12/13 começando com 55) e número
 * internacional já com "+". Retorna `null` quando não dá pra confiar. */
export function normalizarWhatsapp(bruto: string): string | null {
  const texto = bruto.trim();
  if (!texto) return null;
  const digitos = texto.replace(/\D/g, "");
  if (texto.startsWith("+") && !digitos.startsWith("55")) {
    return digitos.length >= 8 && digitos.length <= 15 && digitos[0] !== "0" ? `+${digitos}` : null;
  }
  const nacional = digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos;
  if (nacional.length !== 10 && nacional.length !== 11) return null;
  if (nacional[0] === "0" || nacional[2] === "0") return null;
  if (nacional.length === 11 && nacional[2] !== "9") return null;
  return `+55${nacional}`;
}

/** Mostra o WhatsApp sem expor o número inteiro (lista da equipe, auditoria). */
export function mascararWhatsapp(e164: string | null): string {
  if (!e164) return "-";
  return `(**) *****-${e164.slice(-4)}`;
}

// Sem 0/O, 1/l/I e similares: a pessoa digita a senha lendo no celular.
const ALFABETO_SENHA = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Senha temporária de 12 caracteres (~68 bits), gerada com `crypto`. Mesmo
 * mínimo de 12 caracteres da tela de redefinir senha. */
export function gerarSenhaTemporaria(tamanho = 12): string {
  let senha = "";
  for (let i = 0; i < tamanho; i++) senha += ALFABETO_SENHA[randomInt(ALFABETO_SENHA.length)];
  return senha;
}

export function expiracaoSenhaTemporaria(agora: Date): Date {
  return new Date(agora.getTime() + DIAS_VALIDADE_SENHA_TEMPORARIA * 24 * 60 * 60 * 1000);
}

/** Tela e ações de Equipe: gestão (master incluso) com a flag da
 * organização ligada. Flag desligada fecha tudo, inclusive para master. */
export function podeUsarEquipe(acesso: { role: Role; equipeHabilitado: boolean }): boolean {
  return (acesso.role === "gestao" || acesso.role === "master") && acesso.equipeHabilitado;
}

/** Quem está concedendo: papel efetivo e, se o vínculo do gestor for preso a
 * uma unidade, qual. Master administra a organização escolhida inteira. */
export type Concedente = { role: Role; unidadeFixa: string | null };

export type ResultadoConcessao =
  | { ok: true; role: PapelEquipe; unidadeId: string | null }
  | { ok: false; erro: string };

/** Valida papel e unidade de um vínculo novo contra o escopo de quem concede.
 * `unidadesDaOrganizacao` vem do banco (unidades ativas da organização da
 * sessão), nunca do formulário. */
export function validarConcessao(params: {
  concedente: Concedente;
  role: string;
  unidadeId: string | null;
  unidadesDaOrganizacao: ReadonlySet<string>;
}): ResultadoConcessao {
  const { concedente, role, unidadeId, unidadesDaOrganizacao } = params;
  if (concedente.role !== "gestao" && concedente.role !== "master") {
    return { ok: false, erro: "Só a gestão cadastra a equipe." };
  }
  if (role !== "gestao" && role !== "operacional") {
    return { ok: false, erro: "Função inválida." };
  }
  if (role === "operacional" && !unidadeId) {
    return { ok: false, erro: "Operacional precisa de uma unidade." };
  }
  if (unidadeId && !unidadesDaOrganizacao.has(unidadeId)) {
    return { ok: false, erro: "Unidade não pertence a este cliente." };
  }
  if (concedente.unidadeFixa) {
    if (!unidadeId) return { ok: false, erro: "Você só pode dar acesso à sua unidade." };
    if (unidadeId !== concedente.unidadeFixa) {
      return { ok: false, erro: "Você só pode dar acesso à sua unidade." };
    }
  }
  return { ok: true, role, unidadeId };
}

/** O gestor pode mexer (reenviar, revogar, reativar, editar WhatsApp) neste
 * vínculo? Mesmo recorte da concessão, mais: nunca master, nunca o próprio. */
export function podeAdministrarVinculo(params: {
  concedente: Concedente & { userId: string; organizacaoId: string };
  alvo: { userId: string; organizacaoId: string; unidadeId: string | null; role: string };
}): boolean {
  const { concedente, alvo } = params;
  if (concedente.role !== "gestao" && concedente.role !== "master") return false;
  if (alvo.role === "master") return false;
  if (alvo.userId === concedente.userId) return false;
  if (alvo.organizacaoId !== concedente.organizacaoId) return false;
  if (concedente.unidadeFixa && alvo.unidadeId !== concedente.unidadeFixa) return false;
  return true;
}

/** Ordem fixa para escolher o vínculo quando a pessoa tem mais de um na mesma
 * organização: gestão antes de operacional, organização inteira antes de
 * unidade, mais antigo primeiro, e id como desempate final. Antes dependia da ordem que o banco
 * devolvia. */
export function ordenarVinculos<
  T extends { id?: string; role: Role; unidade_id: string | null; created_at?: string | null },
>(vinculos: readonly T[]): T[] {
  const peso = (r: Role) => (r === "master" ? 0 : r === "gestao" ? 1 : 2);
  return [...vinculos].sort(
    (a, b) =>
      peso(a.role) - peso(b.role) ||
      Number(a.unidade_id !== null) - Number(b.unidade_id !== null) ||
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) ||
      String(a.id ?? "").localeCompare(String(b.id ?? "")),
  );
}

/** Mensagem de boas-vindas que o Vini manda pelo WhatsApp de Vinícius. Montada
 * no app só para pré-visualização em teste; o texto real é montado no Vini a
 * partir dos campos, para a rota não virar disparo genérico. */
export type DadosBoasVindas = {
  nome: string;
  email: string;
  organizacaoNome: string;
  senhaTemporaria: string | null;
  validaAte: Date | null;
  url: string;
};

// ── Senha provisória para conta que já existe (24/10/2026) ─────────────
// A troca de estado e a conferência de quem pode são do banco
// (`gerar_senha_provisoria_conta`, migration 20261024150000). Aqui só o que
// o servidor faz com a resposta.

/** Respostas de `gerar_senha_provisoria_conta`. */
export type CodigoGerarProvisoria =
  | "ok"
  | "sem_permissao"
  | "nao_encontrado"
  | "propria_conta"
  | "outra_organizacao"
  | "outra_unidade"
  | "limite"
  | "limite_ator"
  | "whatsapp_recente";

/** Texto para a tela a partir da resposta do banco. `null` = deu certo.
 * Resposta desconhecida vira erro genérico (falha fechada). */
export function mensagemGerarProvisoria(codigo: unknown): string | null {
  switch (codigo) {
    case "ok":
      return null;
    case "sem_permissao":
      return "Você não tem permissão para gerar senha provisória.";
    case "nao_encontrado":
      return "Acesso não encontrado.";
    case "propria_conta":
      return "Para trocar a sua própria senha, use \"Esqueci minha senha\" na tela de login.";
    case "outra_organizacao":
      return "Essa pessoa também tem acesso a outro cliente no Zatti Hub. Peça para a Zatti gerar a senha provisória dela.";
    case "outra_unidade":
      return "Essa pessoa também tem acesso a outra unidade. Peça para a gestão geral do cliente gerar a senha provisória.";
    case "limite":
      return "Espere 2 minutos entre uma senha provisória e outra.";
    case "limite_ator":
      return "Você gerou várias senhas provisórias em pouco tempo. Por segurança, espere 10 minutos.";
    case "whatsapp_recente":
      return "O WhatsApp desta pessoa mudou agora há pouco. Por segurança, espere 30 minutos ou peça à Zatti.";
    default:
      return "Não foi possível gerar a senha provisória.";
  }
}

/** Validade da provisória para mostrar na tela, no horário de Brasília
 * (DD/MM/AAAA às HH:MM). O instante vem do servidor; fuso explícito. */
export function formatarValidadeProvisoria(validaAte: Date): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(validaAte);
  const p = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("day")}/${p("month")}/${p("year")} às ${p("hour")}:${p("minute")}`;
}

/** Espera depois de trocar o WhatsApp do vínculo antes de mandar senha
 * provisória de conta redefinida para ele (o banco confere o mesmo). */
export const MINUTOS_ESPERA_WHATSAPP_TROCADO = 30;

export function whatsappTrocadoHaPouco(alteradoEm: string | null, agora: Date): boolean {
  if (!alteradoEm) return false;
  const quando = new Date(alteradoEm).getTime();
  if (Number.isNaN(quando)) return true; // na dúvida, espera (falha fechada)
  return agora.getTime() - quando < MINUTOS_ESPERA_WHATSAPP_TROCADO * 60_000;
}
