-- Rollback executável e completo do pacote P0, na ordem que realmente
-- funciona (testada de ponta a ponta em banco Docker descartável - ver
-- registro de sessão / relatório de entrega, não só narrado em
-- comentário). Cobre as 4 migrations do P0: 20260811090000_p0_rls_hardening,
-- 20260811093000_p0_rate_limiting, 20260812000000_grants_tabelas_aplicacao,
-- e devolve o schema ao estado imediatamente anterior a essas três (ou
-- seja, ao estado logo depois de 20260807103000_faturamento_total_por_canais).
--
-- NÃO reverte 20260722_schema_base nem as quatro migrations de 20260807 -
-- essas não são "pacote P0", são a base/estoque que já existia antes.
--
-- Uso: só em banco descartável (local Docker) ou mediante nova
-- autorização explícita para produção/staging - este arquivo nunca deve
-- ser aplicado sozinho sem alguém ler e confirmar cada bloco antes.
--
-- Ordem (motivo de cada passo comentado inline):
--   1. Revoga os GRANTs novos (não depende de mais nada, pode ser o
--      primeiro ou o último - feito primeiro aqui por clareza).
--   2. Derruba as 27 policies "hardened" do RLS hardening.
--   3. Derruba a função e a tabela do rate limiting.
--   4. Derruba as 4 funções auxiliares (só funciona DEPOIS do passo 2 -
--      com qualquer policy hardened ainda ativa, falha com "cannot drop
--      function because other objects depend on it", confirmado com
--      prova negativa na sessão de testes).
--   5. Recria as policies originais (pré-P0), tabela por tabela.

begin;

-- ── 1. Revoga os GRANTs de 20260812000000_grants_tabelas_aplicacao ─────

revoke select, insert, update, delete on table
  public.organizacoes,
  public.unidades,
  public.perfis,
  public.vinculos,
  public.logs_auditoria,
  public.pedidos,
  public.pedido_itens,
  public.consolidados_vendas,
  public.produtos,
  public.fornecedores,
  public.contagens,
  public.contagem_itens
from authenticated, service_role;

-- ── 2. Derruba as 27 policies "hardened" (to authenticated + AAL2) ─────

drop policy if exists "organizacoes_select_por_vinculo" on organizacoes;
drop policy if exists "unidades_select_por_vinculo" on unidades;
drop policy if exists "perfis_select_own" on perfis;
drop policy if exists "vinculos_select_own" on vinculos;
drop policy if exists "logs_auditoria_insert_own" on logs_auditoria;
drop policy if exists "perfis_select_mesma_unidade" on perfis;
drop policy if exists "produtos_select_por_vinculo" on produtos;
drop policy if exists "produtos_insert_gestao" on produtos;
drop policy if exists "produtos_update_gestao" on produtos;
drop policy if exists "fornecedores_select_por_vinculo" on fornecedores;
drop policy if exists "fornecedores_insert_gestao" on fornecedores;
drop policy if exists "fornecedores_update_gestao" on fornecedores;
drop policy if exists "contagens_select_por_vinculo" on contagens;
drop policy if exists "contagens_insert_por_vinculo" on contagens;
drop policy if exists "contagem_itens_select_por_vinculo" on contagem_itens;
drop policy if exists "contagem_itens_insert_por_vinculo" on contagem_itens;
drop policy if exists "contagem_itens_update_por_vinculo" on contagem_itens;
drop policy if exists "pedidos_select_por_vinculo" on pedidos;
drop policy if exists "pedidos_insert_por_vinculo" on pedidos;
drop policy if exists "pedidos_update_por_vinculo" on pedidos;
drop policy if exists "pedido_itens_select_por_vinculo" on pedido_itens;
drop policy if exists "pedido_itens_insert_por_vinculo" on pedido_itens;
drop policy if exists "pedido_itens_update_por_vinculo" on pedido_itens;
drop policy if exists "pedido_itens_delete_por_vinculo" on pedido_itens;
drop policy if exists "consolidados_vendas_select_por_vinculo" on consolidados_vendas;
drop policy if exists "consolidados_vendas_insert_por_vinculo" on consolidados_vendas;
drop policy if exists "consolidados_vendas_update_por_vinculo" on consolidados_vendas;

-- ── 3. Derruba rate limiting (20260811093000_p0_rate_limiting) ─────────

drop function if exists public.checar_rate_limit(text, text, integer, integer);
drop table if exists public.limites_taxa;

-- ── 4. Derruba as 4 funções auxiliares - só depois do passo 2 ──────────

drop function if exists public.vinculo_unidade_gestao(text);
drop function if exists public.vinculo_unidade(text);
drop function if exists public.vinculo_organizacao(text);
drop function if exists public.tem_aal2();

-- ── 5. Recria as policies originais (texto exato de schema_base.sql e
-- estoque_no_banco.sql - as duas migrations que o P0 substituiu) ───────

