-- Categorias de Fichas Técnicas passam a ser geridas pelo próprio cliente:
-- editar código/nome (o código é imutável hoje, e sai na regra vinda do
-- primeiro round de pilotagem - ver 20260817190000) e excluir. Excluir já
-- fica bloqueado sozinho pelo banco: `fichas_tecnicas.categoria_id` referencia
-- `categorias_ficha(id)` sem `on delete`, que é "no action" (equivalente a
-- restrict) por padrão - só falta a policy de delete pra Gestão chegar a
-- tentar.
--
-- Editar o código é mais delicado: o código faz parte dos chars 4-6 do SKU
-- (ver 20260817190000_fichas_tecnicas_sku_categoria.sql) e SKU é imutável
-- por regra. Aqui a régua muda: o código DEIXA de ser imutável na categoria,
-- e uma função dedicada (`renomear_categoria_ficha`) troca o código da
-- categoria e, na mesma transação, atualiza o SKU (só os chars 4-6) de toda
-- ficha cadastrada nela - preserva camada (chars 1-3) e o sufixo do nome
-- (chars 7-9), como pediu o cliente ("todos os produtos cadastrados nessa
-- categoria será alterado para o novo código"). O gatilho de ficha_tecnica
-- passa a aceitar esse UPDATE específico de sku (e só esse formato -
-- continua impossível uma edição livre de SKU).
begin;

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
       or new.criado_em is distinct from old.criado_em then
      raise exception 'Camada e unidade da categoria sao imutaveis';
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
     or (tg_op = 'INSERT' and v_categoria.codigo <> substring(new.sku from 4 for 3)) then
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
    if new.sku is distinct from old.sku then
      -- Só é permitido nesse formato exato: troca do código da categoria
      -- (cascade de renomear_categoria_ficha) - camada (chars 1-3) e sufixo
      -- do nome (chars 7-9) intactos, chars 4-6 batendo com o código atual
      -- da categoria. Nunca uma edição livre de SKU.
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

drop policy if exists "categorias_ficha_delete_gestao" on public.categorias_ficha;
create policy "categorias_ficha_delete_gestao" on public.categorias_ficha
  for delete to authenticated
  using (public.usuario_pode_usar_fichas(unidade_id, array['gestao']));

-- security invoker: RLS de categorias_ficha (update) e fichas_tecnicas
-- (update) continuam sendo a barreira de verdade - essa função só empacota
-- as duas gravações numa transação só.
create or replace function public.renomear_categoria_ficha(
  p_unidade_id text,
  p_categoria_id uuid,
  p_novo_codigo text,
  p_novo_nome text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_codigo_antigo text;
  v_codigo_novo text := upper(trim(p_novo_codigo));
  v_fichas_atualizadas integer := 0;
begin
  select codigo into v_codigo_antigo
  from public.categorias_ficha
  where id = p_categoria_id and unidade_id = p_unidade_id;

  if v_codigo_antigo is null then
    raise exception 'Categoria nao encontrada';
  end if;

  update public.categorias_ficha
  set codigo = v_codigo_novo, nome = p_novo_nome
  where id = p_categoria_id and unidade_id = p_unidade_id;

  if v_codigo_novo <> v_codigo_antigo then
    update public.fichas_tecnicas
    set sku = camada || v_codigo_novo || substring(sku from 7 for 3)
    where categoria_id = p_categoria_id and unidade_id = p_unidade_id;
    get diagnostics v_fichas_atualizadas = row_count;
  end if;

  return jsonb_build_object('codigo', v_codigo_novo, 'fichasAtualizadas', v_fichas_atualizadas);
end;
$$;

revoke all on function public.renomear_categoria_ficha(text, uuid, text, text) from public, anon;
grant execute on function public.renomear_categoria_ficha(text, uuid, text, text) to authenticated;

commit;
