import { describe, expect, it } from "vitest";
import { LIMITE_ALERTAS_MENSAGEM, linhaDoAlerta, montarMensagemAlertas, notasDoAlerta, telefoneParaEnvio, type AlertaParaEnvio, comentarioSeguro } from "./alertas";

function alerta(p: Partial<AlertaParaEnvio>): AlertaParaEnvio {
  return {
    respostaId: "r1",
    criadoEm: "2026-11-12T23:14:00.000Z",
    origem: "salao",
    atendimento: 2,
    comida: 4,
    nps: 5,
    espera: "mais_de_45",
    comentario: null,
    whatsappCliente: null,
    ...p,
  };
}

describe("mensagem do alerta de nota baixa", () => {
  it("uma linha por avaliação, com origem, hora de Brasília, notas e espera", () => {
    expect(notasDoAlerta({ atendimento: 2, comida: null, nps: 5 })).toBe("Atendimento 2, Indicaria 5");
    expect(linhaDoAlerta(alerta({}))).toBe("Salão, 12/11/2026 20:14: Atendimento 2, Comida 4, Indicaria 5. Espera: Mais de 45 min.");
  });

  it("comentário entre aspas e contato só quando a pessoa autorizou", () => {
    const l = linhaDoAlerta(alerta({ origem: "delivery", comentario: "Chegou\nfrio", whatsappCliente: "5516999990001" }));
    expect(l).toContain('Comentário: "Chegou frio"');
    // Revisão de 12/11: o número não vai no alerta; só o aviso de que há contato no painel.
    expect(l).toContain("O cliente deixou contato para retorno: a gestão vê em Avaliações.");
    expect(l).not.toContain("99999");
    expect(linhaDoAlerta(alerta({}))).not.toContain("contato");
  });

  it("link no comentário vira [link removido]; número e preço continuam", () => {
    expect(comentarioSeguro("veja https://golpe.com/pix e www.x.net")).toBe("veja [link removido] e [link removido]");
    expect(comentarioSeguro("acesse pague-aqui.com.br/ja agora")).toBe("acesse [link removido] agora");
    expect(comentarioSeguro("paguei R$ 45.90 e esperei 1.5 h")).toBe("paguei R$ 45.90 e esperei 1.5 h");
  });

  it("cabeçalho com o primeiro nome, lista numerada e resumo acima do limite", () => {
    const m = montarMensagemAlertas({ nomeDestinatario: "Ana Paula", unidadeNome: "Dom Quixote", alertas: [alerta({})] });
    expect(m.split("\n")[0]).toBe("Oi Ana, chegou 1 avaliação com nota baixa na Dom Quixote:");
    expect(m).toContain("1) Salão,");
    expect(m.trimEnd().endsWith("Veja todas no Zatti Hub, em Avaliações.")).toBe(true);
    const muitos = Array.from({ length: LIMITE_ALERTAS_MENSAGEM + 2 }, (_, i) => alerta({ respostaId: `r${i}` }));
    const m2 = montarMensagemAlertas({ nomeDestinatario: null, unidadeNome: "Dom Quixote", alertas: muitos });
    expect(m2.split("\n")[0]).toBe(`chegaram ${LIMITE_ALERTAS_MENSAGEM + 2} avaliações com nota baixa na Dom Quixote:`);
    expect(m2).toContain("E mais 2 no painel.");
    expect(m2).not.toMatch(/—/);
  });

  it("telefone só com dígitos", () => {
    expect(telefoneParaEnvio("+55 16 99999-0001")).toBe("5516999990001");
  });
});
