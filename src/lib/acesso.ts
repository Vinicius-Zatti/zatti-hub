import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "gestao" | "operacional" | "master";
export type FonteDadosEstoque = "planilha" | "banco";

/** Nome do cookie que guarda qual organização a pessoa escolheu ver, pra
 * quem tem acesso a mais de uma (master, ou alguém com vínculo em dois
 * clientes). Só um hint de preferência - nunca é a fonte da autorização,
 * `getAcessoAtual` sempre confere contra o banco (vínculo real, ou RLS no
 * caso de master). */
const COOKIE_ORGANIZACAO = "zh_org";

export type AcessoAtual = {
  userId: string;
  usuarioEmail: string;
  /** Nome cadastrado em `perfis.nome` (convite ou editado depois no Painel
   * de Acessos) - `null` quem nunca teve nome definido, a UI cai pro email. */
  usuarioNome: string | null;
  organizacaoId: string;
  organizacaoNome: string;
  unidadeId: string;
  unidadeNome: string;
  spreadsheetId: string | null;
  fonteDadosEstoque: FonteDadosEstoque;
  /** Liga o menu Financeiro > Consolidado de Vendas pra essa unidade -
   * configurável por cliente, editado direto no Supabase (sem tela de
   * admin), mesma convenção de `spreadsheet_id`/`ativo`. */
  consolidadoVendasHabilitado: boolean;
  /** Liga o menu Fichas Técnicas pra essa unidade - piloto exclusivo,
  * mesma convenção de `consolidado_vendas_habilitado` (editado direto no
  * Supabase, sem tela de admin). */
  fichasTecnicasHabilitado: boolean;
  /** Liga o módulo Financeiro gerencial (DRE/DFC/Caixa/Provisões, em
   * /financeiro-gerencial) pra essa unidade - não confundir com o módulo
   * "Financeiro" antigo (Consolidado de Vendas, `consolidadoVendasHabilitado`,
   * renomeado pra "Desempenho" no menu). Mesma convenção de flag por
   * unidade, editada direto no Supabase. */
  financeiroGerencialHabilitado: boolean;
  role: Role;
  /** Todas as organizações que essa pessoa pode ver - mais de uma linha
   * aqui é o sinal pra mostrar o seletor no cabeçalho. Pra role "master"
   * são todas as organizações ativas da plataforma; pra role normal, só as
   * que têm vínculo. */
  organizacoesDisponiveis: { id: string; nome: string }[];
};

type VinculoRow = {
  organizacao_id: string;
  unidade_id: string | null;
  role: Role;
  organizacoes: { nome: string } | null;
};

type OrganizacaoRow = { id: string; nome: string };

type UnidadeRow = {
  id: string;
  nome: string;
  spreadsheet_id: string | null;
  fonte_dados_estoque: FonteDadosEstoque;
  consolidado_vendas_habilitado: boolean;
  fichas_tecnicas_habilitado: boolean;
  financeiro_gerencial_habilitado: boolean;
};

/** Resolve quem está logado e a que organização/unidade ele tem acesso,
 * direto da sessão - nunca a partir de um id vindo de formulário ou da URL.
 * Redireciona pra fora de qualquer página protegida se não achar sessão ou
 * vínculo ativo. Cacheado por request (React `cache`) pra não bater no
 * banco mais de uma vez quando layout e página chamam isso na mesma
 * renderização. */
