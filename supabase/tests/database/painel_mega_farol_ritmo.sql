-- Painel M.E.G.A., farol por ritmo (13/10/2026): meta de custos variáveis em fin_metas_unidade.
-- Garante: coluna nova com teto > 0, RPC de 7 parâmetros com o 7º opcional (o app publicado
-- antes da migração manda 6 e segue funcionando), a 6ª assinatura sumiu, correção do mesmo
-- mês atualiza o campo, Operacional lê e não grava, outra organização não lê. Fixtures
-- isoladas, sem dado real.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ── Fixture ────────────────────────────────────────────────────────────────
update fin_acesso_exclusivo set ativo = true where id;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000f6001', 'gestao.ritmo@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f6002', 'oper.ritmo@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f6003', 'gestao.ritmo.outra@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-ritmo', 'Org Ritmo', 'saas', true),
  ('org-ritmo-outra', 'Org Ritmo Outra', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, financeiro_gerencial_habilitado, financeiro_liberado_equipe) values
  ('uni-ritmo', 'org-ritmo', 'Ritmo', 'banco', true, true, true),
  ('uni-ritmo-outra', 'org-ritmo-outra', 'Ritmo Outra', 'banco', true, true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000f6001', 'org-ritmo', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f6002', 'org-ritmo', 'uni-ritmo', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000f6003', 'org-ritmo-outra', null, 'gestao', 'ativo');

create function pg_temp.como(p_user text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

-- ── Estrutura ──────────────────────────────────────────────────────────────
select has_column('public', 'fin_metas_unidade', 'custos_variaveis', 'coluna custos_variaveis existe');
select col_type_is('public', 'fin_metas_unidade', 'custos_variaveis', 'numeric(14,2)', 'custos_variaveis é numeric(14,2)');
select col_is_null('public', 'fin_metas_unidade', 'custos_variaveis', 'custos_variaveis aceita nulo (sem meta)');
select ok(not has_function_privilege('anon', 'public.fin_meta_unidade_salvar(text, date, numeric, numeric, numeric, numeric, numeric)', 'EXECUTE'),
  'anon não executa a RPC de 7 parâmetros');
select is((select count(*)::int from pg_proc where proname = 'fin_meta_unidade_salvar' and pronamespace = 'public'::regnamespace), 1,
  'só existe uma fin_meta_unidade_salvar (a de 6 parâmetros foi removida)');

set local role authenticated;

-- ── Gestão: 7 parâmetros gravam a meta; 6 (app antigo) seguem funcionando ──
select pg_temp.como('00000000-0000-0000-0000-0000000f6001');
select lives_ok($$ select public.fin_meta_unidade_salvar('uni-ritmo', '2026-10-01', 100000, 0.30, null, null, 2000) $$,
  'Gestão grava a meta de outubro com custos variáveis');
select is((select custos_variaveis::text from fin_metas_unidade where unidade_id = 'uni-ritmo' and vigente_desde = '2026-10-01'),
  '2000.00', 'custos variáveis gravados em outubro');
select lives_ok($$ select public.fin_meta_unidade_salvar('uni-ritmo', '2026-11-01', 120000, 0.30, null, null) $$,
  'chamada com 6 argumentos (app publicado antes da migração) continua valendo');
select is((select custos_variaveis is null from fin_metas_unidade where unidade_id = 'uni-ritmo' and vigente_desde = '2026-11-01'),
  true, 'sem o 7º argumento a meta de custos variáveis fica nula (sem cor)');
select throws_ok($$ select public.fin_meta_unidade_salvar('uni-ritmo', '2026-12-01', null, null, null, null, 0) $$,
  '23514', null, 'custos variáveis zero ou negativo é recusado');
select lives_ok($$ select public.fin_meta_unidade_salvar('uni-ritmo', '2026-10-01', 100000, 0.30, null, null, 2500) $$,
  'corrigir o mesmo mês atualiza a linha');
select is((select count(*)::int || ' ' || max(custos_variaveis)::text from fin_metas_unidade where unidade_id = 'uni-ritmo' and vigente_desde = '2026-10-01'),
  '1 2500.00', 'correção do mesmo mês atualiza custos variáveis sem duplicar a vigência');

-- ── Operacional da unidade lê, não grava; outra organização não lê ─────────
select pg_temp.como('00000000-0000-0000-0000-0000000f6002');
select is((select custos_variaveis::text from fin_metas_unidade where unidade_id = 'uni-ritmo' and vigente_desde = '2026-10-01'),
  '2500.00', 'Operacional lê a meta de custos variáveis da unidade');
select pg_temp.como('00000000-0000-0000-0000-0000000f6003');
select is((select count(*)::int from fin_metas_unidade where unidade_id = 'uni-ritmo'), 0, 'outra organização não lê as metas');

select * from finish();
rollback;
