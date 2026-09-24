-- Gestão de Clientes (Escritório > Clientes). V1 interna: só master vê e
-- opera, igual ao resto do Escritório. Prefixo `zh_clientes_`.
--
-- Divisão das fontes, aprovada por Vinícius em 24/09/2026:
--   - método e conhecimento da Zatti -> vault (Cérebro do Gestor);
--   - estado operacional do cliente   -> ESTAS tabelas;
--   - documentos completos            -> Google Drive (aqui só o link);
--   - eventos com horário             -> Google Calendar, lido na hora.
--
-- Segurança: nada de senha, token, chave, dado bancário ou credencial. O
-- `zh_clientes_links` guarda só endereço https e descrição - a aplicação
-- recusa texto com cara de credencial antes de gravar. Sem upload.
--
-- A carteira não cria cadastro paralelo: o acompanhamento aponta para uma
-- linha de `organizacoes` do tipo consultoria ou híbrido (gatilho abaixo).
begin;

-- ── Acompanhamento (um por cliente) ────────────────────────────────────────
create table if not exists public.zh_clientes_acompanhamentos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id text not null unique references public.organizacoes(id) on delete restrict,
  objetivo_contratado text not null default '' check (length(objetivo_contratado) <= 500),
  meta_principal text not null default '' check (length(meta_principal) <= 500),
  etapa_atual text not null default 'venda' check (etapa_atual in
    ('venda', 'ativacao', 'onboarding', 'mapeia', 'estrutura', 'garante', 'acompanha', 'continuidade')),
  -- Avaliação humana (Vini ou Vinícius). Alertas objetivos são calculados na
  -- aplicação a partir de tarefas, riscos e prazos - não moram aqui.
  saude text not null default 'nao_avaliada' check (saude in ('nao_avaliada', 'boa', 'atencao', 'critica')),
  -- [{"nome": "...", "papel": "..."}] - só nome e papel, sem contato.
  pessoas jsonb not null default '[]'::jsonb
    check (jsonb_typeof(pessoas) = 'array' and jsonb_array_length(pessoas) <= 20),
  prioridades text[] not null default '{}' check (cardinality(prioridades) <= 3),
  proximo_marco text not null default '' check (length(proximo_marco) <= 300),
  proximo_marco_data date,
  -- Palavra que identifica o cliente no título do evento do Google Calendar
  -- (mesma regra do `cs-*` do Vini: "The House" casa "Reunião The House & Zatti").
  termo_calendario text not null default '' check (length(termo_calendario) <= 80),
  cadencia_reunioes text not null default '' check (length(cadencia_reunioes) <= 200),
  criado_por uuid default auth.uid() references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ── Jornada: uma linha por etapa ───────────────────────────────────────────
create table if not exists public.zh_clientes_etapas (
  id uuid primary key default gen_random_uuid(),
  acompanhamento_id uuid not null references public.zh_clientes_acompanhamentos(id) on delete restrict,
  etapa text not null check (etapa in
    ('venda', 'ativacao', 'onboarding', 'mapeia', 'estrutura', 'garante', 'acompanha', 'continuidade')),
  ordem smallint not null check (ordem between 0 and 7),
  responsavel text not null check (responsavel in ('vinicius', 'vini', 'eliandro', 'cliente')),
  prazo date,
  situacao text not null default 'nao_iniciada'
    check (situacao in ('nao_iniciada', 'em_andamento', 'concluida', 'bloqueada')),
  evidencia text not null default '' check (length(evidencia) <= 1000),
  pendencia text not null default '' check (length(pendencia) <= 1000),
  criterio_conclusao text not null default '' check (length(criterio_conclusao) <= 1000),
  -- [{"texto": "...", "feito": false}]
  checklist jsonb not null default '[]'::jsonb
    check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 30),
  atualizado_em timestamptz not null default now(),
  unique (acompanhamento_id, etapa)
);

