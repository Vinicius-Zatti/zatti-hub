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

commit;
