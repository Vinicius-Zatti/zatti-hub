-- Financeiro V2, Fase 3 (13/10/2026): metas da unidade para o farol do Painel M.E.G.A.
-- Garante: RLS de leitura igual ao Financeiro da unidade, escrita só pela RPC e só por
-- Gestão/master, vigência por mês sem reescrever o mês anterior, e a restrição exclusiva de
-- 29/09 valendo em unidade não liberada. Fixtures isoladas, sem dado real.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ── Fixture ────────────────────────────────────────────────────────────────
update fin_acesso_exclusivo set ativo = true where id;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000f5001', 'gestao.meta@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f5002', 'oper.meta@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f5003', 'gestao.outra@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f5004', 'gestao.restrita@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-meta', 'Org Meta', 'saas', true),
  ('org-meta-outra', 'Org Meta Outra', 'saas', true),
  ('org-meta-restrita', 'Org Meta Restrita', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, financeiro_gerencial_habilitado, financeiro_liberado_equipe) values
  ('uni-meta', 'org-meta', 'Meta', 'banco', true, true, true),
  ('uni-meta-outra', 'org-meta-outra', 'Meta Outra', 'banco', true, true, true),
  ('uni-meta-restrita', 'org-meta-restrita', 'Meta Restrita', 'banco', true, true, false);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000f5001', 'org-meta', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f5002', 'org-meta', 'uni-meta', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000f5003', 'org-meta-outra', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f5004', 'org-meta-restrita', null, 'gestao', 'ativo');

create function pg_temp.como(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;

-- ── Estrutura ──────────────────────────────────────────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'public.fin_metas_unidade'::regclass), 'RLS ligada em fin_metas_unidade');
select ok(not has_table_privilege('authenticated', 'public.fin_metas_unidade', 'INSERT'), 'authenticated não insere direto');
select ok(not has_table_privilege('authenticated', 'public.fin_metas_unidade', 'UPDATE'), 'authenticated não altera direto');
select ok(not has_table_privilege('authenticated', 'public.fin_metas_unidade', 'DELETE'), 'authenticated não apaga direto');
select ok(not has_function_privilege('anon', 'public.fin_meta_unidade_salvar(text, date, numeric, numeric, numeric, numeric)', 'EXECUTE'),
  'anon não executa a RPC de metas');

set local role authenticated;

-- ── Gestão da unidade liberada ─────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000f5001');
select lives_ok($$ select public.fin_meta_unidade_salvar('uni-meta', '2026-10-01', 100000, 0.32, 0.40, 10000) $$,
  'Gestão grava a meta de outubro');
select is((select count(*)::int from fin_metas_unidade where unidade_id = 'uni-meta'), 1, 'Gestão lê a meta gravada');
select throws_ok($$ insert into fin_metas_unidade (unidade_id, vigente_desde, faturamento, criado_por, atualizado_por)
  values ('uni-meta', '2026-12-01', 1, '00000000-0000-0000-0000-0000000f5001', '00000000-0000-0000-0000-0000000f5001') $$,
  '42501', null, 'nem a Gestão insere direto na tabela');
select throws_ok($$ select public.fin_meta_unidade_salvar('uni-meta', '2026-10-15', 100000, null, null, null) $$,
  '23514', null, 'vigência fora do dia 1 é recusada');
select throws_ok($$ select public.fin_meta_unidade_salvar('uni-meta', '2026-11-01', null, 1.5, null, null) $$,
  '23514', null, 'percentual acima de 100% é recusado');

-- Vigência: meta nova a partir de novembro não reescreve outubro.
select lives_ok($$ select public.fin_meta_unidade_salvar('uni-meta', '2026-11-01', 120000, 0.30, null, null) $$,
  'Gestão grava meta nova a partir de novembro');
select is((select faturamento::text || ' ' || cmv_percentual::text || ' ' || custo_fixo_percentual::text
  from fin_metas_unidade where unidade_id = 'uni-meta' and vigente_desde = '2026-10-01'),
  '100000.00 0.3200 0.4000', 'a meta de outubro continua igual depois da de novembro');
select is((select count(*)::int from fin_metas_unidade where unidade_id = 'uni-meta'), 2, 'cada vigência é uma linha');
select lives_ok($$ select public.fin_meta_unidade_salvar('uni-meta', '2026-11-01', 125000, 0.30, null, null) $$,
  'corrigir o mesmo mês atualiza a linha');
select is((select count(*)::int || ' ' || max(faturamento)::text from fin_metas_unidade where unidade_id = 'uni-meta' and vigente_desde = '2026-11-01'),
  '1 125000.00', 'correção do mesmo mês não duplica a vigência');

-- ── Operacional da unidade: lê, não grava ──────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000f5002');
select is((select count(*)::int from fin_metas_unidade where unidade_id = 'uni-meta'), 2, 'Operacional lê as metas da unidade');
select throws_ok($$ select public.fin_meta_unidade_salvar('uni-meta', '2027-01-01', 1000, null, null, null) $$,
  '42501', null, 'Operacional não grava meta');

-- ── Gestão de outra organização ────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000f5003');
select is((select count(*)::int from fin_metas_unidade where unidade_id = 'uni-meta'), 0, 'outra organização não lê as metas');
select throws_ok($$ select public.fin_meta_unidade_salvar('uni-meta', '2027-01-01', 1000, null, null, null) $$,
  '42501', null, 'outra organização não grava meta');

-- ── Unidade não liberada: restrição exclusiva de 29/09 vale para metas ─────
select pg_temp.como('00000000-0000-0000-0000-0000000f5004');
select throws_ok($$ select public.fin_meta_unidade_salvar('uni-meta-restrita', '2026-10-01', 1000, null, null, null) $$,
  '42501', null, 'Gestão sem ser titular não grava meta em unidade não liberada');

select * from finish();
rollback;
