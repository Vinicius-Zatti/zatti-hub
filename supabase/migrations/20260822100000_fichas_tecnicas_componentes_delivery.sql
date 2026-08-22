-- Embalagem de delivery vira lista ("Componentes Delivery"), igual à seção
-- Componentes normal - a ficha de Venda podia linkar só 1 embalagem
-- (ficha de Pré-preparo OU produto do Estoque); agora aceita vários itens de
-- qualquer tipo, cada um com sua quantidade, mesmo padrão de
-- `ficha_componentes`. Reaproveita a própria tabela em vez de criar uma
-- nova - só muda o que o item representa (`tipo_uso`), toda a validação de
-- unidade/ciclo/exclusão em cascata já existente em `ficha_componentes`
-- vale igual pros dois tipos.
begin;

alter table public.ficha_componentes
  add column if not exists tipo_uso text not null default 'receita'
    check (tipo_uso in ('receita', 'delivery'));

-- Migra o link único existente pra uma linha de `ficha_componentes` com
-- tipo_uso='delivery', preservando o custo hoje já embutido em produção
-- (quantidade 1, mesmo comportamento de "1 embalagem por unidade vendida"
-- que o link único sempre teve).
insert into public.ficha_componentes (unidade_id, ficha_id, ficha_componente_id, quantidade, unidade_uso, tipo_uso)
select f.unidade_id, f.id, f.embalagem_ficha_id, 1, coalesce(pre.rendimento_unidade, 'UN'), 'delivery'
from public.fichas_tecnicas f
join public.fichas_tecnicas pre on pre.id = f.embalagem_ficha_id and pre.unidade_id = f.unidade_id
where f.embalagem_ficha_id is not null;

-- unidade_uso é só rótulo de exibição (custo não depende dele - ver
-- `calcularCustoFicha`), por isso 'UN' fixo aqui: `produtos.unidade_base` é
-- texto livre sem o mesmo formato estrito de `ficha_componentes.unidade_uso`
-- (regex `[A-Z0-9]{1,20}`) porque a via de embalagem-por-produto nunca
-- passou por essa coluna antes - copiar o valor livre arriscaria falhar a
-- migração num produto com acento/minúscula/espaço na unidade.
insert into public.ficha_componentes (unidade_id, ficha_id, produto_sku, quantidade, unidade_uso, tipo_uso)
select f.unidade_id, f.id, f.embalagem_produto_sku, 1, 'UN', 'delivery'
from public.fichas_tecnicas f
join public.produtos p on p.unidade_id = f.unidade_id and p.sku = f.embalagem_produto_sku
where f.embalagem_produto_sku is not null;

alter table public.fichas_tecnicas
  drop column if exists embalagem_ficha_id,
  drop column if exists embalagem_produto_sku;

-- Volta pra validação sem embalagem (o link único deixou de existir - a
-- lista de Componentes Delivery é validada pelas mesmas regras de
-- `ficha_componentes`/`proteger_ficha_componente` que já valem pra
-- Componentes normal, sem restrição extra de camada).
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

drop function if exists public.salvar_ficha_tecnica(
  text, uuid, uuid, text, text, numeric, text, numeric, uuid, text, integer, text, text, text, text, jsonb, jsonb
);

