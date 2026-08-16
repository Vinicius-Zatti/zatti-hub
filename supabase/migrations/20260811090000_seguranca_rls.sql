-- Defense in depth for the Supabase Data API.
-- Authorization must remain valid even when a client bypasses the UI and
-- calls PostgREST directly with the public/publishable key.

create index if not exists vinculos_user_status_idx
  on public.vinculos (user_id, status);

create index if not exists pedidos_unidade_idx
  on public.pedidos (unidade_id);

create index if not exists pedido_itens_pedido_idx
  on public.pedido_itens (pedido_id);

-- These helpers are SECURITY DEFINER so policy evaluation can inspect the
-- access tables without being affected by their own RLS policies. They only
-- return booleans for the current auth.uid() and never expose row contents.
create or replace function public.usuario_tem_acesso_organizacao(
  p_organizacao_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      auth.jwt() ->> 'aal' = 'aal2'
      or not exists (
        select 1 from public.vinculos vm
        where vm.user_id = auth.uid()
          and vm.status = 'ativo'
          and vm.role = 'master'
      )
    )
    and exists (
      select 1
      from public.vinculos v
      join public.organizacoes o on o.id = p_organizacao_id
      where v.user_id = auth.uid()
        and v.status = 'ativo'
        and o.ativo = true
        and (
          (v.role = 'master' and auth.jwt() ->> 'aal' = 'aal2')
          or (v.role <> 'master' and v.organizacao_id = o.id)
        )
    );
$$;

create or replace function public.usuario_tem_acesso_unidade(
  p_unidade_id text,
  p_papeis text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      auth.jwt() ->> 'aal' = 'aal2'
      or not exists (
        select 1 from public.vinculos vm
        where vm.user_id = auth.uid()
          and vm.status = 'ativo'
          and vm.role = 'master'
      )
    )
    and exists (
      select 1
      from public.unidades u
      join public.organizacoes o on o.id = u.organizacao_id
      join public.vinculos v on v.user_id = auth.uid()
      where u.id = p_unidade_id
        and u.ativo = true
        and o.ativo = true
        and v.status = 'ativo'
        and (
          (v.role = 'master' and auth.jwt() ->> 'aal' = 'aal2')
          or (
            v.role <> 'master'
            and
            v.organizacao_id = u.organizacao_id
            and (v.unidade_id is null or v.unidade_id = u.id)
            and (p_papeis is null or v.role = any (p_papeis))
          )
        )
    );
$$;

create or replace function public.usuario_tem_acesso_pedido(
  p_pedido_id uuid,
  p_papeis text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pedidos p
    where p.id = p_pedido_id
      and public.usuario_tem_acesso_unidade(p.unidade_id, p_papeis)
  );
$$;

create or replace function public.usuario_tem_acesso_contagem(
  p_contagem_id uuid
)
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
      and public.usuario_tem_acesso_unidade(c.unidade_id, null)
  );
$$;

