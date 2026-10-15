import { describe, expect, it } from "vitest";
import { chaveEnvio, idLivre, MODULOS_UNIDADE_NOVA, validarPedido, whatsappDoCrm } from "./regras";

const PEDIDO = {
  pagamento_id: "9001",
  email: " Joana@Exemplo.com ",
  nome: "Joana Teste",
  whatsapp: "31999991111",
  restaurante: "Burger da Joana",
  valor: 718.8,
  lead_id: "0b6f1c1e-1111-4111-8111-111111111111",
};

describe("validarPedido", () => {
  it("normaliza e-mail e WhatsApp", () => {
    const r = validarPedido(PEDIDO);
    expect(r).toEqual({
      ok: true,
      pedido: {
        pagamentoId: "9001",
        email: "joana@exemplo.com",
        nome: "Joana Teste",
        whatsapp: "+5531999991111",
        restaurante: "Burger da Joana",
        valor: 718.8,
        leadSiteId: "0b6f1c1e-1111-4111-8111-111111111111",
      },
    });
  });
  it("lead e valor são opcionais", () => {
    const r = validarPedido({ ...PEDIDO, lead_id: undefined, valor: null });
    expect(r.ok && r.pedido.leadSiteId).toBeNull();
    expect(r.ok && r.pedido.valor).toBeNull();
  });
  it("recusa o que não dá pra confiar", () => {
    expect(validarPedido(null)).toEqual({ ok: false, erro: "pedido_invalido" });
    expect(validarPedido([])).toEqual({ ok: false, erro: "pedido_invalido" });
    expect(validarPedido({ ...PEDIDO, role: "master" })).toEqual({ ok: false, erro: "campo_nao_aceito" });
    expect(validarPedido({ ...PEDIDO, pagamento_id: "abc" })).toEqual({ ok: false, erro: "pagamento_invalido" });
    expect(validarPedido({ ...PEDIDO, email: "joana@" })).toEqual({ ok: false, erro: "email_invalido" });
    expect(validarPedido({ ...PEDIDO, nome: "J" })).toEqual({ ok: false, erro: "nome_invalido" });
    expect(validarPedido({ ...PEDIDO, restaurante: " " })).toEqual({ ok: false, erro: "restaurante_invalido" });
    expect(validarPedido({ ...PEDIDO, whatsapp: "9999" })).toEqual({ ok: false, erro: "whatsapp_invalido" });
    expect(validarPedido({ ...PEDIDO, valor: "muito" })).toEqual({ ok: false, erro: "valor_invalido" });
    expect(validarPedido({ ...PEDIDO, lead_id: "x y" })).toEqual({ ok: false, erro: "lead_invalido" });
  });
});

describe("idLivre", () => {
  it("usa o candidato ou o primeiro sufixo livre", () => {
    expect(idLivre("burger-x", new Set())).toBe("burger-x");
    expect(idLivre("burger-x", new Set(["burger-x", "burger-x-2"]))).toBe("burger-x-3");
    expect(idLivre("a", new Set(["a", "a-2"]), 2)).toBeNull();
  });
});

describe("módulos da unidade nova (decisão de 15/10)", () => {
  it("todos os módulos ligados, estoque no banco (decisão de 15/10/2026)", () => {
    expect(MODULOS_UNIDADE_NOVA).toMatchObject({
      fonte_dados_estoque: "banco",
      consolidado_vendas_habilitado: true,
      financeiro_gerencial_habilitado: true,
      financeiro_liberado_equipe: true,
      fichas_tecnicas_habilitado: true,
      garante_habilitado: true,
      extrato_estoque_habilitado: true,
    });
  });
});

describe("whatsappDoCrm e chaveEnvio", () => {
  it("CRM guarda só os dígitos sem o 55", () => {
    expect(whatsappDoCrm("+5531999991111")).toBe("31999991111");
    expect(whatsappDoCrm("+351912345678")).toBeNull();
  });
  it("chave aceita pela rota do Vini e diferente a cada tentativa", () => {
    expect(chaveEnvio("9001", 1)).toMatch(/^[A-Za-z0-9-]{8,80}$/);
    expect(chaveEnvio("9001", 1)).not.toBe(chaveEnvio("9001", 2));
  });
});
