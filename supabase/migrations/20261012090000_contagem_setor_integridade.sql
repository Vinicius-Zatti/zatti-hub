-- Contagem por setor - correções de integridade (veredito do Codex, Tarefa B,
-- defeitos 1 a 11). Decisões de Vinícius registradas em
-- _execucao/zatti-hub/extrato-estoque-v1-veredito-codex.md e no briefing de 11/10.
--
-- O que muda:
--   contagens.modalidade        'legada' | 'setor', persistida; mistura é recusada
--   contagens.snapshot_criado_em quando o escopo foi congelado (vazio continua congelado)
--   contagem_escopo             guarda nome, grupo, unidade e produto_id do snapshot
--   contagem_itens.avulso       item sem cadastro (PENDENTE-...), nunca conta pra completude
--   contagem_setores.versao     trava otimista do envio do setor
--   contagem_envios             histórico completo de cada envio/correção, na mesma transação
--   RPCs                        abrir, substituir (completo + versão), corrigir por id,
--                               designar produtos (transacional, mesma trava da abertura)
--   RLS                         escrita direta em contagem_itens só para contagem legada
--
-- Idempotente e sem apagar dado. Não muda fórmula de CMV nem valores gravados.

begin;

-- 1. Modalidade da contagem ---------------------------------------------------

alter table public.contagens add column if not exists modalidade text;
alter table public.contagens add column if not exists snapshot_criado_em timestamptz;

-- Tem andamento ou escopo => foi aberta por setor. Senão é legada (inclusive a
-- importação do legado e as contagens da planilha migradas pro banco).
update public.contagens c
set modalidade = case
  when exists (select 1 from public.contagem_setores cs where cs.contagem_id = c.id)
    or exists (select 1 from public.contagem_escopo e where e.contagem_id = c.id)
  then 'setor'
  else 'legada'
end
where c.modalidade is null;

update public.contagens c
set snapshot_criado_em = coalesce(
  (select min(cs.criado_em) from public.contagem_setores cs where cs.contagem_id = c.id),
  c.criado_em
)
where c.modalidade = 'setor' and c.snapshot_criado_em is null;