-- schema_base.sql: organizacoes, unidades, perfis, vinculos, logs_auditoria

create policy "perfis_select_own" on perfis
  for select using (id = auth.uid());

create policy "vinculos_select_own" on vinculos
  for select using (user_id = auth.uid());

create policy "unidades_select_por_vinculo" on unidades
  for select using (
    exists (
      select 1 from vinculos v
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = unidades.organizacao_id and (v.unidade_id is null or v.unidade_id = unidades.id)))
    )
  );

create policy "organizacoes_select_por_vinculo" on organizacoes
  for select using (
    exists (
      select 1 from vinculos v
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or v.organizacao_id = organizacoes.id)
    )
  );

create policy "logs_auditoria_insert_own" on logs_auditoria
  for insert with check (user_id = auth.uid());

-- schema_base.sql: pedidos, pedido_itens

create policy "pedidos_select_por_vinculo" on pedidos
  for select using (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = pedidos.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "pedidos_insert_por_vinculo" on pedidos
  for insert with check (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = pedidos.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "pedidos_update_por_vinculo" on pedidos
  for update using (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = pedidos.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "pedido_itens_select_por_vinculo" on pedido_itens
  for select using (
    exists (
      select 1 from pedidos p
      join unidades u on u.id = p.unidade_id
      join vinculos v on v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
      where p.id = pedido_itens.pedido_id
    )
  );

create policy "pedido_itens_insert_por_vinculo" on pedido_itens
  for insert with check (
    exists (
      select 1 from pedidos p
      join unidades u on u.id = p.unidade_id
      join vinculos v on v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
      where p.id = pedido_itens.pedido_id
    )
  );

create policy "pedido_itens_update_por_vinculo" on pedido_itens
  for update using (
    exists (
      select 1 from pedidos p
      join unidades u on u.id = p.unidade_id
      join vinculos v on v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
      where p.id = pedido_itens.pedido_id
    )
  );

create policy "pedido_itens_delete_por_vinculo" on pedido_itens
  for delete using (
    exists (
      select 1 from pedidos p
      join unidades u on u.id = p.unidade_id
      join vinculos v on v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
      where p.id = pedido_itens.pedido_id
    )
  );

-- schema_base.sql: consolidados_vendas, perfis (segunda policy)

create policy "consolidados_vendas_select_por_vinculo" on consolidados_vendas
  for select using (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = consolidados_vendas.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "consolidados_vendas_insert_por_vinculo" on consolidados_vendas
  for insert with check (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = consolidados_vendas.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "consolidados_vendas_update_por_vinculo" on consolidados_vendas
  for update using (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = consolidados_vendas.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "perfis_select_mesma_unidade" on perfis
  for select using (
    exists (
      select 1 from vinculos v1
      join vinculos v2 on v2.user_id = perfis.id and v2.status = 'ativo'
      where v1.user_id = auth.uid() and v1.status = 'ativo'
        and (
          v1.role = 'master'
          or (v1.organizacao_id = v2.organizacao_id and (v1.unidade_id is null or v2.unidade_id is null or v1.unidade_id = v2.unidade_id))
        )
    )
  );

-- estoque_no_banco.sql: produtos, fornecedores, contagens, contagem_itens

create policy "produtos_select_por_vinculo" on produtos
  for select using (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = produtos.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "fornecedores_select_por_vinculo" on fornecedores
  for select using (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = fornecedores.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "produtos_insert_gestao" on produtos
  for insert with check (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = produtos.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.role = 'gestao' and v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "produtos_update_gestao" on produtos
  for update using (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = produtos.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.role = 'gestao' and v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "fornecedores_insert_gestao" on fornecedores
  for insert with check (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = fornecedores.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.role = 'gestao' and v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "fornecedores_update_gestao" on fornecedores
  for update using (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = fornecedores.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.role = 'gestao' and v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "contagens_select_por_vinculo" on contagens
  for select using (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = contagens.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "contagens_insert_por_vinculo" on contagens
  for insert with check (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = contagens.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "contagem_itens_select_por_vinculo" on contagem_itens
  for select using (
    exists (
      select 1 from contagens c
      join unidades u on u.id = c.unidade_id
      join vinculos v on v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
      where c.id = contagem_itens.contagem_id
    )
  );

create policy "contagem_itens_insert_por_vinculo" on contagem_itens
  for insert with check (
    exists (
      select 1 from contagens c
      join unidades u on u.id = c.unidade_id
      join vinculos v on v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
      where c.id = contagem_itens.contagem_id
    )
  );

create policy "contagem_itens_update_por_vinculo" on contagem_itens
  for update using (
    exists (
      select 1 from contagens c
      join unidades u on u.id = c.unidade_id
      join vinculos v on v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
      where c.id = contagem_itens.contagem_id
    )
  );

commit;

select 'rollback completo do pacote P0: sucesso' as status;
