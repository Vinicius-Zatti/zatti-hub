import { describe, expect, it } from "vitest";
import { BIBLIOTECA_POPS, modeloDaBiblioteca } from "./biblioteca";
import {
  concluidaNoPrazo,
  hojeOperacao,
  itemCompleto,
  mensagemErroGarante,
  ontemOperacao,
  percentual,
  situacaoNaTela,
  textoDias,
  textoMeta,
  validarItem,
  validarPublicacao,
} from "./regras";

describe("situacaoNaTela", () => {
  const prazo = "2026-10-11T13:00:00.000Z"; // 10:00 em Brasília
  it("passou do prazo sem concluir = atrasada", () => {
    expect(situacaoNaTela("pendente", prazo, new Date("2026-10-11T13:01:00Z"))).toBe("atrasada");
    expect(situacaoNaTela("em_andamento", prazo, new Date("2026-10-11T14:00:00Z"))).toBe("atrasada");
  });
  it("antes do prazo mantém a situação; concluída é sempre concluída", () => {
    expect(situacaoNaTela("pendente", prazo, new Date("2026-10-11T12:00:00Z"))).toBe("pendente");
    expect(situacaoNaTela("concluida", prazo, new Date("2026-10-11T20:00:00Z"))).toBe("concluida");
  });
  it("pontualidade da conclusão", () => {
    expect(concluidaNoPrazo(prazo, "2026-10-11T12:59:00Z")).toBe(true);
    expect(concluidaNoPrazo(prazo, "2026-10-11T13:30:00Z")).toBe(false);
    expect(concluidaNoPrazo(prazo, null)).toBeNull();
  });
});

describe("percentual e datas", () => {
  it("percentual sem divisão por zero", () => {
    expect(percentual(0, 0)).toBe(0);
    expect(percentual(1, 3)).toBe(33);
    expect(percentual(5, 4)).toBe(100);
  });
  it("hoje no fuso de Brasília (23h de Brasília ainda é o mesmo dia)", () => {
    expect(hojeOperacao(new Date("2026-10-12T02:30:00Z"))).toBe("2026-10-11");
    expect(hojeOperacao(new Date("2026-10-12T03:30:00Z"))).toBe("2026-10-12");
  });
  it("texto dos dias", () => {
    expect(textoDias([0, 1, 2, 3, 4, 5, 6])).toBe("Todo dia");
    expect(textoDias([1, 2, 3, 4, 5])).toBe("Seg a Sex");
    expect(textoDias([6, 0])).toBe("Dom, Sáb");
  });
});

describe("validarPublicacao", () => {
  it("aceita dias e horário válidos", () => {
    expect(validarPublicacao({ dias: ["5", "1"], horario: "09:30" })).toEqual({ ok: true, dias: [1, 5], horario: "09:30" });
  });
  it("recusa sem dia, dia inválido e horário inválido", () => {
    expect(validarPublicacao({ dias: [], horario: "09:30" }).ok).toBe(false);
    expect(validarPublicacao({ dias: ["7"], horario: "09:30" }).ok).toBe(false);
    expect(validarPublicacao({ dias: ["1"], horario: "25:00" }).ok).toBe(false);
  });
});

describe("validarItem", () => {
  const base = { titulo: "Temperatura", tipo: "numero", critico: false, fotoObrigatoria: false, permiteNa: true, metaMin: "0", metaMax: "5" };
  it("crítico nunca aceita não se aplica", () => {
    const r = validarItem({ ...base, critico: true, permiteNa: true });
    expect(r.ok && r.permiteNa).toBe(false);
  });
  it("meta só em número e estrelas; vírgula vira ponto; faixa invertida é corrigida", () => {
    const r = validarItem({ ...base, metaMin: "5,5", metaMax: "1" });
    expect(r.ok && [r.metaMin, r.metaMax]).toEqual([1, 5.5]);
    const c = validarItem({ ...base, tipo: "check" });
    expect(c.ok && [c.metaMin, c.metaMax]).toEqual([null, null]);
  });
  it("estrelas só de 1 a 5; título obrigatório; tipo inválido", () => {
    expect(validarItem({ ...base, tipo: "estrelas", metaMin: "0" }).ok).toBe(false);
    expect(validarItem({ ...base, titulo: "  " }).ok).toBe(false);
    expect(validarItem({ ...base, tipo: "foto" }).ok).toBe(false);
  });
  it("texto da meta", () => {
    expect(textoMeta("numero", 0, 5)).toBe("meta: 0 a 5");
    expect(textoMeta("numero", null, -18)).toBe("meta: até -18");
    expect(textoMeta("estrelas", 4, null)).toBe("meta: 4 estrelas ou mais");
    expect(textoMeta("check", null, null)).toBeNull();
  });
});