-- ── Onboarding: situação de cada informação (nunca o dado sensível) ────────
create table if not exists public.zh_clientes_onboarding (
  id uuid primary key default gen_random_uuid(),
  acompanhamento_id uuid not null references public.zh_clientes_acompanhamentos(id) on delete restrict,
  bloco text not null check (bloco in ('empresarial', 'financeiro', 'operacional')),
  item text not null check (length(trim(item)) > 0 and length(item) <= 200),
  resposta text not null default '' check (length(resposta) <= 1000),
  situacao text not null default 'pendente'
    check (situacao in ('confirmado', 'informado', 'pendente', 'nao_se_aplica', 'precisa_decisao')),
  ordem smallint not null default 0 check (ordem >= 0),
  atualizado_em timestamptz not null default now(),
  unique (acompanhamento_id, bloco, item)
);

-- ── Reuniões ───────────────────────────────────────────────────────────────
create table if not exists public.zh_clientes_reunioes (
  id uuid primary key default gen_random_uuid(),
  acompanhamento_id uuid not null references public.zh_clientes_acompanhamentos(id) on delete restrict,
  data date not null,
  titulo text not null check (length(trim(titulo)) > 0 and length(titulo) <= 200),
  situacao text not null default 'aberta' check (situacao in ('aberta', 'fechada')),
  resumo text not null default '' check (length(resumo) <= 4000),
  resumo_whatsapp text not null default '' check (length(resumo_whatsapp) <= 4000),
  pauta_proxima text not null default '' check (length(pauta_proxima) <= 4000),
  fechada_em timestamptz,
  criado_em timestamptz not null default now(),
  check ((situacao = 'fechada') = (fechada_em is not null)),
  -- Alvo da chave composta de `zh_clientes_itens`.
  unique (acompanhamento_id, id)
);

-- Uma reunião aberta por cliente de cada vez, garantido pelo banco.
create unique index if not exists zh_clientes_reunioes_uma_aberta
  on public.zh_clientes_reunioes (acompanhamento_id) where situacao = 'aberta';

