import { describe, expect, it } from "vitest";
import {
  contarAtrasados,
  contarCriticosFora,
  mensagemErroPlano,
  ordenarPlanos,
  situacaoPlanoNaTela,
  textoRespostaOrigem,
  validarMotivoDescarte,
  validarResolucao,
} from "./planos";
import { REGRA_PADRAO, mensagemErroGarante, validarRegra } from "./regras";

const agora = new Date("2026-10-13T15:00:00Z");

describe("situacaoPlanoNaTela", () => {
  it("aberto depois do prazo vira atrasado", () => {
    expect(situacaoPlanoNaTela("aberto", "2026-10-13T14:59:00Z", agora)).toBe("atrasado");
    expect(situacaoPlanoNaTela("aberto", "2026-10-13T15:01:00Z", agora)).toBe("aberto");
  });
  it("fechado continua fechado, mesmo vencido", () => {
    expect(situacaoPlanoNaTela("resolvido", "2026-10-01T00:00:00Z", agora)).toBe("resolvido");
    expect(situacaoPlanoNaTela("descartado", "2026-10-01T00:00:00Z", agora)).toBe("descartado");
  });
});

describe("ordenarPlanos", () => {
  it("atrasados no topo (mais vencido primeiro), depois no prazo, depois fechados recentes", () => {
    const planos = [
      { id: "noPrazoTarde", situacao: "aberto" as const, prazo: "2026-10-14T10:00:00Z", fechadoEm: null },
      { id: "fechadoAntigo", situacao: "resolvido" as const, prazo: "2026-10-01T10:00:00Z", fechadoEm: "2026-10-02T10:00:00Z" },
      { id: "atrasadoRecente", situacao: "aberto" as const, prazo: "2026-10-13T12:00:00Z", fechadoEm: null },
      { id: "noPrazoCedo", situacao: "aberto" as const, prazo: "2026-10-13T18:00:00Z", fechadoEm: null },
      { id: "fechadoNovo", situacao: "descartado" as const, prazo: "2026-10-01T10:00:00Z", fechadoEm: "2026-10-12T10:00:00Z" },
      { id: "atrasadoAntigo", situacao: "aberto" as const, prazo: "2026-10-10T12:00:00Z", fechadoEm: null },
    ];
    expect(ordenarPlanos(planos, agora).map((p) => p.id)).toEqual([
      "atrasadoAntigo",
      "atrasadoRecente",
      "noPrazoCedo",
      "noPrazoTarde",
      "fechadoNovo",
      "fechadoAntigo",
    ]);
  });
  it("não muda a lista original", () => {
    const planos = [
      { situacao: "aberto" as const, prazo: "2026-10-14T10:00:00Z", fechadoEm: null },
      { situacao: "aberto" as const, prazo: "2026-10-10T10:00:00Z", fechadoEm: null },
    ];
    ordenarPlanos(planos, agora);
    expect(planos[0].prazo).toBe("2026-10-14T10:00:00Z");
  });
});

