-- Extrato do estoque v1 - recorte mínimo (desenho em
-- _execucao/zatti-hub/extrato-estoque-v1.md, vereditos do Codex na mesma pasta).
--
-- O que entra:
--   estoque_movimentacoes        extrato: compra (recebimento), perda/saida/entrada (manual).
--                                Só leitura pela Data API; escrita só pelas RPCs abaixo.
--   pedidos.recebido_em/_dia     gravados na transição para recebido, preservados no reenvio.
--   pedidos.versao_itens         sobe a cada mudança nos itens ou no recebimento; a tela manda
--                                a versão que leu e o recebimento desatualizado é recusado.
--   estoque_extrato_inicio       marco por unidade: antes dele o extrato não tem as compras.
--   produtos.ultimo_preco_pago   cache escrito só pela rotina transacional (regra 2).
--   registrar_recebimento_pedido RPC única do recebimento (regra 1, trava da regra 4).
--   registrar_perda_estoque      perda com motivo (regra 5), custo = último preço pago na data,
--                                congelado no lançamento.
--   cancelar_movimentacao_estoque  só Gestão/Master, só lançamento manual.
--   estoque_posicoes             view: contagem elegível por produto, com identidade e unidade
--                                da época (snapshot do setor; no legado, linha gravada).
--   estoque_extrato_linhas       view (security invoker): movimentos + contagens como "posição".
--   estoque_saldos               view (security invoker): saldo por SKU a partir da última
--                                posição, só quando o histórico é completo e a unidade bate.
--
-- O que NÃO faz: não gera movimento de recebimento antigo (sem carga retroativa),
-- não preenche recebido_em de pedido já recebido (fica nulo: a data real não existe
-- no banco), não muda contagem, CMV, cotação nem fichas. Custo médio fica para depois.
--
-- Idempotente: rodar de novo não duplica nada nem altera dado gravado. Sem begin/commit
-- próprios: a migração já roda numa transação.

-- 1. Pedidos: data do recebimento -------------------------------------------

alter table public.pedidos add column if not exists recebido_em timestamptz;
alter table public.pedidos add column if not exists recebido_dia date;

comment on column public.pedidos.recebido_em is
  'Instante em que o pedido passou para recebido (RPC registrar_recebimento_pedido). Nulo em '
  'pedido não recebido e em pedido recebido antes de 13/10/2026 (data real desconhecida).';
comment on column public.pedidos.recebido_dia is
  'Dia operacional (America/Sao_Paulo) de recebido_em. É a data das compras no extrato.';

-- Versão do pedido para o recebimento: sobe a cada mudança nos itens (Data API,
-- pelo gatilho) e a cada recebimento que mudou algo. A tela manda a versão que
-- leu; se outra pessoa mexeu no meio, o recebimento é recusado.
alter table public.pedidos add column if not exists versao_itens integer not null default 0;

comment on column public.pedidos.versao_itens is
  'Sobe a cada mudança em pedido_itens e a cada recebimento que mudou algo. '
  'registrar_recebimento_pedido recusa versão diferente da que a tela leu.';

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

-- 3b. Marco de início do extrato por unidade -----------------------------------
-- Antes do marco o extrato não tem as compras (recebimentos antigos não viram
-- movimento: sem carga retroativa), então saldo a partir de contagem anterior
-- não é estoque esperado confiável. inicio_dia = primeiro dia operacional
-- coberto por inteiro; nulo = unidade fora do estoque no banco.

create table if not exists public.estoque_extrato_inicio (
  unidade_id text primary key references public.unidades(id) on delete cascade,
  inicio_dia date,
  definido_em timestamptz not null default now()
);

comment on table public.estoque_extrato_inicio is
  'Marco do extrato por unidade. Contagem anterior a inicio_dia fica "sem histórico completo".';

alter table public.estoque_extrato_inicio enable row level security;
revoke all on public.estoque_extrato_inicio from public, anon, authenticated;
grant select on public.estoque_extrato_inicio to authenticated;

