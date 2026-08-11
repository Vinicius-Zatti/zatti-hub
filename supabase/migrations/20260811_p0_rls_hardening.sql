-- P0 segurança multi-tenant - hardening de RLS.
--
-- Contexto: o schema já tinha RLS habilitado e policies baseadas em
-- `vinculos` (nunca em id vindo do cliente) em todas as tabelas
-- multi-tenant. Esta migração fecha três lacunas em cima disso:
--
--   1. Nenhuma policy tinha `to authenticated` explícito - sem isso, uma
--      policy no Postgres vale para PUBLIC (inclusive `anon`). Na prática o
--      `anon` já não conseguia nada porque `auth.uid()` vem nulo pra ele,
--      mas o requisito é ter isso explícito e auditável, não implícito.
--   2. `role = 'master'` dava acesso total sem exigir MFA (AAL2). Master é
--      o papel mais poderoso da plataforma (enxerga toda organização) - o
--      pacote P0 exige AAL2 pra esse papel, sem exceção mesmo se a mesma
--      conta também tiver outro papel em algum vínculo.
--   3. A lógica de "tem vínculo que alcança essa unidade/organização"
--      estava duplicada em ~15 policies quase idênticas. Consolidada em
--      3 funções auxiliares, search_path fixo, sem SECURITY DEFINER (elas
--      só leem `vinculos`/`unidades`, que o próprio chamador autenticado já
--      teria acesso via RLS de qualquer forma - nenhuma precisa rodar com
--      privilégio elevado).
--
-- Idempotente: todo `create or replace function` e `drop policy if exists`
-- + `create policy` pode rodar de novo sem erro. Reversível: ver bloco
-- "rollback" comentado no final (não roda automático - é referência pra
-- quem for reverter manualmente).

-- ── Funções auxiliares ──────────────────────────────────────────────────

create or replace function public.tem_aal2()
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_catalog
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false);
$$;

comment on function public.tem_aal2() is
  'Sessão atual completou o desafio MFA (AAL2)? Usado pra exigir MFA de quem tem papel master em qualquer policy.';

revoke all on function public.tem_aal2() from public;
grant execute on function public.tem_aal2() to authenticated;

create or replace function public.vinculo_organizacao(p_organizacao_id text)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from vinculos v
    where v.user_id = auth.uid()
      and v.status = 'ativo'
      and (
        (v.role = 'master' and public.tem_aal2())
        or v.organizacao_id = p_organizacao_id
      )
  );
$$;

comment on function public.vinculo_organizacao(text) is
  'Usuário logado tem vínculo ativo com essa organização (direto, ou master com AAL2)?';

revoke all on function public.vinculo_organizacao(text) from public;
grant execute on function public.vinculo_organizacao(text) to authenticated;

create or replace function public.vinculo_unidade(p_unidade_id text)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from vinculos v
    join unidades u on u.id = p_unidade_id
    where v.user_id = auth.uid()
      and v.status = 'ativo'
      and (
        (v.role = 'master' and public.tem_aal2())
        or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id))
      )
  );
$$;

comment on function public.vinculo_unidade(text) is
  'Usuário logado alcança essa unidade com qualquer papel (direto, dono de rede com unidade_id nulo, ou master com AAL2)?';

revoke all on function public.vinculo_unidade(text) from public;
grant execute on function public.vinculo_unidade(text) to authenticated;

create or replace function public.vinculo_unidade_gestao(p_unidade_id text)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from vinculos v
    join unidades u on u.id = p_unidade_id
    where v.user_id = auth.uid()
      and v.status = 'ativo'
      and (
        (v.role = 'master' and public.tem_aal2())
        or (v.role = 'gestao' and v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id))
      )
  );
$$;

comment on function public.vinculo_unidade_gestao(text) is
  'Igual vinculo_unidade, mas só papel gestao conta (além de master com AAL2) - cadastro/preço de produto e fornecedor.';

revoke all on function public.vinculo_unidade_gestao(text) from public;
grant execute on function public.vinculo_unidade_gestao(text) to authenticated;

-- ── organizacoes / unidades ─────────────────────────────────────────────

drop policy if exists "organizacoes_select_por_vinculo" on organizacoes;
create policy "organizacoes_select_por_vinculo" on organizacoes
  for select to authenticated
  using (public.vinculo_organizacao(id));

drop policy if exists "unidades_select_por_vinculo" on unidades;
create policy "unidades_select_por_vinculo" on unidades
  for select to authenticated
  using (public.vinculo_unidade(id));

