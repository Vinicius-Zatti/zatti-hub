-- RLS fase 2 (22/10/2026): policies de SELECT por conjunto de unidades acessíveis.
-- Prova que a troca não muda quem vê o quê: as funções novas devolvem exatamente as unidades em que
-- usuario_tem_acesso_unidade / usuario_pode_usar_financeiro_gerencial dariam true, e as tabelas
-- seguem isoladas entre clientes. Fixtures isoladas, sem dado real.

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

update fin_acesso_exclusivo set ativo = true where id;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000f6001', 'gestao.a.rls2@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f6002', 'oper.a1.rls2@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f6003', 'gestao.b.rls2@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f6004', 'master.rls2@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f6005', 'sem.vinculo.rls2@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-rls2-a', 'Cliente A', 'saas', true), ('org-rls2-b', 'Cliente B', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, financeiro_gerencial_habilitado, financeiro_liberado_equipe) values
  ('uni-rls2-a1', 'org-rls2-a', 'A1', 'banco', true, true, true),
  ('uni-rls2-a2', 'org-rls2-a', 'A2', 'banco', true, true, false),
  ('uni-rls2-a3', 'org-rls2-a', 'A3 inativa', 'banco', false, true, true),
  ('uni-rls2-b1', 'org-rls2-b', 'B1', 'banco', true, true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000f6001', 'org-rls2-a', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f6002', 'org-rls2-a', 'uni-rls2-a1', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000f6003', 'org-rls2-b', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f6004', 'org-rls2-a', null, 'master', 'ativo');
insert into fin_acesso_titulares (user_id) values ('00000000-0000-0000-0000-0000000f6004');

-- Um produto, uma contagem com item, um pedido com item e uma conta financeira por unidade.
insert into produtos (unidade_id, sku, grupo, nome, unidade_base, preco_unitario, ativo)
  select u, 'HORLIM001', 'HOR', 'limao', 'KG', 10, true
  from unnest(array['uni-rls2-a1', 'uni-rls2-a2', 'uni-rls2-a3', 'uni-rls2-b1']) u;
insert into contagens (id, unidade_id, data, mes, modalidade) values
  ('00000000-0000-0000-0000-0000000f6c01', 'uni-rls2-a1', '2026-10-01', 'teste', 'legada'),
  ('00000000-0000-0000-0000-0000000f6c02', 'uni-rls2-a2', '2026-10-01', 'teste', 'legada'),
  ('00000000-0000-0000-0000-0000000f6c03', 'uni-rls2-a3', '2026-10-01', 'teste', 'legada'),
  ('00000000-0000-0000-0000-0000000f6c04', 'uni-rls2-b1', '2026-10-01', 'teste', 'legada');
insert into contagem_itens (contagem_id, sku, grupo, nome, unidade_base, quantidade, preco_unitario, total)
  select c.id, 'HORLIM001', 'HOR', 'limao', 'KG', 1, 10, 10 from contagens c where c.unidade_id like 'uni-rls2-%';
insert into pedidos (id, unidade_id, fornecedor, data_contagem_base, criado_por, recebido) values
  ('00000000-0000-0000-0000-0000000f6d01', 'uni-rls2-a1', 'F', '2026-10-01', '00000000-0000-0000-0000-0000000f6001', false),
  ('00000000-0000-0000-0000-0000000f6d02', 'uni-rls2-a2', 'F', '2026-10-01', '00000000-0000-0000-0000-0000000f6001', false),
  ('00000000-0000-0000-0000-0000000f6d03', 'uni-rls2-a3', 'F', '2026-10-01', '00000000-0000-0000-0000-0000000f6001', false),
  ('00000000-0000-0000-0000-0000000f6d04', 'uni-rls2-b1', 'F', '2026-10-01', '00000000-0000-0000-0000-0000000f6003', false);
insert into pedido_itens (pedido_id, sku, nome, unidade_base, quantidade_pedida, preco_antigo, preco_atualizado, preco_confirmado, vencedor_confirmado)
  select p.id, 'HORLIM001', 'limao', 'KG', 5, 10, 8, true, true from pedidos p where p.unidade_id like 'uni-rls2-%';
