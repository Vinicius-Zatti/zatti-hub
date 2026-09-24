import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import {
  ETAPAS,
  ROTULO_ETAPA,
  ROTULO_RESPONSAVEL,
  type ClienteCompleto,
  type EtapaJornada,
  type ItemCliente,
  type ItemOnboarding,
  type Responsavel,
  type Reuniao,
} from "./tipos";

/** Regras puras da Gestão de Clientes. Nada aqui lê banco ou decide
 * metodologia: só organiza o que já está registrado. Pergunta e pauta
 * sugeridas saem de pendências reais, nunca de conteúdo inventado. */

/** 0 a 100. Etapa concluída vale 1; em andamento ou bloqueada vale a fração
 * do checklist feito; não iniciada vale 0. */
export function calcularProgresso(etapas: EtapaJornada[]): number {
  if (etapas.length === 0) return 0;
  const soma = etapas.reduce((total, e) => {
    if (e.situacao === "concluida") return total + 1;
    if (e.situacao === "nao_iniciada" || e.checklist.length === 0) return total;
    return total + e.checklist.filter((c) => c.feito).length / e.checklist.length;
  }, 0);
  return Math.round((soma / ETAPAS.length) * 100);
}

export function tarefasAbertas(itens: ItemCliente[], responsavel?: Responsavel): ItemCliente[] {
  return itens.filter(
    (i) => i.tipo === "tarefa" && i.situacao === "aberta" && (!responsavel || i.responsavel === responsavel),
  );
}

export const vencida = (item: { prazo: string | null }, hojeIso: string) =>
  item.prazo !== null && item.prazo < hojeIso;

/** Alertas objetivos: não substituem a saúde avaliada por uma pessoa. */
export function alertasDoCliente(cliente: ClienteCompleto, hojeIso: string): string[] {
  const alertas: string[] = [];
  const vencidas = tarefasAbertas(cliente.itens).filter((t) => vencida(t, hojeIso));
  if (vencidas.length > 0) alertas.push(`${vencidas.length} tarefa(s) vencida(s)`);

  const riscos = cliente.itens.filter((i) => i.tipo === "risco" && i.situacao === "aberta");
  for (const r of riscos) alertas.push(`Risco: ${r.texto}`);

  const atual = cliente.etapas.find((e) => e.etapa === cliente.acompanhamento.etapaAtual);
  if (atual?.situacao === "bloqueada") alertas.push(`Etapa ${ROTULO_ETAPA[atual.etapa]} bloqueada`);
  if (atual && atual.situacao !== "concluida" && atual.prazo && atual.prazo < hojeIso) {
    alertas.push(`Prazo da etapa ${ROTULO_ETAPA[atual.etapa]} vencido`);
  }

  const decisoes = cliente.onboarding.filter((o) => o.situacao === "precisa_decisao").length;
  if (decisoes > 0) alertas.push(`${decisoes} item(ns) de onboarding precisam de decisão`);

  const { proximoMarcoData } = cliente.acompanhamento;
  if (proximoMarcoData && proximoMarcoData < hojeIso) alertas.push("Próximo marco com data vencida");
  return alertas;
}

export type PreparacaoReuniao = {
  ultimaReuniao: Reuniao | null;
  decisoes: ItemCliente[];
  tarefasVencidas: ItemCliente[];
  tarefasPendentes: ItemCliente[];
  faltaDoCliente: ItemOnboarding[];
  faseAtual: string;
  perguntasRecomendadas: string[];
  pautaSugerida: string[];
};

export function prepararReuniao(cliente: ClienteCompleto, hojeIso: string): PreparacaoReuniao {
  const fechadas = cliente.reunioes.filter((r) => r.situacao === "fechada").sort((a, b) => b.data.localeCompare(a.data));
  const abertas = tarefasAbertas(cliente.itens);
  const tarefasVencidas = abertas.filter((t) => vencida(t, hojeIso));
  const tarefasPendentes = abertas.filter((t) => !vencida(t, hojeIso));
  const faltaDoCliente = cliente.onboarding.filter((o) => o.situacao === "pendente" || o.situacao === "precisa_decisao");
  const perguntas = cliente.itens.filter((i) => i.tipo === "pergunta" && i.situacao === "aberta");
  const atual = cliente.etapas.find((e) => e.etapa === cliente.acompanhamento.etapaAtual);
  const faltaNaEtapa = atual?.checklist.filter((c) => !c.feito).map((c) => c.texto) ?? [];

  const perguntasRecomendadas = [
    ...perguntas.map((p) => p.texto),
    ...faltaDoCliente.filter((o) => o.situacao === "precisa_decisao").map((o) => `Decidir: ${o.item}`),
    ...tarefasVencidas.filter((t) => t.responsavel === "cliente").map((t) => `Como está: ${t.texto}?`),
  ];

  const pautaSugerida = [
    fechadas[0] ? `Retomar a reunião de ${formatarDataBr(fechadas[0].data)}: ${fechadas[0].titulo}` : "",
    tarefasVencidas.length ? `Tarefas vencidas (${tarefasVencidas.length})` : "",
    faltaDoCliente.length ? `Informações que faltam do cliente (${faltaDoCliente.length})` : "",
    atual && faltaNaEtapa.length
      ? `${ROTULO_ETAPA[atual.etapa]}: ${faltaNaEtapa.slice(0, 3).join("; ")}`
      : "",
    perguntasRecomendadas.length ? "Perguntas em aberto" : "",
    "Próximos passos, responsáveis e prazos",
  ].filter(Boolean);

  return {
    ultimaReuniao: fechadas[0] ?? null,
    decisoes: cliente.itens.filter((i) => i.tipo === "decisao" && i.situacao !== "cancelada"),
    tarefasVencidas,
    tarefasPendentes,
    faltaDoCliente,
    faseAtual: ROTULO_ETAPA[cliente.acompanhamento.etapaAtual],
    perguntasRecomendadas,
    pautaSugerida,
  };
}

