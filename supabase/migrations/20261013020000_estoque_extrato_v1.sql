-- Extrato do estoque v1 - recorte mínimo (desenho em
-- _execucao/zatti-hub/extrato-estoque-v1.md, vereditos do Codex na mesma pasta).
--
-- O que entra:
--   estoque_movimentacoes        extrato: compra (recebimento), perda/saida/entrada (manual).
--                                Só leitura pela Data API; escrita só pelas RPCs abaixo.
--   pedidos.recebido_em/_dia     gravados na transição para recebido, preservados no reenvio.
--   produtos.ultimo_preco_pago   cache escrito só pela rotina transacional (regra 2).
--   registrar_recebimento_pedido RPC única do recebimento (regra 1, trava da regra 4).
--   registrar_perda_estoque      perda com motivo (regra 5), custo = último preço pago na data.
--   cancelar_movimentacao_estoque  só Gestão/Master, só lançamento manual.
--   estoque_extrato_linhas       view (security invoker): movimentos + contagens como "posição".
--   estoque_saldos               view (security invoker): saldo por SKU a partir da última posição.
--
-- O que NÃO faz: não gera movimento de recebimento antigo (sem carga retroativa),
-- não preenche recebido_em de pedido já recebido (fica nulo: a data real não existe
-- no banco), não muda contagem, CMV, cotação nem fichas. Custo médio fica para depois.
--
-- Idempotente: rodar de novo não duplica nada nem altera dado gravado.

begin;

-- 1. Pedidos: data do recebimento -------------------------------------------

alter table public.pedidos add column if not exists recebido_em timestamptz;
alter table public.pedidos add column if not exists recebido_dia date;

comment on column public.pedidos.recebido_em is
  'Instante em que o pedido passou para recebido (RPC registrar_recebimento_pedido). Nulo em '
  'pedido não recebido e em pedido recebido antes de 13/10/2026 (data real desconhecida).';
comment on column public.pedidos.recebido_dia is
  'Dia operacional (America/Sao_Paulo) de recebido_em. É a data das compras no extrato.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_recebido_dia_coerente') then
    alter table public.pedidos
      add constraint pedidos_recebido_dia_coerente
      check ((recebido_em is null) = (recebido_dia is null) and (recebido or recebido_em is null));
  end if;
  -- Chaves compostas para amarrar o movimento ao pedido e ao item da mesma unidade.
  if not exists (select 1 from pg_constraint where conname = 'pedidos_id_unidade_unico') then
    alter table public.pedidos add constraint pedidos_id_unidade_unico unique (id, unidade_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedido_itens_id_pedido_unico') then
    alter table public.pedido_itens add constraint pedido_itens_id_pedido_unico unique (id, pedido_id);
  end if;
  -- Já existe desde a contagem por setor (produto_setores usa); garantido aqui por segurança.
  if not exists (select 1 from pg_constraint where conname = 'produtos_id_unidade_unico') then
    alter table public.produtos add constraint produtos_id_unidade_unico unique (id, unidade_id);
  end if;
end $$;

-- 2. Produtos: cache do último preço pago ------------------------------------

alter table public.produtos add column if not exists ultimo_preco_pago numeric;
alter table public.produtos add column if not exists ultimo_preco_pago_em date;

comment on column public.produtos.ultimo_preco_pago is
  'Cache: custo da compra ativa mais recente (data operacional, criado_em, id) com custo '
  'conhecido. Nulo = sem compra válida. Escrito só por recalcular_ultimo_preco_pago.';

-- 3. Extrato -------------------------------------------------------------------

create table if not exists public.estoque_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  produto_id uuid not null,
  -- SKU e unidade como estavam no lançamento (histórico, não muda com o cadastro).
  sku text not null,
  unidade_base text not null,
  tipo text not null,
  origem text not null,
  quantidade numeric not null,
  -- Nulo = custo desconhecido. Nunca zero.
  custo_unitario numeric,
  -- Dia operacional (America/Sao_Paulo).
  data date not null,
  pedido_id uuid,
  pedido_item_id uuid,
  -- Quantidade recebida em branco vira a pedida, marcada como não conferida.
  quantidade_conferida boolean not null default true,
  motivo text,
  observacao text,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default clock_timestamp(),
  cancelado_em timestamptz,
  cancelado_por uuid references auth.users(id),
  motivo_cancelamento text,
  constraint estoque_mov_produto_mesma_unidade
    foreign key (produto_id, unidade_id) references public.produtos (id, unidade_id) on delete restrict,
  constraint estoque_mov_pedido_mesma_unidade
    foreign key (pedido_id, unidade_id) references public.pedidos (id, unidade_id) on delete restrict,
  constraint estoque_mov_item_do_pedido
    foreign key (pedido_item_id, pedido_id) references public.pedido_itens (id, pedido_id) on delete restrict,
  constraint estoque_mov_tipo_valido check (tipo in ('compra', 'perda', 'saida', 'entrada')),
  constraint estoque_mov_origem_valida check (origem in ('recebimento', 'manual')),
  constraint estoque_mov_tipo_origem check (
    (origem = 'recebimento' and tipo = 'compra' and pedido_id is not null and pedido_item_id is not null)
    or (origem = 'manual' and tipo in ('perda', 'saida', 'entrada')
        and pedido_id is null and pedido_item_id is null and quantidade_conferida)
  ),
  constraint estoque_mov_quantidade_positiva check (quantidade > 0),
  constraint estoque_mov_custo_positivo check (custo_unitario is null or custo_unitario > 0),
  constraint estoque_mov_perda_com_motivo check (
    tipo <> 'perda'
    or (motivo in ('vencido', 'estragou', 'erro_preparo', 'quebra', 'outro')
        and (motivo <> 'outro' or length(btrim(coalesce(observacao, ''))) >= 3))
  ),
  constraint estoque_mov_cancelamento_completo check (
    (cancelado_em is null and cancelado_por is null and motivo_cancelamento is null)
    or (cancelado_em is not null and length(btrim(coalesce(motivo_cancelamento, ''))) >= 3)
  ),
  constraint estoque_mov_sku_preenchido check (length(btrim(sku)) > 0)
);