create or replace function public.usuario_pode_usar_consolidado(
  p_unidade_id text,
  p_papeis text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.usuario_tem_acesso_unidade(p_unidade_id, p_papeis)
    and exists (
      select 1
      from public.unidades u
      where u.id = p_unidade_id
        and u.consolidado_vendas_habilitado = true
    );
$$;

create or replace function public.usuario_pode_ver_perfil(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      auth.jwt() ->> 'aal' = 'aal2'
      or not exists (
        select 1 from public.vinculos vm
        where vm.user_id = auth.uid()
          and vm.status = 'ativo'
          and vm.role = 'master'
      )
    )
    and (
      p_user_id = auth.uid()
      or exists (
        select 1
        from public.vinculos atual
        join public.vinculos alvo
          on alvo.user_id = p_user_id
         and alvo.status = 'ativo'
        join public.organizacoes o
          on o.id = alvo.organizacao_id
         and o.ativo = true
        where atual.user_id = auth.uid()
          and atual.status = 'ativo'
          and (
            (atual.role = 'master' and auth.jwt() ->> 'aal' = 'aal2')
            or (
              atual.role <> 'master'
              and
              atual.organizacao_id = alvo.organizacao_id
              and (
                atual.unidade_id is null
                or alvo.unidade_id is null
                or atual.unidade_id = alvo.unidade_id
              )
            )
          )
      )
    );
$$;

revoke all on function public.usuario_tem_acesso_organizacao(text) from public, anon;
revoke all on function public.usuario_tem_acesso_unidade(text, text[]) from public, anon;
revoke all on function public.usuario_tem_acesso_pedido(uuid, text[]) from public, anon;
revoke all on function public.usuario_tem_acesso_contagem(uuid) from public, anon;
revoke all on function public.usuario_pode_usar_consolidado(text, text[]) from public, anon;
revoke all on function public.usuario_pode_ver_perfil(uuid) from public, anon;

grant execute on function public.usuario_tem_acesso_organizacao(text) to authenticated;
grant execute on function public.usuario_tem_acesso_unidade(text, text[]) to authenticated;
grant execute on function public.usuario_tem_acesso_pedido(uuid, text[]) to authenticated;
grant execute on function public.usuario_tem_acesso_contagem(uuid) to authenticated;
grant execute on function public.usuario_pode_usar_consolidado(text, text[]) to authenticated;
grant execute on function public.usuario_pode_ver_perfil(uuid) to authenticated;

-- Core identity and tenant lookup policies.
drop policy if exists "perfis_select_own" on public.perfis;
drop policy if exists "perfis_select_mesma_unidade" on public.perfis;
drop policy if exists "perfis_select_autorizado" on public.perfis;
drop policy if exists "vinculos_select_own" on public.vinculos;
drop policy if exists "unidades_select_por_vinculo" on public.unidades;
drop policy if exists "organizacoes_select_por_vinculo" on public.organizacoes;
drop policy if exists "logs_auditoria_insert_own" on public.logs_auditoria;

create policy "perfis_select_autorizado" on public.perfis
  for select to authenticated
  using (public.usuario_pode_ver_perfil(id));

create policy "vinculos_select_own" on public.vinculos
  for select to authenticated
  using (user_id = auth.uid());

create policy "unidades_select_por_vinculo" on public.unidades
  for select to authenticated
  using (public.usuario_tem_acesso_unidade(id, null));

create policy "organizacoes_select_por_vinculo" on public.organizacoes
  for select to authenticated
  using (public.usuario_tem_acesso_organizacao(id));

create policy "logs_auditoria_insert_own" on public.logs_auditoria
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.usuario_tem_acesso_unidade(unidade_id, null)
  );

-- Stock tables: reads follow the tenant; catalog writes require Gestao.
drop policy if exists "produtos_select_por_vinculo" on public.produtos;
drop policy if exists "produtos_insert_gestao" on public.produtos;
drop policy if exists "produtos_update_gestao" on public.produtos;
drop policy if exists "fornecedores_select_por_vinculo" on public.fornecedores;
drop policy if exists "fornecedores_insert_gestao" on public.fornecedores;
drop policy if exists "fornecedores_update_gestao" on public.fornecedores;
drop policy if exists "contagens_select_por_vinculo" on public.contagens;
drop policy if exists "contagens_insert_por_vinculo" on public.contagens;
drop policy if exists "contagem_itens_select_por_vinculo" on public.contagem_itens;
drop policy if exists "contagem_itens_insert_por_vinculo" on public.contagem_itens;
drop policy if exists "contagem_itens_update_por_vinculo" on public.contagem_itens;

create policy "produtos_select_por_vinculo" on public.produtos
  for select to authenticated
  using (public.usuario_tem_acesso_unidade(unidade_id, null));

create policy "produtos_insert_gestao" on public.produtos
  for insert to authenticated
  with check (public.usuario_tem_acesso_unidade(unidade_id, array['gestao']));

create policy "produtos_update_gestao" on public.produtos
  for update to authenticated
  using (public.usuario_tem_acesso_unidade(unidade_id, array['gestao']))
  with check (public.usuario_tem_acesso_unidade(unidade_id, array['gestao']));

create policy "fornecedores_select_por_vinculo" on public.fornecedores
  for select to authenticated
  using (public.usuario_tem_acesso_unidade(unidade_id, null));

create policy "fornecedores_insert_gestao" on public.fornecedores
  for insert to authenticated
  with check (public.usuario_tem_acesso_unidade(unidade_id, array['gestao']));

create policy "fornecedores_update_gestao" on public.fornecedores
  for update to authenticated
  using (public.usuario_tem_acesso_unidade(unidade_id, array['gestao']))
  with check (public.usuario_tem_acesso_unidade(unidade_id, array['gestao']));

create policy "contagens_select_por_vinculo" on public.contagens
  for select to authenticated
  using (public.usuario_tem_acesso_unidade(unidade_id, null));

create policy "contagens_insert_por_vinculo" on public.contagens
  for insert to authenticated
  with check (
    public.usuario_tem_acesso_unidade(unidade_id, null)
    and criado_por = auth.uid()
  );

create policy "contagem_itens_select_por_vinculo" on public.contagem_itens
  for select to authenticated
  using (public.usuario_tem_acesso_contagem(contagem_id));

