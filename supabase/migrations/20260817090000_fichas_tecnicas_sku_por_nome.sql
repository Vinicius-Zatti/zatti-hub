-- Corrige a regra do SKU das Fichas Técnicas: os caracteres 4-6 vêm das 3
-- primeiras letras do NOME do prato (não um contador cego por camada) - ex.
-- "Maionese da casa" -> PREMAI001. Sufixo de 3 dígitos só desempata pratos
-- cujo nome começa com as mesmas 3 letras. Migração nova porque a anterior
-- (20260811100000_fichas_tecnicas.sql) já está aplicada e com dado real de
-- teste - não dá mais pra editar ela no lugar.
begin;

create extension if not exists unaccent with schema extensions;

drop table if exists public.ficha_sku_contador;

create table public.ficha_sku_contador (
  unidade_id text not null references public.unidades(id),
  camada text not null check (camada in ('PRE', 'VEN')),
  prefixo text not null check (prefixo ~ '^[A-Z]{3}$'),
  proximo integer not null default 1 check (proximo > 0),
  primary key (unidade_id, camada, prefixo)
);

alter table public.ficha_sku_contador enable row level security;

drop policy if exists "ficha_sku_contador_gestao" on public.ficha_sku_contador;
create policy "ficha_sku_contador_gestao" on public.ficha_sku_contador
  for all to authenticated
  using (public.usuario_pode_usar_fichas(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_fichas(unidade_id, array['gestao']));

-- 3 primeiras letras do nome, maiúsculo, sem acento/pontuação/número -
-- preenche com 'X' se o nome tiver menos de 3 letras.
create or replace function public.prefixo_sku_ficha(p_nome text)
returns text
language sql
stable
set search_path = ''
as $$
  select rpad(
    left(
      regexp_replace(
        upper(extensions.unaccent(coalesce(p_nome, ''))),
        '[^A-Z]', '', 'g'
      ),
      3
    ),
    3, 'X'
  );
$$;

revoke all on function public.prefixo_sku_ficha(text) from public, anon;
grant execute on function public.prefixo_sku_ficha(text) to authenticated;

drop function if exists public.gerar_sku_ficha(text, text);

create or replace function public.gerar_sku_ficha(
  p_unidade_id text,
  p_camada text,
  p_nome text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_prefixo text;
  v_proximo integer;
begin
  v_prefixo := public.prefixo_sku_ficha(p_nome);

  insert into public.ficha_sku_contador (unidade_id, camada, prefixo, proximo)
  values (p_unidade_id, p_camada, v_prefixo, 2)
  on conflict (unidade_id, camada, prefixo)
  do update set proximo = public.ficha_sku_contador.proximo + 1
  returning proximo - 1 into v_proximo;

  return p_camada || v_prefixo || lpad(v_proximo::text, 3, '0');
end;
$$;

revoke all on function public.gerar_sku_ficha(text, text, text) from public, anon;
grant execute on function public.gerar_sku_ficha(text, text, text) to authenticated;

-- Reaponta salvar_ficha_tecnica pro gerador de SKU com 3 argumentos.
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
begin
  if p_ficha_id is null then
    v_versao_nova := 1;

    insert into public.fichas_tecnicas (
      unidade_id, categoria_id, sku, camada, nome,
      rendimento_quantidade, rendimento_unidade, preco_venda,
      tempo_preparo_minutos, foto_path,
      observacoes_operacionais, observacoes_gerenciais, status, versao,
      criado_por, atualizado_por
    ) values (
      p_unidade_id, p_categoria_id,
      public.gerar_sku_ficha(p_unidade_id, p_camada, p_nome), p_camada, p_nome,
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