-- Um único movimento ativo por item de pedido.
create unique index if not exists estoque_mov_item_ativo_unico
  on public.estoque_movimentacoes (pedido_item_id)
  where cancelado_em is null and pedido_item_id is not null;

-- Ordem estável do extrato: data, criado_em, id.
create index if not exists estoque_mov_unidade_ordem
  on public.estoque_movimentacoes (unidade_id, data, criado_em, id);
create index if not exists estoque_mov_produto_ordem
  on public.estoque_movimentacoes (produto_id, data, criado_em, id);
create index if not exists estoque_mov_pedido
  on public.estoque_movimentacoes (pedido_id) where pedido_id is not null;

alter table public.estoque_movimentacoes enable row level security;

-- Data API: só leitura, por acesso à unidade. Nenhuma policy de escrita.
revoke all on public.estoque_movimentacoes from public, anon, authenticated;
grant select on public.estoque_movimentacoes to authenticated;

drop policy if exists "estoque_mov_select_por_unidade" on public.estoque_movimentacoes;
create policy "estoque_mov_select_por_unidade" on public.estoque_movimentacoes
  for select to authenticated
  using (public.usuario_tem_acesso_unidade(unidade_id, null));

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'vini_leitura') then
    grant select on public.estoque_movimentacoes to vini_leitura;
    drop policy if exists vini_leitura_select on public.estoque_movimentacoes;
    create policy vini_leitura_select on public.estoque_movimentacoes
      for select to vini_leitura using (true);
  end if;
end $$;

-- Lançamento não se edita nem se apaga: só se cancela, uma vez, com motivo.
-- Vale para qualquer papel (inclusive o dono das RPCs).
create or replace function public.proteger_estoque_movimentacoes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Lançamento do extrato não pode ser apagado; cancele com motivo.'
      using errcode = '42501';
  end if;
  if old.cancelado_em is not null then
    raise exception 'Lançamento já cancelado não muda mais.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['cancelado_em', 'cancelado_por', 'motivo_cancelamento'])
     is distinct from (to_jsonb(old) - array['cancelado_em', 'cancelado_por', 'motivo_cancelamento']) then
    raise exception 'Lançamento do extrato não se edita; cancele e lance de novo.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_estoque_movimentacoes() from public, anon, authenticated;

drop trigger if exists proteger_estoque_movimentacoes on public.estoque_movimentacoes;
create trigger proteger_estoque_movimentacoes
  before update or delete on public.estoque_movimentacoes
  for each row execute function public.proteger_estoque_movimentacoes();