-- `p_componentes` volta a carregar os dois tipos juntos (receita + delivery)
-- - cada item traz `tipo_uso`, default 'receita' se vier sem (compatibilidade
-- com qualquer chamada antiga que ainda não mande o campo).
create or replace function public.salvar_ficha_tecnica(
  p_unidade_id text,
  p_ficha_id uuid,
  p_categoria_id uuid,
  p_camada text,
  p_nome text,
  p_rendimento_quantidade numeric,
  p_rendimento_unidade text,
  p_preco_venda numeric,
  p_tempo_preparo_minutos integer,
  p_foto_path text,
  p_observacoes_operacionais text,
  p_observacoes_gerenciais text,
  p_status text,
  p_componentes jsonb,
  p_etapas jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_versao_nova integer;
  v_ficha public.fichas_tecnicas%rowtype;
  v_item jsonb;
  v_categoria_codigo text;
begin
  if p_ficha_id is null then
    v_versao_nova := 1;

    select codigo into v_categoria_codigo
    from public.categorias_ficha
    where id = p_categoria_id and unidade_id = p_unidade_id;

    if v_categoria_codigo is null then
      raise exception 'Categoria nao encontrada';
    end if;

    insert into public.fichas_tecnicas (
      unidade_id, categoria_id, sku, camada, nome,
      rendimento_quantidade, rendimento_unidade, preco_venda,
      tempo_preparo_minutos, foto_path,
      observacoes_operacionais, observacoes_gerenciais, status, versao,
      criado_por, atualizado_por
    ) values (
      p_unidade_id, p_categoria_id,
      public.gerar_sku_ficha(p_unidade_id, p_camada, v_categoria_codigo, p_nome), p_camada, p_nome,
      p_rendimento_quantidade, p_rendimento_unidade, p_preco_venda,
      p_tempo_preparo_minutos, p_foto_path,
      coalesce(p_observacoes_operacionais, ''), coalesce(p_observacoes_gerenciais, ''),
      p_status, v_versao_nova,
      auth.uid(), auth.uid()
    )
    returning * into v_ficha;

    v_id := v_ficha.id;
  else
    select versao + 1 into v_versao_nova
    from public.fichas_tecnicas
    where id = p_ficha_id and unidade_id = p_unidade_id;

    if v_versao_nova is null then
      raise exception 'Ficha tecnica nao encontrada';
    end if;

    update public.fichas_tecnicas set
      categoria_id = p_categoria_id,
      nome = p_nome,
      rendimento_quantidade = p_rendimento_quantidade,
      rendimento_unidade = p_rendimento_unidade,
      preco_venda = p_preco_venda,
      tempo_preparo_minutos = p_tempo_preparo_minutos,
      foto_path = p_foto_path,
      observacoes_operacionais = coalesce(p_observacoes_operacionais, ''),
      observacoes_gerenciais = coalesce(p_observacoes_gerenciais, ''),
      status = p_status,
      versao = v_versao_nova
    where id = p_ficha_id and unidade_id = p_unidade_id
    returning * into v_ficha;

    if not found then
      raise exception 'Sem permissao para editar esta ficha tecnica';
    end if;

    v_id := v_ficha.id;
  end if;

  delete from public.ficha_componentes where ficha_id = v_id and unidade_id = p_unidade_id;
  for v_item in select * from jsonb_array_elements(coalesce(p_componentes, '[]'::jsonb)) loop
    insert into public.ficha_componentes (
      unidade_id, ficha_id, produto_sku, ficha_componente_id,
      quantidade, unidade_uso, ordem, observacoes, tipo_uso
    ) values (
      p_unidade_id,
      v_id,
      nullif(v_item->>'produto_sku', ''),
      nullif(v_item->>'ficha_componente_id', '')::uuid,
      (v_item->>'quantidade')::numeric,
      v_item->>'unidade_uso',
      coalesce((v_item->>'ordem')::integer, 0),
      coalesce(v_item->>'observacoes', ''),
      coalesce(nullif(v_item->>'tipo_uso', ''), 'receita')
    );
  end loop;

  delete from public.ficha_etapas where ficha_id = v_id and unidade_id = p_unidade_id;
  for v_item in select * from jsonb_array_elements(coalesce(p_etapas, '[]'::jsonb)) loop
    insert into public.ficha_etapas (unidade_id, ficha_id, ordem, descricao)
    values (p_unidade_id, v_id, (v_item->>'ordem')::integer, v_item->>'descricao');
  end loop;

  insert into public.ficha_versoes (unidade_id, ficha_id, versao, snapshot, criado_por)
  values (
    p_unidade_id,
    v_id,
    v_versao_nova,
    jsonb_build_object(
      'ficha', to_jsonb(v_ficha),
      'componentes', coalesce(p_componentes, '[]'::jsonb),
      'etapas', coalesce(p_etapas, '[]'::jsonb)
    ),
    auth.uid()
  );

  return jsonb_build_object('id', v_id, 'sku', v_ficha.sku, 'versao', v_versao_nova);
end;
$$;

revoke all on function public.salvar_ficha_tecnica(
  text, uuid, uuid, text, text, numeric, text, numeric, integer, text, text, text, text, jsonb, jsonb
) from public, anon;
grant execute on function public.salvar_ficha_tecnica(
  text, uuid, uuid, text, text, numeric, text, numeric, integer, text, text, text, text, jsonb, jsonb
) to authenticated;

commit;
