/** Início da área do Vinícius (Zatti HUB, 15/10/2026): o dia numa tela só,
 * com o que o app já tem - Agenda (Calendar + prioridades), Comercial (CRM
 * `zh_leads`), Clientes (acompanhamentos) e Conteúdo (peças do calendário).
 * Funções puras; a página só carrega os dados e chama `montarInicio`. */
import type { CompromissoCalendario, TarefaAgenda } from "@/lib/agenda/tipos";
import { alertasDoCliente, calcularProgresso } from "@/lib/clientes/jornada";
import type { ClienteCompleto, Saude } from "@/lib/clientes/tipos";
import { calcularIndicadores, type Indicadores, type Lead } from "@/lib/comercial/funil";
import { pecasDoDia, somarDias, type Peca } from "@/lib/conteudo/pecas";

/** Lead fora do funil ativo: não entra em "falar hoje". */
const ETAPAS_ENCERRADAS = new Set<Lead["etapa"]>(["perdido", "consultoria_fechada"]);
const ORDEM_SAUDE: Record<Saude, number> = { critica: 0, atencao: 1, nao_avaliada: 2, boa: 3 };
const LIMITE_LISTA = 6;

export type ResumoCliente = {
  id: string;
  nome: string;
  saude: Saude;
  progresso: number;
  alertas: string[];
};

export type Inicio = {
  agenda: {
    compromissos: CompromissoCalendario[] | null;
    prioridades: TarefaAgenda[];
    prioridadesFeitas: number;
  };
  comercial: {
    falarHoje: Lead[];
    falarHojeTotal: number;
    atrasados: number;
    ativos: number;
    novos7Dias: number;
    mes: Indicadores;
  };
  clientes: ResumoCliente[];
  conteudo: { hoje: Peca[]; amanha: Peca[]; atrasadas: number };
};

/** Peça com data passada que ainda não foi publicada em lugar nenhum. */
function pecaAtrasada(p: Peca, hoje: string): boolean {
  return p.data !== null && p.data < hoje && !p.status.startsWith("Publicado");
}

/** `compromissos` e `prioridades` vêm de `montarDia` (Agenda > Dia): espelho
 * da grade já fica de fora. `compromissos` null = Calendar não pôde ser lido. */
export function montarInicio(params: {
  hoje: string;
  compromissos: CompromissoCalendario[] | null;
  prioridades: TarefaAgenda[];
  leads: Lead[];
  clientes: ClienteCompleto[];
  pecas: Peca[];
}): Inicio {
  const { hoje, compromissos, leads, clientes, pecas } = params;

  const prioridades = [...params.prioridades].sort((a, b) => (a.prioridadePosicao ?? 9) - (b.prioridadePosicao ?? 9));

  const ativos = leads.filter((l) => !ETAPAS_ENCERRADAS.has(l.etapa));
  const comAcao = ativos
    .filter((l) => l.proximaAcaoEm !== null && l.proximaAcaoEm <= hoje)
    .sort((a, b) => (a.proximaAcaoEm! < b.proximaAcaoEm! ? -1 : a.proximaAcaoEm! > b.proximaAcaoEm! ? 1 : 0));
  const seteDiasAtras = somarDias(hoje, -6);
  const inicioMes = `${hoje.slice(0, 7)}-01`;

  const resumoClientes: ResumoCliente[] = clientes
    .map((c) => ({
      id: c.acompanhamento.id,
      nome: c.acompanhamento.organizacaoNome,
      saude: c.acompanhamento.saude,
      progresso: calcularProgresso(c.etapas),
      alertas: alertasDoCliente(c, hoje),
    }))
    .sort((a, b) => ORDEM_SAUDE[a.saude] - ORDEM_SAUDE[b.saude] || b.alertas.length - a.alertas.length || a.nome.localeCompare(b.nome));

  return {
    agenda: {
      compromissos,
      prioridades,
      prioridadesFeitas: prioridades.filter((p) => p.situacao === "feita").length,
    },
    comercial: {
      falarHoje: comAcao.slice(0, LIMITE_LISTA),
      falarHojeTotal: comAcao.length,
      atrasados: comAcao.filter((l) => l.proximaAcaoEm! < hoje).length,
      ativos: ativos.length,
      novos7Dias: leads.filter((l) => l.criadoEm.slice(0, 10) >= seteDiasAtras).length,
      mes: calcularIndicadores(leads.filter((l) => l.criadoEm.slice(0, 10) >= inicioMes)),
    },
    clientes: resumoClientes,
    conteudo: {
      hoje: pecasDoDia(pecas, hoje),
      amanha: pecasDoDia(pecas, somarDias(hoje, 1)),
      atrasadas: pecas.filter((p) => pecaAtrasada(p, hoje)).length,
    },
  };
}