export const getAcessoAtual = cache(async (): Promise<AcessoAtual> => {
  const supabase = await createClient();
  const { data: claims, error: erroClaims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (erroClaims || !userId) redirect("/login");

  const [{ data: vinculosData, error: erroVinculos }, { data: perfil }] = await Promise.all([
    supabase
      .from("vinculos")
      .select("organizacao_id, unidade_id, role, organizacoes(nome)")
      .eq("user_id", userId)
      .eq("status", "ativo"),
    supabase.from("perfis").select("nome").eq("id", userId).maybeSingle(),
  ]);

  if (erroVinculos) {
    console.error("Falha ao consultar os vínculos do usuário:", {
      codigo: erroVinculos.code,
      mensagem: erroVinculos.message,
      detalhes: erroVinculos.details,
    });
    throw new Error("Não foi possível validar o acesso do usuário.");
  }

  const vinculos = (vinculosData as unknown as VinculoRow[] | null) ?? [];
  if (vinculos.length === 0) redirect("/sem-acesso");

  const ehMaster = vinculos.some((v) => v.role === "master");
  // Sessao administrativa precisa de segundo fator. A mesma exigencia esta
  // nos helpers de RLS, portanto vale tambem para chamadas diretas a Data API.
  if (ehMaster && claims.claims.aal !== "aal2") redirect("/mfa");
  const cookieStore = await cookies();
  const orgEscolhida = cookieStore.get(COOKIE_ORGANIZACAO)?.value;

  let organizacoesDisponiveis: { id: string; nome: string }[];
  let organizacaoId: string;
  let role: Role;

  if (ehMaster) {
    // Master enxerga toda organização ativa da plataforma, sem precisar de
    // um vínculo por cliente - RLS em `organizacoes`/`unidades` já dá esse
    // acesso pra quem tem qualquer vínculo com role "master".
    const { data: todasOrgs } = await supabase
      .from("organizacoes")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome");
    organizacoesDisponiveis = (todasOrgs as unknown as OrganizacaoRow[] | null) ?? [];
    if (organizacoesDisponiveis.length === 0) redirect("/sem-acesso");

    if (organizacoesDisponiveis.some((o) => o.id === orgEscolhida)) {
      organizacaoId = orgEscolhida!;
    } else {
      // Sem preferência salva ainda: não pode cair na primeira organização
      // em ordem alfabética sem checar se ela já tem dado configurado, senão
      // master fica preso na tela de "planilha pendente" de um cliente novo
      // (sem seletor pra sair de lá) mesmo tendo outras organizações prontas.
      const { data: unidadesProntas } = await supabase
        .from("unidades")
        .select("organizacao_id, spreadsheet_id, fonte_dados_estoque")
        .in(
          "organizacao_id",
          organizacoesDisponiveis.map((o) => o.id),
        )
        .eq("ativo", true);

      const orgsComDados = new Set(
        ((unidadesProntas as {
          organizacao_id: string;
          spreadsheet_id: string | null;
          fonte_dados_estoque: FonteDadosEstoque;
        }[] | null) ?? [])
          .filter((u) => u.fonte_dados_estoque === "banco" || Boolean(u.spreadsheet_id))
          .map((u) => u.organizacao_id),
      );
      organizacaoId =
        organizacoesDisponiveis.find((o) => orgsComDados.has(o.id))?.id ??
        organizacoesDisponiveis[0].id;
    }
    role = "master";
  } else {
    organizacoesDisponiveis = vinculos.map((v) => ({
      id: v.organizacao_id,
      nome: v.organizacoes?.nome ?? "",
    }));
    const vinculo =
      vinculos.find((v) => v.organizacao_id === orgEscolhida) ?? vinculos[0];
    organizacaoId = vinculo.organizacao_id;
    role = vinculo.role;
  }

  // unidade_id do vínculo específico só existe fora do caso master (que já
  // resolveu a organização acima, não uma unidade específica) - busca a
  // primeira unidade ativa dessa organização por padrão nos dois casos,
  // exceto quando o vínculo trava numa unidade única.
  const vinculoDaOrg = vinculos.find((v) => v.organizacao_id === organizacaoId);
  const unidadeFixa = !ehMaster ? vinculoDaOrg?.unidade_id ?? null : null;

  const unidadeQuery = unidadeFixa
    ? supabase
        .from("unidades")
        .select("id, nome, spreadsheet_id, fonte_dados_estoque, consolidado_vendas_habilitado, fichas_tecnicas_habilitado, financeiro_gerencial_habilitado")
        .eq("id", unidadeFixa)
        .eq("ativo", true)
        .limit(1)
    : supabase
        .from("unidades")
        .select("id, nome, spreadsheet_id, fonte_dados_estoque, consolidado_vendas_habilitado, fichas_tecnicas_habilitado, financeiro_gerencial_habilitado")
        .eq("organizacao_id", organizacaoId)
        .eq("ativo", true)
        .order("id")
        .limit(1);

  const { data: unidades } = await unidadeQuery;
  const unidade = (unidades as unknown as UnidadeRow[] | null)?.[0];
  if (!unidade) redirect("/sem-acesso");
  if (unidade.fonte_dados_estoque === "planilha" && !unidade.spreadsheet_id) {
    redirect("/planilha-pendente");
  }

  return {
    userId,
    usuarioEmail: typeof claims.claims.email === "string" ? claims.claims.email : "",
    usuarioNome: (perfil as { nome: string | null } | null)?.nome ?? null,
    organizacaoId,
    organizacaoNome:
      organizacoesDisponiveis.find((o) => o.id === organizacaoId)?.nome ?? "",
    unidadeId: unidade.id,
    unidadeNome: unidade.nome,
    spreadsheetId: unidade.spreadsheet_id,
    fonteDadosEstoque: unidade.fonte_dados_estoque,
    consolidadoVendasHabilitado: unidade.consolidado_vendas_habilitado,
    fichasTecnicasHabilitado: unidade.fichas_tecnicas_habilitado,
    financeiroGerencialHabilitado: unidade.financeiro_gerencial_habilitado,
    role,
    organizacoesDisponiveis,
  };
});

/** Barreira real pras telas/ações só de Gestão (master conta como gestão em
 * qualquer organização) - chamar tanto no layout (esconde navegação)
 * quanto dentro de cada Server Action que grava dado (impede a escrita
 * mesmo que alguém chame a action direto, sem passar pela tela). */
export async function requireGestao(): Promise<AcessoAtual> {
  const acesso = await getAcessoAtual();
  if (acesso.role !== "gestao" && acesso.role !== "master") redirect("/estoque/contagem");
  return acesso;
}

/** Barreira de autorizacao do modulo Financeiro. A flag no layout controla a
 * navegacao; esta funcao protege tambem Server Actions chamadas diretamente.
 * A mesma regra e repetida nas policies do banco como ultima barreira. */
export async function requireConsolidadoVendas(): Promise<AcessoAtual> {
  const acesso = await getAcessoAtual();
  if (!acesso.consolidadoVendasHabilitado) redirect("/estoque/contagem");
  return acesso;
}

/** Edicao do consolidado exige simultaneamente modulo habilitado e papel de
 * Gestao (master continua com os mesmos privilegios administrativos). */
export async function requireGestaoConsolidado(): Promise<AcessoAtual> {
  const acesso = await requireGestao();
  if (!acesso.consolidadoVendasHabilitado) redirect("/estoque/contagem");
  return acesso;
}

/** Barreira de autorizacao do modulo Fichas Tecnicas (piloto exclusivo). A
 * flag no layout controla a navegacao; esta funcao protege tambem Server
 * Actions chamadas diretamente. A mesma regra e repetida em
 * `usuario_pode_usar_fichas` no banco como ultima barreira. */
export async function requireFichasTecnicas(): Promise<AcessoAtual> {
  const acesso = await getAcessoAtual();
  if (!acesso.fichasTecnicasHabilitado) redirect("/estoque/contagem");
  return acesso;
}

/** Escrita em Fichas Tecnicas exige simultaneamente modulo habilitado e
 * papel de Gestao (master continua com os mesmos privilegios
 * administrativos) - consulta e liberada pra todos os papeis. */
export async function requireGestaoFichasTecnicas(): Promise<AcessoAtual> {
  const acesso = await requireGestao();
  if (!acesso.fichasTecnicasHabilitado) redirect("/estoque/contagem");
  return acesso;
}

/** Barreira de autorizacao do modulo Financeiro gerencial (DRE/DFC/Caixa,
 * piloto exclusivo). A flag no layout controla a navegacao; esta funcao
 * protege tambem Server Actions chamadas diretamente. A mesma regra e
 * repetida em `usuario_pode_usar_financeiro_gerencial` no banco como ultima
 * barreira. */
export async function requireFinanceiroGerencial(): Promise<AcessoAtual> {
  const acesso = await getAcessoAtual();
  if (!acesso.financeiroGerencialHabilitado) redirect("/estoque/contagem");
  return acesso;
}

/** Escrita que exige simultaneamente modulo habilitado e papel de Gestao
 * (master continua com os mesmos privilegios administrativos) - usado pra
 * contas financeiras, categorias proprias, estoque mensal, provisoes e
 * fechamento; consulta e lancamento comum usam so `requireFinanceiroGerencial`. */
export async function requireGestaoFinanceiroGerencial(): Promise<AcessoAtual> {
  const acesso = await requireGestao();
  if (!acesso.financeiroGerencialHabilitado) redirect("/estoque/contagem");
  return acesso;
}

/** Barreira pra telas ainda em construção, visíveis só pro Vinícius
 * (master) enquanto não são validadas pra virar acesso real de cliente. */
export async function requireMaster(): Promise<AcessoAtual> {
  const acesso = await getAcessoAtual();
  if (acesso.role !== "master") redirect("/estoque/pedidos");
  return acesso;
}

/** Barreira do módulo pessoal "Meu Tempo" (controle de horas de Vinícius por
 * frente/cliente) - visível e operável só por master, sem flag de habilitação
 * por unidade (não é módulo de cliente). Aplica direto sobre `requireMaster()`,
 * mesmo padrão de composição de `requireGestaoFinanceiroGerencial`. A mesma
 * regra é repetida em `usuario_e_master()` no banco como última barreira, e
 * toda tabela do módulo também filtra por `criado_por = auth.uid()` (dados
 * pessoais por usuário, pensando num possível segundo master no futuro). */
export async function requireMeuTempo(): Promise<AcessoAtual> {
  return requireMaster();
}

/** Log mínimo de auditoria: quem mudou o quê, quando, em qual unidade. Uma
 * falha aqui nunca deve derrubar a ação de verdade do usuário, por isso
 * engole o erro (só loga no servidor). */
export async function registrarAuditoria(params: {
  acesso: AcessoAtual;
  acao: string;
  entidade: string;
  entidadeId: string;
  dadosAntigos?: unknown;
  dadosNovos?: unknown;
}): Promise<void> {
  await registrarAuditoriaBatch([params]);
}

/** Mesmo log, várias linhas num único insert - usado pelo "Salvar todos"
 * das grades de edição, que antes gravava auditoria uma chamada por linha
 * junto com o resto do save em paralelo. */
export async function registrarAuditoriaBatch(
  entradas: {
    acesso: AcessoAtual;
    acao: string;
    entidade: string;
    entidadeId: string;
    dadosAntigos?: unknown;
    dadosNovos?: unknown;
  }[]
): Promise<void> {
  if (entradas.length === 0) return;
  try {
    const supabase = await createClient();
    await supabase.from("logs_auditoria").insert(
      entradas.map((params) => ({
        unidade_id: params.acesso.unidadeId,
        user_id: params.acesso.userId,
        acao: params.acao,
        entidade: params.entidade,
        entidade_id: params.entidadeId,
        dados_antigos: sanitizarAuditoria(params.dadosAntigos),
        dados_novos: sanitizarAuditoria(params.dadosNovos),
      }))
    );
  } catch {
    console.error("Falha ao gravar log de auditoria");
  }
}

const CAMPOS_SENSIVEIS_AUDITORIA = /^(senha|password|token|secret|authorization|cookie|cpf|cnpj|email|telefone|whatsapp)$/i;

function sanitizarAuditoria(valor: unknown, profundidade = 0): unknown {
  if (valor === undefined || valor === null) return null;
  if (profundidade >= 4) return "[limite]";
  if (typeof valor === "string") return valor.slice(0, 500);
  if (typeof valor === "number" || typeof valor === "boolean") return valor;
  if (Array.isArray(valor)) {
    return valor.slice(0, 50).map((item) => sanitizarAuditoria(item, profundidade + 1));
  }
  if (typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .slice(0, 80)
        .map(([chave, conteudo]) => [
          chave,
          CAMPOS_SENSIVEIS_AUDITORIA.test(chave)
            ? "[redigido]"
            : sanitizarAuditoria(conteudo, profundidade + 1),
        ]),
    );
  }
  return String(valor).slice(0, 200);
}