create policy "contagem_itens_insert_por_vinculo" on public.contagem_itens
  for insert to authenticated
  with check (public.usuario_tem_acesso_contagem(contagem_id));

create policy "contagem_itens_update_por_vinculo" on public.contagem_itens
  for update to authenticated
  using (public.usuario_tem_acesso_contagem(contagem_id))
  with check (public.usuario_tem_acesso_contagem(contagem_id));

-- Purchase orders: Operational may only update receipt fields. Gestao/master
-- retain the editor operations. The trigger below enforces column-level rules,
-- which RLS cannot express by itself.
drop policy if exists "pedidos_select_por_vinculo" on public.pedidos;
drop policy if exists "pedidos_insert_por_vinculo" on public.pedidos;
drop policy if exists "pedidos_update_por_vinculo" on public.pedidos;
drop policy if exists "pedido_itens_select_por_vinculo" on public.pedido_itens;
drop policy if exists "pedido_itens_insert_por_vinculo" on public.pedido_itens;
drop policy if exists "pedido_itens_update_por_vinculo" on public.pedido_itens;
drop policy if exists "pedido_itens_delete_por_vinculo" on public.pedido_itens;
drop policy if exists "pedidos_insert_gestao" on public.pedidos;
drop policy if exists "pedidos_update_recebimento_ou_gestao" on public.pedidos;
drop policy if exists "pedido_itens_insert_gestao" on public.pedido_itens;
drop policy if exists "pedido_itens_update_recebimento_ou_gestao" on public.pedido_itens;
drop policy if exists "pedido_itens_delete_gestao" on public.pedido_itens;

create policy "pedidos_select_por_vinculo" on public.pedidos
  for select to authenticated
  using (public.usuario_tem_acesso_unidade(unidade_id, null));

create policy "pedidos_insert_gestao" on public.pedidos
  for insert to authenticated
  with check (
    public.usuario_tem_acesso_unidade(unidade_id, array['gestao'])
    and criado_por = auth.uid()
  );

create policy "pedidos_update_recebimento_ou_gestao" on public.pedidos
  for update to authenticated
  using (public.usuario_tem_acesso_unidade(unidade_id, null))
  with check (public.usuario_tem_acesso_unidade(unidade_id, null));

create policy "pedido_itens_select_por_vinculo" on public.pedido_itens
  for select to authenticated
  using (public.usuario_tem_acesso_pedido(pedido_id, null));

create policy "pedido_itens_insert_gestao" on public.pedido_itens
  for insert to authenticated
  with check (public.usuario_tem_acesso_pedido(pedido_id, array['gestao']));

create policy "pedido_itens_update_recebimento_ou_gestao" on public.pedido_itens
  for update to authenticated
  using (public.usuario_tem_acesso_pedido(pedido_id, null))
  with check (public.usuario_tem_acesso_pedido(pedido_id, null));

create policy "pedido_itens_delete_gestao" on public.pedido_itens
  for delete to authenticated
  using (public.usuario_tem_acesso_pedido(pedido_id, array['gestao']));

create or replace function public.proteger_escrita_pedidos()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_gestao boolean;
begin
  -- SQL editor/service operations have no end-user auth.uid() and keep their
  -- administrative behavior. Data API requests are constrained by RLS first.
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'pedidos' then
    if tg_op = 'INSERT' then
      if not public.usuario_tem_acesso_unidade(new.unidade_id, array['gestao'])
         or new.criado_por is distinct from auth.uid() then
        raise exception 'Operacao nao autorizada para este pedido' using errcode = '42501';
      end if;
      return new;
    end if;

    if new.id is distinct from old.id
       or new.unidade_id is distinct from old.unidade_id
       or new.criado_por is distinct from old.criado_por
       or new.criado_em is distinct from old.criado_em then
      raise exception 'Campos imutaveis do pedido nao podem ser alterados' using errcode = '42501';
    end if;

    v_gestao := public.usuario_tem_acesso_unidade(old.unidade_id, array['gestao']);
    if not v_gestao and (
      new.fornecedor is distinct from old.fornecedor
      or new.data_contagem_base is distinct from old.data_contagem_base
      or new.previsao_entrega is distinct from old.previsao_entrega
    ) then
      raise exception 'Operacional so pode atualizar o recebimento' using errcode = '42501';
    end if;

    new.atualizado_em := now();
    return new;
  end if;

  -- pedido_itens
  if tg_op = 'INSERT' then
    if not public.usuario_tem_acesso_pedido(new.pedido_id, array['gestao']) then
      raise exception 'Operacao nao autorizada para este item' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not public.usuario_tem_acesso_pedido(old.pedido_id, array['gestao']) then
      raise exception 'Operacao nao autorizada para este item' using errcode = '42501';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id
     or new.pedido_id is distinct from old.pedido_id then
    raise exception 'Campos imutaveis do item nao podem ser alterados' using errcode = '42501';
  end if;

  v_gestao := public.usuario_tem_acesso_pedido(old.pedido_id, array['gestao']);
  if not v_gestao and (
    new.sku is distinct from old.sku
    or new.nome is distinct from old.nome
    or new.nome_compra is distinct from old.nome_compra
    or new.unidade_base is distinct from old.unidade_base
    or new.quantidade_pedida is distinct from old.quantidade_pedida
    or new.preco_antigo is distinct from old.preco_antigo
    or new.preco_atualizado is distinct from old.preco_atualizado
    or new.preco_confirmado is distinct from old.preco_confirmado
    or new.vencedor_confirmado is distinct from old.vencedor_confirmado
  ) then
    raise exception 'Operacional so pode atualizar quantidade recebida' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.proteger_escrita_pedidos() from public, anon, authenticated;

