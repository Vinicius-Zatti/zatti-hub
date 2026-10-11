-- Checklist Garante V1, fase 1 (11/10/2026). Etapa Garante do M.E.G.A.: a rotina nasce
-- do POP (Estrutura), a equipe cumpre no celular com foto e o dono vê quem fez.
-- Plano e vereditos: _execucao/zatti-hub/rotinas-mega-v1-plano.md e
-- rotinas-mega-v1-veredito-codex.md.
--
--   garante_modelos       checklist da unidade (nasce da biblioteca de POPs ou do zero)
--   garante_itens         itens do modelo (check, número com faixa, estrelas, texto, foto)
--   garante_publicacoes   quem faz, em que dias e até que horas (com vigência)
--   garante_execucoes     uma por publicação por dia, com snapshot dos itens
--   garante_respostas     uma por item da execução
--
-- Escrita da execução só por RPC (iniciar, responder, registrar foto, concluir), que
-- confere acesso, item do snapshot e calcula "dentro da meta" no banco. Execução
-- concluída não muda mais. Agenda calculada na leitura, sem cron. Fotos no bucket
-- privado garante-evidencias, legíveis por 40 dias.

-- ── Flag por unidade ────────────────────────────────────────────────────
alter table public.unidades
  add column if not exists garante_habilitado boolean not null default false;

-- ── Modelos e itens ─────────────────────────────────────────────────────
create table if not exists public.garante_modelos (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  nome text not null check (length(btrim(nome)) between 1 and 120),
  descricao text check (descricao is null or length(descricao) <= 500),
  origem_pop text check (origem_pop is null or length(origem_pop) <= 60),
  ativo boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, unidade_id)
);
create index if not exists garante_modelos_unidade on public.garante_modelos (unidade_id) where ativo;

create table if not exists public.garante_itens (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null,
  unidade_id text not null,
  ordem integer not null default 0,
  grupo text check (grupo is null or length(grupo) <= 80),
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  instrucao text check (instrucao is null or length(instrucao) <= 500),
  tipo text not null default 'check' check (tipo in ('check', 'numero', 'estrelas', 'texto')),
  critico boolean not null default false,
  foto_obrigatoria boolean not null default false,
  permite_na boolean not null default true,
  meta_min numeric,
  meta_max numeric,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  foreign key (modelo_id, unidade_id) references public.garante_modelos (id, unidade_id) on delete cascade,
  check (meta_min is null or meta_max is null or meta_min <= meta_max),
  check (tipo in ('numero', 'estrelas') or (meta_min is null and meta_max is null)),
  check (tipo <> 'estrelas' or ((meta_min is null or meta_min between 1 and 5) and (meta_max is null or meta_max between 1 and 5))),
  -- Item crítico nunca aceita "não se aplica".
  check (not (critico and permite_na))
);
create index if not exists garante_itens_modelo on public.garante_itens (modelo_id, ordem);

-- ── Publicações (quem, quando, até que horas) ───────────────────────────
create table if not exists public.garante_publicacoes (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null,
  unidade_id text not null,
  setor_id uuid,
  responsavel_id uuid references auth.users(id) on delete set null,
  -- 0 = domingo ... 6 = sábado (extract(dow)).
  dias_semana smallint[] not null check (cardinality(dias_semana) between 1 and 7 and dias_semana <@ array[0,1,2,3,4,5,6]::smallint[]),
  horario_limite time not null,
  vigente_desde date not null default current_date,
  vigente_ate date,
  ativo boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  foreign key (modelo_id, unidade_id) references public.garante_modelos (id, unidade_id),
  foreign key (setor_id, unidade_id) references public.setores (id, unidade_id),
  check (vigente_ate is null or vigente_ate >= vigente_desde),
  unique (id, unidade_id)
);
create index if not exists garante_publicacoes_unidade on public.garante_publicacoes (unidade_id) where ativo;

