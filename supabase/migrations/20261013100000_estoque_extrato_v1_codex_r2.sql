-- Extrato do estoque v1 - ajuste da rodada 2 do Codex (P1: pedido recebido com
-- extrato incompleto).
--
-- Antes: o gatilho dos itens só protegia item que JÁ tinha compra no extrato.
-- Em pedido recebido, um item novo (INSERT) ou um item sem compra que passasse
-- a ser elegível (vencedor confirmado, SKU/unidade corrigidos, quantidade que
-- sai de zero) entrava sem lançar compra: o pedido ficava "recebido" com o
-- extrato faltando aquele item.
--
-- Agora, com o pedido recebido:
--   - item novo é recusado;
--   - item movido de outro pedido para ele é recusado;
--   - em item com vencedor confirmado (ou que passa a ter), mudar vencedor,
--     SKU, unidade ou quantidade pedida é recusado.
-- Mensagem: desmarcar o recebimento em Pedidos Feitos, alterar e receber de
-- novo (o recebimento então lança a compra). Nome, preço e itens sem vencedor
-- continuam editáveis (não mudam o que entra no extrato). Apagar item sem
-- compra continua livre (é o que tira o perdedor da disputa).
--
-- A leitura de "recebido" acontece depois da trava da linha do pedido (a mesma
-- do recebimento): edição e recebimento do mesmo pedido nunca se cruzam.
--
-- Rodada 3 do Codex (P1): "desfazer vencedor" gravava a desmarcação no
-- fornecedor vencedor antes de recriar o item nos concorrentes, em chamadas
-- separadas. Com um concorrente já recebido, a recriação era recusada e o
-- vencedor ficava sem confirmação (estado parcial). Agora tudo vai na função
-- desfazer_vencedor_pedido, numa transação só: trava os pedidos envolvidos em
-- ordem de id (itens do pedido e depois o pedido, a mesma ordem do
-- recebimento) e qualquer recusa desfaz tudo.
--
-- Idempotente: só `create or replace`; a migration 20261013020000 não muda.

begin;