drop trigger if exists proteger_escrita_pedidos on public.pedidos;
create trigger proteger_escrita_pedidos
  before insert or update on public.pedidos
  for each row execute function public.proteger_escrita_pedidos();

drop trigger if exists proteger_escrita_pedido_itens on public.pedido_itens;
create trigger proteger_escrita_pedido_itens
  before insert or update or delete on public.pedido_itens
  for each row execute function public.proteger_escrita_pedidos();

-- Finance: the feature flag is now part of the database boundary, authorship
-- is bound to auth.uid(), edits require Gestao, and totals are recalculated in
-- PostgreSQL so a direct API caller cannot forge them.
drop policy if exists "consolidados_vendas_select_por_vinculo" on public.consolidados_vendas;
drop policy if exists "consolidados_vendas_insert_por_vinculo" on public.consolidados_vendas;
drop policy if exists "consolidados_vendas_update_por_vinculo" on public.consolidados_vendas;
drop policy if exists "consolidados_vendas_select_habilitado" on public.consolidados_vendas;
drop policy if exists "consolidados_vendas_insert_habilitado" on public.consolidados_vendas;
drop policy if exists "consolidados_vendas_update_gestao" on public.consolidados_vendas;

create policy "consolidados_vendas_select_habilitado" on public.consolidados_vendas
  for select to authenticated
  using (public.usuario_pode_usar_consolidado(unidade_id, null));

create policy "consolidados_vendas_insert_habilitado" on public.consolidados_vendas
  for insert to authenticated
  with check (
    public.usuario_pode_usar_consolidado(unidade_id, null)
    and criado_por = auth.uid()
  );

create policy "consolidados_vendas_update_gestao" on public.consolidados_vendas
  for update to authenticated
  using (public.usuario_pode_usar_consolidado(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_consolidado(unidade_id, array['gestao']));

create or replace function public.proteger_escrita_consolidado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      if not public.usuario_pode_usar_consolidado(new.unidade_id, null) then
        raise exception 'Consolidado nao habilitado para esta unidade' using errcode = '42501';
      end if;
      new.criado_por := auth.uid();
      new.criado_em := now();
      new.atualizado_por := null;
      new.atualizado_em := now();
    else
      if not public.usuario_pode_usar_consolidado(old.unidade_id, array['gestao']) then
        raise exception 'Operacao nao autorizada para este consolidado' using errcode = '42501';
      end if;
      if new.id is distinct from old.id
         or new.unidade_id is distinct from old.unidade_id
         or new.data is distinct from old.data
         or new.criado_por is distinct from old.criado_por
         or new.criado_em is distinct from old.criado_em then
        raise exception 'Campos imutaveis do consolidado nao podem ser alterados' using errcode = '42501';
      end if;
      new.atualizado_por := auth.uid();
      new.atualizado_em := now();
    end if;
  end if;

  new.total_formas_pagamento :=
    new.credito + new.debito + new.pix + new.dinheiro + new.vale_alimentacao;
  new.total_canais := new.salao + new.delivery_proprio;
  new.total_marketplaces := new.ifood + new.food99;
  new.faturamento_total := new.total_canais + new.total_marketplaces;
  new.diferenca := abs(new.total_formas_pagamento - new.total_canais);
  new.status := case when new.diferenca = 0 then 'conferido' else 'divergente' end;

  return new;
end;
$$;

revoke all on function public.proteger_escrita_consolidado() from public, anon, authenticated;

drop trigger if exists proteger_escrita_consolidado on public.consolidados_vendas;
create trigger proteger_escrita_consolidado
  before insert or update on public.consolidados_vendas
  for each row execute function public.proteger_escrita_consolidado();
