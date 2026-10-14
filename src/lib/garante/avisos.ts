import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { textoMeta } from "./regras";
import type { TipoItemGarante } from "./biblioteca";

// Avisos do Checklist Garante pelo WhatsApp do Vini (13/10/2026, decisão 1 de Vinícius).
// Função pura: o banco gera as pendências (garante_avisos), o Hub monta o texto, o Vini só
// envia e confirma. Avisos do mesmo ciclo vão juntos numa mensagem (lista). Sem emoji, sem
// travessão, sem dado sensível (nome do checklist, horário, item, valor e primeiro nome).

export type TipoAviso = "atrasado" | "nao_concluido" | "critico_fora_da_meta";

/** O que `garante_avisos.detalhes` guarda (chaves como o banco grava). */
export type DetalhesAviso = {
  modelo_nome?: string | null;
  horario_limite?: string | null;
  data?: string | null;
  responsavel_nome?: string | null;
  item_titulo?: string | null;
  item_tipo?: string | null;
  valor_bool?: boolean | null;
  valor_numero?: number | string | null;
  meta_min?: number | string | null;
  meta_max?: number | string | null;
};

export type AvisoParaEnvio = { chave: string; tipo: TipoAviso; evento_em: string; detalhes: DetalhesAviso };

export const RESULTADOS_ENVIO = ["enviado", "falhou", "incerto"] as const;
export type ResultadoEnvio = (typeof RESULTADOS_ENVIO)[number];

/** Quem pode ser marcado como responsável (tela). Só os 4 últimos dígitos do WhatsApp. */
export type CandidatoAvisos = {
  vinculoId: string;
  nome: string;
  papel: "gestao" | "master";
  /** "Toda a organização", nome da unidade ou "Zatti (master)". */
  alcance: string;
  whatsappFinal: string | null;
};

export type ResponsavelAvisosAtual = {
  vinculoId: string;
  nome: string;
  papel: string;
  whatsappFinal: string | null;
  /** Nulo = válido; senão por que os avisos estão parados. */
  motivo: "sem_acesso" | "sem_whatsapp" | null;
};

/** Acima disso a mensagem resume o resto: o Quadro do dia tem tudo. */
export const LIMITE_LINHAS_MENSAGEM = 15;

export const DICA_AVISOS =
  "Três situações viram aviso: checklist que passou do horário limite e ainda não foi concluído; checklist que fechou a janela do dia sem ser concluído; e item crítico respondido fora da meta. O Hub junta o que apareceu desde o último ciclo (a cada 10 min, das 7h às 23h) numa mensagem só e o Vini manda para o WhatsApp do responsável. Problema resolvido antes de sair (checklist concluído, item corrigido) não é cobrado; aviso com mais de 7 dias expira.";

function primeiroNome(nome: string | null | undefined): string | null {
  const limpo = (nome ?? "").trim();
  if (!limpo) return null;
  return limpo.split(/\s+/)[0];
}

/** "hoje", "ontem" ou a data DD/MM (sem passar por Date: `data` já vem AAAA-MM-DD). */
export function diaRelativo(data: string | null | undefined, hoje: string): string {
  if (!data) return "";
  if (data === hoje) return "hoje";
  const [a, m, d] = hoje.split("-").map(Number);
  const ontem = new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
  if (data === ontem) return "ontem";
  return formatarDataBr(data).slice(0, 5);
}

