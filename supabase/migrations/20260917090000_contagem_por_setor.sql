-- Contagem de estoque por setor - v1
-- Spec: _execucao/zatti-hub/contagem-por-setor-v1.md (aprovada por Vinícius e pelo Codex
-- em 2026-09-17). A casa conta por setor físico (bar, cozinha, depósito), não por grupo de
-- produto, e o mesmo item pode existir em mais de um setor. O total da unidade é a SOMA
-- dos setores.
--
-- Quatro tabelas novas e uma coluna:
--   setores            lista da unidade, criada pela cliente
--   produto_setores    N:N, com trava de unidade cruzada
--   contagem_setores   andamento: quem já fechou o setor naquela data
--   contagem_escopo    snapshot de quem pertencia a qual setor quando a data foi aberta
--   contagem_itens.setor_id  de qual setor veio aquela linha (nulo = contagem legada)

begin;

-- 1. Setores -----------------------------------------------------------------

create table if not exists setores (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references unidades(id),
  nome text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- fecha o par usado pela chave estrangeira composta de produto_setores
  unique (id, unidade_id)
);

-- "Bar", "bar" e " Bar " são o mesmo setor.
create unique index if not exists setores_nome_unico_por_unidade
  on setores (unidade_id, lower(btrim(nome)));

create index if not exists setores_unidade on setores (unidade_id);

-- 2. Produto x setor ---------------------------------------------------------

-- Par necessário pra referência composta. É redundante com a PK de produtos,
-- mas é o que permite ao banco exigir produto e setor da MESMA unidade.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'produtos_id_unidade_unico'
  ) then
    alter table public.produtos add constraint produtos_id_unidade_unico unique (id, unidade_id);
  end if;
end $$;

create table if not exists produto_setores (
  produto_id uuid not null,
  setor_id uuid not null,
  unidade_id text not null references unidades(id),
  criado_em timestamptz not null default now(),
  primary key (produto_id, setor_id),
  -- as duas referências compostas carregam a mesma unidade_id da linha, então
  -- vincular produto de uma unidade a setor de outra é recusado pelo banco.
  foreign key (produto_id, unidade_id) references produtos (id, unidade_id) on delete cascade,
  foreign key (setor_id, unidade_id) references setores (id, unidade_id) on delete cascade
);

create index if not exists produto_setores_setor on produto_setores (setor_id);
create index if not exists produto_setores_unidade on produto_setores (unidade_id);

-- 3. Andamento da contagem por setor ----------------------------------------

create table if not exists contagem_setores (
  id uuid primary key default gen_random_uuid(),
  contagem_id uuid not null references contagens(id) on delete cascade,
  setor_id uuid not null references setores(id),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'concluido')),
  enviado_em timestamptz,
  enviado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  unique (contagem_id, setor_id)
);

create index if not exists contagem_setores_contagem on contagem_setores (contagem_id);

-- 4. Snapshot do escopo ------------------------------------------------------

-- Congela quem pertencia a qual setor no momento em que a data foi aberta.
-- Sem isso, mexer na designação depois mudaria a completude de uma contagem
-- histórica sem ninguém perceber.
create table if not exists contagem_escopo (
  contagem_id uuid not null references contagens(id) on delete cascade,
  setor_id uuid not null references setores(id),
  sku text not null,
  primary key (contagem_id, setor_id, sku)
);

create index if not exists contagem_escopo_por_sku on contagem_escopo (contagem_id, sku);

-- 5. Item da contagem ganha o setor -----------------------------------------

alter table contagem_itens
  add column if not exists setor_id uuid references setores(id);

-- Parcial de propósito: linha legada (setor nulo) continua livre, como sempre
-- foi na importação do legado, e linha nova não repete SKU dentro do setor.
create unique index if not exists contagem_itens_unico_por_setor
  on contagem_itens (contagem_id, setor_id, sku)
  where setor_id is not null;

create index if not exists contagem_itens_setor on contagem_itens (setor_id);

-- 6. Acesso ------------------------------------------------------------------

create or replace function public.usuario_tem_acesso_setor(
  p_setor_id uuid,
  p_papeis text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.setores s
    where s.id = p_setor_id
      and public.usuario_tem_acesso_unidade(s.unidade_id, p_papeis)
  );
$$;

alter table setores enable row level security;
alter table produto_setores enable row level security;
alter table contagem_setores enable row level security;
alter table contagem_escopo enable row level security;

create policy "setores_select_por_vinculo" on public.setores
  for select to authenticated
  using (public.usuario_tem_acesso_unidade(unidade_id, null));

create policy "setores_insert_gestao" on public.setores
  for insert to authenticated
  with check (public.usuario_tem_acesso_unidade(unidade_id, array['gestao']));

create policy "setores_update_gestao" on public.setores
  for update to authenticated
  using (public.usuario_tem_acesso_unidade(unidade_id, array['gestao']))
  with check (public.usuario_tem_acesso_unidade(unidade_id, array['gestao']));

-- Sem policy de delete: setor é desativado, nunca apagado, pra não deixar
-- contagem antiga apontando pra setor que sumiu.

create policy "produto_setores_select_por_vinculo" on public.produto_setores
  for select to authenticated
  using (public.usuario_tem_acesso_unidade(unidade_id, null));

