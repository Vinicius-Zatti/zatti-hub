import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const envios: Array<Record<string, unknown>> = [];
let respostaEnvio: "aceito" | "falhou" | "incerto" = "aceito";
vi.mock("@/lib/equipe/envio", () => ({
  enviarAcessoPeloVini: async (dados: Record<string, unknown>) => {
    envios.push(dados);
    return respostaEnvio;
  },
}));

const { executarProvisionamento } = await import("./servidor");
type Registro = Parameters<typeof executarProvisionamento>[1];

// Banco falso em memória: só o que o cadastro automático usa do supabase-js.
type Linha = Record<string, unknown>;
function bancoFalso(inicial: Record<string, Linha[]> = {}) {
  const tabelas: Record<string, Linha[]> = { organizacoes: [], unidades: [], perfis: [], vinculos: [], senhas_temporarias: [], zh_provisionamentos: [], zh_leads: [], zh_leads_eventos: [], ...inicial };
  const usuarios: Array<{ id: string; email: string; app_metadata: Record<string, unknown> }> = [];
  const falhas = new Set<string>(); // "insert:vinculos" etc.
  let seq = 0;

  function consulta(tabela: string) {
    const filtros: Array<[string, unknown]> = [];
    let op: "select" | "insert" | "update" | "upsert" = "select";
    let carga: Linha | null = null;
    const linhas = () => (tabelas[tabela] ??= []);
    const filtradas = () => linhas().filter((l) => filtros.every(([c, v]) => l[c] === v));
    const executar = () => {
      if (falhas.has(`${op}:${tabela}`)) return { data: null, error: { code: "XX000", message: "falha simulada" } };
      if (op === "select") return { data: filtradas(), error: null };
      if (op === "insert") {
        const nova = { id: (carga!.id as string) ?? `id-${++seq}`, ...carga };
        if (linhas().some((l) => l.id === nova.id)) return { data: null, error: { code: "23505", message: "duplicado" } };
        linhas().push(nova);
        return { data: [nova], error: null };
      }
      if (op === "upsert") {
        const i = linhas().findIndex((l) => l.user_id === carga!.user_id);
        if (i >= 0) linhas()[i] = { ...linhas()[i], ...carga };
        else linhas().push({ ...carga });
        return { data: null, error: null };
      }
      for (const l of filtradas()) Object.assign(l, carga);
      return { data: null, error: null };
    };
    const q = {
      select: () => q,
      insert: (l: Linha) => ((op = "insert"), (carga = l), q),
      update: (l: Linha) => ((op = "update"), (carga = l), q),
      upsert: (l: Linha) => ((op = "upsert"), (carga = l), q),
      eq: (c: string, v: unknown) => (filtros.push([c, v]), q),
      maybeSingle: async () => {
        const r = executar();
        return { data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error };
      },
      single: async () => {
        const r = executar();
        return { data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error };
      },
      then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(executar()).then(ok, erro),
    };
    return q;
  }

  const admin = {
    from: consulta,
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: usuarios }, error: null }),
        createUser: async (dados: { email: string; app_metadata: Record<string, unknown> }) => {
          if (falhas.has("createUser")) return { data: { user: null }, error: { message: "falha" } };
          const user = { id: `user-${++seq}`, email: dados.email, app_metadata: dados.app_metadata };
          usuarios.push(user);
          return { data: { user }, error: null };
        },
        deleteUser: async (id: string) => {
          const i = usuarios.findIndex((u) => u.id === id);
          if (i >= 0) usuarios.splice(i, 1);
          tabelas.perfis = tabelas.perfis.filter((p) => p.id !== id);
          tabelas.vinculos = tabelas.vinculos.filter((v) => v.user_id !== id);
          return { error: null };
        },
      },
    },
  };
  return { admin: admin as never, tabelas, usuarios, falhas };
}

function registro(extra: Partial<Registro> = {}): Registro {
  return {
    id: "reg-1", pagamento_id: "9001", status: "processando", email: "joana@exemplo.com", nome: "Joana Teste",
    whatsapp: "+5531999991111", restaurante: "Burger da Joana", organizacao_id: null, unidade_id: null,
    user_id: null, vinculo_id: null, envio: null, motivo: "", tentativas: 1, ...extra,
  };
}

beforeEach(() => {
  envios.length = 0;
  respostaEnvio = "aceito";
});