-- ── perfis / vinculos / logs_auditoria ──────────────────────────────────
-- Sem lógica de master aqui: cada um só lê o próprio vínculo/perfil, e
-- auditoria só é gravada (nunca lida) pelo app - nada disso depende de
-- AAL2. Só adiciona `to authenticated` explícito.

drop policy if exists "perfis_select_own" on perfis;
create policy "perfis_select_own" on perfis
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "vinculos_select_own" on vinculos;
create policy "vinculos_select_own" on vinculos
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "logs_auditoria_insert_own" on logs_auditoria;
create policy "logs_auditoria_insert_own" on logs_auditoria
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "perfis_select_mesma_unidade" on perfis;
create policy "perfis_select_mesma_unidade" on perfis
  for select to authenticated
  using (
    exists (
      select 1 from vinculos v1
      join vinculos v2 on v2.user_id = perfis.id and v2.status = 'ativo'
      where v1.user_id = auth.uid() and v1.status = 'ativo'
        and (
          (v1.role = 'master' and public.tem_aal2())
          or (
            v1.organizacao_id = v2.organizacao_id
            and (v1.unidade_id is null or v2.unidade_id is null or v1.unidade_id = v2.unidade_id)
          )
        )
    )
  );

-- ── produtos / fornecedores (cadastro e preço só Gestão/master+AAL2) ────

drop policy if exists "produtos_select_por_vinculo" on produtos;
create policy "produtos_select_por_vinculo" on produtos
  for select to authenticated
  using (public.vinculo_unidade(unidade_id));

drop policy if exists "produtos_insert_gestao" on produtos;
create policy "produtos_insert_gestao" on produtos
  for insert to authenticated
  with check (public.vinculo_unidade_gestao(unidade_id));

drop policy if exists "produtos_update_gestao" on produtos;
create policy "produtos_update_gestao" on produtos
  for update to authenticated
  using (public.vinculo_unidade_gestao(unidade_id))
  with check (public.vinculo_unidade_gestao(unidade_id));

drop policy if exists "fornecedores_select_por_vinculo" on fornecedores;
create policy "fornecedores_select_por_vinculo" on fornecedores
  for select to authenticated
  using (public.vinculo_unidade(unidade_id));

drop policy if exists "fornecedores_insert_gestao" on fornecedores;
create policy "fornecedores_insert_gestao" on fornecedores
  for insert to authenticated
  with check (public.vinculo_unidade_gestao(unidade_id));

drop policy if exists "fornecedores_update_gestao" on fornecedores;
create policy "fornecedores_update_gestao" on fornecedores
  for update to authenticated
  using (public.vinculo_unidade_gestao(unidade_id))
  with check (public.vinculo_unidade_gestao(unidade_id));

-- ── contagens / contagem_itens (Gestão e Operacional, ambos) ────────────

drop policy if exists "contagens_select_por_vinculo" on contagens;
create policy "contagens_select_por_vinculo" on contagens
  for select to authenticated
  using (public.vinculo_unidade(unidade_id));

drop policy if exists "contagens_insert_por_vinculo" on contagens;
create policy "contagens_insert_por_vinculo" on contagens
  for insert to authenticated
  with check (public.vinculo_unidade(unidade_id));

drop policy if exists "contagem_itens_select_por_vinculo" on contagem_itens;
create policy "contagem_itens_select_por_vinculo" on contagem_itens
  for select to authenticated
  using (
    exists (
      select 1 from contagens c
      where c.id = contagem_itens.contagem_id
        and public.vinculo_unidade(c.unidade_id)
    )
  );

drop policy if exists "contagem_itens_insert_por_vinculo" on contagem_itens;
create policy "contagem_itens_insert_por_vinculo" on contagem_itens
  for insert to authenticated
  with check (
    exists (
      select 1 from contagens c
      where c.id = contagem_itens.contagem_id
        and public.vinculo_unidade(c.unidade_id)
    )
  );

drop policy if exists "contagem_itens_update_por_vinculo" on contagem_itens;
create policy "contagem_itens_update_por_vinculo" on contagem_itens
  for update to authenticated
  using (
    exists (
      select 1 from contagens c
      where c.id = contagem_itens.contagem_id
        and public.vinculo_unidade(c.unidade_id)
    )
  )
  with check (
    exists (
      select 1 from contagens c
      where c.id = contagem_itens.contagem_id
        and public.vinculo_unidade(c.unidade_id)
    )
  );