describe("validarResolucao e validarMotivoDescarte", () => {
  it("aceitam de 3 a 500 caracteres, sem os espaços das pontas", () => {
    expect(validarResolucao("  Troquei a borracha  ")).toEqual({ ok: true, texto: "Troquei a borracha" });
    expect(validarResolucao("abc").ok).toBe(true);
    expect(validarResolucao("a".repeat(500)).ok).toBe(true);
    expect(validarMotivoDescarte("Termômetro quebrado").ok).toBe(true);
  });
  it("recusam texto curto, vazio ou acima de 500", () => {
    expect(validarResolucao("ok").ok).toBe(false);
    expect(validarResolucao("    ").ok).toBe(false);
    expect(validarResolucao("a".repeat(501)).ok).toBe(false);
    const r = validarMotivoDescarte("x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("motivo");
  });
});

describe("mensagemErroPlano", () => {
  it("sem permissão fala do plano, não do checklist", () => {
    expect(mensagemErroPlano("sem_permissao")).toContain("descartar é só da gestão");
  });
  it("demais erros vêm traduzidos do Garante", () => {
    expect(mensagemErroPlano("plano_fechado")).toContain("já foi resolvido ou descartado");
    expect(mensagemErroPlano("resolucao_obrigatoria")).toContain("3 a 500");
    expect(mensagemErroPlano("motivo_descarte_obrigatorio")).toContain("motivo do descarte");
    expect(mensagemErroGarante("plano_imutavel")).toContain("não mudam");
    expect(mensagemErroGarante("plano_nao_encontrado")).toContain("não encontrado");
    expect(mensagemErroGarante("regra_invalida")).toContain("168");
  });
});

describe("textoRespostaOrigem", () => {
  it("mostra o valor e a meta", () => {
    expect(textoRespostaOrigem({ tipo: "check" }, { valorBool: false, valorNumero: null, valorTexto: null })).toBe("Não feito");
    expect(textoRespostaOrigem({ tipo: "numero", meta_min: 0, meta_max: 5 }, { valorBool: null, valorNumero: 7.5, valorTexto: null })).toBe(
      "7,5 (meta: 0 a 5)",
    );
    expect(textoRespostaOrigem({ tipo: "estrelas", meta_min: 4, meta_max: null }, { valorBool: null, valorNumero: 2, valorTexto: null })).toBe(
      "2 estrelas (meta: 4 estrelas ou mais)",
    );
  });
  it("sem resposta legível avisa", () => {
    expect(textoRespostaOrigem({ tipo: "check" }, null)).toBe("Resposta não encontrada");
  });
});

describe("contarAtrasados", () => {
  it("conta só o que passou do prazo sem concluir", () => {
    expect(
      contarAtrasados(
        [
          { situacao: "pendente", prazo: "2026-10-13T14:00:00Z" },
          { situacao: "em_andamento", prazo: "2026-10-13T14:30:00Z" },
          { situacao: "concluida", prazo: "2026-10-13T14:00:00Z" },
          { situacao: "pendente", prazo: "2026-10-13T16:00:00Z" },
        ],
        agora,
      ),
    ).toBe(2);
  });
});

describe("contarCriticosFora", () => {
  it("conta só resposta fora da meta em item crítico do snapshot daquela execução", () => {
    const execucoes = [
      { id: "e1", snapshot: [{ id: "i1", critico: true }, { id: "i2", critico: false }] },
      { id: "e2", snapshot: [{ id: "i1", critico: false }] },
      { id: "e3", snapshot: null },
    ];
    const fora = [
      { execucaoId: "e1", itemId: "i1" },
      { execucaoId: "e1", itemId: "i2" },
      { execucaoId: "e2", itemId: "i1" },
      { execucaoId: "e3", itemId: "i1" },
    ];
    expect(contarCriticosFora(execucoes, fora)).toBe(1);
  });
});

describe("validarRegra com prazo do plano", () => {
  it("prazo do plano de 1 a 168 h, inteiro", () => {
    expect(validarRegra({ antecedenciaMin: 120, atrasoMaxMin: 60, prazoPlanoHoras: 24 })).toEqual({
      ok: true,
      antecedenciaMin: 120,
      atrasoMaxMin: 60,
      prazoPlanoHoras: 24,
    });
    expect(validarRegra({ antecedenciaMin: 120, atrasoMaxMin: 60, prazoPlanoHoras: 1 }).ok).toBe(true);
    expect(validarRegra({ antecedenciaMin: 120, atrasoMaxMin: 60, prazoPlanoHoras: 168 }).ok).toBe(true);
    expect(validarRegra({ antecedenciaMin: 120, atrasoMaxMin: 60, prazoPlanoHoras: 0 }).ok).toBe(false);
    expect(validarRegra({ antecedenciaMin: 120, atrasoMaxMin: 60, prazoPlanoHoras: 169 }).ok).toBe(false);
    expect(validarRegra({ antecedenciaMin: 120, atrasoMaxMin: 60, prazoPlanoHoras: 1.5 }).ok).toBe(false);
    expect(validarRegra({ antecedenciaMin: 120, atrasoMaxMin: 60, prazoPlanoHoras: null }).ok).toBe(false);
  });
  it("padrão de 24 h", () => {
    expect(REGRA_PADRAO.prazoPlanoHoras).toBe(24);
  });
});
