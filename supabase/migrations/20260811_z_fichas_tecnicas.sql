-- Fichas Técnicas: executar depois de 20260811_seguranca_rls.sql.
-- O módulo nasce desligado e deve ser habilitado primeiro apenas na Zatti Teste.
begin;

alter table public.unidades
  add column if not exists fichas_tecnicas_habilitado boolean not null default false;

create or replace function public.usuario_pode_usar_fichas(
  p_unidade_id text,
  p_papeis text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.usuario_tem_acesso_unidade(p_unidade_id, p_papeis)
    and exists (
      select 1 from public.unidades u
      where u.id = p_unidade_id
        and u.fichas_tecnicas_habilitado = true
    );
$$;

revoke all on function public.usuario_pode_usar_fichas(text, text[]) from public, anon;
grant execute on function public.usuario_pode_usar_fichas(text, text[]) to authenticated;

create table if not exists public.categorias_ficha (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  camada text not null check (camada in ('PRE', 'VEN')),
  codigo text not null check (codigo ~ '^[A-Z]{3}$'),
  nome text not null check (char_length(trim(nome)) between 1 and 80),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, camada, codigo)
);

create table if not exists public.fichas_tecnicas (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  categoria_id uuid not null references public.categorias_ficha(id),
  sku text not null check (sku ~ '^(PRE|VEN)[A-Z0-9]{6}$'),
  camada text not null check (camada in ('PRE', 'VEN')),
  nome text not null check (char_length(trim(nome)) between 1 and 160),
  rendimento_quantidade numeric(14,4) not null check (rendimento_quantidade > 0),
  rendimento_unidade text not null check (rendimento_unidade in ('KG', 'LT', 'UN')),
  preco_venda numeric(12,2) check (preco_venda is null or preco_venda >= 0),
  tempo_preparo_minutos integer check (tempo_preparo_minutos is null or tempo_preparo_minutos >= 0),
  foto_path text,
  observacoes_operacionais text not null default '',
  observacoes_gerenciais text not null default '',
  status text not null default 'rascunho' check (status in ('rascunho', 'ativa', 'inativa')),
  versao integer not null default 1 check (versao > 0),
  criado_por uuid not null references auth.users(id),
  atualizado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, sku),
  unique (unidade_id, id),
  check (
    (camada = 'PRE' and left(sku, 3) = 'PRE')
    or (camada = 'VEN' and left(sku, 3) = 'VEN')
  )
);

create table if not exists public.produto_conversoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null,
  produto_sku text not null,
  unidade_uso text not null check (unidade_uso ~ '^[A-Z0-9]{1,20}$'),
  quantidade_unidade_base numeric(14,6) not null check (quantidade_unidade_base > 0),
  descricao text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, produto_sku, unidade_uso),
  foreign key (unidade_id, produto_sku)
    references public.produtos(unidade_id, sku) on update restrict on delete restrict
);

create table if not exists public.ficha_componentes (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null,
  ficha_id uuid not null,
  produto_sku text,
  ficha_componente_id uuid,
  quantidade numeric(14,4) not null check (quantidade > 0),
  unidade_uso text not null check (unidade_uso ~ '^[A-Z0-9]{1,20}$'),
  ordem integer not null default 0 check (ordem >= 0),
  observacoes text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (unidade_id, ficha_id)
    references public.fichas_tecnicas(unidade_id, id) on delete cascade,
  foreign key (unidade_id, produto_sku)
    references public.produtos(unidade_id, sku) on update restrict on delete restrict,
  foreign key (unidade_id, ficha_componente_id)
    references public.fichas_tecnicas(unidade_id, id) on delete restrict,
  check ((produto_sku is not null)::integer + (ficha_componente_id is not null)::integer = 1)
);

create table if not exists public.ficha_etapas (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null,
  ficha_id uuid not null,
  ordem integer not null check (ordem >= 0),
  descricao text not null check (char_length(trim(descricao)) between 1 and 2000),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (ficha_id, ordem),
  foreign key (unidade_id, ficha_id)
    references public.fichas_tecnicas(unidade_id, id) on delete cascade
);

