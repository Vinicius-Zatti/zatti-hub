-- RLS fase 2 (22/10/2026): leitura por "conjunto de unidades acessíveis" em vez de checagem por linha.
--
-- Antes, cada linha lida de produtos, contagens, pedidos, fin_* etc. chamava
-- `usuario_tem_acesso_unidade(unidade_id)` (ou `usuario_pode_usar_financeiro_gerencial`), que faz
-- joins em unidades/organizacoes/vinculos e confere a sessão a cada linha. Numa tabela de 2.000
-- produtos isso é 2.000 execuções. Agora a policy de SELECT usa
-- `unidade_id in (select public.unidades_acessiveis())`: o Postgres calcula a lista de unidades
-- uma vez por consulta e filtra as linhas contra ela.
--
-- Regra de acesso NÃO muda: as duas funções novas espelham exatamente as vigentes
--   - usuario_tem_acesso_unidade            (20261011120000_equipe_cliente.sql)
--   - usuario_pode_usar_financeiro_gerencial (20261011150000_financeiro_v2_acesso_unidade.sql)
-- e o pgTAP rls_fase2_unidades_acessiveis.sql compara as duas formas unidade por unidade.
--
-- Só policies de SELECT mudam (via ALTER POLICY, mantendo nome, papel e comando). INSERT, UPDATE e
-- DELETE continuam com as funções por linha. Ficam de fora as tabelas da Conciliação
-- (usuario_pode_usar_conciliacao) e fin_regras_classificacao_versoes (depende da regra).
--
-- Desfazer: reaplicar as policies de SELECT das migrações de origem (o texto antigo de cada uma
-- está no comentário ao lado) e `drop function public.unidades_financeiro_acessiveis(text[]),
-- public.unidades_acessiveis(text[]);`.
begin;

-- ── Funções ────────────────────────────────────────────────────────────────

-- Mesmas condições de usuario_tem_acesso_unidade(p_unidade_id, p_papeis), devolvendo o conjunto
-- de unidades em que ela daria true. As condições globais (sessão vigente e segundo fator de
-- master) não dependem da unidade e viram filtro único.
create or replace function public.unidades_acessiveis(p_papeis text[] default null)
returns setof text
language sql
stable
security definer
set search_path = ''
rows 20
as $$
  select u.id
  from public.unidades u
  join public.organizacoes o on o.id = u.organizacao_id
  where auth.uid() is not null
    and public.sessao_vigente()
    and (
      auth.jwt() ->> 'aal' = 'aal2'
      or not exists (
        select 1 from public.vinculos vm
        where vm.user_id = auth.uid()
          and vm.status = 'ativo'
          and vm.role = 'master'
      )
    )
    and u.ativo = true
    and o.ativo = true
    and exists (
      select 1
      from public.vinculos v
      where v.user_id = auth.uid()
        and v.status = 'ativo'
        and (
          (v.role = 'master' and auth.jwt() ->> 'aal' = 'aal2')
          or (
            v.role <> 'master'
            and v.organizacao_id = u.organizacao_id
            and (v.unidade_id is null or v.unidade_id = u.id)
            and (p_papeis is null or v.role = any (p_papeis))
          )
        )
    );
$$;

-- Mesmas condições de usuario_pode_usar_financeiro_gerencial(p_unidade_id, p_papeis).
create or replace function public.unidades_financeiro_acessiveis(p_papeis text[] default null)
returns setof text
language sql
stable
security definer
set search_path = ''
rows 20
as $$
  select u.id
  from public.unidades u
  where u.id in (select public.unidades_acessiveis(p_papeis))
    and u.financeiro_gerencial_habilitado = true
    and (u.financeiro_liberado_equipe or public.usuario_e_titular_financeiro());
$$;

revoke all on function public.unidades_acessiveis(text[]) from public, anon;
revoke all on function public.unidades_financeiro_acessiveis(text[]) from public, anon;
grant execute on function public.unidades_acessiveis(text[]) to authenticated;
grant execute on function public.unidades_financeiro_acessiveis(text[]) to authenticated;

-- ── Estoque e cadastro ─────────────────────────────────────────────────────

-- antes: usuario_tem_acesso_unidade(id, null)
alter policy unidades_select_por_vinculo on public.unidades
  using (id in (select public.unidades_acessiveis()));

-- antes: usuario_tem_acesso_unidade(unidade_id, null)
alter policy produtos_select_por_vinculo on public.produtos
  using (unidade_id in (select public.unidades_acessiveis()));
alter policy contagens_select_por_vinculo on public.contagens
  using (unidade_id in (select public.unidades_acessiveis()));
alter policy pedidos_select_por_vinculo on public.pedidos
  using (unidade_id in (select public.unidades_acessiveis()));

-- antes: contagem_id in (select c.id from contagens c where usuario_tem_acesso_unidade(c.unidade_id, null))
alter policy contagem_itens_select_por_vinculo on public.contagem_itens
  using (contagem_id in (
    select c.id from public.contagens c where c.unidade_id in (select public.unidades_acessiveis())
  ));
alter policy contagem_escopo_select_por_vinculo on public.contagem_escopo
  using (contagem_id in (
    select c.id from public.contagens c where c.unidade_id in (select public.unidades_acessiveis())
  ));
alter policy contagem_setores_select_por_vinculo on public.contagem_setores
  using (contagem_id in (
    select c.id from public.contagens c where c.unidade_id in (select public.unidades_acessiveis())
  ));
alter policy contagem_envios_select_por_vinculo on public.contagem_envios
  using (contagem_id in (
    select c.id from public.contagens c where c.unidade_id in (select public.unidades_acessiveis())
  ));

-- antes: usuario_tem_acesso_pedido(pedido_id, null)
alter policy pedido_itens_select_por_vinculo on public.pedido_itens
  using (pedido_id in (
    select p.id from public.pedidos p where p.unidade_id in (select public.unidades_acessiveis())
  ));

-- ── Financeiro Gerencial ───────────────────────────────────────────────────

-- antes: usuario_pode_usar_financeiro_gerencial(unidade_id, null)
do $$
declare
  t text;
begin
  foreach t in array array[
    'fin_baixas', 'fin_caixa_entrada', 'fin_caixa_entrada_pastas', 'fin_categorias',
    'fin_contas_financeiras', 'fin_contrapartes', 'fin_documentos', 'fin_estoque_mensal',
    'fin_fatura_pagamentos', 'fin_faturas_cartao', 'fin_fechamentos', 'fin_lancamentos',
    'fin_metas_unidade', 'fin_parcelas', 'fin_provisoes_parametros', 'fin_provisoes_reversoes',
    'fin_recorrencias', 'fin_saidas_sem_receita', 'fin_transferencias'
  ] loop
    execute format(
      'alter policy %I on public.%I using (unidade_id in (select public.unidades_financeiro_acessiveis()))',
      t || '_select', t
    );
  end loop;
end;
$$;

-- antes: usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao'])
alter policy fin_alerta_destinatarios_select on public.fin_alerta_destinatarios
  using (unidade_id in (select public.unidades_financeiro_acessiveis(array['gestao'])));
alter policy fin_caixa_entrada_remetentes_select on public.fin_caixa_entrada_remetentes
  using (unidade_id in (select public.unidades_financeiro_acessiveis(array['gestao'])));

commit;
