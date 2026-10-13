-- Checklist Garante, Fase 2, entrega 2b (13/10/2026): plano de ação.
-- Desenho: _execucao/zatti-hub/rotinas-mega-v1-fase2-desenho.md, seção 3 com o
-- "Ajuste B" do Codex por cima. O card do Painel (seção 4) só lê o que já existe.
-- Avisos (seção 5) ficam fora.
--
--   garante_regras_unidade   ganha prazo_plano_horas (padrão 24, de 1 a 168), versionado
--                            junto com a janela
--   garante_planos_acao      um plano por execução e item fora da meta; origem,
--                            responsável e prazo nunca mudam
--   garante_concluir         cria, na mesma transação, o plano de cada item fora da meta
--   garante_gerar_planos_vencidos  item crítico fora da meta em execução que venceu
--                            incompleta (gerado na leitura, idempotente)
--   garante_resolver_plano   responsável ou gestão, com o texto da resolução
--   garante_descartar_plano  só gestão, com motivo
--
-- Idempotente (pode rodar 2 vezes) e sem nada que impeça rodar numa transação só.

-- ══ Prazo do plano na regra versionada ══════════════════════════════════
alter table public.garante_regras_unidade
  add column if not exists prazo_plano_horas integer not null default 24
  check (prazo_plano_horas between 1 and 168);

-- Horas do plano pela regra vigente na data da ocorrência (padrão 24 sem regra).
create or replace function public.garante_prazo_plano_horas(p_unidade_id text, p_data date)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select g.prazo_plano_horas from public.garante_regras_unidade g
     where g.unidade_id = p_unidade_id and g.vigente_desde <= p_data
     order by g.vigente_desde desc limit 1
  ), 24);
$$;
revoke all on function public.garante_prazo_plano_horas(text, date) from public, anon;
grant execute on function public.garante_prazo_plano_horas(text, date) to authenticated;

-- Regra nova ganha o prazo do plano. Sem p_prazo_plano_horas (chamada antiga, com 3
-- ou 4 argumentos), mantém o prazo que valia: muda a assinatura, por isso drop antes.
drop function if exists public.garante_definir_regra(text, integer, integer, date);
create or replace function public.garante_definir_regra(
  p_unidade_id text, p_antecedencia_min integer, p_atraso_max_min integer, p_vigente_desde date default null,
  p_prazo_plano_horas integer default null
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje date := public.garante_hoje();
  v_data date := coalesce(p_vigente_desde, public.garante_hoje() + 1);
  v_base date;
  v_prazo integer;
begin
  if not public.usuario_pode_usar_garante(p_unidade_id, array['gestao']) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_data <= v_hoje then raise exception 'so_data_futura' using errcode = '22023'; end if;
  if p_antecedencia_min is null or p_atraso_max_min is null
     or p_antecedencia_min not between 0 and 720 or p_atraso_max_min not between 0 and 1440
     or (p_prazo_plano_horas is not null and p_prazo_plano_horas not between 1 and 168) then
    raise exception 'regra_invalida' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('garante_regra:' || p_unidade_id, 0));
  if not exists (select 1 from public.garante_regras_unidade where unidade_id = p_unidade_id) then
    select least(v_hoje, coalesce(min(p.vigente_desde), v_hoje)) into v_base
      from public.garante_publicacoes p where p.unidade_id = p_unidade_id;
    insert into public.garante_regras_unidade (unidade_id, vigente_desde, criado_por)
    values (p_unidade_id, v_base, auth.uid());
  end if;

  delete from public.garante_regras_unidade where unidade_id = p_unidade_id and vigente_desde > v_data;
  v_prazo := coalesce(p_prazo_plano_horas, public.garante_prazo_plano_horas(p_unidade_id, v_data));
  insert into public.garante_regras_unidade (unidade_id, vigente_desde, antecedencia_min, atraso_max_min, prazo_plano_horas, criado_por)
  values (p_unidade_id, v_data, p_antecedencia_min, p_atraso_max_min, v_prazo, auth.uid())
  on conflict (unidade_id, vigente_desde) do update
     set antecedencia_min = excluded.antecedencia_min, atraso_max_min = excluded.atraso_max_min,
         prazo_plano_horas = excluded.prazo_plano_horas, criado_por = excluded.criado_por, criado_em = now();
  return v_data;