describe("executarProvisionamento", () => {
  it("cria organização SaaS, unidade com os módulos decididos, conta de gestão e manda o acesso", async () => {
    const b = bancoFalso({ zh_provisionamentos: [registro() as never], zh_leads: [{ id: "lead-1", whatsapp: "31999991111", organizacao_id: null }] });
    const r = await executarProvisionamento(b.admin, registro(), new Date("2026-10-15T15:00:00Z"));
    expect(r).toEqual({ status: "concluido", envio: "aceito", organizacaoId: "burger-da-joana" });
    expect(b.tabelas.organizacoes).toEqual([{ id: "burger-da-joana", nome: "Burger da Joana", tipo_cliente: "saas", ativo: true, equipe_habilitado: true, vigencia_fim: "2027-10-15", renovacao_token: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/) }]);
    const unidade = b.tabelas.unidades[0];
    expect(unidade).toMatchObject({ organizacao_id: "burger-da-joana", nome: "Burger da Joana", fonte_dados_estoque: "banco", fichas_tecnicas_habilitado: true, financeiro_gerencial_habilitado: true, financeiro_liberado_equipe: true, garante_habilitado: true });
    expect(b.tabelas.vinculos[0]).toMatchObject({ role: "gestao", status: "convidado", unidade_id: null, whatsapp: "+5531999991111" });
    expect(b.usuarios[0].app_metadata).toEqual({ zh_pendente: true, zh_v2: true });
    // Só o hash vai ao banco; a senha só aparece no pedido ao Vini.
    const senha = envios[0].senhaTemporaria as string;
    expect(senha).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(JSON.stringify(b.tabelas)).not.toContain(senha);
    expect(envios[0]).toMatchObject({ tipo: "conta_nova", whatsapp: "+5531999991111", email: "joana@exemplo.com", organizacaoNome: "Burger da Joana", idempotencia: "compra-9001-1" });
    expect(b.tabelas.zh_provisionamentos[0]).toMatchObject({ status: "concluido", envio: "aceito", organizacao_id: "burger-da-joana", user_id: b.usuarios[0].id });
    expect(b.tabelas.zh_leads[0].organizacao_id).toBe("burger-da-joana");
    expect(b.tabelas.zh_leads_eventos[0]).toMatchObject({ tipo: "virou_cliente", autor: "vini", chave_externa: "prov-9001" });
  });

  it("e-mail que já tem conta: nada é criado, vai para revisão manual", async () => {
    const b = bancoFalso({ zh_provisionamentos: [registro() as never] });
    b.usuarios.push({ id: "u-antigo", email: "joana@exemplo.com", app_metadata: {} });
    const r = await executarProvisionamento(b.admin, registro());
    expect(r).toEqual({ status: "revisao_manual", motivo: "E-mail já tem conta no Zatti Hub" });
    expect(b.tabelas.organizacoes).toHaveLength(0);
    expect(envios).toHaveLength(0);
  });

  it("nome de restaurante repetido ganha sufixo em vez de travar a compra", async () => {
    const b = bancoFalso({ organizacoes: [{ id: "burger-da-joana" }], zh_provisionamentos: [registro() as never] });
    const r = await executarProvisionamento(b.admin, registro());
    expect(r).toMatchObject({ status: "concluido", organizacaoId: "burger-da-joana-2" });
  });

  it("falha no vínculo desfaz a conta e grava o andamento; a retomada reaproveita organização e unidade", async () => {
    const b = bancoFalso({ zh_provisionamentos: [registro() as never] });
    b.falhas.add("insert:vinculos");
    const r1 = await executarProvisionamento(b.admin, registro());
    expect(r1).toEqual({ status: "falhou", motivo: "não criou o vínculo" });
    expect(b.usuarios).toHaveLength(0);
    const salvo = b.tabelas.zh_provisionamentos[0] as unknown as Registro;
    expect(salvo).toMatchObject({ status: "falhou", organizacao_id: "burger-da-joana" });
    expect(salvo.unidade_id).toBeTruthy();

    b.falhas.clear();
    const r2 = await executarProvisionamento(b.admin, { ...salvo, status: "processando", tentativas: 2 });
    expect(r2).toMatchObject({ status: "concluido", organizacaoId: "burger-da-joana" });
    expect(b.tabelas.organizacoes).toHaveLength(1);
    expect(b.tabelas.unidades).toHaveLength(1);
    expect(envios[0].idempotencia).toBe("compra-9001-2");
  });

  it("retomada depois da conta criada: senha nova, sem conta nova nem revisão manual", async () => {
    const b = bancoFalso({ zh_provisionamentos: [registro() as never] });
    respostaEnvio = "incerto";
    await executarProvisionamento(b.admin, registro());
    const salvo = b.tabelas.zh_provisionamentos[0] as unknown as Registro;
    expect(salvo).toMatchObject({ status: "concluido", envio: "incerto" });
    const hashAntes = b.tabelas.senhas_temporarias[0].hash;
    respostaEnvio = "aceito";
    const r = await executarProvisionamento(b.admin, { ...salvo, status: "processando", tentativas: 2 });
    expect(r).toMatchObject({ status: "concluido", envio: "aceito" });
    expect(b.usuarios).toHaveLength(1);
    expect(b.tabelas.senhas_temporarias).toHaveLength(1);
    expect(b.tabelas.senhas_temporarias[0].hash).not.toBe(hashAntes);
  });
});
