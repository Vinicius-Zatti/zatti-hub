-- "Usar a ficha existente", v2 (parecer do Codex de 26/10/2026 sobre o PR #55).
-- Só a função `unir_pre_preparo_ficha_existente` muda (create or replace, mesma
-- assinatura e mesmo comportamento para quem pode):
--   P1. Autorização explícita na entrada: Gestão ou master, com edição em
--       Cadastros e no Cardápio da unidade. Antes, no caminho "produto mais
--       antigo", nada exigia Cadastros, e no inverso nem sempre se exigia Cardápio.
--   P2. Conversões e ingredientes de outras fichas são copiados pelo próprio
--       DELETE ... RETURNING, para não perder uma edição feita ao mesmo tempo.
-- Somente aditiva: nenhuma tabela, coluna ou outra função muda.
begin;

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
  -- Parecer do Codex (26/10, P1): a RPC é chamável direto por authenticated,
  -- e nem todo caminho da união passa por um gatilho de Cadastros e de
  -- Cardápio. A autorização vem aqui, na entrada: Gestão (master conta, como
  -- em todo o app) com edição nos dois módulos. Papéis administrativos
  -- (SQL Editor, servidor, operador do Vini) seguem sem essa trava.
  if current_user in ('authenticated', 'anon') and (
    auth.uid() is null
    or not public.usuario_tem_acesso_unidade(p_unidade_id, array['gestao'])
    or not public.pode_modulo('cadastros', 'editar', p_unidade_id)
    or not public.pode_modulo('cardapio', 'editar', p_unidade_id)
  ) then
    raise exception 'Unir pre-preparo exige edicao em Cadastros e no Cardapio nesta unidade'
      using errcode = '42501';
  end if;

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
    -- As chaves estrangeiras são "on update restrict": sai e volta com o
    -- SKU novo, com o mesmo id, quantidade e datas. A cópia é o que o DELETE
    -- apagou (RETURNING), não uma leitura anterior: uma edição concorrente da
    -- conversão ou do ingrediente faz o DELETE esperar e devolver a versão já
    -- confirmada, sem voltar ao valor antigo (parecer do Codex, 26/10, P2).
    with apagadas as (
      delete from public.produto_conversoes
      where unidade_id = p_unidade_id and produto_sku = v_produto.sku
      returning *
    )
    select jsonb_agg(to_jsonb(a)) into v_conversoes from apagadas a;
    with apagados as (
      delete from public.ficha_componentes
      where unidade_id = p_unidade_id and produto_sku = v_produto.sku
      returning *
    )
    select jsonb_agg(to_jsonb(a)) into v_componentes from apagados a;

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
