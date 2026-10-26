-- Pré-preparo: "usar a ficha existente" (26/10/2026). Antes de liberar o
-- pré-preparo vinculado para todas as unidades: produto PRE e ficha PRE de
-- nome parecido, criados separados e com SKUs diferentes, viram um item só
-- quando a pessoa escolhe (nada se une sozinho). Sem isso, ligar a chave
-- "Pré-preparo" criava uma ficha nova ao lado da antiga (caso da Cebola
-- Caramelizada do Zatti Burger, corrigido à mão em 24/10).
--
-- Regras (Vinícius, 23/10): quem nasce primeiro manda no SKU; a unidade da
-- contagem é a unidade de rendimento da ficha, sem conversão.
--   * Produto mais antigo (ou do mesmo instante): a ficha passa a usar o SKU
--     do produto. Quem usa a ficha como ingrediente aponta pelo id, nada muda.
--   * Ficha mais antiga: o produto passa a usar o SKU da ficha, levando junto
--     a conversão dele e os ingredientes de outras fichas que o usam. Só sem
--     histórico: produto com lançamento no extrato, contagem ou pedido não
--     troca de SKU (regra do extrato v1; contagem e pedido fechados não se
--     editam), e a união é recusada com a explicação.
-- Somente aditiva: uma função nova e dois gatilhos que ganham uma exceção.
begin;

-- Gatilho da ficha: a ficha vinculada pode receber o SKU do produto dono
-- dela. Fora da união isso nunca acontece, porque o vínculo exige SKU igual
-- (`validar_vinculo_pre_preparo`). O resto é o corpo de 20261023180000.
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
    -- Exceção nova: SKU que passa a ser o do produto vinculado (união).
    if new.sku is distinct from old.sku and not v_vinculada then
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

-- Gatilho do produto: durante a união (e só nela, marcada na transação pela
-- função abaixo, para aquela ficha) o produto aponta para a ficha um instante
-- antes de a ficha receber o SKU dele. O resto é o corpo de 20261023180000.
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
    if v_ficha.sku <> upper(trim(new.sku))
       and coalesce(current_setting('zatti_hub.unindo_pre_preparo', true), '') <> v_ficha.id::text then
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

