-- Leitura das contagens sem estourar o tempo limite (13/10/2026).
-- A cotação da The House caiu com "canceling statement due to statement
-- timeout" em "carregar o escopo da contagem" e "carregar os itens contados":
-- a policy de leitura chamava usuario_tem_acesso_contagem(contagem_id) uma vez
-- por LINHA (cada chamada confere sessão, vínculo e unidade), e a RLS roda antes
-- do filtro da consulta, então a conta cresce com a tabela inteira.
--
-- Mesma regra de acesso, conferida uma vez por CONTAGEM: o subselect não depende
-- da linha, vira um conjunto calculado uma vez por consulta. Quem via continua
-- vendo exatamente o mesmo; só muda o custo.

drop policy if exists "contagem_itens_select_por_vinculo" on public.contagem_itens;
create policy "contagem_itens_select_por_vinculo" on public.contagem_itens
  for select to authenticated
  using (
    contagem_id in (
      select c.id from public.contagens c
      where public.usuario_tem_acesso_unidade(c.unidade_id, null)
    )
  );

drop policy if exists "contagem_escopo_select_por_vinculo" on public.contagem_escopo;
create policy "contagem_escopo_select_por_vinculo" on public.contagem_escopo
  for select to authenticated
  using (
    contagem_id in (
      select c.id from public.contagens c
      where public.usuario_tem_acesso_unidade(c.unidade_id, null)
    )
  );

drop policy if exists "contagem_setores_select_por_vinculo" on public.contagem_setores;
create policy "contagem_setores_select_por_vinculo" on public.contagem_setores
  for select to authenticated
  using (
    contagem_id in (
      select c.id from public.contagens c
      where public.usuario_tem_acesso_unidade(c.unidade_id, null)
    )
  );

drop policy if exists "contagem_envios_select_por_vinculo" on public.contagem_envios;
create policy "contagem_envios_select_por_vinculo" on public.contagem_envios
  for select to authenticated
  using (
    contagem_id in (
      select c.id from public.contagens c
      where public.usuario_tem_acesso_unidade(c.unidade_id, null)
    )
  );