-- Lê o recebido do pedido sem depender da policy de quem chamou (o gatilho já
-- passou pela checagem de unidade em travar_pedido_extrato).
create or replace function public.pedido_recebido_extrato(p_pedido_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce((select p.recebido from public.pedidos p where p.id = p_pedido_id), false);
$$;

revoke all on function public.pedido_recebido_extrato(uuid) from public, anon;
grant execute on function public.pedido_recebido_extrato(uuid) to authenticated;

create or replace function public.proteger_extrato_pedidos()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_msg_recebido constant text :=
    'Este pedido já está marcado como recebido. Desmarque o recebimento em Pedidos Feitos, '
    || 'faça a alteração e marque como recebido de novo (assim a compra entra no extrato do estoque).';
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'pedidos' then
    -- Pedido nasce pela Data API sempre não recebido, sem data e na versão 0:
    -- recebimento só pela RPC (o app nunca cria pedido já recebido).
    if tg_op = 'INSERT' then
      if new.recebido or new.recebido_em is not null or new.recebido_dia is not null
         or new.versao_itens <> 0 then
        raise exception 'O recebimento só é gravado pela tela Pedidos Feitos.' using errcode = '42501';
      end if;
      return new;
    end if;
    if new.recebido is distinct from old.recebido
       or new.recebido_em is distinct from old.recebido_em
       or new.recebido_dia is distinct from old.recebido_dia
       or new.versao_itens is distinct from old.versao_itens then
      raise exception 'O recebimento só é gravado pela tela Pedidos Feitos.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- pedido_itens: primeiro a trava do pedido (mesma do recebimento), depois a
  -- checagem do extrato, que assim enxerga o que um recebimento já gravou.
  if tg_op = 'INSERT' then
    if new.quantidade_recebida is not null then
      raise exception 'A quantidade recebida só é gravada pela tela Pedidos Feitos.' using errcode = '42501';
    end if;
    perform public.travar_pedido_extrato(new.pedido_id);
    if public.pedido_recebido_extrato(new.pedido_id) then
      raise exception '%', c_msg_recebido using errcode = 'P0001';
    end if;
    return new;
  end if;

  perform public.travar_pedido_extrato(old.pedido_id);
  if tg_op = 'UPDATE' then
    if new.pedido_id is distinct from old.pedido_id then
      perform public.travar_pedido_extrato(new.pedido_id);
      if public.pedido_recebido_extrato(new.pedido_id) then
        raise exception '%', c_msg_recebido using errcode = 'P0001';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    if exists (select 1 from public.estoque_movimentacoes m where m.pedido_item_id = old.id) then
      raise exception 'Este item já teve recebimento lançado no extrato do estoque e não pode ser removido.'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if new.quantidade_recebida is distinct from old.quantidade_recebida then
    raise exception 'A quantidade recebida só é gravada pela tela Pedidos Feitos.' using errcode = '42501';
  end if;

  if (new.sku is distinct from old.sku
      or new.unidade_base is distinct from old.unidade_base
      or new.quantidade_pedida is distinct from old.quantidade_pedida
      or new.preco_antigo is distinct from old.preco_antigo
      or new.preco_atualizado is distinct from old.preco_atualizado
      or new.vencedor_confirmado is distinct from old.vencedor_confirmado)
     and exists (
       select 1 from public.estoque_movimentacoes m
       where m.pedido_item_id = old.id and m.cancelado_em is null
     ) then
    raise exception 'Este item já está recebido no extrato do estoque. Desmarque o recebimento em Pedidos Feitos antes de alterar.'
      using errcode = 'P0001';
  end if;

  -- Item sem compra em pedido recebido: nada que o torne elegível à compra
  -- (vencedor confirmado + SKU/unidade do cadastro + quantidade > 0) passa sem
  -- um novo recebimento.
  if new.vencedor_confirmado
     and (new.vencedor_confirmado is distinct from old.vencedor_confirmado
          or new.sku is distinct from old.sku
          or new.unidade_base is distinct from old.unidade_base
          or new.quantidade_pedida is distinct from old.quantidade_pedida)
     and public.pedido_recebido_extrato(new.pedido_id) then
    raise exception '%', c_msg_recebido using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_extrato_pedidos() from public, anon, authenticated;

-- Desfaz a confirmação de vencedor de um item: tira a marca do fornecedor atual
-- e, se houver concorrentes, recria o item neles (mesma quantidade, preço não
-- confirmado) e copia a quantidade para os outros pedidos da contagem que têm
-- o SKU - a mesma semântica de antes em src/lib/pedidos.ts, agora atômica.
-- Roda como quem chamou (security invoker): a RLS e os gatilhos dos pedidos
-- valem como na Data API. A checagem de Gestão abaixo só antecipa a recusa.
create or replace function public.desfazer_vencedor_pedido(
  p_unidade_id text,
  p_data_contagem_base text,
  p_fornecedor_atual text,
  p_outros_fornecedores text[],
  p_sku text,
  p_nome text,
  p_nome_compra text,
  p_unidade_base text,
  p_quantidade_pedida numeric,
  p_preco_antigo numeric
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_outros text[];
  v_fornecedor text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;
  if p_unidade_id is null or not public.usuario_tem_acesso_unidade(p_unidade_id, array['gestao']) then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  if p_data_contagem_base is null or length(p_data_contagem_base) = 0
     or p_fornecedor_atual is null or length(p_fornecedor_atual) = 0 or length(p_fornecedor_atual) > 160
     or p_sku is null or length(p_sku) = 0 or length(p_sku) > 80
     or p_nome is null or length(p_nome) = 0
     or p_unidade_base is null or length(p_unidade_base) = 0
     or p_quantidade_pedida is null or p_quantidade_pedida < 0 then
    raise exception 'Dados do item inválidos.' using errcode = 'P0001';
  end if;

  v_outros := array(
    select distinct f
    from unnest(coalesce(p_outros_fornecedores, '{}'::text[])) f
    where f is not null and length(f) > 0 and f <> p_fornecedor_atual
    order by f
  );
  if cardinality(v_outros) > 50 or exists (select 1 from unnest(v_outros) f where length(f) > 160) then
    raise exception 'Lista de fornecedores inválida.' using errcode = 'P0001';
  end if;

  -- 1. Acha ou cria o pedido de cada fornecedor (como garantirPedido). Pedido
  --    criado aqui some junto se algo for recusado depois.
  foreach v_fornecedor in array array[p_fornecedor_atual] || v_outros loop
    insert into public.pedidos (unidade_id, fornecedor, data_contagem_base, criado_por)
    values (p_unidade_id, v_fornecedor, p_data_contagem_base, v_uid)
    on conflict (unidade_id, fornecedor, data_contagem_base) do nothing;
  end loop;

  -- 2. Trava, em ordem de id, os pedidos que esta operação toca: o atual, os
  --    concorrentes e (havendo concorrentes) os que recebem a cópia da
  --    quantidade. Em cada um, itens por id e depois o pedido - a mesma ordem
  --    do recebimento, para os dois não se travarem em cruz.
  for v_id in
    select p.id
    from public.pedidos p
    where p.unidade_id = p_unidade_id
      and p.data_contagem_base = p_data_contagem_base
      and (
        p.fornecedor = p_fornecedor_atual
        or p.fornecedor = any (v_outros)
        or (cardinality(v_outros) > 0
            and exists (select 1 from public.pedido_itens pi where pi.pedido_id = p.id and pi.sku = p_sku))
      )
    order by p.id
  loop
    perform 1 from public.pedido_itens pi where pi.pedido_id = v_id order by pi.id for update;
    perform public.travar_pedido_extrato(v_id);
  end loop;

  -- 3. Desmarca o vencedor atual.
  update public.pedido_itens pi
  set vencedor_confirmado = false
  from public.pedidos p
  where pi.pedido_id = p.id
    and p.unidade_id = p_unidade_id
    and p.data_contagem_base = p_data_contagem_base
    and p.fornecedor = p_fornecedor_atual
    and pi.sku = p_sku;

  if cardinality(v_outros) = 0 then
    return;
  end if;

  -- 4. Recria o item em cada concorrente (preço volta a ser só referência).
  --    Pedido recebido recusa o item novo (gatilho) e a função inteira desfaz.
  for v_id in
    select p.id
    from public.pedidos p
    where p.unidade_id = p_unidade_id
      and p.data_contagem_base = p_data_contagem_base
      and p.fornecedor = any (v_outros)
    order by p.id
  loop
    update public.pedido_itens pi
    set nome = p_nome,
        nome_compra = nullif(p_nome_compra, ''),
        unidade_base = p_unidade_base,
        quantidade_pedida = p_quantidade_pedida,
        preco_antigo = p_preco_antigo,
        preco_atualizado = null,
        preco_confirmado = false
    where pi.pedido_id = v_id and pi.sku = p_sku;
    if not found then
      insert into public.pedido_itens (
        pedido_id, sku, nome, nome_compra, unidade_base, quantidade_pedida,
        preco_antigo, preco_atualizado, preco_confirmado
      )
      values (
        v_id, p_sku, p_nome, nullif(p_nome_compra, ''), p_unidade_base, p_quantidade_pedida,
        p_preco_antigo, null, false
      );
    end if;
  end loop;

  -- 5. Quantidade pedida é a mesma necessidade em qualquer fornecedor: copia
  --    para os outros pedidos da contagem que já têm o SKU.
  update public.pedido_itens pi
  set quantidade_pedida = p_quantidade_pedida
  from public.pedidos p
  where pi.pedido_id = p.id
    and p.unidade_id = p_unidade_id
    and p.data_contagem_base = p_data_contagem_base
    and pi.sku = p_sku
    and pi.quantidade_pedida is distinct from p_quantidade_pedida;
end;
$$;

revoke all on function public.desfazer_vencedor_pedido(text, text, text, text[], text, text, text, text, numeric, numeric)
  from public, anon;
grant execute on function public.desfazer_vencedor_pedido(text, text, text, text[], text, text, text, text, numeric, numeric)
  to authenticated;

commit;