alter table public.contagens alter column modalidade set default 'legada';
alter table public.contagens alter column modalidade set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contagens_modalidade_valida') then
    alter table public.contagens
      add constraint contagens_modalidade_valida check (modalidade in ('legada', 'setor'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contagens_setor_tem_snapshot') then
    alter table public.contagens
      add constraint contagens_setor_tem_snapshot
      check (modalidade = 'legada' or snapshot_criado_em is not null);
  end if;
end $$;

-- 2. Metadados do snapshot -----------------------------------------------------

alter table public.contagem_escopo add column if not exists produto_id uuid;
alter table public.contagem_escopo add column if not exists nome text;
alter table public.contagem_escopo add column if not exists grupo text;
alter table public.contagem_escopo add column if not exists unidade_base text;

-- Backfill: primeiro pelo cadastro (mesma unidade e SKU)...
update public.contagem_escopo e
set produto_id = p.id,
    nome = coalesce(e.nome, p.nome),
    grupo = coalesce(e.grupo, p.grupo),
    unidade_base = coalesce(e.unidade_base, p.unidade_base)
from public.contagens c, public.produtos p
where c.id = e.contagem_id
  and p.unidade_id = c.unidade_id
  and p.sku = e.sku
  and (e.produto_id is null or e.nome is null or e.grupo is null or e.unidade_base is null);

-- ...e, quando o produto já não existe, pelo que ficou gravado nos itens.
update public.contagem_escopo e
set nome = coalesce(e.nome, i.nome),
    grupo = coalesce(e.grupo, i.grupo),
    unidade_base = coalesce(e.unidade_base, i.unidade_base)
from (
  select distinct on (ci.contagem_id, ci.sku)
    ci.contagem_id, ci.sku, ci.nome, ci.grupo, ci.unidade_base
  from public.contagem_itens ci
  order by ci.contagem_id, ci.sku, ci.ordem
) i
where i.contagem_id = e.contagem_id
  and i.sku = e.sku
  and (e.nome is null or e.grupo is null or e.unidade_base is null);

update public.contagem_escopo set nome = sku where nome is null;
update public.contagem_escopo set grupo = '' where grupo is null;
update public.contagem_escopo set unidade_base = '' where unidade_base is null;

alter table public.contagem_escopo alter column nome set default '';
alter table public.contagem_escopo alter column grupo set default '';
alter table public.contagem_escopo alter column unidade_base set default '';
alter table public.contagem_escopo alter column nome set not null;
alter table public.contagem_escopo alter column grupo set not null;
alter table public.contagem_escopo alter column unidade_base set not null;

-- 3. Item avulso -------------------------------------------------------------

alter table public.contagem_itens add column if not exists avulso boolean not null default false;

update public.contagem_itens
set avulso = true
where avulso = false and sku like 'PENDENTE-%';

-- 4. Versão do envio do setor ---------------------------------------------------

alter table public.contagem_setores add column if not exists versao integer not null default 0;

update public.contagem_setores
set versao = 1
where versao = 0 and situacao = 'concluido';

-- 5. Histórico de envios ------------------------------------------------------

create table if not exists public.contagem_envios (
  id uuid primary key default gen_random_uuid(),
  contagem_id uuid not null references public.contagens(id) on delete cascade,
  setor_id uuid not null references public.setores(id),
  versao integer not null,
  tipo text not null default 'envio' check (tipo in ('envio', 'correcao')),
  enviado_por uuid references auth.users(id),
  enviado_em timestamptz not null default now(),
  itens_anteriores jsonb not null default '[]'::jsonb,
  itens_novos jsonb not null default '[]'::jsonb
);

create index if not exists contagem_envios_contagem on public.contagem_envios (contagem_id, setor_id, versao);

alter table public.contagem_envios enable row level security;

drop policy if exists "contagem_envios_select_por_vinculo" on public.contagem_envios;
create policy "contagem_envios_select_por_vinculo" on public.contagem_envios
  for select to authenticated
  using (public.usuario_tem_acesso_contagem(contagem_id));

revoke all on public.contagem_envios from public, anon, authenticated;
grant select on public.contagem_envios to authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'vini_leitura') then
    grant select on public.contagem_envios to vini_leitura;
    drop policy if exists vini_leitura_select on public.contagem_envios;
    create policy vini_leitura_select on public.contagem_envios
      for select to vini_leitura using (true);
  end if;
end $$;

-- 6. Escrita direta: só legado ----------------------------------------------

-- Contagem por setor só é escrita pelas funções abaixo (security definer).
create or replace function public.usuario_pode_escrever_contagem_legada(p_contagem_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.contagens c
    where c.id = p_contagem_id
      and c.modalidade = 'legada'
      and public.usuario_tem_acesso_unidade(c.unidade_id, null)
  );
$$;

revoke all on function public.usuario_pode_escrever_contagem_legada(uuid) from public, anon;
grant execute on function public.usuario_pode_escrever_contagem_legada(uuid) to authenticated;

drop policy if exists "contagem_itens_insert_por_vinculo" on public.contagem_itens;
drop policy if exists "contagem_itens_update_por_vinculo" on public.contagem_itens;

create policy "contagem_itens_insert_por_vinculo" on public.contagem_itens
  for insert to authenticated
  with check (
    setor_id is null
    and public.usuario_pode_escrever_contagem_legada(contagem_id)
  );

create policy "contagem_itens_update_por_vinculo" on public.contagem_itens
  for update to authenticated
  using (setor_id is null and public.usuario_pode_escrever_contagem_legada(contagem_id))
  with check (setor_id is null and public.usuario_pode_escrever_contagem_legada(contagem_id));

-- Cabeçalho criado direto (fluxo legado) nasce sempre legado.
drop policy if exists "contagens_insert_por_vinculo" on public.contagens;
create policy "contagens_insert_por_vinculo" on public.contagens
  for insert to authenticated
  with check (
    public.usuario_tem_acesso_unidade(unidade_id, null)
    and criado_por = auth.uid()
    and modalidade = 'legada'
    and snapshot_criado_em is null
  );

-- Designação só pela função transacional (mesma trava da abertura).
drop policy if exists "produto_setores_insert_gestao" on public.produto_setores;
drop policy if exists "produto_setores_delete_gestao" on public.produto_setores;

-- 7. Funções auxiliares ------------------------------------------------------

-- Mesma regra de `calcularAlerta` (src/lib/banco/estoque.ts).
create or replace function public.contagem_alerta(
  p_quantidade numeric,
  p_preco numeric,
  p_necessario_semana numeric,
  p_minimo numeric,
  p_tem_produto boolean
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_quantidade is null then ''
    when p_preco is null then 'Falta preço no cadastro'
    when not p_tem_produto then ''
    when p_necessario_semana is not null and p_quantidade > p_necessario_semana * 2
      then 'Possível erro de contagem'
    when p_minimo is not null and p_quantidade < p_minimo then 'Comprar emergencial'
    else ''
  end;
$$;

-- Trava única por unidade: abertura de contagem e designação de produto a setor
-- nunca se intercalam, então o snapshot nunca vê designação pela metade.
create or replace function public.travar_setores_unidade(p_unidade_id text)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('contagem-setor-unidade:' || p_unidade_id, 0));
$$;

revoke all on function public.travar_setores_unidade(text) from public, anon, authenticated;

-- 8. Abrir a contagem do dia -------------------------------------------------

create or replace function public.abrir_contagem_setor(
  p_unidade_id text,
  p_data date,
  p_mes text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_contagem uuid;
  v_modalidade text;
begin
  if not public.usuario_tem_acesso_unidade(p_unidade_id, null) then
    raise exception 'Sem acesso a esta unidade' using errcode = '42501';
  end if;

  perform public.travar_setores_unidade(p_unidade_id);

  select c.id, c.modalidade into v_contagem, v_modalidade
  from public.contagens c
  where c.unidade_id = p_unidade_id and c.data = p_data
  for update;

  if v_contagem is null then
    insert into public.contagens (unidade_id, data, mes, criado_por, modalidade, snapshot_criado_em)
    values (p_unidade_id, p_data, p_mes, auth.uid(), 'setor', now())
    returning id into v_contagem;
  elsif v_modalidade = 'setor' then
    -- Snapshot já congelado, mesmo vazio: nunca reabre outro escopo.
    return v_contagem;
  elsif exists (select 1 from public.contagem_itens ci where ci.contagem_id = v_contagem) then
    raise exception 'Esta data já tem uma contagem no modo antigo (sem setor). Para contar por setor, escolha outra data.'
      using errcode = 'P0001';
  else
    update public.contagens
    set modalidade = 'setor', snapshot_criado_em = now()
    where id = v_contagem;
  end if;

  insert into public.contagem_escopo (contagem_id, setor_id, sku, produto_id, nome, grupo, unidade_base)
  select v_contagem, ps.setor_id, p.sku, p.id, p.nome, p.grupo, p.unidade_base
  from public.produto_setores ps
  join public.produtos p on p.id = ps.produto_id
  join public.setores s on s.id = ps.setor_id
  where ps.unidade_id = p_unidade_id
    and s.ativo = true
    and p.ativo = true
  on conflict do nothing;

  -- setor sem nenhum produto no snapshot fica de fora do andamento.
  insert into public.contagem_setores (contagem_id, setor_id, situacao, versao)
  select distinct v_contagem, e.setor_id, 'pendente', 0
  from public.contagem_escopo e
  where e.contagem_id = v_contagem
  on conflict (contagem_id, setor_id) do nothing;

  return v_contagem;
end;
$$;

-- 9. Gravar (ou regravar) a contagem de um setor ----------------------------

-- A versão antiga (sem versão esperada) deixa de existir: ninguém mais grava
-- setor sem completude, sem trava e sem histórico.
drop function if exists public.substituir_contagem_setor(uuid, uuid, jsonb);

create or replace function public.substituir_contagem_setor(
  p_contagem_id uuid,
  p_setor_id uuid,
  p_itens jsonb,
  p_versao_esperada integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade text;
  v_modalidade text;
  v_versao integer;
  v_setor_nome text;
  v_problema text;
  v_faltam integer;
  v_anteriores jsonb;
  v_novos jsonb;
  v_gravados integer;
begin
  select c.unidade_id, c.modalidade into v_unidade, v_modalidade
  from public.contagens c
  where c.id = p_contagem_id;

  if v_unidade is null then
    raise exception 'Contagem nao encontrada' using errcode = '22023';
  end if;

  if not public.usuario_tem_acesso_unidade(v_unidade, null) then
    raise exception 'Sem acesso a esta contagem' using errcode = '42501';
  end if;

  if v_modalidade <> 'setor' then
    raise exception 'Esta data foi contada no modo antigo (sem setor) e não aceita envio por setor.'
      using errcode = 'P0001';
  end if;

  -- Trava a linha do andamento ANTES de ler ou apagar qualquer item: dois
  -- envios do mesmo setor passam a ser um depois do outro.
  select cs.versao, s.nome into v_versao, v_setor_nome
  from public.contagem_setores cs
  join public.setores s on s.id = cs.setor_id
  where cs.contagem_id = p_contagem_id and cs.setor_id = p_setor_id
  for update of cs;

  if v_versao is null then
    raise exception 'Este setor não faz parte da contagem desta data.' using errcode = 'P0001';
  end if;

  if p_versao_esperada is null or p_versao_esperada <> v_versao then
    raise exception 'Outra pessoa enviou este setor agora. Recarregue.' using errcode = 'P0001';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Lista de itens inválida.' using errcode = 'P0001';
  end if;

  create temporary table if not exists pg_temp.envio_setor (
    sku text,
    quantidade numeric,
    avulso boolean,
    nome text,
    unidade_base text
  ) on commit drop;
  truncate pg_temp.envio_setor;

  insert into pg_temp.envio_setor (sku, quantidade, avulso, nome, unidade_base)
  select btrim(item.sku), item.quantidade, coalesce(item.avulso, false),
         btrim(coalesce(item.nome, '')), btrim(coalesce(item.unidade_base, ''))
  from jsonb_to_recordset(p_itens) as item(
    sku text, quantidade numeric, avulso boolean, nome text, unidade_base text
  );

  select case
    when exists (select 1 from pg_temp.envio_setor where sku is null or sku = '')
      then 'Item sem SKU no envio.'
    when exists (select 1 from pg_temp.envio_setor where quantidade < 0)
      then 'Quantidade negativa não é aceita.'
    when exists (select 1 from pg_temp.envio_setor group by sku having count(*) > 1)
      then 'SKU repetido no envio: ' || (
        select string_agg(sku, ', ' order by sku)
        from (select sku from pg_temp.envio_setor group by sku having count(*) > 1) d)
    when exists (
      select 1 from pg_temp.envio_setor
      where avulso and (sku not like 'PENDENTE-%' or nome = '' or quantidade is null))
      then 'Item avulso precisa de nome, quantidade e código PENDENTE-.'
    when exists (
      select 1 from pg_temp.envio_setor en
      where avulso and exists (
        select 1 from public.contagem_escopo e
        where e.contagem_id = p_contagem_id and e.sku = en.sku))
      then 'Item avulso não pode usar o código de um produto da lista.'
    when exists (
      select 1 from pg_temp.envio_setor en
      where not avulso and not exists (
        select 1 from public.contagem_escopo e
        where e.contagem_id = p_contagem_id and e.setor_id = p_setor_id and e.sku = en.sku))
      then 'Item fora da lista deste setor: ' || (
        select string_agg(en.sku, ', ' order by en.sku)
        from pg_temp.envio_setor en
        where not en.avulso and not exists (
          select 1 from public.contagem_escopo e
          where e.contagem_id = p_contagem_id and e.setor_id = p_setor_id and e.sku = en.sku))
    else null
  end into v_problema;

  if v_problema is not null then
    raise exception '%', v_problema using errcode = 'P0001';
  end if;

  select count(*) into v_faltam
  from public.contagem_escopo e
  where e.contagem_id = p_contagem_id
    and e.setor_id = p_setor_id
    and not exists (
      select 1 from pg_temp.envio_setor en
      where en.sku = e.sku and not en.avulso and en.quantidade is not null);

  if v_faltam > 0 then
    raise exception 'Envio incompleto: faltam % % do setor %.',
      v_faltam, case when v_faltam = 1 then 'item' else 'itens' end, v_setor_nome
      using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(to_jsonb(ci) - 'contagem_id' order by ci.ordem), '[]'::jsonb)
  into v_anteriores
  from public.contagem_itens ci
  where ci.contagem_id = p_contagem_id and ci.setor_id = p_setor_id;

  delete from public.contagem_itens
  where contagem_id = p_contagem_id and setor_id = p_setor_id;

  -- Itens da lista: nome/grupo/unidade do snapshot; preço, total e alerta do
  -- banco, nunca do navegador.
  insert into public.contagem_itens (
    contagem_id, setor_id, sku, grupo, nome, unidade_base,
    quantidade, preco_unitario, total, alerta, avulso
  )
  select
    p_contagem_id, p_setor_id, e.sku, e.grupo, e.nome, e.unidade_base,
    en.quantidade, p.preco_unitario,
    case when p.preco_unitario is null then null else round(en.quantidade * p.preco_unitario, 2) end,
    public.contagem_alerta(en.quantidade, p.preco_unitario, p.estoque_necessario_semana,
                           p.estoque_minimo, p.id is not null),
    false
  from pg_temp.envio_setor en
  join public.contagem_escopo e
    on e.contagem_id = p_contagem_id and e.setor_id = p_setor_id and e.sku = en.sku
  left join public.produtos p
    on p.id = e.produto_id and p.unidade_id = v_unidade
  where not en.avulso
  order by e.sku;

  insert into public.contagem_itens (
    contagem_id, setor_id, sku, grupo, nome, unidade_base,
    quantidade, preco_unitario, total, alerta, avulso
  )
  select
    p_contagem_id, p_setor_id, en.sku, '', en.nome, coalesce(nullif(en.unidade_base, ''), 'UN'),
    en.quantidade, null, null, 'Sem cadastro, falta criar produto', true
  from pg_temp.envio_setor en
  where en.avulso
  order by en.sku;

  select count(*), coalesce(jsonb_agg(to_jsonb(ci) - 'contagem_id' order by ci.ordem), '[]'::jsonb)
  into v_gravados, v_novos
  from public.contagem_itens ci
  where ci.contagem_id = p_contagem_id and ci.setor_id = p_setor_id;

  update public.contagem_setores
  set situacao = 'concluido', enviado_em = now(), enviado_por = auth.uid(), versao = versao + 1
  where contagem_id = p_contagem_id and setor_id = p_setor_id;

  insert into public.contagem_envios (
    contagem_id, setor_id, versao, tipo, enviado_por, itens_anteriores, itens_novos
  )
  values (p_contagem_id, p_setor_id, v_versao + 1, 'envio', auth.uid(), v_anteriores, v_novos);

  return jsonb_build_object('gravados', v_gravados, 'versao', v_versao + 1);
end;
$$;

-- 10. Corrigir a quantidade de um item, pelo id ------------------------------

create or replace function public.corrigir_item_contagem(
  p_item_id uuid,
  p_quantidade numeric,
  p_versao_esperada integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_contagem uuid;
  v_setor uuid;
  v_unidade text;
  v_modalidade text;
  v_versao integer;
  v_antes jsonb;
  v_depois jsonb;
  v_alterados integer;
begin
  if p_quantidade is null or p_quantidade < 0 then
    raise exception 'Quantidade inválida.' using errcode = 'P0001';
  end if;

  select ci.contagem_id, ci.setor_id, c.unidade_id, c.modalidade
  into v_contagem, v_setor, v_unidade, v_modalidade
  from public.contagem_itens ci
  join public.contagens c on c.id = ci.contagem_id
  where ci.id = p_item_id;

  if v_contagem is null then
    raise exception 'Não achei esse item para corrigir. Ele pode ter sido substituído por um envio mais novo. Recarregue.'
      using errcode = 'P0001';
  end if;

  if not public.usuario_tem_acesso_unidade(v_unidade, null) then
    raise exception 'Sem acesso a esta contagem' using errcode = '42501';
  end if;

  if v_modalidade = 'setor' then
    if v_setor is null then
      raise exception 'Item sem setor numa contagem por setor.' using errcode = 'P0001';
    end if;

    -- Mesma trava da substituição.
    select cs.versao into v_versao
    from public.contagem_setores cs
    where cs.contagem_id = v_contagem and cs.setor_id = v_setor
    for update;

    if v_versao is null then
      raise exception 'Este setor não faz parte da contagem desta data.' using errcode = 'P0001';
    end if;
    if p_versao_esperada is null or p_versao_esperada <> v_versao then
      raise exception 'Outra pessoa enviou este setor agora. Recarregue.' using errcode = 'P0001';
    end if;
  end if;

  -- Lido de novo depois da trava: um reenvio pode ter apagado a linha.
  select to_jsonb(ci) - 'contagem_id' into v_antes
  from public.contagem_itens ci
  where ci.id = p_item_id
  for update;

  if v_antes is null then
    raise exception 'Não achei esse item para corrigir. Ele pode ter sido substituído por um envio mais novo. Recarregue.'
      using errcode = 'P0001';
  end if;

  -- Preço é o que já estava gravado na linha: corrigir quantidade não
  -- reprecifica. Alerta segue o cadastro atual, como sempre foi.
  update public.contagem_itens ci
  set quantidade = p_quantidade,
      total = case when ci.preco_unitario is null then null
                   else round(p_quantidade * ci.preco_unitario, 2) end,
      alerta = case when ci.avulso then ci.alerta
                    else public.contagem_alerta(p_quantidade, ci.preco_unitario,
                           p.estoque_necessario_semana, p.estoque_minimo, p.id is not null) end
  from (select 1) um
  left join public.produtos p on p.unidade_id = v_unidade and p.sku = (v_antes ->> 'sku')
  where ci.id = p_item_id;

  get diagnostics v_alterados = row_count;
  if v_alterados <> 1 then
    raise exception 'A correção não foi gravada. Recarregue e tente de novo.' using errcode = 'P0001';
  end if;

  if v_modalidade = 'setor' then
    select to_jsonb(ci) - 'contagem_id' into v_depois
    from public.contagem_itens ci where ci.id = p_item_id;

    update public.contagem_setores
    set versao = versao + 1
    where contagem_id = v_contagem and setor_id = v_setor;

    insert into public.contagem_envios (
      contagem_id, setor_id, versao, tipo, enviado_por, itens_anteriores, itens_novos
    )
    values (v_contagem, v_setor, v_versao + 1, 'correcao', auth.uid(),
            jsonb_build_array(v_antes), jsonb_build_array(v_depois));

    return jsonb_build_object('versao', v_versao + 1);
  end if;

  return jsonb_build_object('versao', null);
end;
$$;

-- 11. Designar produtos a setores, de uma vez ---------------------------------

create or replace function public.designar_setores_produtos(
  p_unidade_id text,
  p_designacoes jsonb
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_problema text;
  v_gravados integer;
begin
  if not public.usuario_tem_acesso_unidade(p_unidade_id, array['gestao']) then
    raise exception 'Sem permissão para designar setores nesta unidade' using errcode = '42501';
  end if;

  if p_designacoes is null or jsonb_typeof(p_designacoes) <> 'array' then
    raise exception 'Lista de designações inválida.' using errcode = 'P0001';
  end if;

  perform public.travar_setores_unidade(p_unidade_id);

  create temporary table if not exists pg_temp.designacao_setor (
    sku text,
    setor_id uuid
  ) on commit drop;
  create temporary table if not exists pg_temp.designacao_sku (
    sku text
  ) on commit drop;
  truncate pg_temp.designacao_setor;
  truncate pg_temp.designacao_sku;

  insert into pg_temp.designacao_sku (sku)
  select btrim(d ->> 'sku')
  from jsonb_array_elements(p_designacoes) d;

  insert into pg_temp.designacao_setor (sku, setor_id)
  select distinct btrim(d ->> 'sku'), s.valor::uuid
  from jsonb_array_elements(p_designacoes) d
  cross join lateral jsonb_array_elements_text(coalesce(d -> 'setorIds', '[]'::jsonb)) as s(valor);

  select case
    when exists (select 1 from pg_temp.designacao_sku where sku is null or sku = '')
      then 'Designação sem SKU.'
    when exists (select 1 from pg_temp.designacao_sku group by sku having count(*) > 1)
      then 'Produto repetido na designação: ' || (
        select string_agg(sku, ', ' order by sku)
        from (select sku from pg_temp.designacao_sku group by sku having count(*) > 1) d)
    when exists (
      select 1 from pg_temp.designacao_sku ds
      where not exists (
        select 1 from public.produtos p where p.unidade_id = p_unidade_id and p.sku = ds.sku))
      then 'Produto não encontrado nesta unidade: ' || (
        select string_agg(ds.sku, ', ' order by ds.sku)
        from pg_temp.designacao_sku ds
        where not exists (
          select 1 from public.produtos p where p.unidade_id = p_unidade_id and p.sku = ds.sku))
    when exists (
      select 1 from pg_temp.designacao_setor dset
      where not exists (
        select 1 from public.setores s
        where s.id = dset.setor_id and s.unidade_id = p_unidade_id and s.ativo = true))
      then 'Setor inválido ou desativado nesta unidade.'
    else null
  end into v_problema;

  if v_problema is not null then
    raise exception '%', v_problema using errcode = 'P0001';
  end if;

  delete from public.produto_setores ps
  using public.produtos p, pg_temp.designacao_sku ds
  where ps.produto_id = p.id
    and p.unidade_id = p_unidade_id
    and p.sku = ds.sku
    and ps.unidade_id = p_unidade_id;

  insert into public.produto_setores (produto_id, setor_id, unidade_id)
  select p.id, dset.setor_id, p_unidade_id
  from pg_temp.designacao_setor dset
  join public.produtos p on p.unidade_id = p_unidade_id and p.sku = dset.sku;

  get diagnostics v_gravados = row_count;
  return v_gravados;
end;
$$;

revoke all on function public.abrir_contagem_setor(text, date, text) from public, anon;
revoke all on function public.substituir_contagem_setor(uuid, uuid, jsonb, integer) from public, anon;
revoke all on function public.corrigir_item_contagem(uuid, numeric, integer) from public, anon;
revoke all on function public.designar_setores_produtos(text, jsonb) from public, anon;
grant execute on function public.abrir_contagem_setor(text, date, text) to authenticated;
grant execute on function public.substituir_contagem_setor(uuid, uuid, jsonb, integer) to authenticated;
grant execute on function public.corrigir_item_contagem(uuid, numeric, integer) to authenticated;
grant execute on function public.designar_setores_produtos(text, jsonb) to authenticated;

commit;
