-- Pré-preparo vinculado (23/10/2026, piloto Zatti Burger): o produto PRE da
-- lista de contagem e a ficha técnica PRE passam a ser o mesmo item, com um
-- SKU só. Quem nasce primeiro dá o SKU: produto marcado "Pré-preparo" na
-- Edição de Dados gera um rascunho de ficha com o SKU dele; ficha PRE
-- incluída na contagem gera o produto com o SKU da ficha. Com a ficha de
-- custo completo, o preço do produto vem dela (ver
-- `sincronizarCustosPrePreparo`). A unidade da contagem é sempre a unidade de
-- rendimento da ficha (UN, KG ou LT dos dois lados, sem conversão).
-- Só vale em unidade com `pre_preparo_vinculado_habilitado`: o que já existe
-- nas outras unidades não muda.
begin;

alter table public.unidades
  add column if not exists pre_preparo_vinculado_habilitado boolean not null default false;

update public.unidades set pre_preparo_vinculado_habilitado = true where id = 'zatti-burger';

alter table public.produtos
  add column if not exists pre_preparo boolean not null default false,
  add column if not exists ficha_pre_preparo_id uuid;

-- Adiada até o fim da transação: no caminho "produto primeiro" o produto
-- aponta para o id da ficha antes de a ficha ser inserida (o trigger da ficha
-- só aceita o SKU do produto quando o vínculo já existe).
alter table public.produtos
  drop constraint if exists produtos_ficha_pre_preparo_id_fkey,
  add constraint produtos_ficha_pre_preparo_id_fkey
    foreign key (unidade_id, ficha_pre_preparo_id)
    references public.fichas_tecnicas(unidade_id, id)
    on delete set null (ficha_pre_preparo_id)
    deferrable initially deferred;

create unique index if not exists produtos_ficha_pre_preparo_unica
  on public.produtos (unidade_id, ficha_pre_preparo_id)
  where ficha_pre_preparo_id is not null;

-- Mesma regra de antes (SKU de ficha não repete SKU de produto), com uma
-- exceção: a ficha vinculada a um produto usa o SKU dele.
create or replace function public.proteger_ficha_tecnica()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_categoria public.categorias_ficha%rowtype;
  v_categoria_ok boolean;
  v_vinculada boolean;
  v_unidade_contagem text;
begin
  new.sku := upper(trim(new.sku));
  new.nome := trim(new.nome);

  -- Ficha vinculada nunca troca de SKU (a troca do código da categoria
  -- renomeia as outras fichas e preserva esta).
  if tg_op = 'UPDATE' and new.sku is distinct from old.sku and exists (
    select 1 from public.produtos p
    where p.unidade_id = old.unidade_id and p.sku = old.sku and p.ficha_pre_preparo_id = old.id
  ) then
    new.sku := old.sku;
  end if;

  select * into v_categoria
  from public.categorias_ficha c
  where c.id = new.categoria_id;
  v_categoria_ok := found;

  select p.unidade_base into v_unidade_contagem
  from public.produtos p
  where p.unidade_id = new.unidade_id and p.sku = new.sku and p.ficha_pre_preparo_id = new.id;
  v_vinculada := found;

  if not v_categoria_ok
     or v_categoria.unidade_id <> new.unidade_id
     or v_categoria.camada <> new.camada
     or (tg_op = 'INSERT' and not v_vinculada and v_categoria.codigo <> substring(new.sku from 4 for 3)) then
    raise exception 'Categoria, camada e SKU nao correspondem';
  end if;

  if not v_vinculada and exists (
    select 1 from public.produtos p
    where p.unidade_id = new.unidade_id and p.sku = new.sku
  ) then
    raise exception 'SKU ja usado por um produto do estoque';
  end if;

  if v_vinculada then
    if new.camada <> 'PRE' then
      raise exception 'Ficha incluida na contagem precisa ser de pre-preparo';
    end if;
    if new.rendimento_unidade <> v_unidade_contagem then
      raise exception 'Esta ficha esta na lista de contagem em %: o rendimento precisa ficar em %',
        v_unidade_contagem, v_unidade_contagem;
    end if;
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
    if new.sku is distinct from old.sku then
      if left(new.sku, 3) <> left(old.sku, 3)
         or right(new.sku, 3) <> right(old.sku, 3)
         or substring(new.sku from 4 for 3) <> v_categoria.codigo then
        raise exception 'SKU so pode mudar por troca do codigo da categoria';
      end if;
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
  if tg_op = 'UPDATE' and old.ficha_pre_preparo_id is not null and new.sku is distinct from old.sku then
    raise exception 'Produto vinculado a uma ficha tecnica: o SKU nao pode mudar';
  end if;
  -- O upsert da grade passa pelo trigger de INSERT antes de cair no
  -- conflito: a linha proposta vem sem o vínculo, mas o produto gravado já é
  -- o dono daquela ficha.
  if exists (
    select 1 from public.fichas_tecnicas f
    where f.unidade_id = new.unidade_id
      and f.sku = upper(trim(new.sku))
      and f.id is distinct from new.ficha_pre_preparo_id
      and not exists (
        select 1 from public.produtos p
        where p.unidade_id = f.unidade_id and p.sku = f.sku and p.ficha_pre_preparo_id = f.id
      )
  ) then
    raise exception 'SKU ja usado por uma ficha tecnica';
  end if;
  return new;
