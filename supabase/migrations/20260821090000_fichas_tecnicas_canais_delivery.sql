-- Precificação por canal (Salão, Delivery Próprio, iFood, 99Food) na Ficha
-- Técnica de Venda. Cada ficha VEN ganha 3 preços praticados novos (o
-- `preco_venda` que já existe vira "Salão" na UI) e um link opcional pra uma
-- ficha de Pré-preparo usada só como embalagem - o custo dela some no Salão
-- e entra nos 3 canais de delivery (mesma embalagem serve pros 3, o produto
-- físico não muda por canal). Comissão do iFood/99Food substitui a taxa de
-- pagamento na dedução desses dois canais (o marketplace já retém o
-- pagamento na repassa líquido, não cobra os dois ao mesmo tempo) - Delivery
-- Próprio usa a mesma dedução do Salão (taxa de pagamento + imposto).
begin;

alter table public.configuracao_financeira
  add column if not exists comissao_ifood numeric(6,4) not null default 0 check (comissao_ifood >= 0 and comissao_ifood < 1),
  add column if not exists comissao_99food numeric(6,4) not null default 0 check (comissao_99food >= 0 and comissao_99food < 1);

alter table public.fichas_tecnicas
  add column if not exists embalagem_ficha_id uuid,
  add column if not exists preco_venda_delivery_proprio numeric(12,2)
    check (preco_venda_delivery_proprio is null or preco_venda_delivery_proprio >= 0),
  add column if not exists preco_venda_ifood numeric(12,2)
    check (preco_venda_ifood is null or preco_venda_ifood >= 0),
  add column if not exists preco_venda_99food numeric(12,2)
    check (preco_venda_99food is null or preco_venda_99food >= 0);

-- Restrict, mesmo princípio de `ficha_componente_id` em `ficha_componentes`:
-- nunca deixar uma ficha de embalagem sumir sozinha de baixo de quem a usa.
alter table public.fichas_tecnicas
  drop constraint if exists fichas_tecnicas_embalagem_ficha_id_fkey,
  add constraint fichas_tecnicas_embalagem_ficha_id_fkey
    foreign key (unidade_id, embalagem_ficha_id)
    references public.fichas_tecnicas(unidade_id, id) on delete restrict;

-- Embalagem só faz sentido em ficha de Venda apontando pra uma ficha de
-- Pré-preparo (nunca a si mesma, nunca outra ficha de Venda).
create or replace function public.proteger_ficha_tecnica()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_categoria public.categorias_ficha%rowtype;
  v_embalagem_camada text;
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

  if new.embalagem_ficha_id is not null then
    if new.camada <> 'VEN' then
      raise exception 'Somente ficha de Venda pode ter embalagem vinculada';
    end if;
    if new.embalagem_ficha_id = new.id then
      raise exception 'Ficha nao pode ser embalagem de si mesma';
    end if;
    select camada into v_embalagem_camada
    from public.fichas_tecnicas
    where id = new.embalagem_ficha_id and unidade_id = new.unidade_id;
    if v_embalagem_camada is distinct from 'PRE' then
      raise exception 'Embalagem precisa ser uma ficha de Pre-preparo';
    end if;
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

-- salvar_ficha_tecnica ganha p_embalagem_ficha_id (só se aplica a VEN, mas
-- aceita null sempre - o formulário só mostra o seletor pra VEN).
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
      rendimento_quantidade, rendimento_unidade, preco_venda, embalagem_ficha_id,
      tempo_preparo_minutos, foto_path,
      observacoes_operacionais, observacoes_gerenciais, status, versao,
      criado_por, atualizado_por
    ) values (
      p_unidade_id, p_categoria_id,
      public.gerar_sku_ficha(p_unidade_id, p_camada, v_categoria_codigo, p_nome), p_camada, p_nome,
      p_rendimento_quantidade, p_rendimento_unidade, p_preco_venda, p_embalagem_ficha_id,
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

-- Nova chave de rate limit pra edição dos 3 preços de canal (mesmo padrão de
-- `ficha_preco_venda_salvar`, que só cobre o preço de Salão).
create or replace function public.consumir_limite_requisicao(p_chave text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_janela_segundos integer;
  v_contagem integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  select configuracao.limite, configuracao.janela_segundos
    into v_limite, v_janela_segundos
  from (
    values
      ('sugerir_sku', 10, 3600),
      ('registrar_contagem', 30, 600),
      ('corrigir_contagem', 120, 600),
      ('salvar_produtos', 30, 600),
      ('salvar_fornecedores', 30, 600),
      ('pedidos_cotacao', 120, 600),
      ('recebimento', 60, 600),
      ('consolidado_criar', 30, 600),
      ('consolidado_editar', 60, 600),
      ('trocar_organizacao', 30, 600),
      ('ficha_salvar', 60, 600),
      ('ficha_excluir', 30, 600),
      ('categoria_ficha_criar', 30, 600),
      ('conversao_produto_salvar', 60, 600),
      ('configuracao_financeira_salvar', 30, 600),
      ('ficha_preco_venda_salvar', 120, 600),
      ('categoria_ficha_editar', 30, 600),
      ('categoria_ficha_excluir', 30, 600),
      ('excluir_produto', 30, 600),
      ('ficha_precos_canal_salvar', 120, 600)
  ) as configuracao(chave, limite, janela_segundos)
  where configuracao.chave = p_chave;

  if v_limite is null then
    raise exception 'Limite de requisicao desconhecido' using errcode = '22023';
  end if;

  insert into public.limites_requisicao as atual (
    user_id,
    chave,
    janela_inicio,
    contagem
  )
  values (auth.uid(), p_chave, now(), 1)
  on conflict (user_id, chave) do update
  set
    janela_inicio = case
      when excluded.janela_inicio - atual.janela_inicio
        >= make_interval(secs => v_janela_segundos)
      then excluded.janela_inicio
      else atual.janela_inicio
    end,
    contagem = case
      when excluded.janela_inicio - atual.janela_inicio
        >= make_interval(secs => v_janela_segundos)
      then 1
      else atual.contagem + 1
    end
  returning contagem into v_contagem;

  return v_contagem <= v_limite;
end;
$$;

commit;
