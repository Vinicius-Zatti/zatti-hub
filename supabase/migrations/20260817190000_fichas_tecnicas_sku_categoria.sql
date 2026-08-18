-- Correção final da regra do SKU: a categoria FAZ parte dele (chars 4-6),
-- exatamente como Produtos faz com o Grupo ([Grupo][Produto][Referência] -
-- ver src/lib/skus/sugerir.ts). Fichas seguem [Camada][Categoria][Prato].
-- Ex: categoria "Burgers" (BUR) + prato "Pão Carne e Queijo" (PCQ, regra de
-- palavras já existente) -> VENBURPCQ. É por isso que categoria pede um
-- código de 3 letras na criação - pra virar isso aqui.
--
-- O contador sequencial por prefixo de nome não faz mais sentido (não
-- sobra espaço pra sufixo numérico com a categoria ocupando o meio) - troca
-- por checagem direta de colisão contra fichas_tecnicas, com fallback
-- trocando o último caractere por dígito quando duas fichas da mesma
-- categoria reduzem pro mesmo prefixo de 3 letras.
begin;

drop table if exists public.ficha_sku_contador;
drop function if exists public.gerar_sku_ficha(text, text, text);

create or replace function public.gerar_sku_ficha(
  p_unidade_id text,
  p_camada text,
  p_categoria_codigo text,
  p_nome text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_prefixo_nome text;
  v_sku text;
  v_sufixo integer := 0;
begin
  v_prefixo_nome := public.prefixo_sku_ficha(p_nome);
  v_sku := p_camada || upper(trim(p_categoria_codigo)) || v_prefixo_nome;

  while exists (
    select 1 from public.fichas_tecnicas f
    where f.unidade_id = p_unidade_id and f.sku = v_sku
  ) loop
    v_sufixo := v_sufixo + 1;
    if v_sufixo > 9 then
      raise exception 'Nao foi possivel gerar um SKU unico para esta ficha';
    end if;
    v_sku := p_camada || upper(trim(p_categoria_codigo)) || left(v_prefixo_nome, 2) || v_sufixo::text;
  end loop;

  return v_sku;
end;
$$;

revoke all on function public.gerar_sku_ficha(text, text, text, text) from public, anon;
grant execute on function public.gerar_sku_ficha(text, text, text, text) to authenticated;

-- Volta a exigir que a categoria bata com os caracteres 4-6 do SKU - agora
-- é a regra certa (categoria faz parte do SKU por design, não coincidência).
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
     or v_categoria.codigo <> substring(new.sku from 4 for 3) then
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
       or new.sku is distinct from old.sku
       or new.criado_por is distinct from old.criado_por
       or new.criado_em is distinct from old.criado_em
       or new.versao < old.versao then
      raise exception 'Campos imutaveis da ficha nao podem ser alterados';
    end if;
    if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
    new.atualizado_em := now();
  end if;
  return new;
end;
$$;

-- salvar_ficha_tecnica busca o codigo da categoria e repassa pro gerador
-- de SKU (a categoria não pode mudar depois, então isso só roda na criação).
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
      quantidade, unidade_uso, ordem, observacoes
    ) values (
      p_unidade_id,
      v_id,
      nullif(v_item->>'produto_sku', ''),
      nullif(v_item->>'ficha_componente_id', '')::uuid,
      (v_item->>'quantidade')::numeric,
      v_item->>'unidade_uso',
      coalesce((v_item->>'ordem')::integer, 0),
      coalesce(v_item->>'observacoes', '')
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

commit;
