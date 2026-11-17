import { describe, expect, it } from "vitest";
import { filtrarLeads, ROTULO_ORIGEM, SEM_PROSPECCAO_FRIA, type Lead } from "./funil";
import {
  chegouEm,
  dataContato,
  inicioPeriodoProspeccao,
  lerPeriodoProspeccao,
  resumirProspeccao,
  type LeadProspeccao,
} from "./prospeccao-fria";

const base: Lead = {
  id: "1", whatsapp: "", instagram: "loja", cidadeBairro: "", seguidores: null, ultimoPostEm: null,
  notaGoogle: null, avaliacoesGoogle: null, vendeDelivery: "", nome: "Loja", negocio: "", origem: "prospeccao_fria",
  produtoInteresse: "", etapa: "abordado", motivoPerda: "", faturamentoAtual: "", faturamentoDesejado: "", dificuldade: "",
  proximaAcao: "", proximaAcaoEm: null, organizacaoId: null, criadoEm: "2026-11-16T12:00:00Z",
  etapaDesde: "2026-11-16T12:00:00Z", ultimoEventoEm: "2026-11-16T12:00:00Z",
};
const loja = (p: Partial<LeadProspeccao>): LeadProspeccao => ({ ...base, passos: [], ...p });

describe("origem Prospecção fria", () => {
  it("tem rótulo e separa do resto no filtro", () => {
    expect(ROTULO_ORIGEM.prospeccao_fria).toBe("Prospecção fria");
    const leads = [loja({ id: "a" }), { ...base, id: "b", origem: "site" as const }];
    const f = { produto: "" as const, desde: null };
    expect(filtrarLeads(leads, { ...f, origem: "prospeccao_fria" }).map((l) => l.id)).toEqual(["a"]);
    expect(filtrarLeads(leads, { ...f, origem: SEM_PROSPECCAO_FRIA }).map((l) => l.id)).toEqual(["b"]);
    expect(filtrarLeads(leads, { ...f, origem: "" })).toHaveLength(2);
  });
});

describe("período", () => {
  it("lê o período e cai em 7 dias quando desconhecido", () => {
    expect(lerPeriodoProspeccao("hoje")).toBe("hoje");
    expect(lerPeriodoProspeccao("30")).toBe("30");
    expect(lerPeriodoProspeccao("90")).toBe("7");
    expect(lerPeriodoProspeccao(undefined)).toBe("7");
  });
  it("conta hoje dentro do período", () => {
    expect(inicioPeriodoProspeccao("hoje", "2026-11-16")).toBe("2026-11-16");
    expect(inicioPeriodoProspeccao("7", "2026-11-16")).toBe("2026-11-10");
    expect(inicioPeriodoProspeccao("30", "2026-11-01")).toBe("2026-10-03");
  });
});

describe("data do contato", () => {
  it("é a primeira chegada em Abordado ou depois, no horário de Brasília", () => {
    const l = loja({
      passos: [
        { em: "2026-11-15T10:00:00Z", paraEtapa: "comecar_a_seguir" },
        { em: "2026-11-16T01:30:00Z", paraEtapa: "abordado" }, // 15/11 22h30 em Brasília
        { em: "2026-11-16T15:00:00Z", paraEtapa: "respondeu" },
      ],
    });
    expect(dataContato(l)).toBe("2026-11-15");
  });
  it("loja que entrou direto em Respondeu também foi contatada", () => {
    expect(dataContato(loja({ etapa: "respondeu", passos: [{ em: "2026-11-16T15:00:00Z", paraEtapa: "respondeu" }] }))).toBe("2026-11-16");
  });
  it("loja ainda em Começar a seguir não foi contatada", () => {
    expect(dataContato(loja({ etapa: "comecar_a_seguir", passos: [{ em: "2026-11-16T15:00:00Z", paraEtapa: "comecar_a_seguir" }] }))).toBeNull();
  });
});

describe("funil acumulado", () => {
  const passo = (paraEtapa: LeadProspeccao["etapa"], dia = "16") => ({ em: `2026-11-${dia}T15:00:00Z`, paraEtapa });
  const lojas = [
    loja({ id: "1", passos: [passo("abordado")] }),
    loja({ id: "2", etapa: "respondeu", passos: [passo("abordado"), passo("respondeu")] }),
    // Perdida depois da reunião: conta até a reunião e em Perdidas.
    loja({ id: "3", etapa: "perdido", passos: [passo("abordado"), passo("respondeu"), passo("reuniao_diagnostico"), passo("perdido")] }),
    // Virou cliente sem passar por Consultoria fechada: conta como cliente.
    loja({ id: "4", etapa: "reuniao_diagnostico", organizacaoId: "org", passos: [passo("abordado"), passo("respondeu"), passo("reuniao_diagnostico")] }),
    // Contatada antes do período: fica fora.
    loja({ id: "5", etapa: "respondeu", passos: [passo("abordado", "01"), passo("respondeu")] }),
  ];

  it("conta cada loja até a etapa mais avançada e calcula as taxas", () => {
    const r = resumirProspeccao(lojas, "2026-11-10");
    expect(r.totais).toEqual({ contatadas: 4, responderam: 3, reuniao: 2, cliente: 1 });
    expect(r.taxas).toEqual({ contatadas: null, responderam: 75, reuniao: 66.7, cliente: 50 });
    expect(r.perdidas).toBe(1);
    expect(r.taxaPerdidas).toBe(25);
    expect(r.lojas.map((l) => l.id).sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("sem loja no período, taxas ficam sem valor", () => {
    const r = resumirProspeccao(lojas, "2026-12-01");
    expect(r.totais.contatadas).toBe(0);
    expect(r.taxas.responderam).toBeNull();
    expect(r.taxaPerdidas).toBeNull();
  });

  it("virou cliente ainda em Começar a seguir conta em todas as etapas e tem data de contato", () => {
    const l = loja({ id: "9", etapa: "comecar_a_seguir", organizacaoId: "org", criadoEm: "2026-11-14T15:00:00Z",
      passos: [{ em: "2026-11-15T15:00:00Z", paraEtapa: "comecar_a_seguir" }] });
    expect(dataContato(l)).toBe("2026-11-15");
    expect(dataContato({ ...l, passos: [] })).toBe("2026-11-14");
    const r = resumirProspeccao([l], "2026-11-10");
    expect(r.totais).toEqual({ contatadas: 1, responderam: 1, reuniao: 1, cliente: 1 });
  });

  it("Cliente nunca passa de Reunião", () => {
    const r = resumirProspeccao(lojas, "2026-11-10");
    expect(r.totais.cliente).toBeLessThanOrEqual(r.totais.reuniao);
  });

  it("perdida conta pela etapa a que chegou, não pelo Perdido", () => {
    expect(chegouEm(lojas[2], "reuniao")).toBe(true);
    expect(chegouEm(lojas[2], "cliente")).toBe(false);
  });
});
