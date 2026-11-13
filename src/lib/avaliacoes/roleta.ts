// Avaliações: roleta de prêmios no fim da pesquisa dos apps (13/11/2026). Funções puras; o banco
// sorteia, gera o código e confere tudo de novo (supabase/migrations/20261113170000_avaliacoes_roleta.sql).

export const LIMITE_PREMIOS = 8;
export const LIMITE_NOME_PREMIO = 60;
export const LIMITE_REGRA_PREMIO = 120;
export const VALIDADE_PADRAO_DIAS = 30;

export type PremioEntrada = { id?: string | null; nome: string; regra: string; peso: number };
export type PremioValidado = { id: string | null; nome: string; regra: string | null; peso: number };
/** Prêmio como a página pública recebe (sem o peso: a chance não vai ao navegador). */
export type PremioPublico = { id: string; nome: string; regra: string | null };

const UUID = /^[0-9a-f-]{36}$/;

/** Mesmas regras de `avaliacoes_salvar_roleta`: até 8 prêmios, nome de 2 a 60 letras, regra até
 * 120, peso de 1 a 100, validade de 1 a 180 dias e ao menos um prêmio para ligar. */
export function validarRoleta(e: {
  ativa: boolean;
  validadeDias: number;
  premios: PremioEntrada[];
}): { ok: true; ativa: boolean; validadeDias: number; premios: PremioValidado[] } | { ok: false; erro: string } {
  if (!Number.isInteger(e.validadeDias) || e.validadeDias < 1 || e.validadeDias > 180) return { ok: false, erro: "A validade do cupom deve ser de 1 a 180 dias." };
  const premios: PremioValidado[] = [];
  for (const p of e.premios) {
    const nome = String(p.nome ?? "").replace(/\s+/g, " ").trim();
    const regra = String(p.regra ?? "").replace(/\s+/g, " ").trim();
    if (!nome && !regra) continue;
    if (nome.length < 2 || nome.length > LIMITE_NOME_PREMIO) return { ok: false, erro: `O nome de cada prêmio deve ter de 2 a ${LIMITE_NOME_PREMIO} letras.` };
    if (regra.length > LIMITE_REGRA_PREMIO) return { ok: false, erro: `A regra de cada prêmio pode ter até ${LIMITE_REGRA_PREMIO} letras.` };
    if (!Number.isInteger(p.peso) || p.peso < 1 || p.peso > 100) return { ok: false, erro: "A chance de cada prêmio deve ser de 1 a 100." };
    premios.push({ id: p.id && UUID.test(p.id) ? p.id : null, nome, regra: regra || null, peso: p.peso });
  }
  if (premios.length > LIMITE_PREMIOS) return { ok: false, erro: `Cadastre até ${LIMITE_PREMIOS} prêmios.` };
  if (e.ativa && premios.length === 0) return { ok: false, erro: "Cadastre ao menos um prêmio para ligar a roleta." };
  return { ok: true, ativa: e.ativa, validadeDias: e.validadeDias, premios };
}

/** Chance de cada prêmio em % (peso dividido pela soma dos pesos), arredondada. */
export function chances(premios: { peso: number }[]): number[] {
  const total = premios.reduce((a, p) => a + (p.peso > 0 ? p.peso : 0), 0);
  return premios.map((p) => (total > 0 && p.peso > 0 ? Math.round((p.peso / total) * 100) : 0));
}

/** Giro final da roda (graus) para o ponteiro, no topo, parar no meio da fatia `indice`. Fatias de
 * tamanho igual (o sorteio é do banco; a roda só mostra o resultado). */
export function anguloFinal(indice: number, total: number, voltas = 6): number {
  const fatia = 360 / total;
  const centro = indice * fatia + fatia / 2;
  return voltas * 360 + (360 - centro);
}

/** "ABC234" do jeito que a pessoa digitar ("abc 234", "abc-234"). */
export function normalizarCodigo(bruto: string): string {
  return String(bruto ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function codigoValido(codigo: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(codigo);
}

/** Cupom passou da validade? */
export function cupomVencido(validoAte: string, agora: Date = new Date()): boolean {
  return new Date(validoAte) < agora;
}

export type ResumoCupons = { emitidos: number; usados: number; vencidos: number; abertos: number; taxaUso: number | null };

/** Cupons do período: emitidos, usados (viraram pedido direto), vencidos sem uso e em aberto. */
export function resumirCupons(cupons: { usadoEm: string | null; validoAte: string }[], agora: Date = new Date()): ResumoCupons {
  const usados = cupons.filter((c) => c.usadoEm).length;
  const vencidos = cupons.filter((c) => !c.usadoEm && new Date(c.validoAte) < agora).length;
  return {
    emitidos: cupons.length,
    usados,
    vencidos,
    abertos: cupons.length - usados - vencidos,
    taxaUso: cupons.length ? Math.round((usados / cupons.length) * 100) : null,
  };
}
