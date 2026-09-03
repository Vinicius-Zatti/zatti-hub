-- Módulo pessoal "Meu Tempo" (controle de horas de Vinícius por frente/cliente).
-- Só master vê e opera - sem organizacao_id/unidade_id, ignora a organização
-- selecionada no menu (não é módulo de cliente). Escopado por usuário
-- (criado_por = auth.uid()) pensando num possível segundo master no futuro:
-- cada master enxerga só os próprios dados, nunca os de outro. Prefixo novo
-- `zh_tempo_` (Zatti Hub, não colide com nenhum outro módulo).
begin;

-- Barreira equivalente a `usuario_pode_usar_financeiro_gerencial`, mas sem
-- conceito de unidade/organização - só confere vínculo ativo com role
-- master e a mesma exigência de segundo fator (aal2) já aplicada em
-- `usuario_tem_acesso_unidade` (getAcessoAtual redireciona pra /mfa quando
-- master ainda não tem aal2 - a mesma regra vive aqui pra defesa em
-- profundidade na Data API).
create or replace function public.usuario_e_master()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and auth.jwt() ->> 'aal' = 'aal2'
    and exists (
      select 1 from public.vinculos v
      where v.user_id = auth.uid()
        and v.status = 'ativo'
        and v.role = 'master'
    );
$$;

revoke all on function public.usuario_e_master() from public, anon;
grant execute on function public.usuario_e_master() to authenticated;

-- ── Frentes (Horizzon, Lucaskinhas, Betones, Dom Quixote, Próprio - ...) ──
-- Editável em CRUD normal (nome/tipo/ativo) - diferente de valor-hora e meta
-- mensal abaixo, que são histórico imutável. Desativar nunca apaga histórico
-- de lançamento nem de valor/meta - só tira a frente da lista de escolha.

