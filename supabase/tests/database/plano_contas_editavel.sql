-- Plano de contas padrão automático e editável (20/10/2026).
-- Garante no banco: unidade que liga o Financeiro recebe o plano padrão sozinha; Gestão renomeia e
-- arquiva conta padrão, apaga conta própria nunca usada; grupo de contas fica fixo; contas dos
-- cálculos (folha, FGTS, INSS, provisões, equipamentos) não saem; Operacional não edita.
-- Fixtures isoladas, sem dado real.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ── Fixture ────────────────────────────────────────────────────────────────
update fin_acesso_exclusivo set ativo = false where id;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000ac001', 'gestao-pc@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000ac002', 'oper-pc@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-pc', 'Org PC', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, financeiro_gerencial_habilitado, financeiro_liberado_equipe) values
  ('uni-pc', 'org-pc', 'PC', 'banco', true, true, true),
  ('uni-pc-off', 'org-pc', 'PC desligada', 'banco', true, false, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000ac001', 'org-pc', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000ac002', 'org-pc', 'uni-pc', 'operacional', 'ativo');

-- ── Semeadura automática ───────────────────────────────────────────────────
select ok((select count(*) from fin_categorias where unidade_id = 'uni-pc') > 90,
  'unidade criada com o Financeiro ligado já nasce com o plano padrão');
select is((select count(*)::int from fin_categorias where unidade_id = 'uni-pc-off'), 0,
  'unidade sem Financeiro não recebe plano');
update unidades set financeiro_gerencial_habilitado = true where id = 'uni-pc-off';
select ok((select count(*) from fin_categorias where unidade_id = 'uni-pc-off') > 90,
  'ligar o Financeiro depois semeia o plano padrão');

create temp table ids_pc as
  select codigo_sistema, id from fin_categorias where unidade_id = 'uni-pc' and codigo_sistema is not null;
grant select on ids_pc to authenticated;
create temp table propria_pc (id uuid);
grant select, insert on propria_pc to authenticated;

create function pg_temp.como(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
create function pg_temp.cat(p_codigo text) returns uuid language sql as $$
  select id from ids_pc where codigo_sistema = p_codigo;
$$;

set local role authenticated;

-- ── Gestão ─────────────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000ac001');

select lives_ok($$ update fin_categorias set nome = 'Luz' where id = pg_temp.cat('co_energia_eletrica') $$,
  'Gestão renomeia conta padrão');
select lives_ok($$ update fin_categorias set arquivado = true where id = pg_temp.cat('co_condominio') $$,
  'Gestão remove (arquiva) conta padrão');
select is((select arquivado from fin_categorias where id = pg_temp.cat('co_condominio')), true,
  'conta padrão removida fica arquivada');
delete from fin_categorias where id = pg_temp.cat('co_condominio');
select is((select count(*)::int from fin_categorias where id = pg_temp.cat('co_condominio')), 1,
  'conta padrão não é apagada');
select throws_ok($$ update fin_categorias set arquivado = true where id = pg_temp.cat('cmo_fgts') $$,
  '42501', null, 'conta usada nas provisões não sai');
select lives_ok($$ update fin_categorias set nome = 'FGTS mensal' where id = pg_temp.cat('cmo_fgts') $$,
  'conta usada nas provisões pode ser renomeada');
select throws_ok($$ update fin_categorias set arquivado = true where id = pg_temp.cat('sno_equipamentos_investimentos') $$,
  '42501', null, 'conta de equipamentos (DFC) não sai');
update fin_categorias set nome = 'Outro nome' where id = pg_temp.cat('custos_ocupacao');
select isnt((select nome from fin_categorias where id = pg_temp.cat('custos_ocupacao')), 'Outro nome',
  'grupo de contas não muda');
select throws_ok($$ update fin_categorias set papel_dre = 'cmo' where id = pg_temp.cat('co_aluguel') $$,
  'P0001', null, 'conta não muda de linha da DRE');

with nova as (
  insert into fin_categorias (unidade_id, parent_id, nivel, papel_dre, nome, padrao, ordem)
  values ('uni-pc', pg_temp.cat('custos_ocupacao'), 'conta', 'custo_ocupacao', 'Alarme', false, 999) returning id)
insert into propria_pc select id from nova;
select lives_ok($$ delete from fin_categorias where id = (select id from propria_pc) $$,
  'Gestão apaga conta própria');
select is((select count(*)::int from fin_categorias where id = (select id from propria_pc)), 0,
  'conta própria apagada sumiu');

-- ── Operacional ────────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000ac002');
update fin_categorias set nome = 'Tentativa' where id = pg_temp.cat('co_aluguel');
reset role;
select isnt((select nome from fin_categorias where id = pg_temp.cat('co_aluguel')), 'Tentativa',
  'Operacional não renomeia conta');
select ok((select count(*) from pg_policies where tablename = 'fin_categorias' and cmd = 'DELETE'
  and roles = array['authenticated']::name[] and qual ~ 'padrao = false') = 1,
  'só conta própria tem caminho de exclusão pela API');

select * from finish();
rollback;
