import "server-only";
import type { AcessoAtual } from "@/lib/acesso";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TipoItemGarante } from "@/lib/garante/biblioteca";
import { REGRA_PADRAO, type SituacaoAgenda } from "@/lib/garante/regras";
import { intervaloNota, normalizarLinhaNota, type LinhaNota, type LinhaNotaBruta } from "@/lib/garante/nota";
import { contarAtrasados, contarCriticosFora, textoRespostaOrigem, type SituacaoPlano } from "@/lib/garante/planos";

export type LinhaAgenda = {
  publicacaoId: string;
  modeloNome: string;
  setorNome: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  horarioLimite: string;
  prazo: string;
  execucaoId: string | null;
  situacao: SituacaoAgenda;
  totalItens: number;
  respondidos: number;
  foraDaMeta: number;
  concluidaEm: string | null;
  /** Janela (regra da unidade vigente na data, ou a gravada ao iniciar). */
  abreEm: string;
  fechaEm: string;
  ehMinha: boolean;
};

/** Agenda do dia da unidade da sessão (RPC garante_agenda, com RLS de quem
 * chama). Operacional vê só o que é dele ou sem responsável. */
export async function carregarAgenda(acesso: AcessoAtual, data: string): Promise<LinhaAgenda[]> {
  const supabase = await createClient();
  const { data: linhas, error } = await supabase.rpc("garante_agenda", { p_unidade_id: acesso.unidadeId, p_data: data });
  if (error) throw new Error("Não foi possível carregar os checklists do dia.");
  const brutas = (linhas ?? []) as {
    publicacao_id: string;
    modelo_nome: string;
    setor_id: string | null;
    responsavel_id: string | null;
    horario_limite: string;
    prazo: string;
    execucao_id: string | null;
    situacao: SituacaoAgenda;
    total_itens: number;
    respondidos: number;
    fora_da_meta: number;
    concluida_em: string | null;
    abre_em: string;
    fecha_em: string;
  }[];

  const responsaveis = [...new Set(brutas.map((l) => l.responsavel_id).filter(Boolean))] as string[];
  const setores = [...new Set(brutas.map((l) => l.setor_id).filter(Boolean))] as string[];
  const [{ data: perfis }, { data: setoresData }] = await Promise.all([
    responsaveis.length ? supabase.from("perfis").select("id, nome").in("id", responsaveis) : Promise.resolve({ data: [] }),
    setores.length ? supabase.from("setores").select("id, nome").in("id", setores) : Promise.resolve({ data: [] }),
  ]);
  const nome = new Map(((perfis ?? []) as { id: string; nome: string | null }[]).map((p) => [p.id, p.nome]));
  const setor = new Map(((setoresData ?? []) as { id: string; nome: string }[]).map((s) => [s.id, s.nome]));

  const gestao = acesso.role !== "operacional";
  return brutas
    .map((l) => ({
      publicacaoId: l.publicacao_id,
      modeloNome: l.modelo_nome,
      setorNome: l.setor_id ? setor.get(l.setor_id) ?? null : null,
      responsavelId: l.responsavel_id,
      responsavelNome: l.responsavel_id ? nome.get(l.responsavel_id) ?? null : null,
      horarioLimite: l.horario_limite.slice(0, 5),
      prazo: l.prazo,
      execucaoId: l.execucao_id,
      situacao: l.situacao,
      totalItens: l.total_itens,
      respondidos: l.respondidos,
      foraDaMeta: l.fora_da_meta,
      concluidaEm: l.concluida_em,
      abreEm: l.abre_em,
      fechaEm: l.fecha_em,
      ehMinha: !l.responsavel_id || l.responsavel_id === acesso.userId,
    }))
    .filter((l) => gestao || l.ehMinha);
}

export type ItemSnapshot = {
  id: string;
  ordem: number;
  grupo: string | null;
  titulo: string;
  instrucao: string | null;
  tipo: TipoItemGarante;
  critico: boolean;
  foto_obrigatoria: boolean;
  permite_na: boolean;
  meta_min: number | null;
  meta_max: number | null;
};