-- ── Tarefas, decisões, fatos, perguntas e riscos ───────────────────────────
create table if not exists public.zh_clientes_itens (
  id uuid primary key default gen_random_uuid(),
  acompanhamento_id uuid not null references public.zh_clientes_acompanhamentos(id) on delete restrict,
  reuniao_id uuid,
  tipo text not null check (tipo in ('tarefa', 'decisao', 'fato', 'pergunta', 'risco')),
  texto text not null check (length(trim(texto)) > 0 and length(texto) <= 1000),
  responsavel text check (responsavel in ('vinicius', 'vini', 'eliandro', 'cliente')),
  prazo date,
  situacao text not null default 'aberta' check (situacao in ('aberta', 'concluida', 'cancelada')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- Tarefa sempre tem dono; prazo pode faltar, dono não.
  check (tipo <> 'tarefa' or responsavel is not null),
  -- Item de reunião só aponta para reunião do MESMO cliente.
  foreign key (acompanhamento_id, reuniao_id)
    references public.zh_clientes_reunioes(acompanhamento_id, id) on delete restrict
);

create index if not exists zh_clientes_itens_acomp_idx
  on public.zh_clientes_itens (acompanhamento_id, tipo, situacao);

-- ── Diagnóstico (dimensões da Fase 1 da trilha) ────────────────────────────
create table if not exists public.zh_clientes_diagnostico (
  id uuid primary key default gen_random_uuid(),
  acompanhamento_id uuid not null references public.zh_clientes_acompanhamentos(id) on delete restrict,
  dimensao text not null check (dimensao in ('financeiro', 'cardapio', 'operacional', 'mercado', 'marketing')),
  situacao text not null default 'nao_iniciado' check (situacao in ('nao_iniciado', 'em_andamento', 'concluido')),
  resumo text not null default '' check (length(resumo) <= 2000),
  atualizado_em timestamptz not null default now(),
  unique (acompanhamento_id, dimensao)
);

-- ── Indicadores (valor informado à mão, com referência e fonte) ────────────
create table if not exists public.zh_clientes_indicadores (
  id uuid primary key default gen_random_uuid(),
  acompanhamento_id uuid not null references public.zh_clientes_acompanhamentos(id) on delete restrict,
  nome text not null check (length(trim(nome)) > 0 and length(nome) <= 120),
  valor text not null check (length(trim(valor)) > 0 and length(valor) <= 60),
  referencia text not null default '' check (length(referencia) <= 40),
  fonte text not null default '' check (length(fonte) <= 200),
  atualizado_em timestamptz not null default now()
);

-- ── Documentos e acessos: só link e descrição ──────────────────────────────
create table if not exists public.zh_clientes_links (
  id uuid primary key default gen_random_uuid(),
  acompanhamento_id uuid not null references public.zh_clientes_acompanhamentos(id) on delete restrict,
  tipo text not null check (tipo in ('documento', 'acesso')),
  titulo text not null check (length(trim(titulo)) > 0 and length(titulo) <= 160),
  url text not null default '' check (url = '' or (url ~ '^https://[^\s]+$' and length(url) <= 500)),
  observacao text not null default '' check (length(observacao) <= 500),
  atualizado_em timestamptz not null default now()
);

-- ── atualizado_em ──────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['zh_clientes_acompanhamentos', 'zh_clientes_etapas', 'zh_clientes_onboarding',
    'zh_clientes_itens', 'zh_clientes_diagnostico', 'zh_clientes_indicadores', 'zh_clientes_links']
  loop
    execute format('drop trigger if exists tocar_atualizado_em on public.%I', t);
    execute format('create trigger tocar_atualizado_em before update on public.%I
      for each row execute function public.tocar_atualizado_em()', t);
  end loop;
end $$;

-- ── Só cliente de consultoria ou híbrido entra na carteira ─────────────────
create or replace function public.validar_organizacao_do_acompanhamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.organizacoes o
    where o.id = new.organizacao_id and o.ativo and o.tipo_cliente in ('consultoria', 'hybrid')
  ) then
    raise exception 'Só cliente ativo de consultoria ou híbrido entra na Gestão de Clientes.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_organizacao_do_acompanhamento() from public, anon, authenticated;

drop trigger if exists validar_organizacao on public.zh_clientes_acompanhamentos;
create trigger validar_organizacao
  before insert or update of organizacao_id on public.zh_clientes_acompanhamentos
  for each row execute function public.validar_organizacao_do_acompanhamento();

-- ── RLS: só master (aal2), em todas as operações ───────────────────────────
-- Dado da empresa, não pessoal: sem filtro por `criado_por` (um segundo
-- master da Zatti enxerga a mesma carteira). Sem policy de delete: nada
-- some pela aplicação; item errado vira `cancelada`.
do $$
declare t text;
begin
  foreach t in array array['zh_clientes_acompanhamentos', 'zh_clientes_etapas', 'zh_clientes_onboarding',
    'zh_clientes_reunioes', 'zh_clientes_itens', 'zh_clientes_diagnostico', 'zh_clientes_indicadores',
    'zh_clientes_links']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.usuario_e_master())', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.usuario_e_master())', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.usuario_e_master()) with check (public.usuario_e_master())', t || '_update', t);
  end loop;
end $$;

-- GRANT explícito: projeto novo do Supabase não expõe tabela nova sem ele.
-- Só `authenticated`; quem decide o que cada um vê é o RLS acima.
revoke all on public.zh_clientes_acompanhamentos, public.zh_clientes_etapas, public.zh_clientes_onboarding,
  public.zh_clientes_reunioes, public.zh_clientes_itens, public.zh_clientes_diagnostico,
  public.zh_clientes_indicadores, public.zh_clientes_links from anon, authenticated;
grant select, insert, update on public.zh_clientes_acompanhamentos, public.zh_clientes_etapas,
  public.zh_clientes_onboarding, public.zh_clientes_reunioes, public.zh_clientes_itens,
  public.zh_clientes_diagnostico, public.zh_clientes_indicadores, public.zh_clientes_links to authenticated;
grant delete on public.zh_clientes_indicadores, public.zh_clientes_links to authenticated;

-- Links e indicadores podem ser apagados (link errado, indicador duplicado).
create policy "zh_clientes_links_delete" on public.zh_clientes_links
  for delete to authenticated using (public.usuario_e_master());
create policy "zh_clientes_indicadores_delete" on public.zh_clientes_indicadores
  for delete to authenticated using (public.usuario_e_master());