function numero(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Valor respondido, em palavras: "não feito", "9", "2 estrelas". */
export function textoValorResposta(d: DetalhesAviso): string {
  if (d.item_tipo === "check") return d.valor_bool === false ? "não feito" : "feito";
  const n = numero(d.valor_numero);
  if (n === null) return "sem valor";
  const texto = n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (d.item_tipo === "estrelas") return `${texto} ${n === 1 ? "estrela" : "estrelas"}`;
  return texto;
}

/** Uma linha por aviso, sem numeração. */
export function linhaDoAviso(aviso: AvisoParaEnvio, hoje: string): string {
  const d = aviso.detalhes ?? {};
  const modelo = (d.modelo_nome ?? "Checklist").trim();
  const dia = diaRelativo(d.data, hoje);
  const quem = primeiroNome(d.responsavel_nome);
  if (aviso.tipo === "atrasado") {
    const horario = d.horario_limite ? ` (até ${d.horario_limite})` : "";
    return `${modelo}${horario} de ${dia} passou do horário e ainda não foi concluído.${quem ? ` Responsável: ${quem}.` : ""}`;
  }
  if (aviso.tipo === "nao_concluido") {
    const horario = d.horario_limite ? ` (até ${d.horario_limite})` : "";
    return `${modelo}${horario} de ${dia} não foi concluído dentro do prazo.${quem ? ` Responsável: ${quem}.` : ""}`;
  }
  const item = (d.item_titulo ?? "item").trim();
  const meta = d.item_tipo === "numero" || d.item_tipo === "estrelas" ? textoMeta(d.item_tipo as TipoItemGarante, numero(d.meta_min), numero(d.meta_max)) : null;
  return `Item crítico fora da meta em ${modelo} de ${dia}: ${item} = ${textoValorResposta(d)}${meta ? ` (${meta})` : ""}.${quem ? ` Respondido por ${quem}.` : ""}`;
}

/** Texto da mensagem do ciclo: cabeçalho, lista numerada (até o limite, depois um resumo) e
 * onde ver. `avisos` já vem na ordem do banco (pelo momento do evento). */
export function montarMensagemAvisos(p: { nomeDestinatario: string | null; unidadeNome: string; avisos: AvisoParaEnvio[]; hoje: string }): string {
  const nome = primeiroNome(p.nomeDestinatario);
  const total = p.avisos.length;
  const linhas: string[] = [];
  const plural = total === 1 ? "aviso" : "avisos";
  linhas.push(`${nome ? `Oi ${nome}, ` : ""}${total} ${plural} do Checklist Garante da ${p.unidadeNome}:`);
  p.avisos.slice(0, LIMITE_LINHAS_MENSAGEM).forEach((a, i) => linhas.push(`${i + 1}) ${linhaDoAviso(a, p.hoje)}`));
  if (total > LIMITE_LINHAS_MENSAGEM) {
    const resto = total - LIMITE_LINHAS_MENSAGEM;
    linhas.push(`E mais ${resto} ${resto === 1 ? "aviso" : "avisos"} no Quadro do dia.`);
  }
  linhas.push("");
  linhas.push("Veja no Zatti Hub, em Garante > Quadro do dia.");
  return linhas.join("\n");
}

/** `vinculos.whatsapp` é E.164 (+5516999990000); o Vini manda só dígitos. */
export function telefoneParaEnvio(whatsapp: string): string {
  return whatsapp.replace(/\D/g, "");
}

export type SituacaoAvisos = {
  pendentes: number;
  incertos: number;
  falharam: number;
  /** Nulo = responsável válido. Senão, por que os avisos estão parados. */
  motivoResponsavel: ResponsavelAvisosAtual["motivo"];
};

/** Frases da tela Regras da unidade sobre a fila de avisos. */
export function textoSituacaoAvisos(s: SituacaoAvisos, temResponsavel: boolean): string[] {
  const frases: string[] = [];
  if (!temResponsavel) {
    frases.push("Ninguém recebe os avisos desta unidade ainda.");
    return frases;
  }
  if (s.motivoResponsavel === "sem_acesso") frases.push("O responsável perdeu o acesso à unidade: os avisos ficam parados até trocar o responsável.");
  if (s.motivoResponsavel === "sem_whatsapp") frases.push("O responsável está sem WhatsApp cadastrado: os avisos ficam parados até cadastrar em Equipe ou trocar o responsável.");
  if (s.pendentes > 0) frases.push(`${s.pendentes} ${s.pendentes === 1 ? "aviso esperando" : "avisos esperando"} o próximo envio.`);
  if (s.incertos > 0) frases.push(`${s.incertos} ${s.incertos === 1 ? "envio incerto" : "envios incertos"} (o WhatsApp pode ter saído sem confirmação; não repete).`);
  if (s.falharam > 0) frases.push(`${s.falharam} ${s.falharam === 1 ? "aviso não pôde" : "avisos não puderam"} ser enviados depois de 3 tentativas.`);
  if (frases.length === 0) frases.push("Nenhum aviso pendente.");
  return frases;
}

/** Por que um vínculo não serve como responsável (mesma regra de `garante_motivo_vinculo_avisos`). */
export function motivoVinculoAvisos(
  v: { status: string; role: string; organizacaoId: string; unidadeId: string | null; whatsapp: string | null },
  unidade: { id: string; organizacaoId: string },
): SituacaoAvisos["motivoResponsavel"] {
  const alcanca = v.role === "master" || (v.role === "gestao" && v.organizacaoId === unidade.organizacaoId && (v.unidadeId === null || v.unidadeId === unidade.id));
  if (v.status !== "ativo" || !alcanca) return "sem_acesso";
  if (!v.whatsapp) return "sem_whatsapp";
  return null;
}