insert into fin_contas_financeiras (unidade_id, nome, tipo)
  select u, 'Banco', 'banco' from unnest(array['uni-rls2-a1', 'uni-rls2-a2', 'uni-rls2-a3', 'uni-rls2-b1']) u;

-- Todas as unidades do banco (inclusive as que não são deste teste), lidas antes de trocar de papel.
create temp table todas_unidades as select id from unidades;
grant select on todas_unidades to authenticated;

create function pg_temp.como(p_user text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

-- Quantas unidades a forma nova e a antiga classificam diferente (tem de ser 0), com e sem papel.
create function pg_temp.divergencias() returns int language sql as $$
  select (
    (select count(*) from todas_unidades t
      where (t.id in (select public.unidades_acessiveis()))
        is distinct from public.usuario_tem_acesso_unidade(t.id, null))
  + (select count(*) from todas_unidades t
      where (t.id in (select public.unidades_acessiveis(array['gestao'])))
        is distinct from public.usuario_tem_acesso_unidade(t.id, array['gestao']))
  + (select count(*) from todas_unidades t
      where (t.id in (select public.unidades_acessiveis(array['operacional'])))
        is distinct from public.usuario_tem_acesso_unidade(t.id, array['operacional']))
  + (select count(*) from todas_unidades t
      where (t.id in (select public.unidades_financeiro_acessiveis()))
        is distinct from public.usuario_pode_usar_financeiro_gerencial(t.id, null))
  + (select count(*) from todas_unidades t
      where (t.id in (select public.unidades_financeiro_acessiveis(array['gestao'])))
        is distinct from public.usuario_pode_usar_financeiro_gerencial(t.id, array['gestao']))
  )::int;
$$;

-- Unidades deste teste que o usuário atual enxerga em cada tabela (lista ordenada, '' = nenhuma).
create function pg_temp.vistas(p_tabela text) returns text language plpgsql as $$
declare v text;
begin
  execute case p_tabela
    when 'unidades' then
      $q$select string_agg(id, ',' order by id) from public.unidades where id like 'uni-rls2-%'$q$
    when 'contagem_itens' then
      $q$select string_agg(distinct c.unidade_id, ',' order by c.unidade_id) from public.contagem_itens i
         join public.contagens c on c.id = i.contagem_id where c.unidade_id like 'uni-rls2-%'$q$
    when 'pedido_itens' then
      $q$select string_agg(distinct p.unidade_id, ',' order by p.unidade_id) from public.pedido_itens i
         join public.pedidos p on p.id = i.pedido_id where p.unidade_id like 'uni-rls2-%'$q$
    else format($q$select string_agg(distinct unidade_id, ',' order by unidade_id) from public.%I
                   where unidade_id like 'uni-rls2-%%'$q$, p_tabela)
  end into v;
  return coalesce(v, '');
end;
$$;

select ok(not has_function_privilege('anon', 'public.unidades_acessiveis(text[])', 'EXECUTE'),
  'anon não executa unidades_acessiveis');
select ok(not has_function_privilege('anon', 'public.unidades_financeiro_acessiveis(text[])', 'EXECUTE'),
  'anon não executa unidades_financeiro_acessiveis');
select ok(has_function_privilege('authenticated', 'public.unidades_acessiveis(text[])', 'EXECUTE'),
  'authenticated executa unidades_acessiveis');
select ok(has_function_privilege('authenticated', 'public.unidades_financeiro_acessiveis(text[])', 'EXECUTE'),
  'authenticated executa unidades_financeiro_acessiveis');

set local role authenticated;

-- ── Gestão do cliente A: as duas unidades ativas de A, nada de B ──
select pg_temp.como('00000000-0000-0000-0000-0000000f6001');
select is(pg_temp.divergencias(), 0, 'Gestão A: forma nova = regra antiga em todas as unidades');
select is(pg_temp.vistas('unidades'), 'uni-rls2-a1,uni-rls2-a2', 'Gestão A vê só as unidades ativas de A');
select is(pg_temp.vistas('produtos'), 'uni-rls2-a1,uni-rls2-a2', 'Gestão A vê produtos só de A');
select is(pg_temp.vistas('contagem_itens'), 'uni-rls2-a1,uni-rls2-a2', 'Gestão A vê itens de contagem só de A');
select is(pg_temp.vistas('pedido_itens'), 'uni-rls2-a1,uni-rls2-a2', 'Gestão A vê itens de pedido só de A');
select is(pg_temp.vistas('fin_contas_financeiras'), 'uni-rls2-a1', 'Gestão A vê o Financeiro só da unidade liberada');

-- ── Operacional de A1: só A1 ──
select pg_temp.como('00000000-0000-0000-0000-0000000f6002');
select is(pg_temp.divergencias(), 0, 'Operacional A1: forma nova = regra antiga em todas as unidades');
select is(pg_temp.vistas('unidades'), 'uni-rls2-a1', 'Operacional vê só a própria unidade');
select is(pg_temp.vistas('produtos'), 'uni-rls2-a1', 'Operacional vê produtos só da própria unidade');
select is(pg_temp.vistas('contagem_itens'), 'uni-rls2-a1', 'Operacional vê itens de contagem só da própria unidade');
select is(pg_temp.vistas('pedido_itens'), 'uni-rls2-a1', 'Operacional vê itens de pedido só da própria unidade');
select is(pg_temp.vistas('fin_contas_financeiras'), 'uni-rls2-a1', 'Operacional segue vendo o Financeiro da unidade liberada');

-- ── Gestão do cliente B: nada de A ──
select pg_temp.como('00000000-0000-0000-0000-0000000f6003');
select is(pg_temp.divergencias(), 0, 'Gestão B: forma nova = regra antiga em todas as unidades');
select is(pg_temp.vistas('unidades'), 'uni-rls2-b1', 'Gestão B não vê unidades de A');
select is(pg_temp.vistas('produtos'), 'uni-rls2-b1', 'Gestão B não vê produtos de A');
select is(pg_temp.vistas('contagem_itens'), 'uni-rls2-b1', 'Gestão B não vê contagens de A');
select is(pg_temp.vistas('pedido_itens'), 'uni-rls2-b1', 'Gestão B não vê pedidos de A');
select is(pg_temp.vistas('fin_contas_financeiras'), 'uni-rls2-b1', 'Gestão B não vê o Financeiro de A');

-- ── Master com segundo fator e titular do Financeiro: todas as unidades ativas ──
select pg_temp.como('00000000-0000-0000-0000-0000000f6004', 'aal2');
select is(pg_temp.divergencias(), 0, 'Master: forma nova = regra antiga em todas as unidades');
select is(pg_temp.vistas('unidades'), 'uni-rls2-a1,uni-rls2-a2,uni-rls2-b1', 'Master vê as unidades ativas de todos os clientes');
select is(pg_temp.vistas('produtos'), 'uni-rls2-a1,uni-rls2-a2,uni-rls2-b1', 'Master vê produtos de todos os clientes');
select is(pg_temp.vistas('pedido_itens'), 'uni-rls2-a1,uni-rls2-a2,uni-rls2-b1', 'Master vê pedidos de todos os clientes');
select is(pg_temp.vistas('fin_contas_financeiras'), 'uni-rls2-a1,uni-rls2-a2,uni-rls2-b1',
  'Master titular vê o Financeiro de todas as unidades habilitadas');

-- ── Master sem segundo fator e usuário sem vínculo: nada ──
select pg_temp.como('00000000-0000-0000-0000-0000000f6004', 'aal1');
select is(pg_temp.divergencias(), 0, 'Master sem segundo fator: forma nova = regra antiga');
select is(pg_temp.vistas('produtos'), '', 'Master sem segundo fator não vê produtos');
select pg_temp.como('00000000-0000-0000-0000-0000000f6005');
select is(pg_temp.divergencias(), 0, 'Sem vínculo: forma nova = regra antiga');

select * from finish();
rollback;