-- ── Execuções e respostas ───────────────────────────────────────────────
create table if not exists public.garante_execucoes (
  id uuid primary key default gen_random_uuid(),
  publicacao_id uuid not null,
  unidade_id text not null,
  data date not null,
  prazo timestamptz not null,
  situacao text not null default 'em_andamento' check (situacao in ('em_andamento', 'concluida')),
  -- Itens como estavam ao iniciar: editar o modelo depois não muda a execução.
  snapshot jsonb not null,
  modelo_nome text not null,
  iniciada_por uuid references auth.users(id) on delete set null,
  iniciada_em timestamptz not null default now(),
  concluida_por uuid references auth.users(id) on delete set null,
  concluida_em timestamptz,
  foreign key (publicacao_id, unidade_id) references public.garante_publicacoes (id, unidade_id),
  unique (publicacao_id, data),
  unique (id, unidade_id),
  check ((situacao = 'concluida') = (concluida_em is not null))
);
create index if not exists garante_execucoes_unidade_data on public.garante_execucoes (unidade_id, data);

create table if not exists public.garante_respostas (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null,
  unidade_id text not null,
  item_id uuid not null,
  valor_bool boolean,
  valor_numero numeric,
  valor_texto text check (valor_texto is null or length(valor_texto) <= 1000),
  nao_se_aplica boolean not null default false,
  justificativa text check (justificativa is null or length(justificativa) <= 500),
  foto_path text,
  foto_recebida_em timestamptz,
  dentro_meta boolean,
  respondido_por uuid references auth.users(id) on delete set null,
  respondido_em timestamptz not null default now(),
  foreign key (execucao_id, unidade_id) references public.garante_execucoes (id, unidade_id) on delete cascade,
  unique (execucao_id, item_id),
  check (not nao_se_aplica or length(btrim(coalesce(justificativa, ''))) >= 3)
);

-- ── RLS ─────────────────────────────────────────────────────────────────
alter table public.garante_modelos enable row level security;
alter table public.garante_itens enable row level security;
alter table public.garante_publicacoes enable row level security;
alter table public.garante_execucoes enable row level security;
alter table public.garante_respostas enable row level security;