end;
$$;

-- Coerência do vínculo do lado do produto. A ficha pode ainda não existir
-- (caminho "produto primeiro", FK adiada): aí quem confere é o trigger da
-- ficha, no insert dela.
create or replace function public.validar_vinculo_pre_preparo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ficha public.fichas_tecnicas%rowtype;
begin
  if new.ficha_pre_preparo_id is null then return new; end if;

  if (tg_op = 'INSERT' or new.ficha_pre_preparo_id is distinct from old.ficha_pre_preparo_id)
     and not exists (
       select 1 from public.unidades u
       where u.id = new.unidade_id and u.pre_preparo_vinculado_habilitado
     ) then
    raise exception 'Pre-preparo com ficha tecnica ainda nao esta liberado nesta unidade';
  end if;

  select * into v_ficha
  from public.fichas_tecnicas f
  where f.unidade_id = new.unidade_id and f.id = new.ficha_pre_preparo_id;
  if found then
    if v_ficha.camada <> 'PRE' then
      raise exception 'So ficha de pre-preparo entra na lista de contagem';
    end if;
    if v_ficha.sku <> upper(trim(new.sku)) then
      raise exception 'Produto e ficha vinculados precisam ter o mesmo SKU';
    end if;
    if v_ficha.rendimento_unidade <> new.unidade_base then
      raise exception 'A unidade da contagem precisa ser a mesma do rendimento da ficha (%)', v_ficha.rendimento_unidade;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validar_vinculo_pre_preparo() from public, anon, authenticated;

drop trigger if exists validar_vinculo_pre_preparo on public.produtos;
create trigger validar_vinculo_pre_preparo
  before insert or update of ficha_pre_preparo_id, sku, unidade_base on public.produtos
  for each row execute function public.validar_vinculo_pre_preparo();

-- Pré-preparo não entra, direta ou indiretamente, na própria receita: o
-- custo dela viraria o preço do produto, que viraria o custo dela, e os dois
-- inflariam a cada recálculo. A aresta "ficha usa produto vinculado" conta
-- como "ficha usa a ficha daquele produto". Só roda em unidade que já tem
-- algum produto vinculado (fora do piloto, nunca).
create or replace function public.bloquear_ciclo_pre_preparo()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_alvo uuid;
begin
  if not exists (
    select 1 from public.produtos p
    where p.unidade_id = new.unidade_id and p.ficha_pre_preparo_id is not null
  ) then
    return new;
  end if;

  if new.produto_sku is not null then
    select p.ficha_pre_preparo_id into v_alvo
    from public.produtos p
    where p.unidade_id = new.unidade_id and p.sku = new.produto_sku;
  else
    v_alvo := new.ficha_componente_id;
  end if;
  if v_alvo is null then return new; end if;

  if exists (
    with recursive alcance(id) as (
      select v_alvo
      union
      select coalesce(c.ficha_componente_id, p.ficha_pre_preparo_id)
      from alcance a
      join public.ficha_componentes c on c.unidade_id = new.unidade_id and c.ficha_id = a.id
      left join public.produtos p on p.unidade_id = c.unidade_id and p.sku = c.produto_sku
      where coalesce(c.ficha_componente_id, p.ficha_pre_preparo_id) is not null
    )
    select 1 from alcance where id = new.ficha_id
  ) then
    raise exception 'O pre-preparo nao pode ser ingrediente da propria ficha, nem por dentro de outro pre-preparo';
  end if;
  return new;
end;
$$;

revoke all on function public.bloquear_ciclo_pre_preparo() from public, anon, authenticated;

drop trigger if exists bloquear_ciclo_pre_preparo on public.ficha_componentes;
create trigger bloquear_ciclo_pre_preparo
  before insert or update on public.ficha_componentes
  for each row execute function public.bloquear_ciclo_pre_preparo();