-- ── pedidos / pedido_itens ───────────────────────────────────────────────
-- UPDATE fica aberto pra qualquer vínculo ativo (Gestão e Operacional
-- precisam mexer aqui - preço/quantidade pedida só Gestão, recebido só
-- Operacional também pode) de propósito: o recorte fino de coluna é feito
-- na Server Action (`requireGestao()` em salvar pedido, `atualizarRecebimento`
-- só toca campo de recebimento em qualquer chamada - ver src/lib/pedidos.ts
-- e src/lib/acesso.ts). RLS aqui é a barreira de tenant/unidade, não de
-- papel dentro da unidade.

drop policy if exists "pedidos_select_por_vinculo" on pedidos;
create policy "pedidos_select_por_vinculo" on pedidos
  for select to authenticated
  using (public.vinculo_unidade(unidade_id));

drop policy if exists "pedidos_insert_por_vinculo" on pedidos;
create policy "pedidos_insert_por_vinculo" on pedidos
  for insert to authenticated
  with check (public.vinculo_unidade(unidade_id));

drop policy if exists "pedidos_update_por_vinculo" on pedidos;
create policy "pedidos_update_por_vinculo" on pedidos
  for update to authenticated
  using (public.vinculo_unidade(unidade_id))
  with check (public.vinculo_unidade(unidade_id));

drop policy if exists "pedido_itens_select_por_vinculo" on pedido_itens;
create policy "pedido_itens_select_por_vinculo" on pedido_itens
  for select to authenticated
  using (
    exists (
      select 1 from pedidos p
      where p.id = pedido_itens.pedido_id
        and public.vinculo_unidade(p.unidade_id)
    )
  );

drop policy if exists "pedido_itens_insert_por_vinculo" on pedido_itens;
create policy "pedido_itens_insert_por_vinculo" on pedido_itens
  for insert to authenticated
  with check (
    exists (
      select 1 from pedidos p
      where p.id = pedido_itens.pedido_id
        and public.vinculo_unidade(p.unidade_id)
    )
  );

drop policy if exists "pedido_itens_update_por_vinculo" on pedido_itens;
create policy "pedido_itens_update_por_vinculo" on pedido_itens
  for update to authenticated
  using (
    exists (
      select 1 from pedidos p
      where p.id = pedido_itens.pedido_id
        and public.vinculo_unidade(p.unidade_id)
    )
  )
  with check (
    exists (
      select 1 from pedidos p
      where p.id = pedido_itens.pedido_id
        and public.vinculo_unidade(p.unidade_id)
    )
  );

drop policy if exists "pedido_itens_delete_por_vinculo" on pedido_itens;
create policy "pedido_itens_delete_por_vinculo" on pedido_itens
  for delete to authenticated
  using (
    exists (
      select 1 from pedidos p
      where p.id = pedido_itens.pedido_id
        and public.vinculo_unidade(p.unidade_id)
    )
  );

-- ── consolidados_vendas ──────────────────────────────────────────────────
-- Mesmo padrão de pedidos: UPDATE aberto pra qualquer vínculo no banco, só
-- Gestão/master edita de fato porque a Server Action de editar chama
-- `requireGestao()` antes (ver src/app/(app)/financeiro/consolidado/actions.ts).

drop policy if exists "consolidados_vendas_select_por_vinculo" on consolidados_vendas;
create policy "consolidados_vendas_select_por_vinculo" on consolidados_vendas
  for select to authenticated
  using (public.vinculo_unidade(unidade_id));

drop policy if exists "consolidados_vendas_insert_por_vinculo" on consolidados_vendas;
create policy "consolidados_vendas_insert_por_vinculo" on consolidados_vendas
  for insert to authenticated
  with check (public.vinculo_unidade(unidade_id));

drop policy if exists "consolidados_vendas_update_por_vinculo" on consolidados_vendas;
create policy "consolidados_vendas_update_por_vinculo" on consolidados_vendas
  for update to authenticated
  using (public.vinculo_unidade(unidade_id))
  with check (public.vinculo_unidade(unidade_id));

-- ── rollback manual (referência, não executa) ────────────────────────────
-- drop policy ... on <tabela>; recriar com o texto de supabase/schema.sql +
-- supabase/migrations/20260807_estoque_no_banco.sql (sem `to authenticated`
-- nem checagem de AAL2). drop function public.tem_aal2(),
-- public.vinculo_organizacao(text), public.vinculo_unidade(text),
-- public.vinculo_unidade_gestao(text) só depois de recriar as policies que
-- dependem delas (senão a criação da policy antiga falha por função
-- inexistente sendo referenciada em policy ainda ativa de outra tabela).