export const IDENTIDADE_VINI = "Vini | Zatti Consultoria";
export const APRESENTACAO_VINI =
  "Oi, aqui é o Vini, assistente de gestão do Vinícius na Zatti. Eu acompanho nossa agenda, documentos, tarefas e andamento do projeto.";

/** Resumo pós-reunião para o grupo. Só prepara o texto: nada é enviado na V1.
 * `primeiroContato` troca o "Vini aqui." pela apresentação completa - o Vini
 * nunca pode parecer o próprio Vinícius. */
export function montarResumoWhatsapp(params: {
  reuniao: Pick<Reuniao, "data" | "titulo" | "resumo">;
  itens: ItemCliente[];
  pautaProxima: string;
  primeiroContato: boolean;
}): string {
  const { reuniao, itens, pautaProxima, primeiroContato } = params;
  const lista = (titulo: string, linhas: string[]) => (linhas.length ? [`*${titulo}*`, ...linhas.map((l) => `- ${l}`), ""] : []);
  const tarefa = (t: ItemCliente) => {
    const dono = t.responsavel ? ROTULO_RESPONSAVEL[t.responsavel] : "";
    const prazo = t.prazo ? `até ${formatarDataBr(t.prazo)}` : "";
    const detalhe = [dono, prazo].filter(Boolean).join(", ");
    return detalhe ? `${t.texto} (${detalhe})` : t.texto;
  };

  return [
    IDENTIDADE_VINI,
    "",
    primeiroContato ? APRESENTACAO_VINI : "Vini aqui.",
    "",
    `Resumo da reunião de ${formatarDataBr(reuniao.data)} - ${reuniao.titulo}`,
    "",
    ...(reuniao.resumo.trim() ? [reuniao.resumo.trim(), ""] : []),
    ...lista("Decisões", itens.filter((i) => i.tipo === "decisao").map((i) => i.texto)),
    ...lista("Tarefas", itens.filter((i) => i.tipo === "tarefa").map(tarefa)),
    ...lista("Perguntas em aberto", itens.filter((i) => i.tipo === "pergunta").map((i) => i.texto)),
    ...(pautaProxima.trim() ? ["*Próxima reunião*", pautaProxima.trim()] : []),
  ]
    .join("\n")
    .trim();
}

/** Recusa texto com cara de credencial ou dado bancário. Não é detector
 * perfeito - é a barreira para o erro honesto de colar senha no campo de
 * "acesso". O banco não guarda credencial por regra, não por sorte. */
const PADROES_CREDENCIAL = [
  /\b(senha|password|passwd|pwd|token|api[_ -]?key|chave\s+(pix|de acesso|secreta)|secret|pin|cvv|c[oó]digo de acesso)\b\s*[:=]/i,
  /\bag[eê]ncia\b.{0,20}\bconta\b.{0,5}\d/i,
  /\b\d{4}[ .-]?\d{4}[ .-]?\d{4}[ .-]?\d{4}\b/,
  /[?&](token|key|access_token|password|senha)=/i,
];

export function pareceCredencial(texto: string): boolean {
  return PADROES_CREDENCIAL.some((p) => p.test(texto));
}

/** Próximo evento do Calendar cujo título contém o termo do cliente (sem
 * diferenciar acento e caixa). Termo vazio nunca casa - melhor "sem reunião"
 * do que pegar a reunião de outro cliente. */
export function proximaReuniaoDoCliente<T extends { titulo: string; data: string; hora: string | null }>(
  eventos: T[],
  termo: string,
  hojeIso: string,
): T | null {
  const normalizar = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const alvo = normalizar(termo);
  if (!alvo) return null;
  return (
    eventos
      .filter((e) => e.data >= hojeIso && normalizar(e.titulo).includes(alvo))
      .sort((a, b) => `${a.data}${a.hora ?? ""}`.localeCompare(`${b.data}${b.hora ?? ""}`))[0] ?? null
  );
}