describe("biblioteca de POPs", () => {
  it("tem os 5 POPs do plano, sem item repetido e com chave única", () => {
    expect(BIBLIOTECA_POPS.map((m) => m.chave)).toEqual([
      "pop-1-abertura",
      "pop-2-fechamento",
      "pop-3-praca",
      "pop-5-limpeza-fechamento",
      "pop-5-limpeza-semanal",
      "pop-6-estoque",
    ]);
    for (const m of BIBLIOTECA_POPS) {
      const titulos = m.itens.map((i) => i.titulo);
      expect(new Set(titulos).size).toBe(titulos.length);
      expect(titulos.every((t) => t.length > 0 && t.length <= 200)).toBe(true);
    }
  });
  it("temperaturas da Abertura com a faixa do próprio POP", () => {
    const itens = modeloDaBiblioteca("pop-1-abertura")!.itens;
    expect(itens.find((i) => i.titulo.includes("refrigerados"))).toMatchObject({ tipo: "numero", metaMin: 0, metaMax: 5 });
    expect(itens.find((i) => i.titulo.includes("congelados"))).toMatchObject({ tipo: "numero", metaMax: -18 });
  });
  it("itens de prova pedem foto; a Abertura igual à do Zatti Burger (7 de 15)", () => {
    const abertura = modeloDaBiblioteca("pop-1-abertura")!.itens.filter((i) => i.foto).map((i) => i.titulo);
    expect(abertura).toEqual([
      "Temperatura das câmaras de refrigerados (°C)",
      "Temperatura das câmaras de congelados (°C)",
      "Verificar validade de itens que serão usados no dia",
      "Salão limpo e mesas organizadas",
      "Banheiros abastecidos e limpos",
      "Lixeiras vazias",
      "Confirmar presença e fardamento de todos",
    ]);
    for (const m of BIBLIOTECA_POPS) {
      const comFoto = m.itens.filter((i) => i.foto).length;
      expect(comFoto).toBeGreaterThan(0);
      expect(comFoto).toBeLessThan(m.itens.length);
    }
  });
});

describe("mensagemErroGarante", () => {
  it("traduz o erro do banco e esconde o resto", () => {
    expect(mensagemErroGarante("sem_permissao")).toBe("Esse checklist é de outra pessoa.");
    expect(mensagemErroGarante("duplicate key value")).toBe("Não foi possível salvar. Tente de novo.");
  });
});

describe("itemCompleto (mesmo critério do banco)", () => {
  const vazia = { naoSeAplica: false, valorBool: null, valorNumero: null, valorTexto: null, temFoto: false };
  it("item com foto obrigatória sem a foto não conta, mesmo respondido", () => {
    expect(itemCompleto({ foto_obrigatoria: true }, { ...vazia, valorNumero: 4 })).toBe(false);
    expect(itemCompleto({ foto_obrigatoria: true }, { ...vazia, valorNumero: 4, temFoto: true })).toBe(true);
  });
  it("só a foto, sem resposta, também não conta", () => {
    expect(itemCompleto({ foto_obrigatoria: true }, { ...vazia, temFoto: true })).toBe(false);
  });
  it("não se aplica conta; sem resposta não conta", () => {
    expect(itemCompleto({ foto_obrigatoria: true }, { ...vazia, naoSeAplica: true })).toBe(true);
    expect(itemCompleto({ foto_obrigatoria: false }, undefined)).toBe(false);
    expect(itemCompleto({ foto_obrigatoria: false }, { ...vazia, valorBool: false })).toBe(true);
  });
});

describe("ontemOperacao", () => {
  it("véspera no fuso de Brasília, inclusive na virada do mês e depois das 21h", () => {
    expect(ontemOperacao(new Date("2026-11-01T12:00:00Z"))).toBe("2026-10-31");
    // 23h30 de 12/10 em Brasília = 02h30 UTC de 13/10.
    expect(ontemOperacao(new Date("2026-10-13T02:30:00Z"))).toBe("2026-10-11");
    expect(hojeOperacao(new Date("2026-10-13T02:30:00Z"))).toBe("2026-10-12");
  });
});

describe("validarItem com número não finito", () => {
  const base = { titulo: "Temperatura", tipo: "numero", critico: false, fotoObrigatoria: false, permiteNa: true, metaMin: "", metaMax: "" };
  it("recusa NaN, infinito e número fora do limite", () => {
    expect(validarItem({ ...base, metaMin: "abc" }).ok).toBe(false);
    expect(validarItem({ ...base, metaMax: "Infinity" }).ok).toBe(false);
    expect(validarItem({ ...base, metaMax: "1e9" }).ok).toBe(false);
    expect(validarItem({ ...base, metaMin: "-18", metaMax: "-12,5" }).ok).toBe(true);
  });
});

describe("mensagens novas das RPCs", () => {
  it("responsável sem acesso e checklist sem itens viram texto de gente", () => {
    expect(mensagemErroGarante("responsavel_sem_acesso")).toContain("não tem acesso");
    expect(mensagemErroGarante("checklist_sem_itens")).toContain("não tem itens");
  });
});
