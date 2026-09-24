import { describe, expect, it } from "vitest";
import { abaAtiva } from "@/components/escritorio/abas-escritorio";
import {
  APRESENTACAO_VINI,
  IDENTIDADE_VINI,
  alertasDoCliente,
  calcularProgresso,
  montarResumoWhatsapp,
  pareceCredencial,
  prepararReuniao,
  proximaReuniaoDoCliente,
} from "./jornada";
import { ETAPAS, type ClienteCompleto, type EtapaJornada, type ItemCliente } from "./tipos";

const etapa = (e: EtapaJornada["etapa"], situacao: EtapaJornada["situacao"], checklist: [string, boolean][] = []): EtapaJornada => ({
  id: e, etapa: e, ordem: ETAPAS.indexOf(e), responsavel: "vini", prazo: null, situacao,
  evidencia: "", pendencia: "", criterioConclusao: "", checklist: checklist.map(([texto, feito]) => ({ texto, feito })),
});

const item = (p: Partial<ItemCliente>): ItemCliente => ({
  id: Math.random().toString(), reuniaoId: null, tipo: "tarefa", texto: "x", responsavel: "cliente",
  prazo: null, situacao: "aberta", criadoEm: "", ...p,
});

function cliente(p: Partial<ClienteCompleto> = {}): ClienteCompleto {
  return {
    acompanhamento: {
      id: "a", organizacaoId: "o", organizacaoNome: "The House", objetivoContratado: "", metaPrincipal: "",
      etapaAtual: "ativacao", saude: "nao_avaliada", pessoas: [], prioridades: [], proximoMarco: "",
      proximoMarcoData: null, termoCalendario: "The House", cadenciaReunioes: "", atualizadoEm: "",
    },
    etapas: [
      etapa("venda", "concluida"),
      etapa("ativacao", "em_andamento", [["Contrato assinado", false], ["Grupo criado", true]]),
      ...ETAPAS.slice(2).map((e) => etapa(e, "nao_iniciada")),
    ],
    onboarding: [], reunioes: [], itens: [], diagnostico: [], indicadores: [], links: [],
    ...p,
  };
}

