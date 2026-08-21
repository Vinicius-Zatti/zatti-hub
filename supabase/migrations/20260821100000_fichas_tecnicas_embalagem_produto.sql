-- Segunda via de embalagem, mais simples que a ficha de Pré-preparo: linkar
-- direto um produto do Estoque (tipicamente do grupo Embalagens - EMB, que já
-- existia no cadastro de Produtos) sem precisar montar uma ficha técnica só
-- pra isso. As duas vias são mutuamente exclusivas - o cliente escolhe uma
-- ou outra por prato, nunca as duas ao mesmo tempo.
begin;

alter table public.fichas_tecnicas
  add column if not exists embalagem_produto_sku text;

-- Restrict, mesmo princípio das outras referências de embalagem/componente:
-- nunca deixar o produto sumir sozinho de baixo de quem o usa.
alter table public.fichas_tecnicas
  drop constraint if exists fichas_tecnicas_embalagem_produto_sku_fkey,
  add constraint fichas_tecnicas_embalagem_produto_sku_fkey
    foreign key (unidade_id, embalagem_produto_sku)
    references public.produtos(unidade_id, sku) on update restrict on delete restrict;

alter table public.fichas_tecnicas
  drop constraint if exists fichas_tecnicas_embalagem_um_so_tipo,
  add constraint fichas_tecnicas_embalagem_um_so_tipo
    check (embalagem_ficha_id is null or embalagem_produto_sku is null);

alter table public.fichas_tecnicas
  drop constraint if exists fichas_tecnicas_embalagem_produto_somente_ven,
  add constraint fichas_tecnicas_embalagem_produto_somente_ven
    check (embalagem_produto_sku is null or camada = 'VEN');

-- salvar_ficha_tecnica ganha p_embalagem_produto_sku, ao lado do
-- p_embalagem_ficha_id que já existia.
create or replace function public.salvar_ficha_tecnica(
  p_unidade_id text,
  p_ficha_id uuid,
  p_categoria_id uuid,
  p_camada text,
  p_nome text,
  p_rendimento_quantidade numeric,
  p_rendimento_unidade text,
  p_preco_venda numeric,
  p_embalagem_ficha_id uuid,
  p_embalagem_produto_sku text,
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
      embalagem_ficha_id, embalagem_produto_sku,
      tempo_preparo_minutos, foto_path,
      observacoes_operacionais, observacoes_gerenciais, status, versao,
      criado_por, atualizado_por
    ) values (
      p_unidade_id, p_categoria_id,
      public.gerar_sku_ficha(p_unidade_id, p_camada, v_categoria_codigo, p_nome), p_camada, p_nome,
      p_rendimento_quantidade, p_rendimento_unidade, p_preco_venda,
      p_embalagem_ficha_id, p_embalagem_produto_sku,
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
      embalagem_ficha_id = p_embalagem_ficha_id,
      embalagem_produto_sku = p_embalagem_produto_sku,
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