-- Leitura: quem tem acesso à unidade e com o módulo ligado.
create or replace function public.usuario_pode_usar_garante(p_unidade_id text, p_papeis text[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.usuario_tem_acesso_unidade(p_unidade_id, p_papeis)
    and exists (select 1 from public.unidades u where u.id = p_unidade_id and u.garante_habilitado);
$$;
revoke all on function public.usuario_pode_usar_garante(text, text[]) from public, anon;
grant execute on function public.usuario_pode_usar_garante(text, text[]) to authenticated;

drop policy if exists garante_modelos_select on public.garante_modelos;
create policy garante_modelos_select on public.garante_modelos for select to authenticated
  using (public.usuario_pode_usar_garante(unidade_id));
drop policy if exists garante_modelos_gestao on public.garante_modelos;
create policy garante_modelos_gestao on public.garante_modelos for all to authenticated
  using (public.usuario_pode_usar_garante(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_garante(unidade_id, array['gestao']));

drop policy if exists garante_itens_select on public.garante_itens;
create policy garante_itens_select on public.garante_itens for select to authenticated
  using (public.usuario_pode_usar_garante(unidade_id));
drop policy if exists garante_itens_gestao on public.garante_itens;
create policy garante_itens_gestao on public.garante_itens for all to authenticated
  using (public.usuario_pode_usar_garante(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_garante(unidade_id, array['gestao']));

drop policy if exists garante_publicacoes_select on public.garante_publicacoes;
create policy garante_publicacoes_select on public.garante_publicacoes for select to authenticated
  using (public.usuario_pode_usar_garante(unidade_id));
drop policy if exists garante_publicacoes_gestao on public.garante_publicacoes;
create policy garante_publicacoes_gestao on public.garante_publicacoes for all to authenticated
  using (public.usuario_pode_usar_garante(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_garante(unidade_id, array['gestao']));

-- Execução e resposta: só leitura direta; escrita pelas RPCs abaixo.
drop policy if exists garante_execucoes_select on public.garante_execucoes;
create policy garante_execucoes_select on public.garante_execucoes for select to authenticated
  using (public.usuario_pode_usar_garante(unidade_id));
drop policy if exists garante_respostas_select on public.garante_respostas;
create policy garante_respostas_select on public.garante_respostas for select to authenticated
  using (public.usuario_pode_usar_garante(unidade_id));

-- ── Funções de apoio ────────────────────────────────────────────────────
-- Dia de hoje no fuso da operação (todas as unidades hoje são de Brasília).
create or replace function public.garante_hoje()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Quem pode cumprir a publicação: responsável dela, qualquer um da unidade se ela não
-- tem responsável, ou a gestão da unidade.
create or replace function public.usuario_pode_cumprir_garante(p_unidade_id text, p_responsavel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.usuario_pode_usar_garante(p_unidade_id)
    and (p_responsavel is null or p_responsavel = auth.uid()
         or public.usuario_pode_usar_garante(p_unidade_id, array['gestao'])
         or public.usuario_e_master());
$$;
revoke all on function public.usuario_pode_cumprir_garante(text, uuid) from public, anon;
grant execute on function public.usuario_pode_cumprir_garante(text, uuid) to authenticated;

-- ── Iniciar (ou continuar) a execução do dia ────────────────────────────
-- Só hoje ou ontem (fechamento que passa da meia-noite). Snapshot dos itens ativos.
create or replace function public.garante_iniciar(p_publicacao_id uuid, p_data date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pub record;
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
  if p_data not in (public.garante_hoje(), public.garante_hoje() - 1) then
    raise exception 'data_fora_da_janela' using errcode = '22023';
  end if;
  if p_data < v_pub.vigente_desde or (v_pub.vigente_ate is not null and p_data > v_pub.vigente_ate)
     or not (extract(dow from p_data)::smallint = any (v_pub.dias_semana)) then
    raise exception 'publicacao_nao_devida_nesta_data' using errcode = '22023';
  end if;

  select id into v_id from public.garante_execucoes where publicacao_id = p_publicacao_id and data = p_data;
  if v_id is not null then return v_id; end if;

  insert into public.garante_execucoes (publicacao_id, unidade_id, data, prazo, snapshot, modelo_nome, iniciada_por)
  select v_pub.id, v_pub.unidade_id, p_data,
         (p_data + v_pub.horario_limite) at time zone 'America/Sao_Paulo',
         coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'ordem', i.ordem, 'grupo', i.grupo, 'titulo', i.titulo, 'instrucao', i.instrucao,
           'tipo', i.tipo, 'critico', i.critico, 'foto_obrigatoria', i.foto_obrigatoria,
           'permite_na', i.permite_na, 'meta_min', i.meta_min, 'meta_max', i.meta_max
         ) order by i.ordem, i.criado_em), '[]'::jsonb),
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

-- ── Responder um item ───────────────────────────────────────────────────
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
  v_resp_foto text;
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
        if p_valor_numero is null then raise exception 'valor_obrigatorio' using errcode = '22023'; end if;
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
         -- Marcar "não se aplica" tira a foto do item.
         foto_path = case when excluded.nao_se_aplica then null else public.garante_respostas.foto_path end,
         foto_recebida_em = case when excluded.nao_se_aplica then null else public.garante_respostas.foto_recebida_em end;
  return coalesce(v_dentro, true);
end;
$$;

-- ── Registrar a foto de um item ─────────────────────────────────────────
-- O arquivo já subiu para garante-evidencias/<unidade>/<execucao>/<item>-<aleatório>.jpg
-- (a policy do Storage só aceita nesse caminho, com execução em andamento). A hora
-- registrada é a do servidor de arquivos ao receber, não a do aparelho.
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

-- ── Concluir ────────────────────────────────────────────────────────────
-- Todo item precisa de resposta (ou "não se aplica"), e item com foto obrigatória
-- precisa da foto (sem a foto, o item não conta como feito). Devolve quantos faltam;
-- 0 = concluída agora (ou já estava).
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

  select count(*) into v_faltam
    from jsonb_array_elements(v_exec.snapshot) x
    left join public.garante_respostas r on r.execucao_id = p_execucao_id and r.item_id = (x ->> 'id')::uuid
   where r.id is null
      or (not r.nao_se_aplica and r.dentro_meta is null and r.valor_bool is null and r.valor_numero is null and r.valor_texto is null)
      or (not r.nao_se_aplica and (x ->> 'foto_obrigatoria')::boolean and r.foto_path is null);
  if v_faltam > 0 then return v_faltam; end if;

  update public.garante_execucoes
     set situacao = 'concluida', concluida_em = now(), concluida_por = auth.uid()
   where id = p_execucao_id;
  return 0;
end;
$$;

revoke all on function public.garante_iniciar(uuid, date) from public, anon;
revoke all on function public.garante_responder(uuid, uuid, boolean, numeric, text, boolean, text) from public, anon;
revoke all on function public.garante_registrar_foto(uuid, uuid, text) from public, anon;
revoke all on function public.garante_concluir(uuid) from public, anon;
grant execute on function public.garante_iniciar(uuid, date) to authenticated;
grant execute on function public.garante_responder(uuid, uuid, boolean, numeric, text, boolean, text) to authenticated;
grant execute on function public.garante_registrar_foto(uuid, uuid, text) to authenticated;
grant execute on function public.garante_concluir(uuid) to authenticated;

-- ── Agenda do dia, calculada na leitura (RLS de quem chama) ─────────────
create or replace function public.garante_agenda(p_unidade_id text, p_data date)
returns table (
  publicacao_id uuid, modelo_id uuid, modelo_nome text, setor_id uuid, responsavel_id uuid,
  horario_limite time, prazo timestamptz, execucao_id uuid, situacao text,
  total_itens integer, respondidos integer, fora_da_meta integer, concluida_em timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, m.id, m.nome, p.setor_id, p.responsavel_id, p.horario_limite,
         coalesce(e.prazo, (p_data + p.horario_limite) at time zone 'America/Sao_Paulo'),
         e.id,
         case when e.situacao = 'concluida' then 'concluida'
              when e.id is not null then 'em_andamento'
              else 'pendente' end,
         coalesce(jsonb_array_length(e.snapshot), (select count(*)::int from public.garante_itens i where i.modelo_id = m.id and i.ativo)),
         (select count(*)::int from public.garante_respostas r where r.execucao_id = e.id
            and (r.nao_se_aplica or r.dentro_meta is not null)),
         (select count(*)::int from public.garante_respostas r where r.execucao_id = e.id and r.dentro_meta = false),
         e.concluida_em
    from public.garante_publicacoes p
    join public.garante_modelos m on m.id = p.modelo_id and m.ativo
    left join public.garante_execucoes e on e.publicacao_id = p.id and e.data = p_data
   where p.unidade_id = p_unidade_id
     and p.ativo
     and p_data >= p.vigente_desde and (p.vigente_ate is null or p_data <= p.vigente_ate)
     and extract(dow from p_data)::smallint = any (p.dias_semana)
   order by p.horario_limite, m.nome;
$$;
revoke all on function public.garante_agenda(text, date) from public, anon;
grant execute on function public.garante_agenda(text, date) to authenticated;

-- ── Fotos: bucket privado, só JPEG até 2 MB, legível por 40 dias ────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('garante-evidencias', 'garante-evidencias', false, 2097152, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

drop policy if exists garante_evidencias_select on storage.objects;
create policy garante_evidencias_select on storage.objects for select to authenticated
  using (
    bucket_id = 'garante-evidencias'
    and created_at > now() - interval '40 days'
    and public.usuario_pode_usar_garante((storage.foldername(name))[1])
  );

drop policy if exists garante_evidencias_insert on storage.objects;
create policy garante_evidencias_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'garante-evidencias'
    and exists (
      select 1 from public.garante_execucoes e
      join public.garante_publicacoes p on p.id = e.publicacao_id
      where e.id::text = (storage.foldername(name))[2]
        and e.unidade_id = (storage.foldername(name))[1]
        and e.situacao = 'em_andamento'
        and public.usuario_pode_cumprir_garante(e.unidade_id, p.responsavel_id)
    )
  );
-- Sem update nem delete para usuário: evidência não se troca nem se apaga pelo app.

-- Lista de fotos vencidas (mais de 40 dias) para a limpeza física, feita pelo servidor
-- com a API do Storage.
create or replace function public.garante_evidencias_vencidas(p_limite integer default 500)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name from storage.objects o
   where o.bucket_id = 'garante-evidencias' and o.created_at < now() - interval '40 days'
   order by o.created_at
   limit greatest(1, least(p_limite, 1000));
$$;
revoke all on function public.garante_evidencias_vencidas(integer) from public, anon, authenticated;
grant execute on function public.garante_evidencias_vencidas(integer) to service_role;