drop policy if exists "estoque_inicio_select_por_unidade" on public.estoque_extrato_inicio;
create policy "estoque_inicio_select_por_unidade" on public.estoque_extrato_inicio
  for select to authenticated
  using (public.usuario_tem_acesso_unidade(unidade_id, null));

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'vini_leitura') then
    grant select on public.estoque_extrato_inicio to vini_leitura;
    drop policy if exists vini_leitura_select on public.estoque_extrato_inicio;
    create policy vini_leitura_select on public.estoque_extrato_inicio
      for select to vini_leitura using (true);
  end if;
end $$;

-- Unidades que já usam o estoque no banco: o dia da publicação não conta (os
-- recebimentos dele antes da pausa foram gravados sem movimento), o marco é o
-- dia seguinte. Rodar de novo não mexe no marco gravado.
insert into public.estoque_extrato_inicio (unidade_id, inicio_dia)
select u.id, (now() at time zone 'America/Sao_Paulo')::date + 1
from public.unidades u
where u.fonte_dados_estoque = 'banco'
on conflict (unidade_id) do nothing;

-- Unidade nova já no banco começa no dia da criação (não tem passado). Unidade
-- que passa a usar o banco começa no dia seguinte; a que sai perde o marco.
create or replace function public.atualizar_inicio_extrato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antiga text;
begin
  if tg_op = 'UPDATE' then
    v_antiga := old.fonte_dados_estoque;
  end if;
  if new.fonte_dados_estoque = 'banco'
     and (tg_op = 'INSERT' or v_antiga is distinct from 'banco') then
    insert into public.estoque_extrato_inicio (unidade_id, inicio_dia, definido_em)
    values (
      new.id,
      (now() at time zone 'America/Sao_Paulo')::date + case when tg_op = 'INSERT' then 0 else 1 end,
      now()
    )
    on conflict (unidade_id) do update
      set inicio_dia = excluded.inicio_dia, definido_em = excluded.definido_em;
  elsif new.fonte_dados_estoque is distinct from 'banco' and v_antiga = 'banco' then
    update public.estoque_extrato_inicio
    set inicio_dia = null, definido_em = now()
    where unidade_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function public.atualizar_inicio_extrato() from public, anon, authenticated;

drop trigger if exists atualizar_inicio_extrato on public.unidades;
create trigger atualizar_inicio_extrato
  after insert or update of fonte_dados_estoque on public.unidades
  for each row execute function public.atualizar_inicio_extrato();

-- 4. Barreiras na Data API para os campos que o extrato depende -------------
-- Dentro das RPCs (security definer) o current_user é o dono da função, não
-- `authenticated`, então as RPCs passam; a Data API não.