end;
$$;
revoke all on function public.garante_definir_regra(text, integer, integer, date, integer) from public, anon;
grant execute on function public.garante_definir_regra(text, integer, integer, date, integer) to authenticated;

-- ══ Planos de ação ══════════════════════════════════════════════════════
-- Sem FK para auth.users (responsável e quem fechou): o plano é imutável e um
-- "on delete set null" bateria na trava abaixo. A resposta de origem fica pelo id.
create table if not exists public.garante_planos_acao (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null,
  execucao_id uuid not null,
  item_id uuid not null,
  resposta_id uuid not null,
  -- conclusao = item fora da meta ao concluir; vencida = item crítico fora da meta
  -- em execução que passou do fim da janela sem concluir.
  origem text not null check (origem in ('conclusao', 'vencida')),
  -- Item como estava no snapshot da execução, data e nome do checklist.
  item jsonb not null,
  data date not null,
  modelo_nome text not null,
  -- Responsável da publicação; nulo = da gestão da unidade.
  responsavel_id uuid,
  prazo timestamptz not null,
  situacao text not null default 'aberto' check (situacao in ('aberto', 'resolvido', 'descartado')),
  resolucao text,
  motivo_descarte text,
  fechado_por uuid,
  fechado_em timestamptz,
  criado_em timestamptz not null default now(),
  foreign key (execucao_id, unidade_id) references public.garante_execucoes (id, unidade_id) on delete cascade,
  -- Um plano por execução e item: duas conclusões ou duas leituras nunca duplicam.
  unique (execucao_id, item_id),
  check (
    (situacao = 'aberto' and resolucao is null and motivo_descarte is null and fechado_em is null and fechado_por is null)
    or (situacao = 'resolvido' and length(btrim(coalesce(resolucao, ''))) between 3 and 500 and motivo_descarte is null and fechado_em is not null)
    or (situacao = 'descartado' and length(btrim(coalesce(motivo_descarte, ''))) between 3 and 500 and resolucao is null and fechado_em is not null)
  )
);
create index if not exists garante_planos_acao_unidade on public.garante_planos_acao (unidade_id, situacao, prazo);
create index if not exists garante_planos_acao_responsavel on public.garante_planos_acao (responsavel_id) where situacao = 'aberto';

-- Origem, responsável, prazo e item nunca mudam; plano fechado não muda mais.
-- Vale até para o servidor (a trava é do banco, não só da RPC).
create or replace function public.garante_planos_acao_travar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.situacao <> 'aberto' then
    raise exception 'plano_fechado' using errcode = '22023';
  end if;
  if new.unidade_id is distinct from old.unidade_id or new.execucao_id is distinct from old.execucao_id
     or new.item_id is distinct from old.item_id or new.resposta_id is distinct from old.resposta_id
     or new.origem is distinct from old.origem or new.item is distinct from old.item
     or new.data is distinct from old.data or new.modelo_nome is distinct from old.modelo_nome
     or new.responsavel_id is distinct from old.responsavel_id or new.prazo is distinct from old.prazo
     or new.criado_em is distinct from old.criado_em then
    raise exception 'plano_imutavel' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.garante_planos_acao_travar() from public, anon, authenticated;

drop trigger if exists garante_planos_acao_travar on public.garante_planos_acao;
create trigger garante_planos_acao_travar
  before update on public.garante_planos_acao
  for each row execute function public.garante_planos_acao_travar();

