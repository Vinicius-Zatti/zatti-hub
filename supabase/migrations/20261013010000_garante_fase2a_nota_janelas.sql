-- Checklist Garante, Fase 2, entrega 2a (13/10/2026): nota P-E-Q, regras de janela
-- versionadas e dias sem operação.
-- Desenho: _execucao/zatti-hub/rotinas-mega-v1-fase2-desenho.md, seções 1 e 2 com o
-- "Ajuste A" do Codex por cima. Plano de ação, card no Painel e avisos ficam fora.
--
--   garante_regras_unidade     antecedência e atraso por unidade, versionados por
--                              vigente_desde (só data futura: vale a partir de amanhã)
--   garante_dias_sem_operacao  dia em que a unidade não abre (some da agenda e da nota)
--   garante_execucoes          ganha abre_em e fecha_em, gravados ao iniciar
--   garante_nota               nota P-E-Q calculada na leitura (fórmula versão 1)
--
-- Idempotente (pode rodar 2 vezes) e sem nada que impeça rodar numa transação só.

-- ══ Regras da unidade (versionadas) ═════════════════════════════════════
create table if not exists public.garante_regras_unidade (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  vigente_desde date not null,
  -- Iniciar a partir de prazo - antecedência (até 12 h antes).
  antecedencia_min integer not null default 120 check (antecedencia_min between 0 and 720),
  -- Responder, foto e concluir até prazo + atraso (até 24 h depois).
  atraso_max_min integer not null default 60 check (atraso_max_min between 0 and 1440),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (unidade_id, vigente_desde)
);

-- ══ Dias sem operação ═══════════════════════════════════════════════════
create table if not exists public.garante_dias_sem_operacao (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  data date not null,
  motivo text not null check (length(btrim(motivo)) between 3 and 200),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (unidade_id, data)
);

-- Leitura por quem acessa a unidade (módulo ligado); escrita só pelas RPCs abaixo.
alter table public.garante_regras_unidade enable row level security;
alter table public.garante_dias_sem_operacao enable row level security;
revoke all on table public.garante_regras_unidade, public.garante_dias_sem_operacao from public, anon, authenticated;
grant select on table public.garante_regras_unidade, public.garante_dias_sem_operacao to authenticated;

drop policy if exists garante_regras_unidade_select on public.garante_regras_unidade;
create policy garante_regras_unidade_select on public.garante_regras_unidade for select to authenticated
  using (public.usuario_pode_usar_garante(unidade_id));
drop policy if exists garante_dias_sem_operacao_select on public.garante_dias_sem_operacao;
create policy garante_dias_sem_operacao_select on public.garante_dias_sem_operacao for select to authenticated
  using (public.usuario_pode_usar_garante(unidade_id));

-- Primeira regra (padrão 120/60) de toda unidade que já usa o Garante, vigente desde
-- hoje. A nota da unidade começa nessa data (Ajuste A). Só cria se a unidade não tem
-- nenhuma regra, então rodar de novo noutro dia não muda nada.
insert into public.garante_regras_unidade (unidade_id, vigente_desde)
select u.id, public.garante_hoje()
  from public.unidades u
 where (u.garante_habilitado or exists (select 1 from public.garante_publicacoes p where p.unidade_id = u.id))
   and not exists (select 1 from public.garante_regras_unidade r where r.unidade_id = u.id)
on conflict (unidade_id, vigente_desde) do nothing;

