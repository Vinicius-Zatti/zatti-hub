import { describe, expect, it } from "vitest";
import {
  LIMITE_LINHAS_MENSAGEM,
  diaRelativo,
  linhaDoAviso,
  montarMensagemAvisos,
  motivoVinculoAvisos,
  telefoneParaEnvio,
  textoSituacaoAvisos,
  textoValorResposta,
  type AvisoParaEnvio,
} from "./avisos";

const HOJE = "2026-10-13";

const atrasado: AvisoParaEnvio = {
  chave: "atrasado:p1:2026-10-13",
  tipo: "atrasado",
  evento_em: "2026-10-13T13:00:00+00:00",
  detalhes: { modelo_nome: "Abertura de cozinha", horario_limite: "10:00", data: "2026-10-13", responsavel_nome: "Caio Operador Silva" },
};
const naoConcluido: AvisoParaEnvio = {
  chave: "nao_concluido:p1:2026-10-12",
  tipo: "nao_concluido",
  evento_em: "2026-10-13T02:59:59+00:00",
  detalhes: { modelo_nome: "Fechamento", horario_limite: "23:00", data: "2026-10-12", responsavel_nome: null },
};
const critico: AvisoParaEnvio = {
  chave: "critico:e1:i2",
  tipo: "critico_fora_da_meta",
  evento_em: "2026-10-13T13:15:00+00:00",
  detalhes: { modelo_nome: "Abertura de cozinha", data: "2026-10-13", item_titulo: "Temperatura dos refrigerados", item_tipo: "numero", valor_bool: null, valor_numero: 9, meta_min: 0, meta_max: 5, responsavel_nome: "Caio" },
};

describe("dia relativo e valor", () => {
  it("hoje, ontem e data curta sem passar por fuso", () => {
    expect(diaRelativo("2026-10-13", HOJE)).toBe("hoje");
    expect(diaRelativo("2026-10-12", HOJE)).toBe("ontem");
    expect(diaRelativo("2026-10-01", HOJE)).toBe("01/10");
    expect(diaRelativo("2026-09-30", "2026-10-01")).toBe("ontem");
    expect(diaRelativo(null, HOJE)).toBe("");
  });
  it("check vira não feito; número e estrelas em palavras; vírgula brasileira", () => {
    expect(textoValorResposta({ item_tipo: "check", valor_bool: false })).toBe("não feito");
    expect(textoValorResposta({ item_tipo: "numero", valor_numero: "9.5" })).toBe("9,5");
    expect(textoValorResposta({ item_tipo: "estrelas", valor_numero: 1 })).toBe("1 estrela");
    expect(textoValorResposta({ item_tipo: "estrelas", valor_numero: 2 })).toBe("2 estrelas");
    expect(textoValorResposta({ item_tipo: "numero", valor_numero: null })).toBe("sem valor");
  });
});

describe("linha de cada tipo", () => {
  it("atrasado com horário, dia e primeiro nome do responsável", () => {
    expect(linhaDoAviso(atrasado, HOJE)).toBe("Abertura de cozinha (até 10:00) de hoje passou do horário e ainda não foi concluído. Responsável: Caio.");
  });
  it("não concluído sem responsável não inventa nome", () => {
    expect(linhaDoAviso(naoConcluido, HOJE)).toBe("Fechamento (até 23:00) de ontem não foi concluído dentro do prazo.");
  });
  it("crítico com item, valor, meta e quem respondeu", () => {
    expect(linhaDoAviso(critico, HOJE)).toBe("Item crítico fora da meta em Abertura de cozinha de hoje: Temperatura dos refrigerados = 9 (meta: 0 a 5). Respondido por Caio.");
  });
  it("crítico de check não tem meta numérica", () => {
    const linha = linhaDoAviso(
      { ...critico, detalhes: { ...critico.detalhes, item_tipo: "check", valor_bool: false, valor_numero: null, meta_min: null, meta_max: null, item_titulo: "Fogão ligado" } },
      HOJE,
    );
    expect(linha).toBe("Item crítico fora da meta em Abertura de cozinha de hoje: Fogão ligado = não feito. Respondido por Caio.");
  });
});

