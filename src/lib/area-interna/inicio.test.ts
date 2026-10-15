import { describe, expect, it } from "vitest";
import type { TarefaAgenda } from "@/lib/agenda/tipos";
import type { ClienteCompleto } from "@/lib/clientes/tipos";
import type { Lead } from "@/lib/comercial/funil";
import type { Peca } from "@/lib/conteudo/pecas";
import { montarInicio } from "./inicio";

const HOJE = "2026-10-15";

function lead(p: Partial<Lead>): Lead {
  return {
    id: "l", whatsapp: "", instagram: "", cidadeBairro: "", seguidores: null, ultimoPostEm: null, notaGoogle: null,
    avaliacoesGoogle: null, vendeDelivery: "", nome: "Lead", negocio: "", origem: "instagram", produtoInteresse: "",
    etapa: "abordado", motivoPerda: "", faturamentoAtual: "", faturamentoDesejado: "", dificuldade: "", proximaAcao: "",
    proximaAcaoEm: null, organizacaoId: null, criadoEm: "2026-09-01T10:00:00Z", etapaDesde: "2026-09-01T10:00:00Z",
    ultimoEventoEm: "2026-09-01T10:00:00Z", ...p,
  };
}

function peca(p: Partial<Peca>): Peca {
  return {
    id: "p", titulo: "Peça", data: null, hora: null, status: "Ideia", formato: "", etapa_funil: "", roteiro: "", legenda: "",
    link_referencia: "", link_arquivos: "", observacao: "", origem_notion_id: null, versao: 1, criado_em: "", atualizado_em: "",
    criado_por: "", atualizado_por: "", origem_ultima_mudanca: "hub", ...p,
  };
}

function tarefa(p: Partial<TarefaAgenda>): TarefaAgenda {
  return { id: "t", data: HOJE, titulo: "T", detalhe: "", prioridade: true, prioridadePosicao: 1, ordem: 0, situacao: "pendente", rotinaId: null, ...p };
}

function cliente(nome: string, saude: ClienteCompleto["acompanhamento"]["saude"]): ClienteCompleto {
  return {
    acompanhamento: {
      id: nome, organizacaoId: nome, organizacaoNome: nome, objetivoContratado: "", metaPrincipal: "", etapaAtual: "diagnostico" as never,
      saude, pessoas: [], prioridades: [], proximoMarco: "", proximoMarcoData: null, termoCalendario: "", cadenciaReunioes: "", atualizadoEm: "",
    },
    etapas: [], onboarding: [], reunioes: [], itens: [], diagnostico: [], indicadores: [], links: [],
  };
}

const base = { hoje: HOJE, compromissos: [], prioridades: [], leads: [], clientes: [], pecas: [] };

describe("montarInicio", () => {
  it("comercial: falar hoje inclui atrasados, exclui encerrados e o futuro", () => {
    const r = montarInicio({
      ...base,
      leads: [
        lead({ id: "a", proximaAcaoEm: "2026-10-13" }),
        lead({ id: "b", proximaAcaoEm: HOJE }),
        lead({ id: "c", proximaAcaoEm: "2026-10-16" }),
        lead({ id: "d", proximaAcaoEm: "2026-10-10", etapa: "perdido" }),
        lead({ id: "e", proximaAcaoEm: "2026-10-10", etapa: "consultoria_fechada" }),
      ],
    });
    expect(r.comercial.falarHoje.map((l) => l.id)).toEqual(["a", "b"]);
    expect(r.comercial.atrasados).toBe(1);
    expect(r.comercial.ativos).toBe(3);
  });

  it("comercial: novos nos últimos 7 dias e números do mês só com leads do mês", () => {
    const r = montarInicio({
      ...base,
      leads: [
        lead({ criadoEm: "2026-10-09T12:00:00Z" }),
        lead({ criadoEm: "2026-10-08T12:00:00Z", etapa: "comprou_app" }),
        lead({ criadoEm: "2026-09-30T12:00:00Z", etapa: "comprou_livro" }),
      ],
    });
    expect(r.comercial.novos7Dias).toBe(1);
    expect(r.comercial.mes.leadsNoPeriodo).toBe(2);
    expect(r.comercial.mes.compraram).toBe(1);
  });

  it("agenda: prioridades na ordem da posição e contagem das feitas", () => {
    const r = montarInicio({
      ...base,
      prioridades: [tarefa({ id: "2", prioridadePosicao: 2, situacao: "feita" }), tarefa({ id: "1", prioridadePosicao: 1 })],
    });
    expect(r.agenda.prioridades.map((t) => t.id)).toEqual(["1", "2"]);
    expect(r.agenda.prioridadesFeitas).toBe(1);
  });

  it("agenda: Calendar fora do ar continua null para a tela avisar", () => {
    expect(montarInicio({ ...base, compromissos: null }).agenda.compromissos).toBeNull();
  });

  it("clientes: crítica primeiro, boa por último", () => {
    const r = montarInicio({ ...base, clientes: [cliente("B", "boa"), cliente("C", "critica"), cliente("A", "atencao")] });
    expect(r.clientes.map((c) => c.nome)).toEqual(["C", "A", "B"]);
  });

  it("conteúdo: hoje, amanhã e atrasadas sem publicar", () => {
    const r = montarInicio({
      ...base,
      pecas: [
        peca({ id: "h", data: HOJE }),
        peca({ id: "m", data: "2026-10-16" }),
        peca({ id: "x", data: "2026-10-14", status: "Gravado" }),
        peca({ id: "y", data: "2026-10-14", status: "Publicado todos" }),
      ],
    });
    expect(r.conteudo.hoje.map((p) => p.id)).toEqual(["h"]);
    expect(r.conteudo.amanha.map((p) => p.id)).toEqual(["m"]);
    expect(r.conteudo.atrasadas).toBe(1);
  });
});