-- Ficha excluída de propósito: o produto deixa de ser pré-preparo com ficha
-- (senão a chave continuaria marcada e o próximo salvamento recriaria o
-- rascunho sem ninguém pedir). Preço fica o último, manual dali pra frente.
create or replace function public.soltar_produto_da_ficha_excluida()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.produtos
  set pre_preparo = false, ficha_pre_preparo_id = null
  where unidade_id = old.unidade_id and ficha_pre_preparo_id = old.id;
  return old;
end;
$$;

revoke all on function public.soltar_produto_da_ficha_excluida() from public, anon, authenticated;

drop trigger if exists soltar_produto_da_ficha_excluida on public.fichas_tecnicas;
create trigger soltar_produto_da_ficha_excluida
  before delete on public.fichas_tecnicas
  for each row execute function public.soltar_produto_da_ficha_excluida();

-- Desmarcar a chave: produto e ficha mudam juntos ou nada muda. A ficha fica
-- inativa (nunca excluída) e o vínculo continua, para religar reaproveitar.
create or replace function public.desmarcar_pre_preparo(
  p_unidade_id text,
  p_sku text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ficha_id uuid;
begin
  update public.produtos set pre_preparo = false
  where unidade_id = p_unidade_id and sku = upper(trim(p_sku))
  returning ficha_pre_preparo_id into v_ficha_id;
  if not found then
    raise exception 'Produto nao encontrado';
  end if;
  if v_ficha_id is not null then
    update public.fichas_tecnicas set status = 'inativa'
    where unidade_id = p_unidade_id and id = v_ficha_id;
  end if;
end;
$$;

revoke all on function public.desmarcar_pre_preparo(text, text) from public, anon;
grant execute on function public.desmarcar_pre_preparo(text, text) to authenticated;

-- Caminho "produto primeiro": cria o rascunho da ficha PRE com o SKU, o nome
-- e a unidade do produto, na categoria "Pré-preparos" (PPR, criada se faltar).
-- Idempotente: produto já vinculado devolve a ficha que já tem. security
-- invoker: RLS de produtos/fichas/categorias continua valendo (só Gestão).
create or replace function public.criar_ficha_pre_preparo_do_produto(
  p_unidade_id text,
  p_sku text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_produto public.produtos%rowtype;
  v_categoria_id uuid;
  v_id uuid;
  v_ficha public.fichas_tecnicas%rowtype;
begin
  select * into v_produto
  from public.produtos
  where unidade_id = p_unidade_id and sku = upper(trim(p_sku))
  for update;
  if not found then
    raise exception 'Produto nao encontrado';
  end if;

  if v_produto.ficha_pre_preparo_id is not null then
    update public.produtos set pre_preparo = true
    where unidade_id = p_unidade_id and sku = v_produto.sku and not pre_preparo;
    return v_produto.ficha_pre_preparo_id;
  end if;

  if v_produto.sku !~ '^PRE[A-Z0-9]{6}$' then
    raise exception 'Para ter ficha tecnica, o produto precisa estar no grupo PRE (SKU comecando com PRE)';
  end if;
  if v_produto.unidade_base not in ('UN', 'KG', 'LT') then
    raise exception 'A unidade do pre-preparo precisa ser UN, KG ou LT';
  end if;

  insert into public.categorias_ficha (unidade_id, camada, codigo, nome)
  values (p_unidade_id, 'PRE', 'PPR', 'Pré-preparos')
  on conflict (unidade_id, camada, codigo) do nothing;
  select id into v_categoria_id
  from public.categorias_ficha
  where unidade_id = p_unidade_id and camada = 'PRE' and codigo = 'PPR';

  v_id := gen_random_uuid();
  update public.produtos set pre_preparo = true, ficha_pre_preparo_id = v_id
  where unidade_id = p_unidade_id and sku = v_produto.sku;

  insert into public.fichas_tecnicas (
    id, unidade_id, categoria_id, sku, camada, nome,
    rendimento_quantidade, rendimento_unidade, status, versao,
    criado_por, atualizado_por
  ) values (
    v_id, p_unidade_id, v_categoria_id, v_produto.sku, 'PRE', v_produto.nome,
    1, v_produto.unidade_base, 'rascunho', 1,
    auth.uid(), auth.uid()
  )
  returning * into v_ficha;

  insert into public.ficha_versoes (unidade_id, ficha_id, versao, snapshot, criado_por)
  values (
    p_unidade_id, v_id, 1,
    jsonb_build_object('ficha', to_jsonb(v_ficha), 'componentes', '[]'::jsonb, 'etapas', '[]'::jsonb),
    auth.uid()
  );

  return v_id;
end;
$$;

revoke all on function public.criar_ficha_pre_preparo_do_produto(text, text) from public, anon;
grant execute on function public.criar_ficha_pre_preparo_do_produto(text, text) to authenticated;

commit;
