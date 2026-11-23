-- Contas a Pagar e Receber (23/11/2026): corrigir data e conta de pagamento (fin_corrigir_pagamento).
-- Fixtures isoladas, sem dado real. Rodar: npx supabase db test

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

update fin_acesso_exclusivo set ativo = true where id;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000fd001', 'gestao.cp@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000fd002', 'oper.cp@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-cp', 'Org CP', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, financeiro_gerencial_habilitado, financeiro_liberado_equipe)
  values ('uni-cp', 'org-cp', 'CP', 'banco', true, true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000fd001', 'org-cp', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000fd002', 'org-cp', 'uni-cp', 'operacional', 'ativo');
select public.semear_categorias_financeiras('uni-cp');
insert into fin_contas_financeiras (id, unidade_id, nome, tipo) values
  ('00000000-0000-0000-0000-0000000fdc01', 'uni-cp', 'Banco A', 'banco'),
  ('00000000-0000-0000-0000-0000000fdc02', 'uni-cp', 'Banco B', 'banco');
insert into fin_lancamentos (id, unidade_id, tipo, categoria_id, descricao, data_competencia, criado_por)
  values ('00000000-0000-0000-0000-0000000fda01', 'uni-cp', 'despesa',
          (select id from fin_categorias where unidade_id = 'uni-cp' and codigo_sistema = 'cmc_compras_mercadorias'),
          'Energia', '2026-10-01', '00000000-0000-0000-0000-0000000fd001');
insert into fin_parcelas (id, unidade_id, lancamento_id, numero, total_parcelas, valor, data_prevista)
  values ('00000000-0000-0000-0000-0000000fdb01', 'uni-cp', '00000000-0000-0000-0000-0000000fda01', 1, 1, 904.06, '2026-10-19');

create function pg_temp.como(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000fd001');
insert into fin_baixas (id, unidade_id, parcela_id, conta_financeira_id, valor, data, criado_por)
  values ('00000000-0000-0000-0000-0000000fde01', 'uni-cp', '00000000-0000-0000-0000-0000000fdb01',
          '00000000-0000-0000-0000-0000000fdc01', 904.06, '2026-10-19', '00000000-0000-0000-0000-0000000fd001');

select pg_temp.como('00000000-0000-0000-0000-0000000fd002');
select throws_ok($$ select public.fin_corrigir_pagamento('uni-cp', array['00000000-0000-0000-0000-0000000fde01'::uuid], '2026-10-22', '00000000-0000-0000-0000-0000000fdc02') $$,
  '42501', null, 'Operacional não corrige pagamento');

select pg_temp.como('00000000-0000-0000-0000-0000000fd001');
select throws_ok($$ select public.fin_corrigir_pagamento('uni-cp', array['00000000-0000-0000-0000-0000000fde01'::uuid], '2026-10-22', gen_random_uuid()) $$,
  '23514', null, 'conta de fora da unidade é recusada');
select is(public.fin_corrigir_pagamento('uni-cp', array['00000000-0000-0000-0000-0000000fde01'::uuid], '2026-10-22', '00000000-0000-0000-0000-0000000fdc02'), 1,
  'corrige o pagamento');
select is((select count(*)::int from fin_baixas where estorno_de_baixa_id = '00000000-0000-0000-0000-0000000fde01'), 1, 'original estornado');
select is((select b.data from fin_baixas b where b.tipo = 'baixa' and b.parcela_id = '00000000-0000-0000-0000-0000000fdb01'
            and not exists (select 1 from fin_baixas e where e.estorno_de_baixa_id = b.id)), '2026-10-22'::date, 'nova data gravada');
select is((select b.conta_financeira_id from fin_baixas b where b.tipo = 'baixa' and b.parcela_id = '00000000-0000-0000-0000-0000000fdb01'
            and not exists (select 1 from fin_baixas e where e.estorno_de_baixa_id = b.id)), '00000000-0000-0000-0000-0000000fdc02'::uuid, 'nova conta gravada');
select is((select status from fin_parcelas where id = '00000000-0000-0000-0000-0000000fdb01'), 'quitado', 'conta continua paga');
select is(public.saldo_baixado_parcela('00000000-0000-0000-0000-0000000fdb01'), 904.06::numeric, 'valor pago não muda');
select throws_ok($$ select public.fin_corrigir_pagamento('uni-cp', array['00000000-0000-0000-0000-0000000fde01'::uuid], '2026-10-23', '00000000-0000-0000-0000-0000000fdc01') $$,
  '23514', null, 'pagamento já estornado não se corrige de novo');

select * from finish();
rollback;
