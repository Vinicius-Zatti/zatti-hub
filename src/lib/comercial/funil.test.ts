import { describe, expect, it } from "vitest";
import { abaAtiva } from "@/components/escritorio/abas-escritorio";
import {
  calcularIndicadores,
  chaveProduto,
  descreverEventos,
  diasDesde,
  filtrarLeads,
  formatarMomentoBr,
  instagramValido,
  linkInstagram,
  linkWhatsapp,
  normalizarInstagram,
  ordemEtapa,
  ROTULO_ETAPA,
  SUGESTAO_ETAPA,
  type EventoLead,
  type Lead,
} from "./funil";

const ev = (p: Partial<EventoLead> & Pick<EventoLead, "tipo" | "em">): EventoLead => ({
  id: p.em, deEtapa: null, paraEtapa: null, produto: "", valor: null, texto: "", autor: "site", ...p,
});

const lead = (p: Partial<Lead>): Lead => ({
  id: "1", whatsapp: "31999990000", instagram: "", cidadeBairro: "", seguidores: null, ultimoPostEm: null,
  notaGoogle: null, avaliacoesGoogle: null, vendeDelivery: "", nome: "Ana", negocio: "", origem: "site", produtoInteresse: "Zatti Hub - plano anual",
  etapa: "preencheu_formulario", motivoPerda: "", faturamentoAtual: "", faturamentoDesejado: "", dificuldade: "",
  proximaAcao: "", proximaAcaoEm: null, organizacaoId: null, criadoEm: "2026-10-02T10:00:00Z",
  etapaDesde: "2026-10-02T10:00:00Z", ultimoEventoEm: "2026-10-02T10:00:00Z", ...p,
});