-- 4. Barreiras na Data API para os campos que o extrato depende -------------
-- Dentro das RPCs (security definer) o current_user é o dono da função, não
-- `authenticated`, então as RPCs passam; a Data API não.

create or replace function public.proteger_extrato_pedidos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'pedidos' then
    if new.recebido is distinct from old.recebido
       or new.recebido_em is distinct from old.recebido_em
       or new.recebido_dia is distinct from old.recebido_dia then
      raise exception 'O recebimento só é gravado pela tela Pedidos Feitos.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- pedido_itens
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
  return new;
end;
$$;

revoke all on function public.proteger_extrato_pedidos() from public, anon, authenticated;

drop trigger if exists proteger_extrato_pedidos on public.pedidos;
create trigger proteger_extrato_pedidos
  before update on public.pedidos
  for each row execute function public.proteger_extrato_pedidos();

drop trigger if exists proteger_extrato_pedido_itens on public.pedido_itens;
create trigger proteger_extrato_pedido_itens
  before update or delete on public.pedido_itens
  for each row execute function public.proteger_extrato_pedidos();

create or replace function public.proteger_extrato_produtos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.ultimo_preco_pago is not null or new.ultimo_preco_pago_em is not null then
      raise exception 'Último preço pago é calculado pelo extrato, não se grava direto.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.ultimo_preco_pago is distinct from old.ultimo_preco_pago
     or new.ultimo_preco_pago_em is distinct from old.ultimo_preco_pago_em then
    raise exception 'Último preço pago é calculado pelo extrato, não se grava direto.' using errcode = '42501';
  end if;
  -- SKU imutável na v1 quando já há lançamento no extrato.
  if new.sku is distinct from old.sku
     and exists (select 1 from public.estoque_movimentacoes m where m.produto_id = old.id) then
    raise exception 'Este produto já tem lançamento no extrato do estoque; o SKU não pode mudar.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_extrato_produtos() from public, anon, authenticated;

drop trigger if exists proteger_extrato_produtos on public.produtos;
create trigger proteger_extrato_produtos
  before insert or update on public.produtos
  for each row execute function public.proteger_extrato_produtos();

-- Exclusão de produto com lançamento: explica e orienta a desativar, em vez
-- de estourar a chave estrangeira. Corpo igual ao de 20260819130000, com a
-- checagem a mais no começo.
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
  if exists (
    select 1 from public.estoque_movimentacoes m
    join public.produtos p on p.id = m.produto_id
    where p.unidade_id = p_unidade_id and p.sku = v_sku
  ) then
    raise exception 'Este produto tem lançamentos no extrato do estoque e não pode ser excluído. Desative o produto para tirá-lo das listas.'
      using errcode = 'P0001';
  end if;

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

-- 5. Último preço pago (regra 2) ----------------------------------------------
-- Interna: só as RPCs chamam, depois de travar os produtos.