describe("mensagem do ciclo", () => {
  it("lista numerada, cabeçalho com o primeiro nome e onde ver", () => {
    const texto = montarMensagemAvisos({ nomeDestinatario: "Ana Gestora", unidadeNome: "Loja Centro", avisos: [atrasado, naoConcluido, critico], hoje: HOJE });
    expect(texto.split("\n")[0]).toBe("Oi Ana, 3 avisos do Checklist Garante da Loja Centro:");
    expect(texto).toContain("1) Abertura de cozinha (até 10:00) de hoje");
    expect(texto).toContain("2) Fechamento (até 23:00) de ontem");
    expect(texto).toContain("3) Item crítico fora da meta");
    expect(texto.endsWith("\n\nVeja no Zatti Hub, em Garante > Quadro do dia.")).toBe(true);
    expect(texto).not.toMatch(/[—–]/);
  });
  it("sem nome do destinatário e com um aviso só", () => {
    const texto = montarMensagemAvisos({ nomeDestinatario: null, unidadeNome: "Loja Centro", avisos: [critico], hoje: HOJE });
    expect(texto.split("\n")[0]).toBe("1 aviso do Checklist Garante da Loja Centro:");
  });
  it("acima do limite resume o resto", () => {
    const muitos = Array.from({ length: LIMITE_LINHAS_MENSAGEM + 3 }, (_, i) => ({ ...atrasado, chave: `atrasado:p${i}:2026-10-13` }));
    const texto = montarMensagemAvisos({ nomeDestinatario: "Ana", unidadeNome: "Loja", avisos: muitos, hoje: HOJE });
    expect(texto).toContain(`${LIMITE_LINHAS_MENSAGEM}) `);
    expect(texto).not.toContain(`${LIMITE_LINHAS_MENSAGEM + 1}) `);
    expect(texto).toContain("E mais 3 avisos no Quadro do dia.");
  });
});

describe("telefone e situação", () => {
  it("E.164 vira só dígitos para o Vini", () => {
    expect(telefoneParaEnvio("+5516999990000")).toBe("5516999990000");
    expect(telefoneParaEnvio("+1 415 555 0100")).toBe("14155550100");
  });
  it("frases da tela cobrem responsável inválido, fila, incertos e falhas", () => {
    expect(textoSituacaoAvisos({ pendentes: 0, incertos: 0, falharam: 0, motivoResponsavel: null }, false)).toEqual(["Ninguém recebe os avisos desta unidade ainda."]);
    expect(textoSituacaoAvisos({ pendentes: 0, incertos: 0, falharam: 0, motivoResponsavel: null }, true)).toEqual(["Nenhum aviso pendente."]);
    const frases = textoSituacaoAvisos({ pendentes: 2, incertos: 1, falharam: 3, motivoResponsavel: "sem_whatsapp" }, true);
    expect(frases[0]).toMatch(/sem WhatsApp cadastrado/);
    expect(frases).toContain("2 avisos esperando o próximo envio.");
    expect(frases).toContain("1 envio incerto (o WhatsApp pode ter saído sem confirmação; não repete).");
    expect(frases).toContain("3 avisos não puderam ser enviados depois de 3 tentativas.");
    expect(textoSituacaoAvisos({ pendentes: 1, incertos: 0, falharam: 0, motivoResponsavel: "sem_acesso" }, true)[0]).toMatch(/perdeu o acesso/);
  });
  it("elegibilidade do vínculo segue a regra do banco", () => {
    const unidade = { id: "org-a-loja", organizacaoId: "org-a" };
    const base = { status: "ativo", role: "gestao", organizacaoId: "org-a", unidadeId: null, whatsapp: "+5516999990000" };
    expect(motivoVinculoAvisos(base, unidade)).toBeNull();
    expect(motivoVinculoAvisos({ ...base, unidadeId: "org-a-loja" }, unidade)).toBeNull();
    expect(motivoVinculoAvisos({ ...base, role: "master", organizacaoId: "org-b" }, unidade)).toBeNull();
    expect(motivoVinculoAvisos({ ...base, unidadeId: "org-a-loja2" }, unidade)).toBe("sem_acesso");
    expect(motivoVinculoAvisos({ ...base, role: "operacional" }, unidade)).toBe("sem_acesso");
    expect(motivoVinculoAvisos({ ...base, status: "revogado" }, unidade)).toBe("sem_acesso");
    expect(motivoVinculoAvisos({ ...base, organizacaoId: "org-b" }, unidade)).toBe("sem_acesso");
    expect(motivoVinculoAvisos({ ...base, whatsapp: null }, unidade)).toBe("sem_whatsapp");
  });
});