create table if not exists public.zh_tempo_frentes (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid not null references auth.users(id),
  nome text not null check (char_length(trim(nome)) between 1 and 120),
  tipo text not null check (tipo in ('paga', 'propria')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (criado_por, id),
  unique (criado_por, nome)
);

create index if not exists zh_tempo_frentes_criado_por_idx
  on public.zh_tempo_frentes (criado_por, ativo);

drop trigger if exists tocar_atualizado_em on public.zh_tempo_frentes;
create trigger tocar_atualizado_em
  before update on public.zh_tempo_frentes
  for each row execute function public.tocar_atualizado_em();

-- ── Valor-hora vigente (histórico imutável) ───────────────────────────────
-- Nunca editado in-place - correção é sempre uma linha nova com
-- `vigente_desde` mais recente (mesmo padrão de imutabilidade do Financeiro
-- Gerencial). "Vigente num mês" = a linha de maior `vigente_desde` que seja
-- <= o mês de referência (calculado em código, nunca gravado).

create table if not exists public.zh_tempo_valores_hora (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid not null references auth.users(id),
  valor numeric(14,2) not null check (valor > 0),
  vigente_desde date not null,
  criado_em timestamptz not null default now(),
  unique (criado_por, vigente_desde)
);

create index if not exists zh_tempo_valores_hora_criado_por_idx
  on public.zh_tempo_valores_hora (criado_por, vigente_desde desc);

-- ── Meta mensal por frente (histórico imutável) ───────────────────────────
-- `valor_mensal` opcional - null representa frente própria (sem meta
-- financeira). Mesmo padrão de imutabilidade acima: correção é linha nova.

create table if not exists public.zh_tempo_metas_mensais (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid not null references auth.users(id),
  frente_id uuid not null,
  valor_mensal numeric(14,2) check (valor_mensal is null or valor_mensal > 0),
  vigente_desde date not null,
  criado_em timestamptz not null default now(),
  unique (criado_por, frente_id, vigente_desde),
  -- FK composta (não só `id`) - impede meta apontar pra frente de outro
  -- usuário, mesma defesa em profundidade de `fin_categorias`/`fin_lancamentos`.
  foreign key (criado_por, frente_id) references public.zh_tempo_frentes(criado_por, id)
);

create index if not exists zh_tempo_metas_mensais_frente_idx
  on public.zh_tempo_metas_mensais (criado_por, frente_id, vigente_desde desc);

-- Histórico de verdade: nenhum caminho (Data API, Server Action ou SQL
-- direto por engano) pode alterar ou apagar uma linha já gravada - a defesa
-- primária é a ausência de policy de UPDATE/DELETE nas duas tabelas (ver RLS
-- abaixo, mesmo padrão de `fin_baixas`); este gatilho é defesa em
-- profundidade extra, igual `proteger_categoria_financeira`/
-- `proteger_parcela_financeira` bloqueiam edição de campo estrutural.
create or replace function public.impedir_alteracao_historico_tempo()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Historico imutavel - corrigir e sempre inserir linha nova com vigente_desde mais recente' using errcode = '42501';
end;
$$;

drop trigger if exists impedir_alteracao_historico_tempo on public.zh_tempo_valores_hora;
create trigger impedir_alteracao_historico_tempo
  before update or delete on public.zh_tempo_valores_hora
  for each row execute function public.impedir_alteracao_historico_tempo();

drop trigger if exists impedir_alteracao_historico_tempo on public.zh_tempo_metas_mensais;
create trigger impedir_alteracao_historico_tempo
  before update or delete on public.zh_tempo_metas_mensais
  for each row execute function public.impedir_alteracao_historico_tempo();

-- ── Lançamentos (cronômetro ou manual) ────────────────────────────────────
-- `status` cobre o ciclo do cronômetro (em_andamento -> pausado -> encerrado)
-- - lançamento manual nasce direto `encerrado`. `duracao_minutos` só existe
-- (e é sempre exigido) quando `status = 'encerrado'`: é a soma usada em
-- minuto exato no Painel mensal, nunca recalculada a partir de
-- hora_inicio/hora_fim (que podem nem existir - "duração pura sem hora
-- nenhuma" é permitido). Sem NENHUMA trava de sobreposição de horário entre
-- lançamentos - decisão explícita de Vinícius (pode trabalhar pra dois
-- clientes ao mesmo tempo); a única exclusividade é o índice único parcial
-- abaixo, que garante 1 cronômetro `em_andamento` por vez.

create table if not exists public.zh_tempo_lancamentos (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid not null references auth.users(id),
  frente_id uuid not null,
  data date not null,
  hora_inicio time,
  hora_fim time,
  duracao_minutos integer check (duracao_minutos is null or duracao_minutos > 0),
  tipo_trabalho text not null check (tipo_trabalho in ('reuniao', 'preparacao', 'execucao', 'followup', 'outro')),
  observacao text not null default '',
  origem text not null check (origem in ('cronometro', 'manual')),
  status text not null default 'encerrado' check (status in ('em_andamento', 'pausado', 'encerrado')),
  -- Só usados por lançamento de origem 'cronometro', enquanto o ciclo roda.
  iniciado_em timestamptz,
  encerrado_em timestamptz,
  pausado_desde timestamptz,
  segundos_pausados_acumulados integer not null default 0 check (segundos_pausados_acumulados >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check ((status = 'encerrado') = (duracao_minutos is not null)),
  check (status <> 'pausado' or pausado_desde is not null),
  foreign key (criado_por, frente_id) references public.zh_tempo_frentes(criado_por, id)
);

create index if not exists zh_tempo_lancamentos_criado_por_idx
  on public.zh_tempo_lancamentos (criado_por, data desc);
create index if not exists zh_tempo_lancamentos_frente_idx
  on public.zh_tempo_lancamentos (frente_id);

-- Só 1 cronômetro `em_andamento` por vez, por usuário - trocar de frente ou
-- iniciar de novo com um cronômetro ativo encerra automaticamente o
-- anterior (resolvido na camada de acesso ao banco, não aqui); este índice é
-- a garantia de última instância contra corrida/chamada direta à API.
create unique index if not exists zh_tempo_lancamentos_unico_ativo
  on public.zh_tempo_lancamentos (criado_por) where status = 'em_andamento';

drop trigger if exists tocar_atualizado_em on public.zh_tempo_lancamentos;
create trigger tocar_atualizado_em
  before update on public.zh_tempo_lancamentos
  for each row execute function public.tocar_atualizado_em();

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Módulo pessoal: toda policy exige master E `criado_por = auth.uid()` no
-- SELECT também (não só no INSERT) - um segundo master nunca vê os dados do
-- primeiro, mesmo achado de segurança já corrigido no Financeiro Gerencial
-- (24/08) aplicado aqui desde o início.

alter table public.zh_tempo_frentes enable row level security;
alter table public.zh_tempo_valores_hora enable row level security;
alter table public.zh_tempo_metas_mensais enable row level security;
alter table public.zh_tempo_lancamentos enable row level security;

create policy "zh_tempo_frentes_select" on public.zh_tempo_frentes
  for select to authenticated
  using (public.usuario_e_master() and criado_por = auth.uid());
create policy "zh_tempo_frentes_insert" on public.zh_tempo_frentes
  for insert to authenticated
  with check (public.usuario_e_master() and criado_por = auth.uid());
create policy "zh_tempo_frentes_update" on public.zh_tempo_frentes
  for update to authenticated
  using (public.usuario_e_master() and criado_por = auth.uid())
  with check (public.usuario_e_master() and criado_por = auth.uid());

-- Sem policy de update/delete em valores_hora/metas_mensais - histórico
-- imutável, correção é sempre INSERT de linha nova (mesmo padrão de
-- `fin_baixas`, que também nunca aceita update/delete).
create policy "zh_tempo_valores_hora_select" on public.zh_tempo_valores_hora
  for select to authenticated
  using (public.usuario_e_master() and criado_por = auth.uid());
create policy "zh_tempo_valores_hora_insert" on public.zh_tempo_valores_hora
  for insert to authenticated
  with check (public.usuario_e_master() and criado_por = auth.uid());

create policy "zh_tempo_metas_mensais_select" on public.zh_tempo_metas_mensais
  for select to authenticated
  using (public.usuario_e_master() and criado_por = auth.uid());
create policy "zh_tempo_metas_mensais_insert" on public.zh_tempo_metas_mensais
  for insert to authenticated
  with check (public.usuario_e_master() and criado_por = auth.uid());

create policy "zh_tempo_lancamentos_select" on public.zh_tempo_lancamentos
  for select to authenticated
  using (public.usuario_e_master() and criado_por = auth.uid());
create policy "zh_tempo_lancamentos_insert" on public.zh_tempo_lancamentos
  for insert to authenticated
  with check (public.usuario_e_master() and criado_por = auth.uid());
create policy "zh_tempo_lancamentos_update" on public.zh_tempo_lancamentos
  for update to authenticated
  using (public.usuario_e_master() and criado_por = auth.uid())
  with check (public.usuario_e_master() and criado_por = auth.uid());
-- Excluir é restrito a lançamento manual ou já encerrado (spec da tela
-- Histórico) - nunca um cronômetro em_andamento/pausado por essa via.
create policy "zh_tempo_lancamentos_delete" on public.zh_tempo_lancamentos
  for delete to authenticated
  using (public.usuario_e_master() and criado_por = auth.uid() and status = 'encerrado');

-- ── Semeadura inicial (chamar manualmente depois desta migração) ─────────
-- select public.semear_dados_iniciais_tempo();  -- usa o primeiro master ativo
-- ou, com mais de um master no futuro:
-- select public.semear_dados_iniciais_tempo('UUID_DO_MASTER');
create or replace function public.semear_dados_iniciais_tempo(p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := p_user_id;
  v_horizzon uuid;
  v_lucaskinhas uuid;
  v_betones uuid;
  v_dom_quixote uuid;
begin
  if v_user_id is null then
    select v.user_id into v_user_id
    from public.vinculos v
    where v.role = 'master' and v.status = 'ativo'
    order by v.created_at
    limit 1;
  end if;
  if v_user_id is null then
    raise exception 'Nenhum master encontrado - informe o user_id explicitamente';
  end if;

  insert into public.zh_tempo_frentes (criado_por, nome, tipo) values
    (v_user_id, 'Horizzon', 'paga'),
    (v_user_id, 'Lucaskinhas', 'paga'),
    (v_user_id, 'Betones', 'paga'),
    (v_user_id, 'Dom Quixote', 'paga'),
    (v_user_id, 'Próprio - Verato', 'propria'),
    (v_user_id, 'Próprio - Melhorias Zatti Hub', 'propria'),
    (v_user_id, 'Próprio - Prospecção e novos clientes', 'propria')
  on conflict (criado_por, nome) do nothing;

  insert into public.zh_tempo_valores_hora (criado_por, valor, vigente_desde)
  values (v_user_id, 139.00, current_date)
  on conflict (criado_por, vigente_desde) do nothing;

  select id into v_horizzon from public.zh_tempo_frentes where criado_por = v_user_id and nome = 'Horizzon';
  select id into v_lucaskinhas from public.zh_tempo_frentes where criado_por = v_user_id and nome = 'Lucaskinhas';
  select id into v_betones from public.zh_tempo_frentes where criado_por = v_user_id and nome = 'Betones';
  select id into v_dom_quixote from public.zh_tempo_frentes where criado_por = v_user_id and nome = 'Dom Quixote';

  insert into public.zh_tempo_metas_mensais (criado_por, frente_id, valor_mensal, vigente_desde) values
    (v_user_id, v_horizzon, 7000.00, current_date),
    (v_user_id, v_lucaskinhas, 2100.00, current_date),
    (v_user_id, v_betones, 1000.00, current_date),
    (v_user_id, v_dom_quixote, 1000.00, current_date)
  on conflict (criado_por, frente_id, vigente_desde) do nothing;
end;
$$;

revoke all on function public.semear_dados_iniciais_tempo(uuid) from public, anon, authenticated;

commit;