export type RespostaExecucao = {
  itemId: string;
  valorBool: boolean | null;
  valorNumero: number | null;
  valorTexto: string | null;
  naoSeAplica: boolean;
  justificativa: string | null;
  dentroMeta: boolean | null;
  fotoUrl: string | null;
  fotoRecebidaEm: string | null;
  respondidoPorNome: string | null;
};

export type ExecucaoCompleta = {
  id: string;
  modeloNome: string;
  data: string;
  prazo: string;
  /** Até quando dá para responder, fotografar e concluir (gravado ao iniciar). */
  fechaEm: string;
  situacao: "em_andamento" | "concluida";
  unidadeId: string;
  /** Responsável da programação (null = qualquer pessoa da unidade). */
  responsavelId: string | null;
  itens: ItemSnapshot[];
  respostas: Record<string, RespostaExecucao>;
  concluidaEm: string | null;
  concluidaPorNome: string | null;
};

/** Execução com respostas e fotos (URL assinada de 10 min; a policy do
 * Storage só libera foto de até 40 dias, da unidade de quem pede). */
export async function carregarExecucao(id: string): Promise<ExecucaoCompleta | null> {
  const supabase = await createClient();
  const { data: exec } = await supabase
    .from("garante_execucoes")
    .select("id, publicacao_id, modelo_nome, data, prazo, fecha_em, situacao, unidade_id, snapshot, concluida_em, concluida_por")
    .eq("id", id)
    .maybeSingle();
  if (!exec) return null;
  const { data: pub } = await supabase
    .from("garante_publicacoes")
    .select("responsavel_id")
    .eq("id", exec.publicacao_id as string)
    .maybeSingle();
  const { data: respostasData } = await supabase
    .from("garante_respostas")
    .select("item_id, valor_bool, valor_numero, valor_texto, nao_se_aplica, justificativa, dentro_meta, foto_path, foto_recebida_em, respondido_por")
    .eq("execucao_id", id);
  const respostas = (respostasData ?? []) as {
    item_id: string;
    valor_bool: boolean | null;
    valor_numero: number | null;
    valor_texto: string | null;
    nao_se_aplica: boolean;
    justificativa: string | null;
    dentro_meta: boolean | null;
    foto_path: string | null;
    foto_recebida_em: string | null;
    respondido_por: string | null;
  }[];

  const caminhos = respostas.map((r) => r.foto_path).filter(Boolean) as string[];
  const urls = new Map<string, string>();
  if (caminhos.length) {
    const { data: assinadas } = await supabase.storage.from("garante-evidencias").createSignedUrls(caminhos, 600);
    for (const a of assinadas ?? []) if (a.path && a.signedUrl) urls.set(a.path, a.signedUrl);
  }
  const pessoas = [...new Set([...respostas.map((r) => r.respondido_por), exec.concluida_por].filter(Boolean))] as string[];
  const { data: perfis } = pessoas.length
    ? await supabase.from("perfis").select("id, nome").in("id", pessoas)
    : { data: [] };
  const nome = new Map(((perfis ?? []) as { id: string; nome: string | null }[]).map((p) => [p.id, p.nome]));

  return {
    id: exec.id as string,
    modeloNome: exec.modelo_nome as string,
    data: exec.data as string,
    prazo: exec.prazo as string,
    fechaEm: exec.fecha_em as string,
    situacao: exec.situacao as "em_andamento" | "concluida",
    unidadeId: exec.unidade_id as string,
    responsavelId: (pub?.responsavel_id as string | null) ?? null,
    itens: (exec.snapshot as ItemSnapshot[]) ?? [],
    respostas: Object.fromEntries(
      respostas.map((r) => [
        r.item_id,
        {
          itemId: r.item_id,
          valorBool: r.valor_bool,
          valorNumero: r.valor_numero === null ? null : Number(r.valor_numero),
          valorTexto: r.valor_texto,
          naoSeAplica: r.nao_se_aplica,
          justificativa: r.justificativa,
          dentroMeta: r.dentro_meta,
          fotoUrl: r.foto_path ? urls.get(r.foto_path) ?? null : null,
          fotoRecebidaEm: r.foto_recebida_em,
          respondidoPorNome: r.respondido_por ? nome.get(r.respondido_por) ?? null : null,
        },
      ]),
    ),
    concluidaEm: exec.concluida_em as string | null,
    concluidaPorNome: exec.concluida_por ? nome.get(exec.concluida_por as string) ?? null : null,
  };
}