describe("Gestão de Clientes - regras puras", () => {
  it("progresso conta etapa concluída inteira e a fração do checklist da etapa em andamento", () => {
    // Venda (1) + metade da Ativação (0,5) sobre 8 etapas = 18,75% -> 19.
    expect(calcularProgresso(cliente().etapas)).toBe(19);
    expect(calcularProgresso([])).toBe(0);
  });

  it("alertas saem de fatos registrados: tarefa vencida, risco aberto e etapa bloqueada", () => {
    const c = cliente({
      itens: [
        item({ prazo: "2026-09-01" }),
        item({ tipo: "risco", texto: "Caixa no limite", responsavel: null }),
        item({ tipo: "risco", texto: "Resolvido", responsavel: null, situacao: "concluida" }),
      ],
    });
    c.etapas[1].situacao = "bloqueada";
    const alertas = alertasDoCliente(c, "2026-09-24");
    expect(alertas).toContain("1 tarefa(s) vencida(s)");
    expect(alertas).toContain("Risco: Caixa no limite");
    expect(alertas).not.toContain("Risco: Resolvido");
    expect(alertas).toContain("Etapa Ativação bloqueada");
  });

  it("preparação separa vencidas de pendentes, lista o que falta do cliente e sugere pauta", () => {
    const c = cliente({
      itens: [item({ texto: "Enviar extratos", prazo: "2026-09-20" }), item({ texto: "Concluir contrato", responsavel: "vinicius" })],
      onboarding: [
        { id: "1", bloco: "financeiro", item: "Extratos bancários", resposta: "", situacao: "pendente", ordem: 0 },
        { id: "2", bloco: "empresarial", item: "Estrutura dos CNPJs", resposta: "", situacao: "precisa_decisao", ordem: 0 },
        { id: "3", bloco: "operacional", item: "Fornecedores", resposta: "", situacao: "confirmado", ordem: 0 },
      ],
    });
    const prep = prepararReuniao(c, "2026-09-24");
    expect(prep.tarefasVencidas.map((t) => t.texto)).toEqual(["Enviar extratos"]);
    expect(prep.tarefasPendentes.map((t) => t.texto)).toEqual(["Concluir contrato"]);
    expect(prep.faltaDoCliente.map((o) => o.item)).toEqual(["Extratos bancários", "Estrutura dos CNPJs"]);
    expect(prep.perguntasRecomendadas).toContain("Decidir: Estrutura dos CNPJs");
    expect(prep.perguntasRecomendadas).toContain("Como está: Enviar extratos?");
    expect(prep.pautaSugerida).toContain("Ativação: Contrato assinado");
    expect(prep.faseAtual).toBe("Ativação");
  });

  it("resumo de WhatsApp assina como Vini e só se apresenta no primeiro contato", () => {
    const base = {
      reuniao: { data: "2026-09-24", titulo: "Onboarding financeiro", resumo: "Bancos mapeados." },
      itens: [
        item({ tipo: "decisao", texto: "Extratos pelo Drive", responsavel: null }),
        item({ tipo: "tarefa", texto: "Enviar extratos", responsavel: "cliente", prazo: "2026-10-01" }),
        item({ tipo: "pergunta", texto: "Qual banco da segunda conta?", responsavel: null }),
      ],
      pautaProxima: "1. Revisar extratos",
    };
    const primeiro = montarResumoWhatsapp({ ...base, primeiroContato: true });
    expect(primeiro.startsWith(IDENTIDADE_VINI)).toBe(true);
    expect(primeiro).toContain(APRESENTACAO_VINI);
    expect(primeiro).toContain("- Enviar extratos (Cliente, até 01/10/2026)");
    expect(primeiro).toContain("Resumo da reunião de 24/09/2026 - Onboarding financeiro");

    const depois = montarResumoWhatsapp({ ...base, primeiroContato: false });
    expect(depois).toContain("Vini aqui.");
    expect(depois).not.toContain(APRESENTACAO_VINI);
    // O Vini nunca fala como se fosse o próprio Vinícius.
    expect(depois).not.toMatch(/aqui é o Vinícius/i);
  });

  it("recusa texto com cara de credencial ou dado bancário e aceita descrição de onde está o acesso", () => {
    expect(pareceCredencial("senha: 123456")).toBe(true);
    expect(pareceCredencial("Token = abc")).toBe(true);
    expect(pareceCredencial("Agência 1234 conta 56789-0")).toBe(true);
    expect(pareceCredencial("4111 1111 1111 1111")).toBe(true);
    expect(pareceCredencial("https://app.exemplo.com/?token=abc")).toBe(true);
    expect(pareceCredencial("Acesso de consulta ao banco com a Scheila; login fica com ela")).toBe(false);
    expect(pareceCredencial("https://drive.google.com/drive/folders/abc")).toBe(false);
  });

  it("próxima reunião casa pelo termo sem acento nem caixa e nunca casa com termo vazio", () => {
    const eventos = [
      { titulo: "Reunião LK & Zatti", data: "2026-09-25", hora: "16:00" },
      { titulo: "Onboarding THE HOUSE & Zatti", data: "2026-09-30", hora: "10:00" },
      { titulo: "Reunião The House", data: "2026-09-20", hora: "10:00" },
    ];
    expect(proximaReuniaoDoCliente(eventos, "the house", "2026-09-24")?.data).toBe("2026-09-30");
    expect(proximaReuniaoDoCliente(eventos, "", "2026-09-24")).toBeNull();
  });

  it("aba Clientes fica ativa nas páginas do cliente, e Time de IA só na raiz do Escritório", () => {
    expect(abaAtiva("/escritorio")).toBe("/escritorio");
    expect(abaAtiva("/escritorio/clientes")).toBe("/escritorio/clientes");
    expect(abaAtiva("/escritorio/clientes/abc/reunioes")).toBe("/escritorio/clientes");
    expect(abaAtiva("/agenda/semana")).toBe("/agenda/dia");
  });
});