create policy "produto_setores_insert_gestao" on public.produto_setores
  for insert to authenticated
  with check (public.usuario_tem_acesso_unidade(unidade_id, array['gestao']));

create policy "produto_setores_delete_gestao" on public.produto_setores
  for delete to authenticated
  using (public.usuario_tem_acesso_unidade(unidade_id, array['gestao']));

create policy "contagem_setores_select_por_vinculo" on public.contagem_setores
  for select to authenticated
  using (public.usuario_tem_acesso_contagem(contagem_id));

create policy "contagem_escopo_select_por_vinculo" on public.contagem_escopo
  for select to authenticated
  using (public.usuario_tem_acesso_contagem(contagem_id));

-- Escrita em contagem_setores e contagem_escopo é só pelas funções abaixo, que
-- rodam com security definer e conferem o acesso na mão. Não existe caminho
-- pela aplicação que insira nelas direto.

-- 7. Abrir a contagem do dia -------------------------------------------------

-- Chamada no clique de "Iniciar contagem", depois de escolher data e setor.
-- Idempotente: dois setores abrindo a mesma data ao mesmo tempo geram uma
-- contagem só e um snapshot só.
create or replace function public.abrir_contagem_setor(
  p_unidade_id text,
  p_data date,
  p_mes text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_contagem uuid;
begin
  if not public.usuario_tem_acesso_unidade(p_unidade_id, null) then
    raise exception 'Sem acesso a esta unidade' using errcode = '42501';
  end if;

  -- serializa a abertura da mesma data na mesma unidade
  perform pg_advisory_xact_lock(hashtext(p_unidade_id || ':' || p_data::text));

  insert into public.contagens (unidade_id, data, mes, criado_por)
  values (p_unidade_id, p_data, p_mes, auth.uid())
  on conflict (unidade_id, data) do nothing;

  select c.id into v_contagem
  from public.contagens c
  where c.unidade_id = p_unidade_id and c.data = p_data;

  if not exists (select 1 from public.contagem_escopo e where e.contagem_id = v_contagem) then
    insert into public.contagem_escopo (contagem_id, setor_id, sku)
    select v_contagem, ps.setor_id, p.sku
    from public.produto_setores ps
    join public.produtos p on p.id = ps.produto_id
    join public.setores s on s.id = ps.setor_id
    where ps.unidade_id = p_unidade_id
      and s.ativo = true
      and p.ativo = true
    on conflict do nothing;

    -- setor sem nenhum produto no snapshot fica de fora do andamento, senão
    -- um setor vazio deixaria toda data eternamente parcial.
    insert into public.contagem_setores (contagem_id, setor_id, situacao)
    select distinct v_contagem, e.setor_id, 'pendente'
    from public.contagem_escopo e
    where e.contagem_id = v_contagem
    on conflict (contagem_id, setor_id) do nothing;
  end if;

  return v_contagem;
end;
$$;

-- 8. Gravar (ou regravar) a contagem de um setor ----------------------------

-- Substitui o setor inteiro numa transação só: apaga o que aquele setor tinha
-- gravado, escreve o que veio agora, marca o setor como concluído. Erro em
-- qualquer ponto desfaz tudo. Os outros setores não são tocados.
create or replace function public.substituir_contagem_setor(
  p_contagem_id uuid,
  p_setor_id uuid,
  p_itens jsonb
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade text;
  v_gravados integer;
begin
  select c.unidade_id into v_unidade
  from public.contagens c
  where c.id = p_contagem_id;

  if v_unidade is null then
    raise exception 'Contagem nao encontrada' using errcode = '22023';
  end if;

  if not public.usuario_tem_acesso_unidade(v_unidade, null) then
    raise exception 'Sem acesso a esta contagem' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.setores s
    where s.id = p_setor_id and s.unidade_id = v_unidade and s.ativo = true
  ) then
    raise exception 'Setor invalido para esta contagem' using errcode = '22023';
  end if;

  delete from public.contagem_itens
  where contagem_id = p_contagem_id and setor_id = p_setor_id;

  insert into public.contagem_itens (
    contagem_id, setor_id, sku, grupo, nome, unidade_base,
    quantidade, preco_unitario, total, alerta
  )
  select
    p_contagem_id, p_setor_id, item.sku, coalesce(item.grupo, ''),
    coalesce(item.nome, ''), coalesce(item.unidade_base, ''),
    item.quantidade, item.preco_unitario, item.total, coalesce(item.alerta, '')
  from jsonb_to_recordset(p_itens) as item(
    sku text,
    grupo text,
    nome text,
    unidade_base text,
    quantidade numeric,
    preco_unitario numeric,
    total numeric,
    alerta text
  );

  get diagnostics v_gravados = row_count;

  insert into public.contagem_setores (contagem_id, setor_id, situacao, enviado_em, enviado_por)
  values (p_contagem_id, p_setor_id, 'concluido', now(), auth.uid())
  on conflict (contagem_id, setor_id) do update
    set situacao = 'concluido', enviado_em = now(), enviado_por = auth.uid();

  return v_gravados;
end;
$$;

revoke all on function public.abrir_contagem_setor(text, date, text) from public;
revoke all on function public.substituir_contagem_setor(uuid, uuid, jsonb) from public;
grant execute on function public.abrir_contagem_setor(text, date, text) to authenticated;
grant execute on function public.substituir_contagem_setor(uuid, uuid, jsonb) to authenticated;

commit;
