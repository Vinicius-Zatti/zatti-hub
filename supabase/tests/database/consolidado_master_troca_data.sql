-- Consolidado de Vendas: só o master troca a data de um dia já lançado
-- (06/11/2026). Prova: master com aal2 troca; master sem aal2, gestão e
-- operacional do cliente não; trocar para um dia já lançado falha no UNIQUE
-- sem sobrescrever; master lança qualquer data. Só fixtures de teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000c601', 'ctd-master@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c602', 'ctd-gestao@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c603', 'ctd-oper@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-ctd', 'Cliente CTD', 'saas', true),
  ('org-ctd-master', 'Zatti CTD', 'saas', true);

insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, consolidado_vendas_habilitado) values
  ('ctd-1', 'org-ctd', 'Loja CTD', 'banco', true, true);

insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000c6a01', '00000000-0000-0000-0000-00000000c601', 'org-ctd-master', null, 'master', 'ativo'),
  ('00000000-0000-0000-0000-0000000c6a02', '00000000-0000-0000-0000-00000000c602', 'org-ctd', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000c6a03', '00000000-0000-0000-0000-00000000c603', 'org-ctd', 'ctd-1', 'operacional', 'ativo');

insert into consolidados_vendas (id, unidade_id, data, credito, salao, criado_por) values
  ('00000000-0000-0000-0000-0000000c6b01', 'ctd-1', '2026-11-06', 10, 10, '00000000-0000-0000-0000-00000000c603'),
  ('00000000-0000-0000-0000-0000000c6b02', 'ctd-1', '2026-11-04', 20, 20, '00000000-0000-0000-0000-00000000c603');

create or replace function pg_temp.como(p_user text, p_aal text default 'aal1')
returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

-- Gestão do cliente: edita valores, mas não troca a data.
select pg_temp.como('00000000-0000-0000-0000-00000000c602');
select lives_ok(
  $$update consolidados_vendas set credito = 11, salao = 11 where id = '00000000-0000-0000-0000-0000000c6b01'$$,
  'gestão edita valores como hoje');
select throws_ok(
  $$update consolidados_vendas set data = '2026-11-05' where id = '00000000-0000-0000-0000-0000000c6b01'$$,
  '42501', null, 'gestão não troca a data');

-- Operacional: nem edita (como hoje).
select pg_temp.como('00000000-0000-0000-0000-00000000c603');
select is_empty(
  $$update consolidados_vendas set data = '2026-11-05' where id = '00000000-0000-0000-0000-0000000c6b01' returning id$$,
  'operacional não troca a data (policy de update só gestão)');

-- Master sem segundo fator: barrado.
select pg_temp.como('00000000-0000-0000-0000-00000000c601', 'aal1');
select is_empty(
  $$update consolidados_vendas set data = '2026-11-05' where id = '00000000-0000-0000-0000-0000000c6b01' returning id$$,
  'master sem aal2 não troca a data');

-- Master com aal2: troca a data.
select pg_temp.como('00000000-0000-0000-0000-00000000c601', 'aal2');
select lives_ok(
  $$update consolidados_vendas set data = '2026-11-05' where id = '00000000-0000-0000-0000-0000000c6b01'$$,
  'master troca a data de um dia já lançado');
select is(
  (select data::text from consolidados_vendas where id = '00000000-0000-0000-0000-0000000c6b01'),
  '2026-11-05', 'data trocada gravada');

-- Destino já lançado: UNIQUE barra, nada sobrescrito.
select throws_ok(
  $$update consolidados_vendas set data = '2026-11-04' where id = '00000000-0000-0000-0000-0000000c6b01'$$,
  '23505', null, 'trocar para um dia já lançado falha no UNIQUE');
select is(
  (select credito::numeric from consolidados_vendas where id = '00000000-0000-0000-0000-0000000c6b02'),
  20::numeric, 'o dia de destino continua intacto');

-- Master lança qualquer data.
select lives_ok(
  $$insert into consolidados_vendas (unidade_id, data, credito, salao, criado_por)
    values ('ctd-1', '2026-10-01', 5, 5, '00000000-0000-0000-0000-00000000c601')$$,
  'master lança uma data passada');

select * from finish();
rollback;
