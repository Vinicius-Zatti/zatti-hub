-- Vínculo do fornecedor no Cadastro ao confirmar item da cotação (parecer do Codex, 24/10/2026).
-- Antes o app lia o produto, escolhia a vaga e regravava o produto inteiro: duas confirmações
-- ao mesmo tempo podiam escolher a mesma vaga e a segunda apagava o vínculo da primeira (ou uma
-- edição de preço feita no meio). Aqui a linha fica travada, a duplicidade e a vaga são
-- conferidas sob a trava e só a coluna da vaga muda. Mesma comparação de nome do app
-- (`chaveNormalizada` em src/lib/pedido.ts): sem espaço nas pontas, minúsculo, espaços juntos.
-- Devolve 'ja_vinculado', 'sem_vaga', 'sem_produto' ou o nome da coluna gravada.
begin;

create or replace function public.vincular_fornecedor_produto(
  p_unidade_id text,
  p_sku text,
  p_fornecedor text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_produto public.produtos%rowtype;
  v_chave text := lower(regexp_replace(trim(coalesce(p_fornecedor, '')), '\s+', ' ', 'g'));
  v_campo text;
begin
  if v_chave = '' then
    return 'ja_vinculado';
  end if;

  select * into v_produto
  from public.produtos
  where unidade_id = p_unidade_id and sku = p_sku
  for update;
  if not found then
    return 'sem_produto';
  end if;

  if v_chave in (
    lower(regexp_replace(trim(v_produto.fornecedor_1), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(v_produto.fornecedor_2), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(v_produto.fornecedor_3), '\s+', ' ', 'g')),
    lower(regexp_replace(trim(v_produto.fornecedor_4), '\s+', ' ', 'g'))
  ) then
    return 'ja_vinculado';
  end if;

  v_campo := case
    when trim(v_produto.fornecedor_1) = '' then 'fornecedor_1'
    when trim(v_produto.fornecedor_2) = '' then 'fornecedor_2'
    when trim(v_produto.fornecedor_3) = '' then 'fornecedor_3'
    when trim(v_produto.fornecedor_4) = '' then 'fornecedor_4'
  end;
  if v_campo is null then
    return 'sem_vaga';
  end if;

  update public.produtos
  set fornecedor_1 = case when v_campo = 'fornecedor_1' then p_fornecedor else fornecedor_1 end,
      fornecedor_2 = case when v_campo = 'fornecedor_2' then p_fornecedor else fornecedor_2 end,
      fornecedor_3 = case when v_campo = 'fornecedor_3' then p_fornecedor else fornecedor_3 end,
      fornecedor_4 = case when v_campo = 'fornecedor_4' then p_fornecedor else fornecedor_4 end,
      atualizado_em = now()
  where id = v_produto.id;

  return v_campo;
end;
$$;

revoke all on function public.vincular_fornecedor_produto(text, text, text) from public, anon;
grant execute on function public.vincular_fornecedor_produto(text, text, text) to authenticated;

commit;
