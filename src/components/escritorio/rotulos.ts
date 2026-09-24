import type { Nivel, Situacao } from "@/lib/escritorio/tipos";

export const ROTULO_NIVEL: Record<Nivel, string> = {
  definido: "Apenas definido",
  processo: "Processo disponível",
  operacional: "Agente operacional",
};

export const SITUACAO: Record<Situacao, { rotulo: string; ponto: string }> = {
  disponivel: { rotulo: "Disponível", ponto: "bg-verde" },
  trabalhando: { rotulo: "Trabalhando", ponto: "bg-ambar" },
  "aguardando-vinicius": { rotulo: "Aguardando Vinícius", ponto: "bg-ambar ring-2 ring-ambar/40" },
  "com-problema": { rotulo: "Com problema", ponto: "bg-vermelho" },
  vaga: { rotulo: "Vaga", ponto: "bg-cinza-medio" },
};

/** Data do estado (AAAA-MM-DD) para DD/MM/AAAA, sem passar por `Date`. */
export function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}