-- ── Início do acompanhamento com a estrutura padrão ────────────────────────
-- Fonte única da jornada e do onboarding padrão: checklist e critério de cada
-- etapa seguem `_conhecimento/negocios/trilha-consultoria-zatti.md`; itens de
-- onboarding seguem o `formulario-onboarding.md`. `security invoker`: pela
-- aplicação, o RLS (só master) vale normalmente.
create or replace function public.iniciar_acompanhamento_cliente(p_organizacao_id text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.zh_clientes_acompanhamentos (organizacao_id)
  values (p_organizacao_id)
  returning id into v_id;

  insert into public.zh_clientes_etapas (acompanhamento_id, etapa, ordem, responsavel, criterio_conclusao, checklist)
  select v_id, e.etapa, e.ordem, e.responsavel, e.criterio,
    (select jsonb_agg(jsonb_build_object('texto', t, 'feito', false)) from unnest(e.itens) as t)
  from (values
    ('venda', 0, 'vinicius', 'Cliente aceitou escopo e valores.',
      array['Proposta apresentada', 'Escopo e valores aceitos pelo cliente']),
    ('ativacao', 1, 'vini', 'Contrato assinado, grupo ativo e onboardings com data.',
      array['Contrato assinado', 'Dados da contratante recebidos', 'Grupo do cliente criado',
        'Cliente cadastrado no Zatti Hub', 'Onboardings agendados']),
    ('onboarding', 2, 'vini', 'Formulário preenchido, perfil definido e Documento Mestre v1 entregue.',
      array['Kickoff realizado', 'Formulário de Onboarding preenchido',
        'Perfil de entrada definido (estruturado ou base zero)', 'Documento Mestre v1 entregue',
        'Programa apresentado com cronograma estimado']),
    ('mapeia', 3, 'vinicius', 'Cliente entende seus números reais e o Relatório de Diagnóstico foi aprovado em reunião.',
      array['Diagnóstico Financeiro', 'Análise de Cardápio', 'Diagnóstico Operacional', 'Análise de Mercado',
        'Relatório de Diagnóstico M.E.G.A. aprovado']),
    ('estrutura', 4, 'vinicius', 'Planilha com 30 dias de dados reais, fichas de 80%+ do cardápio e checklists em uso.',
      array['Planilha Financeira', 'Plano de Contas', 'Fichas Técnicas', 'Manual de CMV',
        'Contagem de estoque digital', 'Kit Operacional', 'Guia de Posicionamento', 'Plano de Comunicação']),
    ('garante', 5, 'vinicius', 'Três meses de rotina financeira sem falha grave e cliente gera a DRE sem suporte.',
      array['Manual de Rotinas de Gestão', 'Mapa de Responsabilidades', 'Protocolo de Treinamento',
        '3 DREs completas', 'Relatório de Implementação']),
    ('acompanha', 6, 'vinicius', 'Cliente gere indicadores com autonomia e o relatório final foi apresentado.',
      array['Dashboard de KPIs', 'Template de Revisão Estratégica Mensal', 'Plano de Crescimento 6 meses',
        'Relatório Final M.E.G.A.', 'Proposta de Continuidade']),
    ('continuidade', 7, 'vinicius', 'Decisão do cliente registrada e próximos passos combinados.',
      array['Relatório final apresentado', 'Proposta de continuidade apresentada',
        'Decisão registrada (mentoria, BPO ou encerramento)'])
  ) as e(etapa, ordem, responsavel, criterio, itens);

  insert into public.zh_clientes_onboarding (acompanhamento_id, bloco, item, ordem)
  select v_id, o.bloco, o.item, o.ordem
  from (values
    ('empresarial', 'Estrutura das empresas e CNPJs', 0),
    ('empresarial', 'Dados da contratante para o contrato', 1),
    ('empresarial', 'Responsáveis e papéis no projeto', 2),
    ('empresarial', 'Endereços e canais de atendimento', 3),
    ('empresarial', 'Principais funcionários e funções', 4),
    ('empresarial', 'Meta principal para 12 meses', 5),
    ('empresarial', 'Maior receio em relação ao programa', 6),
    ('financeiro', 'Faturamento médio mensal', 0),
    ('financeiro', 'CMV atual', 1),
    ('financeiro', 'Controle de fluxo de caixa', 2),
    ('financeiro', 'DRE gerencial', 3),
    ('financeiro', 'Bancos e contas usados', 4),
    ('financeiro', 'Extratos bancários', 5),
    ('financeiro', 'Contabilidade e emissão de notas', 6),
    ('financeiro', 'Maquininhas e sistema de vendas', 7),
    ('financeiro', 'Dívidas e compromissos financeiros', 8),
    ('operacional', 'Número de funcionários', 0),
    ('operacional', 'Operação funciona sem o dono', 1),
    ('operacional', 'Fichas técnicas', 2),
    ('operacional', 'Processos documentados', 3),
    ('operacional', 'Setores e locais de estoque', 4),
    ('operacional', 'Listas de contagem', 5),
    ('operacional', 'Fornecedores principais', 6),
    ('operacional', 'Canais de venda (salão, delivery)', 7)
  ) as o(bloco, item, ordem);

  insert into public.zh_clientes_diagnostico (acompanhamento_id, dimensao)
  select v_id, d from unnest(array['financeiro', 'cardapio', 'operacional', 'mercado', 'marketing']) as d;

  return v_id;
end;
$$;

revoke all on function public.iniciar_acompanhamento_cliente(text) from public, anon;
grant execute on function public.iniciar_acompanhamento_cliente(text) to authenticated;

-- ── Fechamento de reunião, atômico ─────────────────────────────────────────
-- Reunião, checklist da etapa atual e acompanhamento mudam juntos ou não
-- mudam: a função inteira é uma transação, e qualquer exceção desfaz tudo.
-- O texto do WhatsApp é montado na aplicação e chega pronto. `security
-- invoker`: o RLS (só master) vale para cada update daqui.
create or replace function public.fechar_reuniao_cliente(
  p_acompanhamento_id uuid,
  p_reuniao_id uuid,
  p_resumo text,
  p_pauta_proxima text,
  p_resumo_whatsapp text,
  p_checklist_feitos integer[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_situacao text;
  v_etapa_id uuid;
  v_etapa_situacao text;
  v_checklist jsonb;
  v_indice integer;
begin
  -- Trava a reunião: dois fechamentos simultâneos não passam os dois.
  select r.situacao into v_situacao
  from public.zh_clientes_reunioes r
  where r.id = p_reuniao_id and r.acompanhamento_id = p_acompanhamento_id
  for update;

  if v_situacao is null then
    raise exception 'Reunião não encontrada para este cliente.' using errcode = 'P0002';
  end if;
  if v_situacao <> 'aberta' then
    raise exception 'Essa reunião já foi fechada.' using errcode = '23514';
  end if;

  select e.id, e.situacao, e.checklist into v_etapa_id, v_etapa_situacao, v_checklist
  from public.zh_clientes_etapas e
  join public.zh_clientes_acompanhamentos a
    on a.id = e.acompanhamento_id and a.etapa_atual = e.etapa
  where a.id = p_acompanhamento_id
  for update of e;

  if v_etapa_id is null then
    raise exception 'Etapa atual do cliente não encontrada.' using errcode = 'P0002';
  end if;

  foreach v_indice in array coalesce(p_checklist_feitos, '{}') loop
    if v_indice is null or v_indice < 0 or v_indice >= jsonb_array_length(v_checklist) then
      raise exception 'Item % não existe no checklist da etapa atual.', v_indice using errcode = '22023';
    end if;
  end loop;

  update public.zh_clientes_reunioes
  set situacao = 'fechada',
      resumo = coalesce(p_resumo, ''),
      pauta_proxima = coalesce(p_pauta_proxima, ''),
      resumo_whatsapp = coalesce(p_resumo_whatsapp, ''),
      fechada_em = now()
  where id = p_reuniao_id and acompanhamento_id = p_acompanhamento_id;

  if cardinality(coalesce(p_checklist_feitos, '{}')) > 0 then
    update public.zh_clientes_etapas
    set checklist = (
          select jsonb_agg(
            case when (item.pos - 1)::integer = any (p_checklist_feitos)
              then jsonb_set(item.valor, '{feito}', 'true'::jsonb)
              else item.valor end
            order by item.pos)
          from jsonb_array_elements(v_checklist) with ordinality as item(valor, pos)
        ),
        situacao = case when v_etapa_situacao = 'nao_iniciada' then 'em_andamento' else v_etapa_situacao end
    where id = v_etapa_id;
  end if;

  update public.zh_clientes_acompanhamentos
  set atualizado_em = now()
  where id = p_acompanhamento_id;
end;
$$;

revoke all on function public.fechar_reuniao_cliente(uuid, uuid, text, text, text, integer[]) from public, anon;
grant execute on function public.fechar_reuniao_cliente(uuid, uuid, text, text, text, integer[]) to authenticated;

-- ── Rate limit ─────────────────────────────────────────────────────────────
-- Recria a função com a lista acumulada (padrão de toda migração que mexe
-- em `consumir_limite_requisicao`) + as duas chaves da Gestão de Clientes.
create or replace function public.consumir_limite_requisicao(p_chave text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_janela_segundos integer;
  v_contagem integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  select configuracao.limite, configuracao.janela_segundos
    into v_limite, v_janela_segundos
  from (
    values
      ('sugerir_sku', 10, 3600),
      ('registrar_contagem', 30, 600),
      ('corrigir_contagem', 120, 600),
      ('salvar_produtos', 30, 600),
      ('salvar_fornecedores', 30, 600),
      ('pedidos_cotacao', 120, 600),
      ('recebimento', 60, 600),
      ('consolidado_criar', 30, 600),
      ('consolidado_editar', 60, 600),
      ('trocar_organizacao', 30, 600),
      ('ficha_salvar', 60, 600),
      ('ficha_excluir', 30, 600),
      ('categoria_ficha_criar', 30, 600),
      ('conversao_produto_salvar', 60, 600),
      ('configuracao_financeira_salvar', 30, 600),
      ('ficha_preco_venda_salvar', 120, 600),
      ('categoria_ficha_editar', 30, 600),
      ('categoria_ficha_excluir', 30, 600),
      ('excluir_produto', 30, 600),
      ('ficha_precos_canal_salvar', 120, 600),
      ('fin_conta_financeira_salvar', 30, 600),
      ('fin_categoria_criar', 30, 600),
      ('fin_categoria_editar', 30, 600),
      ('fin_lancamento_criar', 60, 600),
      ('fin_lancamento_editar', 60, 600),
      ('fin_baixa_registrar', 60, 600),
      ('fin_baixa_estornar', 30, 600),
      ('fin_recorrencia_criar', 30, 600),
      ('fin_lancamento_excluir', 30, 600),
      ('fin_estoque_mensal_salvar', 30, 600),
      ('fin_saidas_sem_receita_salvar', 60, 600),
      ('tempo_frente_salvar', 30, 600),
      ('tempo_valor_hora_salvar', 30, 600),
      ('tempo_meta_mensal_salvar', 30, 600),
      ('tempo_cronometro_acao', 120, 600),
      ('tempo_lancamento_criar', 60, 600),
      ('tempo_lancamento_editar', 60, 600),
      ('tempo_lancamento_excluir', 30, 600),
      ('agenda_tarefa_salvar', 60, 600),
      ('agenda_tarefa_excluir', 30, 600),
      ('agenda_marcar_execucao', 120, 600),
      ('setor_salvar', 30, 600),
      ('setor_designar', 60, 600),
      ('contagem_abrir', 60, 600),
      ('fin_provisao_parametros_salvar', 30, 600),
      ('fin_provisao_reversao_salvar', 30, 600),
      ('fin_fechamento_salvar', 30, 600),
      ('fin_recorrencia_encerrar', 30, 600),
      ('clientes_salvar', 120, 600),
      ('clientes_reuniao', 60, 600)
  ) as configuracao(chave, limite, janela_segundos)
  where configuracao.chave = p_chave;

  if v_limite is null then
    raise exception 'Limite de requisicao desconhecido' using errcode = '22023';
  end if;

  insert into public.limites_requisicao as atual (
    user_id,
    chave,
    janela_inicio,
    contagem
  )
  values (auth.uid(), p_chave, now(), 1)
  on conflict (user_id, chave) do update
  set
    janela_inicio = case
      when excluded.janela_inicio - atual.janela_inicio
        >= make_interval(secs => v_janela_segundos)
      then excluded.janela_inicio
      else atual.janela_inicio
    end,
    contagem = case
      when excluded.janela_inicio - atual.janela_inicio
        >= make_interval(secs => v_janela_segundos)
      then 1
      else atual.contagem + 1
    end
  returning contagem into v_contagem;

  return v_contagem <= v_limite;
end;
$$;

commit;