create table if not exists public.ficha_versoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null,
  ficha_id uuid not null,
  versao integer not null check (versao > 0),
  snapshot jsonb not null,
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  unique (ficha_id, versao),
  foreign key (unidade_id, ficha_id)
    references public.fichas_tecnicas(unidade_id, id) on delete cascade
);

create index if not exists categorias_ficha_unidade_idx
  on public.categorias_ficha (unidade_id, camada, ativo);
create index if not exists fichas_tecnicas_unidade_idx
  on public.fichas_tecnicas (unidade_id, camada, status, nome);
create index if not exists ficha_componentes_ficha_idx
  on public.ficha_componentes (ficha_id, ordem);
create index if not exists ficha_componentes_dependencia_idx
  on public.ficha_componentes (ficha_componente_id)
  where ficha_componente_id is not null;
create index if not exists ficha_etapas_ficha_idx
  on public.ficha_etapas (ficha_id, ordem);
create index if not exists produto_conversoes_produto_idx
  on public.produto_conversoes (unidade_id, produto_sku);

create or replace function public.usuario_pode_usar_ficha_id(
  p_ficha_id uuid,
  p_papeis text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.fichas_tecnicas f
    where f.id = p_ficha_id
      and public.usuario_pode_usar_fichas(f.unidade_id, p_papeis)
  );
$$;

revoke all on function public.usuario_pode_usar_ficha_id(uuid, text[]) from public, anon;
grant execute on function public.usuario_pode_usar_ficha_id(uuid, text[]) to authenticated;

alter table public.categorias_ficha enable row level security;
alter table public.fichas_tecnicas enable row level security;
alter table public.produto_conversoes enable row level security;
alter table public.ficha_componentes enable row level security;
alter table public.ficha_etapas enable row level security;
alter table public.ficha_versoes enable row level security;

drop policy if exists "categorias_ficha_select" on public.categorias_ficha;
drop policy if exists "categorias_ficha_insert_gestao" on public.categorias_ficha;
drop policy if exists "categorias_ficha_update_gestao" on public.categorias_ficha;
create policy "categorias_ficha_select" on public.categorias_ficha
  for select to authenticated
  using (public.usuario_pode_usar_fichas(unidade_id, null));
create policy "categorias_ficha_insert_gestao" on public.categorias_ficha
  for insert to authenticated
  with check (public.usuario_pode_usar_fichas(unidade_id, array['gestao']));
