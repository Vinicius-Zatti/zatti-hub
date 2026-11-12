import { describe, expect, it } from "vitest";
import {
  ESQUEMA_CONFERENCIA,
  interpretarResposta,
  lerReserva,
  LIMITE_CONFERENCIAS_MES,
  montarTextoItem,
  MOTIVO_MAXIMO,
  resultadoSemChamada,
  SISTEMA_CONFERENCIA,
} from "./ia-fotos";

describe("prompt da conferência", () => {
  it("leva checklist, grupo, item e instrução", () => {
    const texto = montarTextoItem({ checklist: "Fechamento", grupo: "Cozinha", titulo: "Balcão limpo", instrucao: "Sem pano em cima" });
    expect(texto).toContain("Checklist: Fechamento");
    expect(texto).toContain("Grupo: Cozinha");
    expect(texto).toContain("Item: Balcão limpo");
    expect(texto).toContain("Como deve estar: Sem pano em cima");
  });

  it("sem instrução nem grupo, não cria linha vazia", () => {
    const texto = montarTextoItem({ checklist: "Abertura", titulo: "Chão seco", grupo: null, instrucao: "  " });
    expect(texto).not.toContain("Grupo:");
    expect(texto).not.toContain("Como deve estar:");
  });

  it("sistema pede para não inventar e define o inconclusivo", () => {
    expect(SISTEMA_CONFERENCIA).toMatch(/Nunca invente/);
    expect(SISTEMA_CONFERENCIA).toMatch(/inconclusivo/);
    expect(SISTEMA_CONFERENCIA).not.toMatch(/[—]/);
  });

  it("esquema fecha os três vereditos e o motivo", () => {
    const props = ESQUEMA_CONFERENCIA.properties as Record<string, { enum?: string[] }>;
    expect(props.veredito.enum).toEqual(["aprovado", "reprovado", "inconclusivo"]);
    expect(ESQUEMA_CONFERENCIA.required).toEqual(["veredito", "motivo"]);
    expect(ESQUEMA_CONFERENCIA.additionalProperties).toBe(false);
  });
});

describe("leitura da resposta da IA", () => {
  it("aceita o JSON do esquema", () => {
    expect(interpretarResposta('{"veredito":"reprovado","motivo":"Pano de prato em cima do balcão."}')).toEqual({
      veredito: "reprovado",
      motivo: "Pano de prato em cima do balcão.",
    });
  });

  it("recusa veredito fora da lista, motivo vazio e texto que não é JSON", () => {
    expect(interpretarResposta('{"veredito":"talvez","motivo":"x"}')).toBeNull();
    expect(interpretarResposta('{"veredito":"aprovado","motivo":"   "}')).toBeNull();
    expect(interpretarResposta("aprovado")).toBeNull();
    expect(interpretarResposta("null")).toBeNull();
  });

  it("encurta motivo longo e troca travessão por hífen", () => {
    const longo = `Chão molhado perto da pia — ${"e com caixas no caminho ".repeat(20)}`;
    const r = interpretarResposta(JSON.stringify({ veredito: "reprovado", motivo: longo }));
    expect(r?.motivo.length).toBeLessThanOrEqual(MOTIVO_MAXIMO);
    expect(r?.motivo.endsWith("...")).toBe(true);
    expect(r?.motivo).not.toContain("—");
  });
});

describe("reserva e teto", () => {
  it("lê a resposta da reserva do banco", () => {
    expect(lerReserva({ situacao: "reservada", chamada_id: "abc" })).toEqual({ situacao: "reservada", chamadaId: "abc" });
    expect(lerReserva({ situacao: "limite" })).toEqual({ situacao: "limite", chamadaId: null });
    expect(lerReserva({ situacao: "reservada" })).toBeNull();
    expect(lerReserva({ situacao: "outra" })).toBeNull();
    expect(lerReserva(null)).toBeNull();
  });

  it("teto do mês não chama a IA e mostra o aviso de limite", () => {
    expect(resultadoSemChamada("limite")).toEqual({ estado: "limite" });
    expect(resultadoSemChamada("desligada")).toEqual({ estado: "desligada" });
    expect(resultadoSemChamada("sem_foto")).toEqual({ estado: "falhou" });
  });

  it("teto é o mesmo do banco (garante_ia_limite_mensal)", () => {
    expect(LIMITE_CONFERENCIAS_MES).toBe(1500);
  });
});