-- Leitura: gestão da unidade vê todos; os outros, só os planos de que são
-- responsáveis. Plano sem responsável é da gestão. Escrita só pelas RPCs.
create or replace function public.usuario_pode_ver_plano_garante(p_unidade_id text, p_responsavel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.usuario_pode_usar_garante(p_unidade_id, array['gestao'])
      or (p_responsavel is not null and p_responsavel = auth.uid() and public.usuario_pode_usar_garante(p_unidade_id));
$$;
revoke all on function public.usuario_pode_ver_plano_garante(text, uuid) from public, anon;
grant execute on function public.usuario_pode_ver_plano_garante(text, uuid) to authenticated;

alter table public.garante_planos_acao enable row level security;
revoke all on table public.garante_planos_acao from public, anon, authenticated;
grant select on table public.garante_planos_acao to authenticated;
drop policy if exists garante_planos_acao_select on public.garante_planos_acao;
create policy garante_planos_acao_select on public.garante_planos_acao for select to authenticated
  using (public.usuario_pode_ver_plano_garante(unidade_id, responsavel_id));

-- Cria os planos de uma execução (uso interno das RPCs, sem grant). conclusao: todo
-- item respondido fora da meta; vencida: só o item crítico fora da meta. Prazo =
-- base + horas da regra vigente na data da execução. Nunca duplica.
create or replace function public.garante_criar_planos(p_execucao_id uuid, p_origem text, p_base timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  insert into public.garante_planos_acao (unidade_id, execucao_id, item_id, resposta_id, origem, item, data,
                                          modelo_nome, responsavel_id, prazo)
  select e.unidade_id, e.id, r.item_id, r.id, p_origem, s.item, e.data, e.modelo_nome, p.responsavel_id,
         p_base + make_interval(hours => public.garante_prazo_plano_horas(e.unidade_id, e.data))
    from public.garante_execucoes e
    join public.garante_publicacoes p on p.id = e.publicacao_id
    join public.garante_respostas r on r.execucao_id = e.id and r.dentro_meta = false and not r.nao_se_aplica
    join lateral jsonb_array_elements(e.snapshot) s(item) on (s.item ->> 'id')::uuid = r.item_id
   where e.id = p_execucao_id
     and (p_origem = 'conclusao' or coalesce((s.item ->> 'critico')::boolean, false))
  on conflict (execucao_id, item_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.garante_criar_planos(uuid, text, timestamptz) from public, anon, authenticated;

-- Concluir: igual à 2a, e na mesma transação cria o plano de cada item fora da meta.
create or replace function public.garante_concluir(p_execucao_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exec record;
  v_faltam integer;
  v_agora timestamptz := now();
begin
  select e.*, p.responsavel_id into v_exec
    from public.garante_execucoes e join public.garante_publicacoes p on p.id = e.publicacao_id
   where e.id = p_execucao_id
   for update of e;
  if not found then raise exception 'execucao_nao_encontrada' using errcode = 'P0002'; end if;
  if not public.usuario_pode_cumprir_garante(v_exec.unidade_id, v_exec.responsavel_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_exec.situacao = 'concluida' then return 0; end if;
  if v_agora > v_exec.fecha_em then raise exception 'data_fora_da_janela' using errcode = '22023'; end if;

  v_faltam := jsonb_array_length(v_exec.snapshot) - public.garante_itens_completos(p_execucao_id, v_exec.snapshot);
  if jsonb_array_length(v_exec.snapshot) = 0 then v_faltam := 1; end if;
  if v_faltam > 0 then return v_faltam; end if;

  update public.garante_execucoes
     set situacao = 'concluida', concluida_em = v_agora, concluida_por = auth.uid()
   where id = p_execucao_id;
  perform public.garante_criar_planos(p_execucao_id, 'conclusao', v_agora);
  return 0;
end;
$$;

-- Item crítico fora da meta em execução que venceu sem concluir: gerado na leitura
-- (tela de planos e card do Painel). Prazo = fim da janela + horas da regra. Só a
-- partir do início da nota na unidade (primeira regra), para não abrir plano de
-- checklist antigo. Mesma trava por unidade e data do garante_iniciar.
create or replace function public.garante_gerar_planos_vencidos(p_unidade_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inicio date;
  v_data date;
  v_exec record;
  v_total integer := 0;
begin
  if not public.usuario_pode_usar_garante(p_unidade_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select min(r.vigente_desde) into v_inicio from public.garante_regras_unidade r where r.unidade_id = p_unidade_id;

  for v_data in
    select distinct e.data
      from public.garante_execucoes e
      join public.garante_respostas r on r.execucao_id = e.id and r.dentro_meta = false and not r.nao_se_aplica
      join lateral jsonb_array_elements(e.snapshot) s(item)
        on (s.item ->> 'id')::uuid = r.item_id and coalesce((s.item ->> 'critico')::boolean, false)
     where e.unidade_id = p_unidade_id and e.situacao = 'em_andamento' and e.fecha_em < now()
       and (v_inicio is null or e.data >= v_inicio)
       and not exists (select 1 from public.garante_planos_acao pl where pl.execucao_id = e.id and pl.item_id = r.item_id)
     order by e.data
  loop
    perform pg_advisory_xact_lock(hashtextextended('garante_dia:' || p_unidade_id || ':' || v_data::text, 0));
    for v_exec in
      select e.id, e.fecha_em from public.garante_execucoes e
       where e.unidade_id = p_unidade_id and e.data = v_data and e.situacao = 'em_andamento' and e.fecha_em < now()
    loop
      v_total := v_total + public.garante_criar_planos(v_exec.id, 'vencida', v_exec.fecha_em);
    end loop;
  end loop;
  return v_total;
end;
$$;
revoke all on function public.garante_gerar_planos_vencidos(text) from public, anon;
grant execute on function public.garante_gerar_planos_vencidos(text) to authenticated;

-- Resolver: o responsável do plano ou a gestão da unidade, com o texto (3 a 500).
create or replace function public.garante_resolver_plano(p_plano_id uuid, p_resolucao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano record;
begin
  select * into v_plano from public.garante_planos_acao where id = p_plano_id for update;
  if not found then raise exception 'plano_nao_encontrado' using errcode = 'P0002'; end if;
  if not public.usuario_pode_ver_plano_garante(v_plano.unidade_id, v_plano.responsavel_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_plano.situacao <> 'aberto' then raise exception 'plano_fechado' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_resolucao, ''))) not between 3 and 500 then
    raise exception 'resolucao_obrigatoria' using errcode = '22023';
  end if;
  update public.garante_planos_acao
     set situacao = 'resolvido', resolucao = btrim(p_resolucao), fechado_por = auth.uid(), fechado_em = now()
   where id = p_plano_id;
end;
$$;

-- Descartar: só a gestão da unidade, com motivo (3 a 500).
create or replace function public.garante_descartar_plano(p_plano_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano record;
begin
  select * into v_plano from public.garante_planos_acao where id = p_plano_id for update;
  if not found then raise exception 'plano_nao_encontrado' using errcode = 'P0002'; end if;
  if not public.usuario_pode_usar_garante(v_plano.unidade_id, array['gestao']) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_plano.situacao <> 'aberto' then raise exception 'plano_fechado' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_motivo, ''))) not between 3 and 500 then
    raise exception 'motivo_descarte_obrigatorio' using errcode = '22023';
  end if;
  update public.garante_planos_acao
     set situacao = 'descartado', motivo_descarte = btrim(p_motivo), fechado_por = auth.uid(), fechado_em = now()
   where id = p_plano_id;
end;
$$;

revoke all on function public.garante_resolver_plano(uuid, text) from public, anon;
revoke all on function public.garante_descartar_plano(uuid, text) from public, anon;
grant execute on function public.garante_resolver_plano(uuid, text) to authenticated;
grant execute on function public.garante_descartar_plano(uuid, text) to authenticated;
