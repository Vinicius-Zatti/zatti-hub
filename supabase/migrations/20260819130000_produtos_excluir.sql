-- Estoque > Edição de Dados ganha exclusão de produto. `ficha_componentes`
-- e `produto_conversoes` referenciam produtos(unidade_id, sku) com
-- `on delete restrict` (ver 20260811100000/20260817120000) - de propósito,
-- pra nunca sumir sozinho um componente usado numa ficha. Aqui é o oposto:
-- o cliente pediu que excluir o produto remova ele também de qualquer ficha
-- técnica que o usa, em vez de bloquear. `excluir_produto_estoque` faz as
-- duas exclusões (conversão + componentes) antes de excluir o produto,
-- numa transação só, e devolve quantas fichas perderam esse componente.
begin;

drop policy if exists "produtos_delete_gestao" on public.produtos;
create policy "produtos_delete_gestao" on public.produtos
  for delete to authenticated
  using (public.usuario_tem_acesso_unidade(unidade_id, array['gestao']));

-- security invoker: RLS de produto_conversoes (all/gestao), ficha_componentes
-- (all/gestao) e produtos (delete/gestao, acima) seguem sendo a barreira de
-- verdade - essa função só empacota as três exclusões numa transação só.
create or replace function public.excluir_produto_estoque(
  p_unidade_id text,
  p_sku text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sku text := upper(trim(p_sku));
  v_componentes_removidos integer := 0;
begin
  delete from public.produto_conversoes
  where unidade_id = p_unidade_id and produto_sku = v_sku;

  delete from public.ficha_componentes
  where unidade_id = p_unidade_id and produto_sku = v_sku;
  get diagnostics v_componentes_removidos = row_count;

  delete from public.produtos
  where unidade_id = p_unidade_id and sku = v_sku;

  return v_componentes_removidos;
end;
$$;

revoke all on function public.excluir_produto_estoque(text, text) from public, anon;
grant execute on function public.excluir_produto_estoque(text, text) to authenticated;

commit;