export type ModeloResumo = { id: string; nome: string; descricao: string | null; origemPop: string | null; itens: number; publicacoes: number };

export async function carregarModelos(acesso: AcessoAtual): Promise<ModeloResumo[]> {
  const supabase = await createClient();
  const [{ data: modelos }, { data: itens }, { data: pubs }] = await Promise.all([
    supabase.from("garante_modelos").select("id, nome, descricao, origem_pop").eq("unidade_id", acesso.unidadeId).eq("ativo", true).order("nome"),
    supabase.from("garante_itens").select("modelo_id").eq("unidade_id", acesso.unidadeId).eq("ativo", true),
    supabase.from("garante_publicacoes").select("modelo_id, vigente_ate").eq("unidade_id", acesso.unidadeId).eq("ativo", true),
  ]);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const contar = (linhas: { modelo_id: string }[]) =>
    linhas.reduce((m, l) => m.set(l.modelo_id, (m.get(l.modelo_id) ?? 0) + 1), new Map<string, number>());
  const nItens = contar((itens ?? []) as { modelo_id: string }[]);
  const nPubs = contar(((pubs ?? []) as { modelo_id: string; vigente_ate: string | null }[]).filter((p) => !p.vigente_ate || p.vigente_ate >= hoje));
  return ((modelos ?? []) as { id: string; nome: string; descricao: string | null; origem_pop: string | null }[]).map((m) => ({
    id: m.id,
    nome: m.nome,
    descricao: m.descricao,
    origemPop: m.origem_pop,
    itens: nItens.get(m.id) ?? 0,
    publicacoes: nPubs.get(m.id) ?? 0,
  }));
}

export type ItemModelo = {
  id: string;
  ordem: number;
  grupo: string | null;
  titulo: string;
  tipo: TipoItemGarante;
  critico: boolean;
  fotoObrigatoria: boolean;
  permiteNa: boolean;
  metaMin: number | null;
  metaMax: number | null;
};

export type PublicacaoModelo = {
  id: string;
  dias: number[];
  horario: string;
  setorNome: string | null;
  responsavelNome: string | null;
  vigenteDesde: string;
  vigenteAte: string | null;
};

export type Pessoa = { id: string; nome: string };

/** Modelo para edição, com itens, publicações, setores e a equipe da unidade.
 * A equipe vem pelo client admin (cada um só lê o próprio vínculo), depois de
 * `requireGestaoGarante()` e sempre recortada pela unidade da sessão. */