create policy "categorias_ficha_update_gestao" on public.categorias_ficha
  for update to authenticated
  using (public.usuario_pode_usar_fichas(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_fichas(unidade_id, array['gestao']));

drop policy if exists "fichas_tecnicas_select" on public.fichas_tecnicas;
drop policy if exists "fichas_tecnicas_insert_gestao" on public.fichas_tecnicas;
drop policy if exists "fichas_tecnicas_update_gestao" on public.fichas_tecnicas;
create policy "fichas_tecnicas_select" on public.fichas_tecnicas
  for select to authenticated
  using (public.usuario_pode_usar_fichas(unidade_id, null));
create policy "fichas_tecnicas_insert_gestao" on public.fichas_tecnicas
  for insert to authenticated
  with check (
    public.usuario_pode_usar_fichas(unidade_id, array['gestao'])
    and criado_por = auth.uid()
    and atualizado_por = auth.uid()
  );
create policy "fichas_tecnicas_update_gestao" on public.fichas_tecnicas
  for update to authenticated
  using (public.usuario_pode_usar_fichas(unidade_id, array['gestao']))
  with check (
    public.usuario_pode_usar_fichas(unidade_id, array['gestao'])
    and atualizado_por = auth.uid()
  );

drop policy if exists "produto_conversoes_select" on public.produto_conversoes;
drop policy if exists "produto_conversoes_gestao" on public.produto_conversoes;
create policy "produto_conversoes_select" on public.produto_conversoes
  for select to authenticated
  using (public.usuario_pode_usar_fichas(unidade_id, null));
create policy "produto_conversoes_gestao" on public.produto_conversoes
  for all to authenticated
  using (public.usuario_pode_usar_fichas(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_fichas(unidade_id, array['gestao']));

drop policy if exists "ficha_componentes_select" on public.ficha_componentes;
drop policy if exists "ficha_componentes_gestao" on public.ficha_componentes;
create policy "ficha_componentes_select" on public.ficha_componentes
  for select to authenticated
  using (public.usuario_pode_usar_ficha_id(ficha_id, null));
create policy "ficha_componentes_gestao" on public.ficha_componentes
  for all to authenticated
  using (public.usuario_pode_usar_ficha_id(ficha_id, array['gestao']))
  with check (public.usuario_pode_usar_ficha_id(ficha_id, array['gestao']));

drop policy if exists "ficha_etapas_select" on public.ficha_etapas;
drop policy if exists "ficha_etapas_gestao" on public.ficha_etapas;
create policy "ficha_etapas_select" on public.ficha_etapas
  for select to authenticated
  using (public.usuario_pode_usar_ficha_id(ficha_id, null));
create policy "ficha_etapas_gestao" on public.ficha_etapas
  for all to authenticated
  using (public.usuario_pode_usar_ficha_id(ficha_id, array['gestao']))
  with check (public.usuario_pode_usar_ficha_id(ficha_id, array['gestao']));

drop policy if exists "ficha_versoes_select_gestao" on public.ficha_versoes;
drop policy if exists "ficha_versoes_insert_gestao" on public.ficha_versoes;
create policy "ficha_versoes_select_gestao" on public.ficha_versoes
  for select to authenticated
  using (public.usuario_pode_usar_ficha_id(ficha_id, array['gestao']));
create policy "ficha_versoes_insert_gestao" on public.ficha_versoes
  for insert to authenticated
  with check (
    public.usuario_pode_usar_ficha_id(ficha_id, array['gestao'])
    and criado_por = auth.uid()
  );

create or replace function public.proteger_categoria_ficha()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.codigo := upper(trim(new.codigo));
  new.nome := trim(new.nome);
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.unidade_id is distinct from old.unidade_id
       or new.camada is distinct from old.camada
       or new.codigo is distinct from old.codigo
       or new.criado_em is distinct from old.criado_em then
      raise exception 'Codigo, camada e unidade da categoria sao imutaveis';
    end if;
    new.atualizado_em := now();
  end if;
  return new;
end;
$$;

create or replace function public.proteger_ficha_tecnica()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_categoria public.categorias_ficha%rowtype;
begin
  new.sku := upper(trim(new.sku));
  new.nome := trim(new.nome);

  select * into v_categoria
  from public.categorias_ficha c
  where c.id = new.categoria_id;

  if not found
     or v_categoria.unidade_id <> new.unidade_id
     or v_categoria.camada <> new.camada
     or v_categoria.codigo <> substring(new.sku from 4 for 3) then
    raise exception 'Categoria, camada e SKU nao correspondem';
  end if;

  if exists (
    select 1 from public.produtos p
    where p.unidade_id = new.unidade_id and p.sku = new.sku
  ) then
    raise exception 'SKU ja usado por um produto do estoque';
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.criado_por := auth.uid();
      new.atualizado_por := auth.uid();
    end if;
  else
    if new.id is distinct from old.id
       or new.unidade_id is distinct from old.unidade_id
       or new.criado_por is distinct from old.criado_por
       or new.criado_em is distinct from old.criado_em
       or new.versao < old.versao then
      raise exception 'Campos imutaveis da ficha nao podem ser alterados';
    end if;
    if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
    new.atualizado_em := now();
  end if;
  return new;
end;
$$;

create or replace function public.proteger_sku_produto()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.fichas_tecnicas f
    where f.unidade_id = new.unidade_id and f.sku = upper(trim(new.sku))
  ) then
    raise exception 'SKU ja usado por uma ficha tecnica';
  end if;
  return new;
end;
$$;

create or replace function public.proteger_ficha_componente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unidade text;
  v_tem_ciclo boolean;
begin
  select f.unidade_id into v_unidade
  from public.fichas_tecnicas f where f.id = new.ficha_id;
  if not found or v_unidade <> new.unidade_id then
    raise exception 'Componente e ficha precisam pertencer a mesma unidade';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.unidade_id is distinct from old.unidade_id
    or new.ficha_id is distinct from old.ficha_id
    or new.criado_em is distinct from old.criado_em
  ) then
    raise exception 'Componente nao pode ser movido para outra ficha';
  end if;

  if new.ficha_componente_id is not null then
    if new.ficha_componente_id = new.ficha_id then
      raise exception 'Uma ficha nao pode usar a si mesma';
    end if;

    with recursive dependencias(id) as (
      select fc.ficha_componente_id
      from public.ficha_componentes fc
      where fc.ficha_id = new.ficha_componente_id
        and fc.ficha_componente_id is not null
      union
      select fc.ficha_componente_id
      from public.ficha_componentes fc
      join dependencias d on fc.ficha_id = d.id
      where fc.ficha_componente_id is not null
    )
    select exists (select 1 from dependencias where id = new.ficha_id)
    into v_tem_ciclo;

    if v_tem_ciclo then
      raise exception 'Dependencia circular entre fichas tecnicas';
    end if;
  end if;

  if tg_op = 'UPDATE' then new.atualizado_em := now(); end if;
  return new;