create or replace function public.recalcular_ultimo_preco_pago(p_produto_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.produtos p
  set ultimo_preco_pago = u.custo_unitario,
      ultimo_preco_pago_em = u.data
  from (
    select ids.id as produto_id, ult.custo_unitario, ult.data
    from unnest(p_produto_ids) as ids(id)
    left join lateral (
      select m.custo_unitario, m.data
      from public.estoque_movimentacoes m
      where m.produto_id = ids.id
        and m.tipo = 'compra'
        and m.cancelado_em is null
        and m.custo_unitario is not null
      order by m.data desc, m.criado_em desc, m.id desc
      limit 1
    ) ult on true
  ) u
  where p.id = u.produto_id
    and (p.ultimo_preco_pago is distinct from u.custo_unitario
         or p.ultimo_preco_pago_em is distinct from u.data);
end;
$$;

revoke all on function public.recalcular_ultimo_preco_pago(uuid[]) from public, anon, authenticated;

-- Custo de saída na data: último preço pago até aquele dia (sem custo médio na v1).
create or replace function public.custo_ultimo_preco_na_data(p_produto_id uuid, p_data date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select m.custo_unitario
  from public.estoque_movimentacoes m
  where m.produto_id = p_produto_id
    and m.tipo = 'compra'
    and m.cancelado_em is null
    and m.custo_unitario is not null
    and m.data <= p_data
  order by m.data desc, m.criado_em desc, m.id desc
  limit 1;
$$;

revoke all on function public.custo_ultimo_preco_na_data(uuid, date) from public, anon, authenticated;

-- 6. Recebimento (regra 1 + trava da regra 4) ---------------------------------

create or replace function public.registrar_recebimento_pedido(
  p_pedido_id uuid,
  p_recebido boolean,
  p_observacao text,
  p_itens jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_unidade text;
  v_fonte text;
  v_gestao boolean;
  v_pedido public.pedidos%rowtype;
  v_produtos uuid[];
  v_recebido_em timestamptz;
  v_recebido_dia date;
  v_item jsonb;
  v_sku text;
  v_qtd numeric;
  v_qtd_txt text;
  v_cancelados integer := 0;
  v_gravados integer := 0;
  v_mantidos integer := 0;
  v_sem_preco integer := 0;
  v_pendencias jsonb := '[]'::jsonb;
  v_motivo_cancel text;
  d record;
begin
  if v_uid is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;
  if p_recebido is null then
    raise exception 'Informe se o pedido foi recebido.' using errcode = 'P0001';
  end if;
  if p_itens is null then
    p_itens := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 500 then
    raise exception 'Lista de itens inválida.' using errcode = 'P0001';
  end if;
  if p_observacao is not null and length(p_observacao) > 2000 then
    raise exception 'Observação muito longa.' using errcode = 'P0001';
  end if;

  select p.unidade_id into v_unidade from public.pedidos p where p.id = p_pedido_id;
  if v_unidade is null or not public.usuario_tem_acesso_unidade(v_unidade, null) then
    raise exception 'Pedido não encontrado nesta unidade.' using errcode = 'P0001';
  end if;
  v_gestao := public.usuario_tem_acesso_unidade(v_unidade, array['gestao']);
  select u.fonte_dados_estoque into v_fonte from public.unidades u where u.id = v_unidade;

  -- Valida os itens enviados antes de travar qualquer coisa.
  for v_item in select value from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Lista de itens inválida.' using errcode = 'P0001';
    end if;
    v_sku := v_item ->> 'sku';
    if v_sku is null or length(v_sku) = 0 or length(v_sku) > 80 then
      raise exception 'Item sem SKU.' using errcode = 'P0001';
    end if;
    v_qtd_txt := v_item ->> 'quantidade_recebida';
    if v_qtd_txt is not null then
      if jsonb_typeof(v_item -> 'quantidade_recebida') <> 'number' then
        raise exception 'Quantidade recebida inválida no item %.', v_sku using errcode = 'P0001';
      end if;
      v_qtd := v_qtd_txt::numeric;
      if v_qtd < 0 or v_qtd > 1000000000 then
        raise exception 'Quantidade recebida inválida no item %.', v_sku using errcode = 'P0001';
      end if;
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_itens))
     <> (select count(distinct value ->> 'sku') from jsonb_array_elements(p_itens)) then
    raise exception 'SKU repetido na lista de itens.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_itens) e
    where not exists (
      select 1 from public.pedido_itens pi
      where pi.pedido_id = p_pedido_id and pi.sku = e.value ->> 'sku'
    )
  ) then
    raise exception 'Um item do pedido não pertence a esta unidade.' using errcode = 'P0001';
  end if;

  -- Regra 4: trava o pedido e, em ordem de id, os produtos afetados (itens do
  -- pedido + produtos com movimento deste pedido) antes de ler histórico.
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;

  select coalesce(array_agg(x.id order by x.id), '{}') into v_produtos
  from (
    select pr.id
    from public.pedido_itens pi
    join public.produtos pr on pr.unidade_id = v_unidade and pr.sku = pi.sku
    where pi.pedido_id = p_pedido_id
    union
    select m.produto_id from public.estoque_movimentacoes m where m.pedido_id = p_pedido_id
  ) x;

  perform 1 from public.produtos pr where pr.id = any (v_produtos) order by pr.id for update;

  -- Itens: quantidade recebida (null = não conferida).
  update public.pedido_itens pi
  set quantidade_recebida = case
    when e.value -> 'quantidade_recebida' is null
      or jsonb_typeof(e.value -> 'quantidade_recebida') = 'null' then null
    else (e.value ->> 'quantidade_recebida')::numeric
  end
  from jsonb_array_elements(p_itens) e
  where pi.pedido_id = p_pedido_id and pi.sku = e.value ->> 'sku'
    and pi.quantidade_recebida is distinct from case
      when e.value -> 'quantidade_recebida' is null
        or jsonb_typeof(e.value -> 'quantidade_recebida') = 'null' then null
      else (e.value ->> 'quantidade_recebida')::numeric
    end;

  -- Cabeçalho. Transição para recebido grava o instante; reenvio preserva;
  -- desmarcar limpa (o histórico fica nos lançamentos cancelados).
  if p_recebido and not v_pedido.recebido then
    v_recebido_em := now();
    v_recebido_dia := (now() at time zone 'America/Sao_Paulo')::date;
  elsif p_recebido then
    v_recebido_em := v_pedido.recebido_em;
    v_recebido_dia := v_pedido.recebido_dia;
  else
    v_recebido_em := null;
    v_recebido_dia := null;
  end if;

  update public.pedidos
  set recebido = p_recebido,
      observacao_entrega = p_observacao,
      recebido_em = v_recebido_em,
      recebido_dia = v_recebido_dia,
      atualizado_em = now()
  where id = p_pedido_id;

  -- Movimentos desejados. Só existem quando o pedido está recebido COM data
  -- registrada (pedido recebido antes desta versão não ganha movimento: sem
  -- carga retroativa) e a unidade usa o estoque no banco.
  create temporary table if not exists pg_temp.recebimento_desejado (
    pedido_item_id uuid primary key,
    produto_id uuid,
    sku text,
    unidade_base text,
    quantidade numeric,
    custo numeric,
    conferida boolean
  ) on commit drop;
  truncate pg_temp.recebimento_desejado;

  if p_recebido and v_recebido_dia is not null and v_fonte = 'banco' then
    for d in
      select pi.id as item_id, pi.sku, pi.nome, pi.unidade_base as un_item,
             coalesce(pi.quantidade_recebida, pi.quantidade_pedida) as qtd,
             (pi.quantidade_recebida is not null) as conferida,
             coalesce(pi.preco_atualizado, pi.preco_antigo) as preco,
             pr.id as produto_id, pr.unidade_base as un_produto
      from public.pedido_itens pi
      left join public.produtos pr on pr.unidade_id = v_unidade and pr.sku = pi.sku
      where pi.pedido_id = p_pedido_id and pi.vencedor_confirmado
      order by pi.sku, pi.id
    loop
      if d.qtd is null or d.qtd <= 0 then
        continue;
      elsif d.produto_id is null then
        v_pendencias := v_pendencias || jsonb_build_object(
          'sku', d.sku, 'nome', d.nome, 'motivo', 'Produto não encontrado no cadastro');
      elsif upper(btrim(d.un_item)) is distinct from upper(btrim(d.un_produto)) then
        v_pendencias := v_pendencias || jsonb_build_object(
          'sku', d.sku, 'nome', d.nome,
          'motivo', format('Unidade do pedido (%s) diferente do cadastro (%s)', d.un_item, d.un_produto));
      else
        insert into pg_temp.recebimento_desejado
        values (d.item_id, d.produto_id, d.sku, d.un_produto, d.qtd,
                case when d.preco > 0 then d.preco else null end, d.conferida);
      end if;
    end loop;
  end if;

  v_motivo_cancel := case when p_recebido then 'Recebimento alterado' else 'Recebimento desmarcado' end;

  -- Cancela o que mudou ou deixou de existir.
  with alvo as (
    select m.id
    from public.estoque_movimentacoes m
    left join pg_temp.recebimento_desejado dd on dd.pedido_item_id = m.pedido_item_id
    where m.pedido_id = p_pedido_id
      and m.cancelado_em is null
      and (
        dd.pedido_item_id is null
        or m.produto_id is distinct from dd.produto_id
        or m.quantidade is distinct from dd.quantidade
        or m.custo_unitario is distinct from dd.custo
        or m.quantidade_conferida is distinct from dd.conferida
        or m.data is distinct from v_recebido_dia
        or m.unidade_base is distinct from dd.unidade_base
      )
  )
  update public.estoque_movimentacoes m
  set cancelado_em = now(), cancelado_por = v_uid, motivo_cancelamento = v_motivo_cancel
  from alvo where m.id = alvo.id;
  get diagnostics v_cancelados = row_count;

  -- Grava o que falta (reenvio idêntico não grava nada).
  insert into public.estoque_movimentacoes (
    unidade_id, produto_id, sku, unidade_base, tipo, origem, quantidade, custo_unitario,
    data, pedido_id, pedido_item_id, quantidade_conferida, criado_por
  )
  select v_unidade, dd.produto_id, dd.sku, dd.unidade_base, 'compra', 'recebimento', dd.quantidade,
         dd.custo, v_recebido_dia, p_pedido_id, dd.pedido_item_id, dd.conferida, v_uid
  from pg_temp.recebimento_desejado dd
  where not exists (
    select 1 from public.estoque_movimentacoes m
    where m.pedido_item_id = dd.pedido_item_id and m.cancelado_em is null
  )
  order by dd.sku, dd.pedido_item_id;
  get diagnostics v_gravados = row_count;

  select count(*) into v_mantidos
  from public.estoque_movimentacoes m
  where m.pedido_id = p_pedido_id and m.cancelado_em is null;

  select count(*) into v_sem_preco
  from public.estoque_movimentacoes m
  where m.pedido_id = p_pedido_id and m.cancelado_em is null and m.custo_unitario is null;

  if v_cancelados > 0 or v_gravados > 0 then
    perform public.recalcular_ultimo_preco_pago(v_produtos);
  end if;

  -- Exceção auditada: desmarcar recebimento cancela compras do extrato, inclusive
  -- quando quem desmarca é o Operacional.
  if v_pedido.recebido and not p_recebido then
    insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
    values (
      v_unidade, v_uid, 'desmarcar_recebimento', 'pedido', p_pedido_id::text,
      jsonb_build_object('recebido', true, 'recebido_em', v_pedido.recebido_em,
                         'recebido_dia', v_pedido.recebido_dia),
      jsonb_build_object('recebido', false, 'lancamentos_cancelados', v_cancelados,
                         'papel', case when v_gestao then 'gestao_ou_master' else 'operacional' end)
    );
  end if;

  return jsonb_build_object(
    'recebido', p_recebido,
    'recebido_dia', v_recebido_dia,
    'gravados', v_gravados,
    'cancelados', v_cancelados,
    'ativos', v_mantidos,
    'sem_preco', v_sem_preco,
    'pendencias', v_pendencias
  );