export async function carregarModelo(acesso: AcessoAtual, id: string) {
  const supabase = await createClient();
  const { data: modelo } = await supabase
    .from("garante_modelos")
    .select("id, nome, descricao, origem_pop, ativo")
    .eq("id", id)
    .eq("unidade_id", acesso.unidadeId)
    .maybeSingle();
  if (!modelo || !modelo.ativo) return null;

  const [{ data: itensData }, { data: pubsData }, { data: setoresData }] = await Promise.all([
    supabase.from("garante_itens").select("id, ordem, grupo, titulo, tipo, critico, foto_obrigatoria, permite_na, meta_min, meta_max").eq("modelo_id", id).eq("ativo", true).order("ordem"),
    supabase.from("garante_publicacoes").select("id, dias_semana, horario_limite, setor_id, responsavel_id, vigente_desde, vigente_ate").eq("modelo_id", id).eq("ativo", true).order("horario_limite"),
    supabase.from("setores").select("id, nome").eq("unidade_id", acesso.unidadeId).eq("ativo", true).order("ordem"),
  ]);

  const admin = createAdminClient();
  const { data: vinculos } = await admin
    .from("vinculos")
    .select("user_id, unidade_id, role")
    .eq("organizacao_id", acesso.organizacaoId)
    .in("status", ["ativo", "convidado"])
    .neq("role", "master");
  const ids = [
    ...new Set(
      ((vinculos ?? []) as { user_id: string; unidade_id: string | null }[])
        .filter((v) => v.unidade_id === null || v.unidade_id === acesso.unidadeId)
        .map((v) => v.user_id),
    ),
  ];
  const { data: perfis } = ids.length ? await admin.from("perfis").select("id, nome").in("id", ids) : { data: [] };
  const pessoas: Pessoa[] = ((perfis ?? []) as { id: string; nome: string | null }[])
    .map((p) => ({ id: p.id, nome: p.nome ?? "Sem nome" }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const nomePessoa = new Map(pessoas.map((p) => [p.id, p.nome]));
  const setores = (setoresData ?? []) as { id: string; nome: string }[];
  const nomeSetor = new Map(setores.map((s) => [s.id, s.nome]));
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  return {
    modelo: { id: modelo.id as string, nome: modelo.nome as string, descricao: modelo.descricao as string | null },
    itens: ((itensData ?? []) as Record<string, unknown>[]).map((i) => ({
      id: i.id as string,
      ordem: i.ordem as number,
      grupo: i.grupo as string | null,
      titulo: i.titulo as string,
      tipo: i.tipo as TipoItemGarante,
      critico: i.critico as boolean,
      fotoObrigatoria: i.foto_obrigatoria as boolean,
      permiteNa: i.permite_na as boolean,
      metaMin: i.meta_min === null ? null : Number(i.meta_min),
      metaMax: i.meta_max === null ? null : Number(i.meta_max),
    })) as ItemModelo[],
    publicacoes: ((pubsData ?? []) as Record<string, unknown>[])
      .filter((p) => !p.vigente_ate || (p.vigente_ate as string) >= hoje)
      .map((p) => ({
        id: p.id as string,
        dias: p.dias_semana as number[],
        horario: (p.horario_limite as string).slice(0, 5),
        setorNome: p.setor_id ? nomeSetor.get(p.setor_id as string) ?? null : null,
        responsavelNome: p.responsavel_id ? nomePessoa.get(p.responsavel_id as string) ?? "Pessoa sem acesso" : null,
        vigenteDesde: p.vigente_desde as string,
        vigenteAte: p.vigente_ate as string | null,
      })) as PublicacaoModelo[],
    setores,
    pessoas,
  };
}

export type LinhaNotaTela = LinhaNota & { nome: string };

/** Nota P-E-Q do período (RPC garante_nota, que confere a gestão da unidade
 * dentro do banco). Nomes de pessoa e setor resolvidos aqui. */
export async function carregarNota(
  acesso: AcessoAtual,
  de: string,
  ate: string,
): Promise<{ unidade: LinhaNotaTela | null; pessoas: LinhaNotaTela[]; setores: LinhaNotaTela[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("garante_nota", { p_unidade_id: acesso.unidadeId, p_de: de, p_ate: ate });
  if (error) throw new Error("Não foi possível calcular a nota.");
  const linhas = ((data ?? []) as LinhaNotaBruta[]).map(normalizarLinhaNota);

  const pessoasIds = linhas.filter((l) => l.nivel === "pessoa" && l.chave).map((l) => l.chave as string);
  const setoresIds = linhas.filter((l) => l.nivel === "setor" && l.chave).map((l) => l.chave as string);
  const [{ data: perfis }, { data: setoresData }] = await Promise.all([
    pessoasIds.length ? supabase.from("perfis").select("id, nome").in("id", pessoasIds) : Promise.resolve({ data: [] }),
    setoresIds.length ? supabase.from("setores").select("id, nome").in("id", setoresIds) : Promise.resolve({ data: [] }),
  ]);
  const nomePessoa = new Map(((perfis ?? []) as { id: string; nome: string | null }[]).map((p) => [p.id, p.nome]));
  const nomeSetor = new Map(((setoresData ?? []) as { id: string; nome: string }[]).map((x) => [x.id, x.nome]));

  const comNome = (l: LinhaNota): LinhaNotaTela => ({
    ...l,
    nome:
      l.nivel === "unidade"
        ? acesso.unidadeNome
        : l.nivel === "pessoa"
          ? l.chave
            ? nomePessoa.get(l.chave) ?? "Pessoa sem nome"
            : "Qualquer pessoa da unidade"
          : l.chave
            ? nomeSetor.get(l.chave) ?? "Setor"
            : "Sem setor",
  });
  return {
    unidade: linhas.find((l) => l.nivel === "unidade") ? comNome(linhas.find((l) => l.nivel === "unidade") as LinhaNota) : null,
    pessoas: linhas.filter((l) => l.nivel === "pessoa").map(comNome),
    setores: linhas.filter((l) => l.nivel === "setor").map(comNome),
  };
}

export type RegraUnidade = { vigenteDesde: string | null; antecedenciaMin: number; atrasoMaxMin: number; prazoPlanoHoras: number };

/** Regra que vale hoje, a próxima já agendada e os dias sem operação de hoje
 * em diante (leitura pelo RLS: quem acessa a unidade). Sem regra cadastrada,
 * vale o padrão (120 min antes, 60 min de atraso, 24 h para o plano de ação). */
export async function carregarRegras(acesso: AcessoAtual, hoje: string) {
  const supabase = await createClient();
  const [{ data: regras }, { data: dias }] = await Promise.all([
    supabase
      .from("garante_regras_unidade")
      .select("vigente_desde, antecedencia_min, atraso_max_min, prazo_plano_horas")
      .eq("unidade_id", acesso.unidadeId)
      .order("vigente_desde"),
    supabase
      .from("garante_dias_sem_operacao")
      .select("data, motivo")
      .eq("unidade_id", acesso.unidadeId)
      .gte("data", hoje)
      .order("data"),
  ]);
  const lista = (
    (regras ?? []) as { vigente_desde: string; antecedencia_min: number; atraso_max_min: number; prazo_plano_horas: number }[]
  ).map((r) => ({
    vigenteDesde: r.vigente_desde,
    antecedenciaMin: r.antecedencia_min,
    atrasoMaxMin: r.atraso_max_min,
    prazoPlanoHoras: r.prazo_plano_horas,
  }));
  const vigente: RegraUnidade = [...lista].reverse().find((r) => r.vigenteDesde <= hoje) ?? {
    vigenteDesde: null,
    antecedenciaMin: REGRA_PADRAO.antecedenciaMin,
    atrasoMaxMin: REGRA_PADRAO.atrasoMaxMin,
    prazoPlanoHoras: REGRA_PADRAO.prazoPlanoHoras,
  };
  const agendadas: RegraUnidade[] = lista.filter((r) => r.vigenteDesde > hoje);
  return {
    vigente,
    agendadas,
    diasSemOperacao: ((dias ?? []) as { data: string; motivo: string }[]).map((d) => ({ data: d.data, motivo: d.motivo })),
  };
}

export type PlanoTela = {
  id: string;
  situacao: SituacaoPlano;
  origem: "conclusao" | "vencida";
  prazo: string;
  fechadoEm: string | null;
  data: string;
  modeloNome: string;
  execucaoId: string;
  itemTitulo: string;
  critico: boolean;
  respostaTexto: string;
  responsavelId: string | null;
  responsavelNome: string | null;
  resolucao: string | null;
  motivoDescarte: string | null;
  fechadoPorNome: string | null;
  podeResolver: boolean;
  podeDescartar: boolean;
};

type PlanoBruto = {
  id: string;
  situacao: SituacaoPlano;
  origem: "conclusao" | "vencida";
  prazo: string;
  fechado_em: string | null;
  data: string;
  modelo_nome: string;
  execucao_id: string;
  resposta_id: string;
  item: { titulo?: string; critico?: boolean; tipo?: TipoItemGarante; meta_min?: number | null; meta_max?: number | null } | null;
  responsavel_id: string | null;
  resolucao: string | null;
  motivo_descarte: string | null;
  fechado_por: string | null;
};

const COLUNAS_PLANO =
  "id, situacao, origem, prazo, fechado_em, data, modelo_nome, execucao_id, resposta_id, item, responsavel_id, resolucao, motivo_descarte, fechado_por";

/** Planos de ação da unidade da sessão: antes de ler, gera os do item crítico
 * fora da meta em checklist que venceu sem concluir (`garante_gerar_planos_vencidos`,
 * idempotente). O RLS mostra tudo para a gestão e só os planos de que a pessoa
 * é responsável para o operacional. Abertos todos; fechados, os dos últimos 30 dias. */
export async function carregarPlanos(acesso: AcessoAtual): Promise<PlanoTela[]> {
  const supabase = await createClient();
  // Falha aqui não impede ler o que já existe: a próxima leitura tenta de novo.
  await supabase.rpc("garante_gerar_planos_vencidos", { p_unidade_id: acesso.unidadeId });
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: abertos, error: e1 }, { data: fechados, error: e2 }] = await Promise.all([
    supabase.from("garante_planos_acao").select(COLUNAS_PLANO).eq("unidade_id", acesso.unidadeId).eq("situacao", "aberto").order("prazo").limit(500),
    supabase
      .from("garante_planos_acao")
      .select(COLUNAS_PLANO)
      .eq("unidade_id", acesso.unidadeId)
      .neq("situacao", "aberto")
      .gte("fechado_em", desde)
      .order("fechado_em", { ascending: false })
      .limit(100),
  ]);
  if (e1 || e2) throw new Error("Não foi possível carregar os planos de ação.");
  const brutos = [...((abertos ?? []) as PlanoBruto[]), ...((fechados ?? []) as PlanoBruto[])];

  const pessoas = [...new Set(brutos.flatMap((p) => [p.responsavel_id, p.fechado_por]).filter(Boolean))] as string[];
  const respostasIds = brutos.map((p) => p.resposta_id);
  const [{ data: perfis }, { data: respostas }] = await Promise.all([
    pessoas.length ? supabase.from("perfis").select("id, nome").in("id", pessoas) : Promise.resolve({ data: [] }),
    respostasIds.length
      ? supabase.from("garante_respostas").select("id, valor_bool, valor_numero, valor_texto").in("id", respostasIds)
      : Promise.resolve({ data: [] }),
  ]);
  const nome = new Map(((perfis ?? []) as { id: string; nome: string | null }[]).map((p) => [p.id, p.nome]));
  const resposta = new Map(
    ((respostas ?? []) as { id: string; valor_bool: boolean | null; valor_numero: number | string | null; valor_texto: string | null }[]).map((r) => [
      r.id,
      { valorBool: r.valor_bool, valorNumero: r.valor_numero === null ? null : Number(r.valor_numero), valorTexto: r.valor_texto },
    ]),
  );

  const gestao = acesso.role !== "operacional";
  return brutos.map((p) => ({
    id: p.id,
    situacao: p.situacao,
    origem: p.origem,
    prazo: p.prazo,
    fechadoEm: p.fechado_em,
    data: p.data,
    modeloNome: p.modelo_nome,
    execucaoId: p.execucao_id,
    itemTitulo: p.item?.titulo ?? "Item",
    critico: Boolean(p.item?.critico),
    respostaTexto: textoRespostaOrigem({ tipo: p.item?.tipo ?? "check", meta_min: p.item?.meta_min, meta_max: p.item?.meta_max }, resposta.get(p.resposta_id) ?? null),
    responsavelId: p.responsavel_id,
    responsavelNome: p.responsavel_id ? nome.get(p.responsavel_id) ?? "Pessoa sem nome" : null,
    resolucao: p.resolucao,
    motivoDescarte: p.motivo_descarte,
    fechadoPorNome: p.fechado_por ? nome.get(p.fechado_por) ?? "Pessoa sem nome" : null,
    podeResolver: p.situacao === "aberto" && (gestao || p.responsavel_id === acesso.userId),
    podeDescartar: p.situacao === "aberto" && gestao,
  }));
}

export type ResumoGarantePainel = {
  nota: number | null;
  atrasadosHoje: number;
  criticosFora: number;
  planosAbertos: number;
  planosAtrasados: number;
};

/** Card "Checklist Garante" do Painel geral (gestão, com a flag). Nota dos
 * últimos 7 dias pela `garante_nota` (que confere a gestão no banco), atrasados
 * de hoje pela agenda, críticos fora da meta nos últimos 7 dias pelo snapshot de
 * cada execução e planos abertos (gerando antes os de checklist vencido). */
export async function carregarResumoGarantePainel(acesso: AcessoAtual, agora: Date = new Date()): Promise<ResumoGarantePainel> {
  const supabase = await createClient();
  const { de, ate } = intervaloNota(7, agora);
  await supabase.rpc("garante_gerar_planos_vencidos", { p_unidade_id: acesso.unidadeId });
  const [nota, agenda, execucoes, abertos] = await Promise.all([
    supabase.rpc("garante_nota", { p_unidade_id: acesso.unidadeId, p_de: de, p_ate: ate }),
    supabase.rpc("garante_agenda", { p_unidade_id: acesso.unidadeId, p_data: ate }),
    supabase.from("garante_execucoes").select("id, snapshot").eq("unidade_id", acesso.unidadeId).gte("data", de).lte("data", ate),
    supabase.from("garante_planos_acao").select("prazo").eq("unidade_id", acesso.unidadeId).eq("situacao", "aberto").limit(5000),
  ]);
  if (nota.error || agenda.error || execucoes.error || abertos.error) throw new Error("Não foi possível carregar o Checklist Garante.");

  const listaExecucoes = (execucoes.data ?? []) as { id: string; snapshot: { id: string; critico?: boolean }[] | null }[];
  let respostasFora: { execucaoId: string; itemId: string }[] = [];
  if (listaExecucoes.length) {
    const { data, error } = await supabase
      .from("garante_respostas")
      .select("execucao_id, item_id")
      .eq("unidade_id", acesso.unidadeId)
      .eq("dentro_meta", false)
      .in("execucao_id", listaExecucoes.map((e) => e.id));
    if (error) throw new Error("Não foi possível carregar o Checklist Garante.");
    respostasFora = ((data ?? []) as { execucao_id: string; item_id: string }[]).map((r) => ({ execucaoId: r.execucao_id, itemId: r.item_id }));
  }

  const unidade = ((nota.data ?? []) as LinhaNotaBruta[]).map(normalizarLinhaNota).find((l) => l.nivel === "unidade");
  const prazos = ((abertos.data ?? []) as { prazo: string }[]).map((p) => p.prazo);
  return {
    nota: unidade?.nota ?? null,
    atrasadosHoje: contarAtrasados((agenda.data ?? []) as { situacao: SituacaoAgenda; prazo: string }[], agora),
    criticosFora: contarCriticosFora(listaExecucoes, respostasFora),
    planosAbertos: prazos.length,
    planosAtrasados: prazos.filter((p) => new Date(p).getTime() < agora.getTime()).length,
  };
}