end;
$$;

revoke all on function public.proteger_categoria_ficha() from public, anon, authenticated;
revoke all on function public.proteger_ficha_tecnica() from public, anon, authenticated;
revoke all on function public.proteger_sku_produto() from public, anon, authenticated;
revoke all on function public.proteger_ficha_componente() from public, anon, authenticated;

drop trigger if exists proteger_categoria_ficha on public.categorias_ficha;
create trigger proteger_categoria_ficha
  before insert or update on public.categorias_ficha
  for each row execute function public.proteger_categoria_ficha();

drop trigger if exists proteger_ficha_tecnica on public.fichas_tecnicas;
create trigger proteger_ficha_tecnica
  before insert or update on public.fichas_tecnicas
  for each row execute function public.proteger_ficha_tecnica();

drop trigger if exists proteger_sku_produto on public.produtos;
create trigger proteger_sku_produto
  before insert or update of unidade_id, sku on public.produtos
  for each row execute function public.proteger_sku_produto();

drop trigger if exists proteger_ficha_componente on public.ficha_componentes;
create trigger proteger_ficha_componente
  before insert or update on public.ficha_componentes
  for each row execute function public.proteger_ficha_componente();

insert into public.categorias_ficha (unidade_id, camada, codigo, nome)
select u.id, padrao.camada, padrao.codigo, padrao.nome
from public.unidades u
cross join (values
  ('PRE', 'MOL', 'Molhos'),
  ('PRE', 'SAL', 'Saladas'),
  ('VEN', 'BUR', 'Burgers'),
  ('VEN', 'COM', 'Combos'),
  ('VEN', 'POR', 'Porcoes'),
  ('VEN', 'ADI', 'Adicionais')
) as padrao(camada, codigo, nome)
on conflict (unidade_id, camada, codigo) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fichas-tecnicas',
  'fichas-tecnicas',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fichas_fotos_select" on storage.objects;
drop policy if exists "fichas_fotos_insert_gestao" on storage.objects;
drop policy if exists "fichas_fotos_update_gestao" on storage.objects;
drop policy if exists "fichas_fotos_delete_gestao" on storage.objects;
create policy "fichas_fotos_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fichas-tecnicas'
    and public.usuario_pode_usar_fichas((storage.foldername(name))[1], null)
  );
create policy "fichas_fotos_insert_gestao" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fichas-tecnicas'
    and public.usuario_pode_usar_fichas((storage.foldername(name))[1], array['gestao'])
  );
create policy "fichas_fotos_update_gestao" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'fichas-tecnicas'
    and public.usuario_pode_usar_fichas((storage.foldername(name))[1], array['gestao'])
  )
  with check (
    bucket_id = 'fichas-tecnicas'
    and public.usuario_pode_usar_fichas((storage.foldername(name))[1], array['gestao'])
  );
create policy "fichas_fotos_delete_gestao" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fichas-tecnicas'
    and public.usuario_pode_usar_fichas((storage.foldername(name))[1], array['gestao'])
  );

commit;

-- Depois de validar o SQL, habilitar somente a unidade de teste:
-- update public.unidades set fichas_tecnicas_habilitado = true where id = 'ID_DA_ZATTI_TESTE';