-- Trava a linha do pedido (a mesma que o recebimento trava com `for update`) e
-- sobe a versão. Chamada pelo gatilho dos itens ANTES de olhar o extrato: uma
-- edição de item e um recebimento do mesmo pedido nunca se cruzam. Concorrência
-- real entre sessões não cabe no pgTAP; a garantia vem desta trava.
create or replace function public.travar_pedido_extrato(p_pedido_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade text;
begin
  select p.unidade_id into v_unidade from public.pedidos p where p.id = p_pedido_id;
  if v_unidade is null then
    return; -- pedido inexistente: a chave estrangeira do item recusa em seguida
  end if;
  if not public.usuario_tem_acesso_unidade(v_unidade, null) then
    raise exception 'Pedido não encontrado nesta unidade.' using errcode = '42501';
  end if;
  update public.pedidos set versao_itens = versao_itens + 1 where id = p_pedido_id;
end;
$$;

-- O gatilho roda como quem chamou (authenticated) e precisa executar a trava.
revoke all on function public.travar_pedido_extrato(uuid) from public, anon;
grant execute on function public.travar_pedido_extrato(uuid) to authenticated;

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
    return new;
  end if;

  perform public.travar_pedido_extrato(old.pedido_id);
  if tg_op = 'UPDATE' then
    if new.pedido_id is distinct from old.pedido_id then
      perform public.travar_pedido_extrato(new.pedido_id);
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
  return new;
end;
$$;

revoke all on function public.proteger_extrato_pedidos() from public, anon, authenticated;

drop trigger if exists proteger_extrato_pedidos on public.pedidos;
create trigger proteger_extrato_pedidos
  before insert or update on public.pedidos
  for each row execute function public.proteger_extrato_pedidos();

drop trigger if exists proteger_extrato_pedido_itens on public.pedido_itens;
create trigger proteger_extrato_pedido_itens
  before insert or update or delete on public.pedido_itens
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
  -- SKU e unidade imutáveis na v1 quando já há lançamento no extrato (somar
  -- KG com UN no saldo seria número errado com cara de certo).
  if new.sku is distinct from old.sku
     and exists (select 1 from public.estoque_movimentacoes m where m.produto_id = old.id) then
    raise exception 'Este produto já tem lançamento no extrato do estoque; o SKU não pode mudar.'
      using errcode = 'P0001';
  end if;
  if upper(btrim(new.unidade_base)) is distinct from upper(btrim(old.unidade_base))
     and exists (select 1 from public.estoque_movimentacoes m where m.produto_id = old.id) then
    raise exception 'Este produto já tem lançamento no extrato do estoque; a unidade não pode mudar.'
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

-- Assinatura antiga (sem a versão esperada) sai: ninguém grava recebimento sem
-- dizer qual versão do pedido leu.
drop function if exists public.registrar_recebimento_pedido(uuid, boolean, text, jsonb);

create or replace function public.registrar_recebimento_pedido(
  p_pedido_id uuid,
  p_recebido boolean,
  p_observacao text,
  p_itens jsonb,
  p_versao_itens integer
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
  v_itens_alterados integer := 0;
  v_versao integer;
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
  if p_versao_itens is null then
    raise exception 'Recarregue a página: a tela não informou a versão do pedido.' using errcode = 'P0001';
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

  -- Regra 4 + trava do pedido. Ordem igual à de uma edição de item pela Data API
  -- (linha do item, depois a do pedido), para as duas não se travarem em cruz:
  -- itens do pedido em ordem de id, o pedido, e só então os produtos. Uma edição
  -- de item em andamento termina antes (e sobe a versão) ou espera este
  -- recebimento terminar (e então enxerga o extrato e é barrada pelo gatilho).
  perform 1 from public.pedido_itens pi where pi.pedido_id = p_pedido_id order by pi.id for update;
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;

  if v_pedido.versao_itens is distinct from p_versao_itens then
    raise exception 'Este pedido mudou depois que a tela foi aberta (outra pessoa editou itens ou o recebimento). Recarregue a página e confira antes de salvar.'
      using errcode = 'P0001';
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

  -- Produtos afetados (itens do pedido + produtos com movimento deste pedido),
  -- em ordem de id, antes de ler histórico.
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
  get diagnostics v_itens_alterados = row_count;

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

  -- Versão sobe só quando algo mudou: reenvio idêntico não desatualiza outra tela.
  v_versao := v_pedido.versao_itens;
  if v_itens_alterados > 0 or v_cancelados > 0 or v_gravados > 0
     or v_pedido.recebido is distinct from p_recebido
     or v_pedido.observacao_entrega is distinct from p_observacao then
    update public.pedidos set versao_itens = versao_itens + 1
    where id = p_pedido_id
    returning versao_itens into v_versao;
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
    'pendencias', v_pendencias,
    'versao_itens', v_versao
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

revoke all on function public.registrar_recebimento_pedido(uuid, boolean, text, jsonb, integer) from public, anon;
revoke all on function public.registrar_perda_estoque(text, uuid, numeric, date, text, text) from public, anon;
revoke all on function public.cancelar_movimentacao_estoque(uuid, text) from public, anon;
grant execute on function public.registrar_recebimento_pedido(uuid, boolean, text, jsonb, integer) to authenticated;
grant execute on function public.registrar_perda_estoque(text, uuid, numeric, date, text, text) to authenticated;
grant execute on function public.cancelar_movimentacao_estoque(uuid, text) to authenticated;

-- 9. Leitura: posições (contagens elegíveis) e extrato ------------------------
-- security_invoker: a RLS de cada tabela de origem vale para quem consulta.
-- Views sem dado próprio: recriadas do zero a cada execução.

drop view if exists public.estoque_saldos;
drop view if exists public.estoque_extrato_linhas;
drop view if exists public.estoque_posicoes;

-- Posição = contagem elegível em que o produto tem quantidade conhecida, com a
-- identidade e a unidade DA ÉPOCA. Ausência nunca vira zero; caso ambíguo não
-- vira posição (fica indeterminado).
-- Elegível = legada, ou por setor com pelo menos um setor e todos concluídos.
--   Por setor: produto e unidade vêm do snapshot (contagem_escopo). O SKU precisa
--     ter escopo, um só produto_id e uma só unidade nele, e as linhas contadas
--     precisam bater exatamente com os setores esperados (nenhuma faltando,
--     nenhuma fora do snapshot, todas com quantidade).
--   Legada: não há snapshot. Vale a unidade gravada na linha (uma só) e o
--     produto atual do SKU só se ele já existia quando cada linha foi gravada
--     (produto recriado depois não herda contagem antiga).
create view public.estoque_posicoes
with (security_invoker = true) as
with elegiveis as (
  select c.id, c.unidade_id, c.data, c.modalidade
  from public.contagens c
  where c.modalidade = 'legada'
     or (
       c.modalidade = 'setor'
       and exists (select 1 from public.contagem_setores cs where cs.contagem_id = c.id)
       and not exists (
         select 1 from public.contagem_setores cs
         where cs.contagem_id = c.id and cs.situacao <> 'concluido'
       )
     )
),
setor_esperado as (
  select
    e.contagem_id,
    e.sku,
    count(*) as setores,
    count(e.produto_id) as com_produto,
    count(distinct e.produto_id) as produtos,
    (array_agg(e.produto_id) filter (where e.produto_id is not null))[1] as produto_id,
    count(distinct upper(btrim(e.unidade_base))) as unidades,
    min(e.unidade_base) as unidade_base
  from public.contagem_escopo e
  join elegiveis c on c.id = e.contagem_id and c.modalidade = 'setor'
  group by e.contagem_id, e.sku
),
setor_contado as (
  select
    ci.contagem_id,
    ci.sku,
    count(*) as linhas,
    count(e.setor_id) as linhas_no_snapshot,
    count(ci.quantidade) as com_quantidade,
    count(ci.total) as com_total,
    sum(ci.quantidade) as quantidade,
    sum(ci.total) as total
  from public.contagem_itens ci
  join elegiveis c on c.id = ci.contagem_id and c.modalidade = 'setor'
  left join public.contagem_escopo e
    on e.contagem_id = ci.contagem_id and e.setor_id = ci.setor_id and e.sku = ci.sku
  where not ci.avulso
  group by ci.contagem_id, ci.sku
)
select
  c.id as contagem_id,
  c.unidade_id,
  c.data,
  c.modalidade,
  se.produto_id,
  se.sku,
  se.unidade_base,
  sc.quantidade,
  case when sc.com_total = sc.linhas then sc.total end as valor
from setor_esperado se
join elegiveis c on c.id = se.contagem_id
join public.produtos p on p.id = se.produto_id and p.unidade_id = c.unidade_id
join setor_contado sc on sc.contagem_id = se.contagem_id and sc.sku = se.sku
where se.com_produto = se.setores
  and se.produtos = 1
  and se.unidades = 1
  and sc.linhas = se.setores
  and sc.linhas_no_snapshot = sc.linhas
  and sc.com_quantidade = sc.linhas
union all
select
  c.id,
  c.unidade_id,
  c.data,
  c.modalidade,
  p.id,
  ci.sku,
  min(ci.unidade_base),
  sum(ci.quantidade),
  case when count(ci.total) = count(*) then sum(ci.total) end
from elegiveis c
join public.contagem_itens ci on ci.contagem_id = c.id and not ci.avulso
join public.produtos p on p.unidade_id = c.unidade_id and p.sku = ci.sku
where c.modalidade = 'legada'
group by c.id, c.unidade_id, c.data, c.modalidade, p.id, ci.sku
having count(ci.quantidade) = count(*)
  and count(distinct upper(btrim(ci.unidade_base))) = 1
  and bool_and(p.criado_em <= ci.criado_em);

create view public.estoque_extrato_linhas
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

-- Saldo por SKU = posição da última contagem elegível com o produto + lançamentos
-- ativos a partir do dia dela (a contagem é posição de abertura do dia). Só vira
-- número quando dá para confiar (situacao_saldo = 'calculado'):
--   sem_posicao             nenhuma contagem elegível com o produto;
--   unidade_divergente      unidade da posição, do cadastro ou de algum lançamento
--                           desde ela não batem (não soma KG com UN);
--   sem_historico_completo  posição anterior ao marco da unidade: as compras de
--                           antes do extrato não estão lançadas.
-- Nos três casos o saldo é nulo (indeterminado), nunca zero.
create view public.estoque_saldos
with (security_invoker = true) as
with ancora as (
  select distinct on (ps.produto_id)
    ps.produto_id, ps.contagem_id, ps.data, ps.quantidade, ps.unidade_base
  from public.estoque_posicoes ps
  order by ps.produto_id, ps.data desc
),
desde as (
  select
    a.produto_id,
    coalesce(sum(m.quantidade) filter (where m.tipo in ('compra', 'entrada')), 0) as entradas,
    coalesce(sum(m.quantidade) filter (where m.tipo in ('perda', 'saida')), 0) as saidas,
    count(m.id) as lancamentos,
    count(m.id) filter (
      where upper(btrim(m.unidade_base)) is distinct from upper(btrim(a.unidade_base))
    ) as em_outra_unidade
  from ancora a
  left join public.estoque_movimentacoes m
    on m.produto_id = a.produto_id and m.cancelado_em is null and m.data >= a.data
  group by a.produto_id
),
base as (
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
    a.unidade_base as unidade_posicao,
    coalesce(d.entradas, 0) as entradas,
    coalesce(d.saidas, 0) as saidas,
    coalesce(d.lancamentos, 0) as lancamentos_desde_posicao,
    i.inicio_dia as inicio_extrato,
    case
      when a.produto_id is null then 'sem_posicao'
      when upper(btrim(a.unidade_base)) is distinct from upper(btrim(p.unidade_base))
        or d.em_outra_unidade > 0 then 'unidade_divergente'
      when i.inicio_dia is null or a.data < i.inicio_dia then 'sem_historico_completo'
      else 'calculado'
    end as situacao_saldo
  from public.produtos p
  left join ancora a on a.produto_id = p.id
  left join desde d on d.produto_id = p.id
  left join public.estoque_extrato_inicio i on i.unidade_id = p.unidade_id
)
select
  b.produto_id,
  b.unidade_id,
  b.sku,
  b.nome,
  b.grupo,
  b.unidade_base,
  b.ativo,
  b.ultimo_preco_pago,
  b.ultimo_preco_pago_em,
  b.data_posicao,
  b.quantidade_posicao,
  b.unidade_posicao,
  b.entradas,
  b.saidas,
  case when b.situacao_saldo = 'calculado' then b.quantidade_posicao + b.entradas - b.saidas end as saldo,
  b.lancamentos_desde_posicao,
  b.inicio_extrato,
  b.situacao_saldo
from base b;

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