describe("funil comercial", () => {
  it("compra nunca é etapa anterior ao formulário e perdido fica fora da ordem", () => {
    expect(ordemEtapa("comprou_livro")).toBeGreaterThan(ordemEtapa("preencheu_formulario"));
    expect(ordemEtapa("comprou_app")).toBeGreaterThan(ordemEtapa("comprou_livro"));
    expect(ordemEtapa("perdido")).toBe(0);
  });

  it("formulário e pagamento do mesmo produto caem na mesma chave", () => {
    expect(chaveProduto("Zatti Hub - plano anual")).toBe("zatti-hub");
    expect(chaveProduto("zatti-hub")).toBe("zatti-hub");
    expect(chaveProduto("Livro Restaurante no Controle")).toBe("livro");
    expect(chaveProduto("Consultoria (pesquisa)")).toBe("consultoria");
  });

  it("nova tentativa sem pagamento depois aparece como não finalizou; com pagamento, não", () => {
    const linhas = descreverEventos([
      ev({ tipo: "formulario", em: "2026-10-02T10:00:00Z", produto: "Livro Restaurante no Controle" }),
      ev({ tipo: "nova_tentativa", em: "2026-10-02T10:20:00Z", produto: "Livro Restaurante no Controle" }),
      ev({ tipo: "pagamento", em: "2026-10-02T10:26:00Z", produto: "livro", valor: 37 }),
      ev({ tipo: "nova_tentativa", em: "2026-10-03T09:00:00Z", produto: "Zatti Hub - plano anual" }),
    ]);
    expect(linhas[0].titulo).not.toContain("não finalizou");
    expect(linhas[1].titulo).toBe("Nova tentativa: Livro Restaurante no Controle");
    expect(linhas[2].titulo).toContain("Comprou Livro");
    expect(linhas[3].titulo).toContain("não finalizou a compra");
  });

  it("consultoria não é compra pelo site, então não leva 'não finalizou'", () => {
    const [l] = descreverEventos([ev({ tipo: "formulario", em: "2026-10-02T10:00:00Z", produto: "Consultoria (pesquisa)" })]);
    expect(l.titulo).toBe("Preencheu o formulário: Consultoria (pesquisa)");
  });

  it("indicadores: conversão sobre os leads filtrados, perdido não conta como compra", () => {
    const leads = [
      lead({ id: "a", etapa: "comprou_livro", origem: "instagram" }),
      lead({ id: "b", etapa: "comprou_app", origem: "instagram" }),
      lead({ id: "c", etapa: "preencheu_formulario", origem: "site" }),
      lead({ id: "d", etapa: "perdido", origem: "site" }),
    ];
    const i = calcularIndicadores(leads);
    expect(i.leadsNoPeriodo).toBe(4);
    expect(i.compraram).toBe(2);
    expect(i.conversao).toBe(50);
    expect(i.porOrigem[0]).toEqual({ origem: "instagram", total: 2 });
    expect(calcularIndicadores([]).conversao).toBeNull();
  });

  it("filtros por origem, produto e período", () => {
    const leads = [
      lead({ id: "a", origem: "instagram", produtoInteresse: "Livro Restaurante no Controle", criadoEm: "2026-09-20T10:00:00Z" }),
      lead({ id: "b", origem: "site", produtoInteresse: "Zatti Hub - plano anual", criadoEm: "2026-10-02T10:00:00Z" }),
    ];
    expect(filtrarLeads(leads, { origem: "instagram", produto: "", desde: null }).map((l) => l.id)).toEqual(["a"]);
    expect(filtrarLeads(leads, { origem: "", produto: "zatti-hub", desde: null }).map((l) => l.id)).toEqual(["b"]);
    expect(filtrarLeads(leads, { origem: "", produto: "", desde: "2026-10-01" }).map((l) => l.id)).toEqual(["b"]);
  });

  it("aba Comercial fica ativa nas subpáginas e momento sai no horário de Brasília", () => {
    expect(abaAtiva("/escritorio/comercial")).toBe("/escritorio/comercial");
    expect(abaAtiva("/escritorio/comercial/abc")).toBe("/escritorio/comercial");
    expect(formatarMomentoBr("2026-10-02T13:26:43Z")).toBe("02/10/2026 10:26");
  });

  it("dias na etapa e link do WhatsApp com 55", () => {
    expect(diasDesde("2026-09-28T23:00:00Z", "2026-10-02")).toBe(4);
    expect(linkWhatsapp("31996555532")).toBe("https://wa.me/5531996555532");
  });

  it("prospecção: Começar a seguir, depois Mandar primeira mensagem, depois Abordado", () => {
    expect(ordemEtapa("comecar_a_seguir")).toBe(1);
    expect(ordemEtapa("mandar_primeira_mensagem")).toBe(2);
    expect(ordemEtapa("abordado")).toBe(3);
    expect(ordemEtapa("perdido")).toBe(0);
    expect(ROTULO_ETAPA.comecar_a_seguir).toBe("Começar a seguir");
    expect(SUGESTAO_ETAPA.comecar_a_seguir).toBe("Seguir o perfil no Instagram e passar para Mandar primeira mensagem");
    expect(SUGESTAO_ETAPA.mandar_primeira_mensagem).toBe("Mandar a primeira mensagem curta pelo Direct, sem link");
    expect(ordemEtapa("abordado")).toBeGreaterThan(ordemEtapa("mandar_primeira_mensagem"));
    expect(ordemEtapa("respondeu")).toBeGreaterThan(ordemEtapa("abordado"));
  });

  it("@ do Instagram normalizado e link do perfil derivado", () => {
    expect(normalizarInstagram(" @Hamburgueria.Do_Ze ")).toBe("hamburgueria.do_ze");
    expect(normalizarInstagram("https://www.instagram.com/PizzariaX/?hl=pt-br")).toBe("pizzariax");
    expect(normalizarInstagram("instagram.com/burger_y")).toBe("burger_y");
    expect(normalizarInstagram("")).toBe("");
    expect(instagramValido("pizzariax")).toBe(true);
    expect(instagramValido("pizza ria")).toBe(false);
    expect(linkInstagram("pizzariax")).toBe("https://www.instagram.com/pizzariax/");
  });

  it("evento criado aparece na linha do tempo com a etapa de entrada", () => {
    const [l] = descreverEventos([
      ev({ tipo: "criado", em: "2026-10-07T10:00:00Z", paraEtapa: "comecar_a_seguir", autor: "vinicius" }),
    ]);
    expect(l.titulo).toBe("Lead cadastrado em Começar a seguir");
  });
});