end;
$$;

-- 7. Perda (regra 5) -----------------------------------------------------------

create or replace function public.registrar_perda_estoque(
  p_unidade_id text,
  p_produto_id uuid,
  p_quantidade numeric,
  p_data date,
  p_motivo text,
  p_observacao text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_produto public.produtos%rowtype;
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;
  if not public.usuario_tem_acesso_unidade(p_unidade_id, array['gestao', 'operacional']) then
    raise exception 'Sem permissão para registrar perda nesta unidade.' using errcode = '42501';
  end if;
  if p_quantidade is null or p_quantidade <= 0 or p_quantidade > 1000000000 then
    raise exception 'Informe uma quantidade maior que zero.' using errcode = 'P0001';
  end if;
  if p_data is null or p_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data da perda não pode ser no futuro.' using errcode = 'P0001';
  end if;
  if p_motivo is null or p_motivo not in ('vencido', 'estragou', 'erro_preparo', 'quebra', 'outro') then
    raise exception 'Escolha o motivo da perda.' using errcode = 'P0001';
  end if;
  if p_motivo = 'outro' and length(coalesce(v_obs, '')) < 3 then
    raise exception 'Descreva o motivo da perda.' using errcode = 'P0001';
  end if;
  if v_obs is not null and length(v_obs) > 500 then
    raise exception 'Observação muito longa.' using errcode = 'P0001';
  end if;

  -- Regra 4: trava o produto antes de ler o histórico de preço.
  select * into v_produto
  from public.produtos
  where id = p_produto_id and unidade_id = p_unidade_id
  for update;
  if v_produto.id is null then
    raise exception 'Produto não encontrado nesta unidade.' using errcode = 'P0001';
  end if;

  insert into public.estoque_movimentacoes (
    unidade_id, produto_id, sku, unidade_base, tipo, origem, quantidade, custo_unitario,
    data, motivo, observacao, criado_por
  ) values (
    p_unidade_id, v_produto.id, v_produto.sku, v_produto.unidade_base, 'perda', 'manual',
    p_quantidade, public.custo_ultimo_preco_na_data(v_produto.id, p_data),
    p_data, p_motivo, v_obs, v_uid
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 8. Cancelamento de lançamento manual ----------------------------------------

create or replace function public.cancelar_movimentacao_estoque(
  p_movimentacao_id uuid,
  p_motivo text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_unidade text;
  v_produto uuid;
  v_mov public.estoque_movimentacoes%rowtype;
begin
  if v_uid is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  select m.unidade_id, m.produto_id into v_unidade, v_produto
  from public.estoque_movimentacoes m where m.id = p_movimentacao_id;
  if v_unidade is null or not public.usuario_tem_acesso_unidade(v_unidade, null) then
    raise exception 'Lançamento não encontrado nesta unidade.' using errcode = 'P0001';
  end if;
  if not public.usuario_tem_acesso_unidade(v_unidade, array['gestao']) then
    raise exception 'Só Gestão cancela lançamento do extrato.' using errcode = '42501';
  end if;
  if length(v_motivo) < 3 or length(v_motivo) > 500 then
    raise exception 'Escreva o motivo do cancelamento.' using errcode = 'P0001';
  end if;

  perform 1 from public.produtos where id = v_produto for update;
  select * into v_mov from public.estoque_movimentacoes where id = p_movimentacao_id for update;

  if v_mov.origem <> 'manual' then
    raise exception 'Compra de recebimento se cancela desmarcando o recebimento em Pedidos Feitos.'
      using errcode = 'P0001';
  end if;
  if v_mov.cancelado_em is not null then
    raise exception 'Este lançamento já foi cancelado.' using errcode = 'P0001';
  end if;

  update public.estoque_movimentacoes
  set cancelado_em = now(), cancelado_por = v_uid, motivo_cancelamento = v_motivo
  where id = p_movimentacao_id;

  perform public.recalcular_ultimo_preco_pago(array[v_produto]);
end;
$$;

revoke all on function public.registrar_recebimento_pedido(uuid, boolean, text, jsonb) from public, anon;
revoke all on function public.registrar_perda_estoque(text, uuid, numeric, date, text, text) from public, anon;
revoke all on function public.cancelar_movimentacao_estoque(uuid, text) from public, anon;
grant execute on function public.registrar_recebimento_pedido(uuid, boolean, text, jsonb) to authenticated;
grant execute on function public.registrar_perda_estoque(text, uuid, numeric, date, text, text) to authenticated;
grant execute on function public.cancelar_movimentacao_estoque(uuid, text) to authenticated;

-- 9. Leitura: posições (contagens elegíveis) e extrato ------------------------
-- security_invoker: a RLS de cada tabela de origem vale para quem consulta.

-- Posição = contagem elegível em que o SKU tem quantidade conhecida em todas as
-- linhas (e, por setor, em todos os setores do snapshot que esperavam o SKU).
-- Elegível = legada, ou por setor com pelo menos um setor e todos concluídos.
-- Ausência nunca vira zero: SKU sem linha não tem posição naquela contagem.
create or replace view public.estoque_posicoes
with (security_invoker = true) as
select
  c.id as contagem_id,
  c.unidade_id,
  c.data,
  c.modalidade,
  p.id as produto_id,
  p.sku,
  p.unidade_base,
  sum(ci.quantidade) as quantidade,
  case when count(ci.total) = count(*) then sum(ci.total) end as valor
from public.contagens c
join public.contagem_itens ci on ci.contagem_id = c.id and not ci.avulso
join public.produtos p on p.unidade_id = c.unidade_id and p.sku = ci.sku
where (
    c.modalidade = 'legada'
    or (
      c.modalidade = 'setor'
      and exists (select 1 from public.contagem_setores cs where cs.contagem_id = c.id)
      and not exists (
        select 1 from public.contagem_setores cs
        where cs.contagem_id = c.id and cs.situacao <> 'concluido'
      )
    )
  )
group by c.id, c.unidade_id, c.data, c.modalidade, p.id, p.sku, p.unidade_base
having count(ci.quantidade) = count(*)
  and (
    c.modalidade = 'legada'
    or not exists (
      select 1 from public.contagem_escopo e
      where e.contagem_id = c.id and e.sku = p.sku
        and not exists (
          select 1 from public.contagem_itens ci2
          where ci2.contagem_id = c.id and ci2.setor_id = e.setor_id
            and ci2.sku = e.sku and ci2.quantidade is not null
        )
    )
  );

create or replace view public.estoque_extrato_linhas
with (security_invoker = true) as
select
  'mov:' || m.id::text as linha_id,
  m.id as movimentacao_id,
  m.unidade_id,
  m.data,
  1 as ordem_no_dia,
  m.criado_em,
  'movimento'::text as natureza,
  m.tipo,
  m.origem,
  m.produto_id,
  m.sku,
  coalesce(p.nome, '') as nome,
  m.unidade_base,
  m.quantidade,
  case when m.tipo in ('compra', 'entrada') then m.quantidade else -m.quantidade end as quantidade_sinal,
  m.custo_unitario,
  case when m.custo_unitario is not null then round(m.quantidade * m.custo_unitario, 2) end as valor,
  m.quantidade_conferida,
  m.motivo,
  m.observacao,
  m.pedido_id,
  pe.fornecedor,
  m.criado_por,
  m.cancelado_em,
  m.motivo_cancelamento
from public.estoque_movimentacoes m
left join public.produtos p on p.id = m.produto_id
left join public.pedidos pe on pe.id = m.pedido_id
union all
select
  'pos:' || ps.contagem_id::text || ':' || ps.produto_id::text,
  null::uuid,
  ps.unidade_id,
  ps.data,
  0,
  c.criado_em,
  'posicao',
  'posicao',
  null::text,
  ps.produto_id,
  ps.sku,
  coalesce(p.nome, ''),
  ps.unidade_base,
  ps.quantidade,
  null::numeric,
  null::numeric,
  ps.valor,
  true,
  null::text,
  null::text,
  null::uuid,
  null::text,
  c.criado_por,
  null::timestamptz,
  null::text
from public.estoque_posicoes ps
join public.contagens c on c.id = ps.contagem_id
left join public.produtos p on p.id = ps.produto_id;

-- Saldo por SKU = posição da última contagem elegível com o SKU + lançamentos
-- ativos a partir do dia dela (a contagem é posição de abertura do dia).
-- Sem posição, o saldo é nulo (indeterminado), nunca zero.
create or replace view public.estoque_saldos
with (security_invoker = true) as
with ancora as (
  select distinct on (ps.produto_id)
    ps.produto_id, ps.contagem_id, ps.data, ps.quantidade
  from public.estoque_posicoes ps
  order by ps.produto_id, ps.data desc
)
select
  p.id as produto_id,
  p.unidade_id,
  p.sku,
  p.nome,
  p.grupo,
  p.unidade_base,
  p.ativo,
  p.ultimo_preco_pago,
  p.ultimo_preco_pago_em,
  a.data as data_posicao,
  a.quantidade as quantidade_posicao,
  coalesce(sum(m.quantidade) filter (where m.tipo in ('compra', 'entrada')), 0) as entradas,
  coalesce(sum(m.quantidade) filter (where m.tipo in ('perda', 'saida')), 0) as saidas,
  case when a.produto_id is not null then
    a.quantidade
    + coalesce(sum(m.quantidade) filter (where m.tipo in ('compra', 'entrada')), 0)
    - coalesce(sum(m.quantidade) filter (where m.tipo in ('perda', 'saida')), 0)
  end as saldo,
  count(m.id) as lancamentos_desde_posicao
from public.produtos p
left join ancora a on a.produto_id = p.id
left join public.estoque_movimentacoes m
  on m.produto_id = p.id and m.cancelado_em is null and a.data is not null and m.data >= a.data
group by p.id, p.unidade_id, p.sku, p.nome, p.grupo, p.unidade_base, p.ativo,
         p.ultimo_preco_pago, p.ultimo_preco_pago_em, a.produto_id, a.data, a.quantidade;

revoke all on public.estoque_posicoes, public.estoque_extrato_linhas, public.estoque_saldos
  from public, anon, authenticated;
grant select on public.estoque_posicoes, public.estoque_extrato_linhas, public.estoque_saldos
  to authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'vini_leitura') then
    grant select on public.estoque_posicoes, public.estoque_extrato_linhas, public.estoque_saldos
      to vini_leitura;
  end if;
end $$;

commit;