-- Janela de uma ocorrência (publicação x data) pela regra vigente naquela data.
-- Sem regra cadastrada vale o padrão: 120 min antes e 60 min depois do prazo.
-- Security invoker: dentro das RPCs roda como dono; chamada direta segue o RLS.
create or replace function public.garante_janela(p_unidade_id text, p_data date, p_horario time)
returns table (prazo timestamptz, abre_em timestamptz, fecha_em timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.prazo,
         b.prazo - make_interval(mins => coalesce(r.antecedencia_min, 120)),
         b.prazo + make_interval(mins => coalesce(r.atraso_max_min, 60))
    from (select ((p_data + p_horario) at time zone 'America/Sao_Paulo') as prazo) b
    left join lateral (
      select g.antecedencia_min, g.atraso_max_min
        from public.garante_regras_unidade g
       where g.unidade_id = p_unidade_id and g.vigente_desde <= p_data
       order by g.vigente_desde desc
       limit 1
    ) r on true;
$$;
revoke all on function public.garante_janela(text, date, time) from public, anon;
grant execute on function public.garante_janela(text, date, time) to authenticated;

-- ══ Janela gravada na execução ══════════════════════════════════════════
alter table public.garante_execucoes add column if not exists abre_em timestamptz;
alter table public.garante_execucoes add column if not exists fecha_em timestamptz;

-- Execuções antigas: a janela que valia (abre 2 h antes do prazo, fecha no fim do dia
-- seguinte à data, no fuso da operação).
update public.garante_execucoes
   set abre_em = coalesce(abre_em, prazo - interval '2 hours'),
       fecha_em = coalesce(fecha_em, ((data + 2)::timestamp at time zone 'America/Sao_Paulo'))
 where abre_em is null or fecha_em is null;

-- Execução gravada sem janela (só o servidor consegue gravar direto) ganha a da regra
-- vigente na data, a partir do prazo dela.
create or replace function public.garante_execucoes_preencher_janela()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_a integer;
  v_b integer;
begin
  if new.abre_em is null or new.fecha_em is null then
    select coalesce(g.antecedencia_min, 120), coalesce(g.atraso_max_min, 60) into v_a, v_b
      from (select 1) x
      left join lateral (
        select r.antecedencia_min, r.atraso_max_min from public.garante_regras_unidade r
         where r.unidade_id = new.unidade_id and r.vigente_desde <= new.data
         order by r.vigente_desde desc limit 1
      ) g on true;
    new.abre_em := coalesce(new.abre_em, new.prazo - make_interval(mins => v_a));
    new.fecha_em := coalesce(new.fecha_em, new.prazo + make_interval(mins => v_b));
  end if;
  return new;
end;
$$;
revoke all on function public.garante_execucoes_preencher_janela() from public, anon, authenticated;

drop trigger if exists garante_execucoes_preencher_janela on public.garante_execucoes;
create trigger garante_execucoes_preencher_janela
  before insert on public.garante_execucoes
  for each row execute function public.garante_execucoes_preencher_janela();

alter table public.garante_execucoes alter column abre_em set not null;
alter table public.garante_execucoes alter column fecha_em set not null;

-- ══ Gestão: regra e dias sem operação (só para a frente) ════════════════
-- Nova regra vale a partir de p_vigente_desde (padrão: amanhã), nunca hoje ou antes.
-- Versões já agendadas depois dessa data saem (nunca valeram). Unidade sem regra
-- nenhuma ganha antes a regra padrão desde a primeira programação, para a nota do
-- passado continuar igual.
create or replace function public.garante_definir_regra(
  p_unidade_id text, p_antecedencia_min integer, p_atraso_max_min integer, p_vigente_desde date default null
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
begin
  if not public.usuario_pode_usar_garante(p_unidade_id, array['gestao']) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_data <= v_hoje then raise exception 'so_data_futura' using errcode = '22023'; end if;
  if p_antecedencia_min is null or p_atraso_max_min is null
     or p_antecedencia_min not between 0 and 720 or p_atraso_max_min not between 0 and 1440 then
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
  insert into public.garante_regras_unidade (unidade_id, vigente_desde, antecedencia_min, atraso_max_min, criado_por)
  values (p_unidade_id, v_data, p_antecedencia_min, p_atraso_max_min, auth.uid())
  on conflict (unidade_id, vigente_desde) do update
     set antecedencia_min = excluded.antecedencia_min, atraso_max_min = excluded.atraso_max_min,
         criado_por = excluded.criado_por, criado_em = now();
  return v_data;
end;
$$;

-- Marcar dia sem operação: só data futura e nunca numa data que já tem checklist
-- iniciado. Mesma trava por unidade e data do garante_iniciar.
create or replace function public.garante_marcar_dia_sem_operacao(p_unidade_id text, p_data date, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.usuario_pode_usar_garante(p_unidade_id, array['gestao']) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_data is null or p_data <= public.garante_hoje() then raise exception 'so_data_futura' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'motivo_obrigatorio' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('garante_dia:' || p_unidade_id || ':' || p_data::text, 0));
  if exists (select 1 from public.garante_execucoes e where e.unidade_id = p_unidade_id and e.data = p_data) then
    raise exception 'data_com_checklist' using errcode = '22023';
  end if;

  insert into public.garante_dias_sem_operacao (unidade_id, data, motivo, criado_por)
  values (p_unidade_id, p_data, btrim(p_motivo), auth.uid())
  on conflict (unidade_id, data) do update set motivo = excluded.motivo, criado_por = excluded.criado_por, criado_em = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.garante_desmarcar_dia_sem_operacao(p_unidade_id text, p_data date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.usuario_pode_usar_garante(p_unidade_id, array['gestao']) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_data is null or p_data <= public.garante_hoje() then raise exception 'so_data_futura' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('garante_dia:' || p_unidade_id || ':' || p_data::text, 0));
  delete from public.garante_dias_sem_operacao where unidade_id = p_unidade_id and data = p_data;
end;
$$;

revoke all on function public.garante_definir_regra(text, integer, integer, date) from public, anon;
revoke all on function public.garante_marcar_dia_sem_operacao(text, date, text) from public, anon;
revoke all on function public.garante_desmarcar_dia_sem_operacao(text, date) from public, anon;
grant execute on function public.garante_definir_regra(text, integer, integer, date) to authenticated;
grant execute on function public.garante_marcar_dia_sem_operacao(text, date, text) to authenticated;
grant execute on function public.garante_desmarcar_dia_sem_operacao(text, date) to authenticated;

-- ══ Janelas nas RPCs de cumprir ═════════════════════════════════════════
-- Iniciar: abre_em <= agora <= fecha_em (regra vigente na data), nunca em dia sem
-- operação. Grava abre_em e fecha_em: mudar a regra depois não reescreve o passado.
create or replace function public.garante_iniciar(p_publicacao_id uuid, p_data date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pub record;
  v_jan record;
  v_id uuid;
begin
  select p.*, m.nome as modelo_nome into v_pub
    from public.garante_publicacoes p
    join public.garante_modelos m on m.id = p.modelo_id
   where p.id = p_publicacao_id and p.ativo and m.ativo;
  if not found then raise exception 'publicacao_nao_encontrada' using errcode = 'P0002'; end if;
  if not public.usuario_pode_cumprir_garante(v_pub.unidade_id, v_pub.responsavel_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_data is null or p_data < v_pub.vigente_desde or (v_pub.vigente_ate is not null and p_data > v_pub.vigente_ate)
     or not (extract(dow from p_data)::smallint = any (v_pub.dias_semana)) then
    raise exception 'publicacao_nao_devida_nesta_data' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('garante_dia:' || v_pub.unidade_id || ':' || p_data::text, 0));

  select id into v_id from public.garante_execucoes where publicacao_id = p_publicacao_id and data = p_data;
  if v_id is not null then return v_id; end if;

  if exists (select 1 from public.garante_dias_sem_operacao d where d.unidade_id = v_pub.unidade_id and d.data = p_data) then
    raise exception 'unidade_fechada_nesta_data' using errcode = '22023';
  end if;
  select * into v_jan from public.garante_janela(v_pub.unidade_id, p_data, v_pub.horario_limite);
  if now() < v_jan.abre_em then raise exception 'janela_ainda_nao_abriu' using errcode = '22023'; end if;
  if now() > v_jan.fecha_em then raise exception 'data_fora_da_janela' using errcode = '22023'; end if;

  if not exists (select 1 from public.garante_itens i where i.modelo_id = v_pub.modelo_id and i.ativo) then
    raise exception 'checklist_sem_itens' using errcode = '22023';
  end if;

  insert into public.garante_execucoes (publicacao_id, unidade_id, data, prazo, abre_em, fecha_em, snapshot, modelo_nome, iniciada_por)
  select v_pub.id, v_pub.unidade_id, p_data, v_jan.prazo, v_jan.abre_em, v_jan.fecha_em,
         jsonb_agg(jsonb_build_object(
           'id', i.id, 'ordem', i.ordem, 'grupo', i.grupo, 'titulo', i.titulo, 'instrucao', i.instrucao,
           'tipo', i.tipo, 'critico', i.critico, 'foto_obrigatoria', i.foto_obrigatoria,
           'permite_na', i.permite_na, 'meta_min', i.meta_min, 'meta_max', i.meta_max
         ) order by i.ordem, i.criado_em),
         v_pub.modelo_nome, auth.uid()
    from public.garante_itens i
   where i.modelo_id = v_pub.modelo_id and i.ativo
  on conflict (publicacao_id, data) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.garante_execucoes where publicacao_id = p_publicacao_id and data = p_data;
  end if;
  return v_id;
end;
$$;

-- Responder, foto e concluir: até fecha_em da execução (mesmo for update de antes).
create or replace function public.garante_responder(
  p_execucao_id uuid,
  p_item_id uuid,
  p_valor_bool boolean default null,
  p_valor_numero numeric default null,
  p_valor_texto text default null,
  p_nao_se_aplica boolean default false,
  p_justificativa text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exec record;
  v_item jsonb;
  v_dentro boolean;
  v_min numeric;
  v_max numeric;
begin
  select e.*, p.responsavel_id into v_exec
    from public.garante_execucoes e join public.garante_publicacoes p on p.id = e.publicacao_id
   where e.id = p_execucao_id
   for update of e;
  if not found then raise exception 'execucao_nao_encontrada' using errcode = 'P0002'; end if;
  if not public.usuario_pode_cumprir_garante(v_exec.unidade_id, v_exec.responsavel_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_exec.situacao <> 'em_andamento' then raise exception 'execucao_concluida' using errcode = '22023'; end if;
  if now() > v_exec.fecha_em then raise exception 'data_fora_da_janela' using errcode = '22023'; end if;

  select x into v_item from jsonb_array_elements(v_exec.snapshot) x where (x ->> 'id')::uuid = p_item_id;
  if v_item is null then raise exception 'item_fora_do_checklist' using errcode = '22023'; end if;

  if p_nao_se_aplica then
    if not (v_item ->> 'permite_na')::boolean or (v_item ->> 'critico')::boolean then
      raise exception 'nao_se_aplica_proibido' using errcode = '22023';
    end if;
    if length(btrim(coalesce(p_justificativa, ''))) < 3 then
      raise exception 'justificativa_obrigatoria' using errcode = '22023';
    end if;
    v_dentro := null;
  else
    v_min := nullif(v_item ->> 'meta_min', '')::numeric;
    v_max := nullif(v_item ->> 'meta_max', '')::numeric;
    case v_item ->> 'tipo'
      when 'check' then
        if p_valor_bool is null then raise exception 'valor_obrigatorio' using errcode = '22023'; end if;
        v_dentro := p_valor_bool;
      when 'numero' then
        if p_valor_numero is null or not (p_valor_numero between -1000000000 and 1000000000) then
          raise exception 'valor_obrigatorio' using errcode = '22023';
        end if;
        v_dentro := (v_min is null or p_valor_numero >= v_min) and (v_max is null or p_valor_numero <= v_max);
      when 'estrelas' then
        if p_valor_numero is null or p_valor_numero not in (1, 2, 3, 4, 5) then
          raise exception 'valor_obrigatorio' using errcode = '22023';
        end if;
        v_dentro := (v_min is null or p_valor_numero >= v_min) and (v_max is null or p_valor_numero <= v_max);
      when 'texto' then
        if length(btrim(coalesce(p_valor_texto, ''))) = 0 then raise exception 'valor_obrigatorio' using errcode = '22023'; end if;
        v_dentro := true;
      else
        raise exception 'tipo_invalido' using errcode = '22023';
    end case;
  end if;

  insert into public.garante_respostas (execucao_id, unidade_id, item_id, valor_bool, valor_numero, valor_texto,
                                        nao_se_aplica, justificativa, dentro_meta, respondido_por, respondido_em)
  values (p_execucao_id, v_exec.unidade_id, p_item_id,
          case when p_nao_se_aplica then null else p_valor_bool end,
          case when p_nao_se_aplica then null else p_valor_numero end,
          case when p_nao_se_aplica then null else nullif(btrim(p_valor_texto), '') end,
          p_nao_se_aplica, case when p_nao_se_aplica then btrim(p_justificativa) else null end,
          v_dentro, auth.uid(), now())
  on conflict (execucao_id, item_id) do update
     set valor_bool = excluded.valor_bool, valor_numero = excluded.valor_numero, valor_texto = excluded.valor_texto,
         nao_se_aplica = excluded.nao_se_aplica, justificativa = excluded.justificativa,
         dentro_meta = excluded.dentro_meta, respondido_por = excluded.respondido_por, respondido_em = excluded.respondido_em,
         foto_path = case when excluded.nao_se_aplica then null else public.garante_respostas.foto_path end,
         foto_recebida_em = case when excluded.nao_se_aplica then null else public.garante_respostas.foto_recebida_em end;
  return coalesce(v_dentro, true);
end;
$$;

create or replace function public.garante_registrar_foto(p_execucao_id uuid, p_item_id uuid, p_caminho text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exec record;
  v_recebida timestamptz;
begin
  select e.*, p.responsavel_id into v_exec
    from public.garante_execucoes e join public.garante_publicacoes p on p.id = e.publicacao_id
   where e.id = p_execucao_id
   for update of e;
  if not found then raise exception 'execucao_nao_encontrada' using errcode = 'P0002'; end if;
  if not public.usuario_pode_cumprir_garante(v_exec.unidade_id, v_exec.responsavel_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_exec.situacao <> 'em_andamento' then raise exception 'execucao_concluida' using errcode = '22023'; end if;
  if now() > v_exec.fecha_em then raise exception 'data_fora_da_janela' using errcode = '22023'; end if;
  if not exists (select 1 from jsonb_array_elements(v_exec.snapshot) x where (x ->> 'id')::uuid = p_item_id) then
    raise exception 'item_fora_do_checklist' using errcode = '22023';
  end if;
  if p_caminho !~ ('^' || v_exec.unidade_id || '/' || p_execucao_id::text || '/' || p_item_id::text || '-[a-z0-9-]{8,64}\.jpg$') then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;
  select o.created_at into v_recebida from storage.objects o
   where o.bucket_id = 'garante-evidencias' and o.name = p_caminho;
  if v_recebida is null then raise exception 'foto_nao_recebida' using errcode = 'P0002'; end if;

  insert into public.garante_respostas (execucao_id, unidade_id, item_id, foto_path, foto_recebida_em, respondido_por)
  values (p_execucao_id, v_exec.unidade_id, p_item_id, p_caminho, v_recebida, auth.uid())
  on conflict (execucao_id, item_id) do update
     set foto_path = excluded.foto_path, foto_recebida_em = excluded.foto_recebida_em,
         nao_se_aplica = false, justificativa = null;
end;
$$;

create or replace function public.garante_concluir(p_execucao_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exec record;
  v_faltam integer;
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
  if now() > v_exec.fecha_em then raise exception 'data_fora_da_janela' using errcode = '22023'; end if;

  v_faltam := jsonb_array_length(v_exec.snapshot) - public.garante_itens_completos(p_execucao_id, v_exec.snapshot);
  if jsonb_array_length(v_exec.snapshot) = 0 then v_faltam := 1; end if;
  if v_faltam > 0 then return v_faltam; end if;

  update public.garante_execucoes
     set situacao = 'concluida', concluida_em = now(), concluida_por = auth.uid()
   where id = p_execucao_id;
  return 0;
end;
$$;

-- ══ Agenda: janela na linha e sem os dias sem operação ══════════════════
-- Data com execução continua aparecendo (mesmo que depois vire dia sem operação,
-- o que as RPCs não deixam). Muda o retorno, por isso drop antes do create.
drop function if exists public.garante_agenda(text, date);
create function public.garante_agenda(p_unidade_id text, p_data date)
returns table (
  publicacao_id uuid, modelo_id uuid, modelo_nome text, setor_id uuid, responsavel_id uuid,
  horario_limite time, prazo timestamptz, execucao_id uuid, situacao text,
  total_itens integer, respondidos integer, fora_da_meta integer, concluida_em timestamptz,
  abre_em timestamptz, fecha_em timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, m.id, coalesce(e.modelo_nome, m.nome), p.setor_id, p.responsavel_id, p.horario_limite,
         coalesce(e.prazo, j.prazo),
         e.id,
         case when e.situacao = 'concluida' then 'concluida'
              when e.id is not null then 'em_andamento'
              else 'pendente' end,
         coalesce(jsonb_array_length(e.snapshot), (select count(*)::int from public.garante_itens i where i.modelo_id = m.id and i.ativo)),
         case when e.id is null then 0 else public.garante_itens_completos(e.id, e.snapshot) end,
         (select count(*)::int from public.garante_respostas r where r.execucao_id = e.id and r.dentro_meta = false),
         e.concluida_em,
         coalesce(e.abre_em, j.abre_em),
         coalesce(e.fecha_em, j.fecha_em)
    from public.garante_publicacoes p
    join public.garante_modelos m on m.id = p.modelo_id
    left join public.garante_execucoes e on e.publicacao_id = p.id and e.data = p_data
    cross join lateral public.garante_janela(p.unidade_id, p_data, p.horario_limite) j
   where p.unidade_id = p_unidade_id
     and (
       e.id is not null
       or (p.ativo
           and p_data >= p.vigente_desde and (p.vigente_ate is null or p_data <= p.vigente_ate)
           and extract(dow from p_data)::smallint = any (p.dias_semana)
           and not exists (select 1 from public.garante_dias_sem_operacao d
                            where d.unidade_id = p_unidade_id and d.data = p_data))
     )
   order by p.horario_limite, 3;
$$;
revoke all on function public.garante_agenda(text, date) from public, anon;
grant execute on function public.garante_agenda(text, date) to authenticated;

-- ══ Storage: foto só até fecha_em ═══════════════════════════════════════
drop policy if exists garante_evidencias_insert on storage.objects;
create policy garante_evidencias_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'garante-evidencias'
    and array_length(storage.foldername(name), 1) = 2
    and storage.filename(name) ~ '^[0-9a-f-]{36}-[a-z0-9-]{8,64}\.jpg$'
    and exists (
      select 1 from public.garante_execucoes e
      join public.garante_publicacoes p on p.id = e.publicacao_id
      where e.id::text = (storage.foldername(name))[2]
        and e.unidade_id = (storage.foldername(name))[1]
        and e.situacao = 'em_andamento'
        and now() <= e.fecha_em
        and public.usuario_pode_cumprir_garante(e.unidade_id, p.responsavel_id)
        and exists (
          select 1 from jsonb_array_elements(e.snapshot) x
           where x ->> 'id' = left(storage.filename(name), 36)
        )
    )
  );

-- ══ Nota P-E-Q (fórmula versão 1) ═══════════════════════════════════════
-- Ocorrência = publicação x data devida (vigência, dia da semana, fora de dia sem
-- operação) + toda execução existente. Só conta a fechada: concluída, ou com a janela
-- de atraso vencida. Por ocorrência (0 a 100):
--   P = 100 se concluiu até o prazo; senão 0.
--   E = 100 x completos / elegíveis (elegível = item que não ficou "não se aplica";
--       completo = com valor e, se pede foto, com a foto).
--   Q = 100 x dentro da meta / respondidos elegíveis (os mesmos completos).
--   Não iniciada: P = E = Q = 0. Iniciada sem resposta elegível: E = Q = 0.
--   Tudo "não se aplica": E e Q vazios (só P conta).
-- Agregado: P, E e Q = média simples das ocorrências com valor; nota = média dos
-- componentes com valor; adesão = concluídas / previstas fechadas. Sem ocorrência
-- fechada: tudo nulo. A nota começa na data da primeira regra da unidade.
-- Linhas: 'unidade' (chave = unidade), 'pessoa' (chave = responsável da publicação,
-- nula = qualquer pessoa) e 'setor' (chave = setor, nula = sem setor).
create or replace function public.garante_nota(p_unidade_id text, p_de date, p_ate date)
returns table (
  nivel text, chave text, previstas integer, concluidas integer, no_prazo integer,
  pontualidade numeric, execucao numeric, qualidade numeric, nota numeric, adesao numeric,
  versao_formula integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_de date;
begin
  if not public.usuario_pode_usar_garante(p_unidade_id, array['gestao']) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or (p_ate - p_de) + 1 > 93 then
    raise exception 'periodo_invalido' using errcode = '22023';
  end if;
  select greatest(p_de, coalesce(min(r.vigente_desde), p_de)) into v_de
    from public.garante_regras_unidade r where r.unidade_id = p_unidade_id;

  return query
  with ocorrencias as (
    select x_e.id as x_exec, x_p.responsavel_id as x_resp, x_p.setor_id as x_setor, x_e.prazo as x_prazo,
           x_e.fecha_em as x_fecha, x_e.situacao as x_sit, x_e.concluida_em as x_concl, x_e.snapshot as x_snap
      from public.garante_execucoes x_e
      join public.garante_publicacoes x_p on x_p.id = x_e.publicacao_id
     where x_e.unidade_id = p_unidade_id and x_e.data between v_de and p_ate
    union all
    select null, x_p.responsavel_id, x_p.setor_id, x_j.prazo, x_j.fecha_em, 'pendente', null, null
      from generate_series(v_de, p_ate, interval '1 day') x_d(dia)
      join public.garante_publicacoes x_p
        on x_p.unidade_id = p_unidade_id and x_p.ativo
       and x_d.dia::date >= x_p.vigente_desde and (x_p.vigente_ate is null or x_d.dia::date <= x_p.vigente_ate)
       and extract(dow from x_d.dia::date)::smallint = any (x_p.dias_semana)
      cross join lateral public.garante_janela(p_unidade_id, x_d.dia::date, x_p.horario_limite) x_j
     where v_de <= p_ate
       and not exists (select 1 from public.garante_execucoes x_e2 where x_e2.publicacao_id = x_p.id and x_e2.data = x_d.dia::date)
       and not exists (select 1 from public.garante_dias_sem_operacao x_s where x_s.unidade_id = p_unidade_id and x_s.data = x_d.dia::date)
  ),
  medidas as (
    select o.x_resp, o.x_setor,
           (o.x_sit = 'concluida') as x_concluida,
           case when o.x_sit = 'concluida' and o.x_concl <= o.x_prazo then 100::numeric else 0::numeric end as x_p,
           case when o.x_exec is null then 0::numeric
                when c.x_eleg = 0 then null
                else 100::numeric * c.x_compl / c.x_eleg end as x_e,
           case when o.x_exec is null then 0::numeric
                when c.x_eleg = 0 then null
                when c.x_compl = 0 then 0::numeric
                else 100::numeric * c.x_dentro / c.x_compl end as x_q
      from ocorrencias o
      left join lateral (
        select count(*) filter (where not coalesce(r.nao_se_aplica, false)) as x_eleg,
               count(*) filter (where not coalesce(r.nao_se_aplica, false)
                                  and (r.valor_bool is not null or r.valor_numero is not null or r.valor_texto is not null)
                                  and (not coalesce((s.item ->> 'foto_obrigatoria')::boolean, false) or r.foto_path is not null)) as x_compl,
               count(*) filter (where not coalesce(r.nao_se_aplica, false)
                                  and (r.valor_bool is not null or r.valor_numero is not null or r.valor_texto is not null)
                                  and (not coalesce((s.item ->> 'foto_obrigatoria')::boolean, false) or r.foto_path is not null)
                                  and r.dentro_meta) as x_dentro
          from jsonb_array_elements(coalesce(o.x_snap, '[]'::jsonb)) s(item)
          left join public.garante_respostas r on r.execucao_id = o.x_exec and r.item_id = (s.item ->> 'id')::uuid
      ) c on true
     where o.x_sit = 'concluida' or now() > o.x_fecha
  ),
  agregado as (
    select case when grouping(m.x_resp) = 0 then 'pessoa' when grouping(m.x_setor) = 0 then 'setor' else 'unidade' end as x_nivel,
           case when grouping(m.x_resp) = 0 then m.x_resp::text when grouping(m.x_setor) = 0 then m.x_setor::text else p_unidade_id end as x_chave,
           count(*)::int as x_prev,
           (count(*) filter (where m.x_concluida))::int as x_concl,
           (count(*) filter (where m.x_p = 100))::int as x_prazo,
           avg(m.x_p) as x_ap, avg(m.x_e) as x_ae, avg(m.x_q) as x_aq
      from medidas m
     group by grouping sets ((), (m.x_resp), (m.x_setor))
  )
  select a.x_nivel, a.x_chave, a.x_prev, a.x_concl, a.x_prazo,
         round(a.x_ap, 1), round(a.x_ae, 1), round(a.x_aq, 1),
         round((coalesce(a.x_ap, 0) + coalesce(a.x_ae, 0) + coalesce(a.x_aq, 0))
               / nullif((a.x_ap is not null)::int + (a.x_ae is not null)::int + (a.x_aq is not null)::int, 0), 1),
         round(100::numeric * a.x_concl / nullif(a.x_prev, 0), 1),
         1
    from agregado a
   order by case a.x_nivel when 'unidade' then 0 when 'pessoa' then 1 else 2 end, a.x_chave nulls last;
end;
$$;
revoke all on function public.garante_nota(text, date, date) from public, anon;
grant execute on function public.garante_nota(text, date, date) to authenticated;

-- ══ Parar de usar sem apagar ocorrência já fechada ══════════════════════
-- A nota conta a ocorrência de hoje quando a janela dela já fechou (mesmo sem
-- ninguém ter começado). Parar o modelo depois disso não pode tirar esse zero:
-- a programação termina hoje (e não ontem) se hoje já tem execução OU se a janela
-- de hoje já fechou. Programação que começou hoje com a janela de hoje fechada
-- também fica (encerrada hoje) em vez de deixar de existir. Para a frente nada
-- muda: amanhã em diante some como antes. garante_encerrar_publicacao já encerra
-- em hoje, então não perde ocorrência fechada e fica como está.
-- Execução já iniciada de amanhã (antecedência cruzando a meia-noite) também fica:
-- a programação nunca termina antes da última execução que ela tem.
create or replace function public.garante_parar_modelo(p_modelo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_modelo record;
  v_hoje date := public.garante_hoje();
begin
  select id, unidade_id into v_modelo from public.garante_modelos where id = p_modelo_id and ativo for update;
  if not found then raise exception 'modelo_nao_encontrado' using errcode = 'P0002'; end if;
  if not public.usuario_pode_usar_garante(v_modelo.unidade_id, array['gestao']) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  update public.garante_publicacoes p
     set ativo = false
   where p.modelo_id = p_modelo_id and p.ativo and p.vigente_desde >= v_hoje
     and not exists (select 1 from public.garante_execucoes e where e.publicacao_id = p.id)
     and not (p.vigente_desde = v_hoje
              and exists (select 1 from public.garante_janela(p.unidade_id, v_hoje, p.horario_limite) j
                           where now() > j.fecha_em));

  update public.garante_publicacoes p
     set vigente_ate = greatest(
           case
             when exists (select 1 from public.garante_execucoes e where e.publicacao_id = p.id and e.data = v_hoje)
               or exists (select 1 from public.garante_janela(p.unidade_id, v_hoje, p.horario_limite) j
                           where now() > j.fecha_em)
               then v_hoje
             else v_hoje - 1
           end,
           (select max(e.data) from public.garante_execucoes e where e.publicacao_id = p.id))
   where p.modelo_id = p_modelo_id and p.ativo
     and (p.vigente_ate is null or p.vigente_ate >= v_hoje);

  update public.garante_modelos set ativo = false, atualizado_em = now() where id = p_modelo_id;
end;
$$;
revoke all on function public.garante_parar_modelo(uuid) from public, anon;
grant execute on function public.garante_parar_modelo(uuid) to authenticated;