-- A união. security invoker: RLS e os gatilhos de permissão (Cadastros e
-- Cardápio) continuam valendo. Tudo numa transação: ou une inteiro ou nada
-- muda. Devolve o SKU que o item passa a ter.
create or replace function public.unir_pre_preparo_ficha_existente(
  p_unidade_id text,
  p_sku text,
  p_ficha_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_produto public.produtos%rowtype;
  v_ficha public.fichas_tecnicas%rowtype;
  v_sku_final text;
  v_status text;
  v_conversoes jsonb;
  v_componentes jsonb;
begin
  if not exists (
    select 1 from public.unidades u
    where u.id = p_unidade_id and u.pre_preparo_vinculado_habilitado
  ) then
    raise exception 'Pre-preparo com ficha tecnica ainda nao esta liberado nesta unidade';
  end if;

  select * into v_produto
  from public.produtos
  where unidade_id = p_unidade_id and sku = upper(trim(p_sku))
  for update;
  if not found then
    raise exception 'Produto nao encontrado';
  end if;

  select * into v_ficha
  from public.fichas_tecnicas
  where unidade_id = p_unidade_id and id = p_ficha_id
  for update;
  if not found then
    raise exception 'Ficha tecnica nao encontrada';
  end if;

  if v_produto.ficha_pre_preparo_id is not null then
    raise exception 'Este produto ja tem ficha tecnica vinculada';
  end if;
  if exists (
    select 1 from public.produtos p
    where p.unidade_id = p_unidade_id and p.ficha_pre_preparo_id = v_ficha.id
  ) then
    raise exception 'Esta ficha ja esta vinculada a outro produto da contagem';
  end if;
  if v_produto.sku !~ '^PRE[A-Z0-9]{6}$' then
    raise exception 'Para ter ficha tecnica, o produto precisa estar no grupo PRE (SKU comecando com PRE)';
  end if;
  if v_ficha.camada <> 'PRE' then
    raise exception 'So ficha de pre-preparo entra na lista de contagem';
  end if;
  if v_ficha.rendimento_unidade <> upper(trim(v_produto.unidade_base)) then
    raise exception 'O produto e contado em % e a ficha rende em %: deixe os dois na mesma unidade antes de unir',
      upper(trim(v_produto.unidade_base)), v_ficha.rendimento_unidade;
  end if;

  -- Depois de unidos, produto e ficha são o mesmo item: a ficha não pode
  -- usar o produto, direto ou por dentro de outro pré-preparo.
  if exists (
    with recursive alcance(id) as (
      select v_ficha.id
      union
      select coalesce(c.ficha_componente_id, p.ficha_pre_preparo_id)
      from alcance a
      join public.ficha_componentes c on c.unidade_id = p_unidade_id and c.ficha_id = a.id
      left join public.produtos p on p.unidade_id = c.unidade_id and p.sku = c.produto_sku
      where coalesce(c.ficha_componente_id, p.ficha_pre_preparo_id) is not null
    )
    select 1
    from alcance a
    join public.ficha_componentes c on c.unidade_id = p_unidade_id and c.ficha_id = a.id
    where c.produto_sku = v_produto.sku
  ) then
    raise exception 'A ficha % usa o proprio produto % como ingrediente (direto ou dentro de outro pre-preparo): tire esse ingrediente antes de unir',
      v_ficha.sku, v_produto.sku;
  end if;

  -- Ficha inativa volta como na chave religada: ativa se tem ingrediente.
  v_status := v_ficha.status;
  if v_status = 'inativa' then
    v_status := case when exists (
      select 1 from public.ficha_componentes c
      where c.unidade_id = p_unidade_id and c.ficha_id = v_ficha.id
    ) then 'ativa' else 'rascunho' end;
  end if;

  if v_ficha.criado_em < v_produto.criado_em then
    -- Ficha mais antiga: o produto recebe o SKU dela, só se não tem histórico.
    if exists (select 1 from public.estoque_movimentacoes m where m.produto_id = v_produto.id) then
      raise exception 'A ficha % e mais antiga, entao o produto passaria de % para %, mas ele ja tem lancamento no extrato do estoque e o SKU nao pode mudar',
        v_ficha.sku, v_produto.sku, v_ficha.sku;
    end if;
    if exists (
      select 1 from public.contagem_itens i join public.contagens c on c.id = i.contagem_id
      where c.unidade_id = p_unidade_id and i.sku in (v_produto.sku, v_ficha.sku)
    ) or exists (
      select 1 from public.contagem_escopo e join public.contagens c on c.id = e.contagem_id
      where c.unidade_id = p_unidade_id and e.sku in (v_produto.sku, v_ficha.sku)
    ) or exists (
      select 1 from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
      where p.unidade_id = p_unidade_id and i.sku in (v_produto.sku, v_ficha.sku)
    ) then
      raise exception 'A ficha % e mais antiga, entao o produto passaria de % para %, mas ele ja aparece em contagem ou pedido e o historico nao troca de SKU',
        v_ficha.sku, v_produto.sku, v_ficha.sku;
    end if;

    v_sku_final := v_ficha.sku;
    select jsonb_agg(to_jsonb(c)) into v_conversoes
    from public.produto_conversoes c
    where c.unidade_id = p_unidade_id and c.produto_sku = v_produto.sku;
    select jsonb_agg(to_jsonb(c)) into v_componentes
    from public.ficha_componentes c
    where c.unidade_id = p_unidade_id and c.produto_sku = v_produto.sku;

    -- As chaves estrangeiras são "on update restrict": sai e volta com o
    -- SKU novo, com o mesmo id, quantidade e datas.
    delete from public.produto_conversoes
    where unidade_id = p_unidade_id and produto_sku = v_produto.sku;
    delete from public.ficha_componentes
    where unidade_id = p_unidade_id and produto_sku = v_produto.sku;

    update public.produtos
    set sku = v_sku_final, pre_preparo = true, ficha_pre_preparo_id = v_ficha.id
    where unidade_id = p_unidade_id and id = v_produto.id;

    if v_conversoes is not null then
      insert into public.produto_conversoes
      select * from jsonb_populate_recordset(null::public.produto_conversoes, (
        select jsonb_agg(e || jsonb_build_object('produto_sku', v_sku_final))
        from jsonb_array_elements(v_conversoes) e
      ));
    end if;
    if v_componentes is not null then
      insert into public.ficha_componentes
      select * from jsonb_populate_recordset(null::public.ficha_componentes, (
        select jsonb_agg(e || jsonb_build_object('produto_sku', v_sku_final))
        from jsonb_array_elements(v_componentes) e
      ));
    end if;

    if v_status is distinct from v_ficha.status then
      update public.fichas_tecnicas set status = v_status
      where unidade_id = p_unidade_id and id = v_ficha.id;
    end if;
  else
    -- Produto mais antigo: a ficha recebe o SKU dele.
    v_sku_final := v_produto.sku;
    perform set_config('zatti_hub.unindo_pre_preparo', v_ficha.id::text, true);
    update public.produtos
    set pre_preparo = true, ficha_pre_preparo_id = v_ficha.id
    where unidade_id = p_unidade_id and id = v_produto.id;
    update public.fichas_tecnicas
    set sku = v_sku_final, status = v_status
    where unidade_id = p_unidade_id and id = v_ficha.id;
    perform set_config('zatti_hub.unindo_pre_preparo', '', true);
  end if;

  if not exists (
    select 1 from public.produtos p
    join public.fichas_tecnicas f on f.unidade_id = p.unidade_id and f.id = p.ficha_pre_preparo_id
    where p.unidade_id = p_unidade_id and p.id = v_produto.id
      and p.sku = v_sku_final and f.sku = v_sku_final and p.pre_preparo
  ) then
    raise exception 'Nao foi possivel unir o produto e a ficha';
  end if;

  return v_sku_final;
end;
$$;

revoke all on function public.unir_pre_preparo_ficha_existente(text, text, uuid) from public, anon;
grant execute on function public.unir_pre_preparo_ficha_existente(text, text, uuid) to authenticated;

commit;
