-- Contas a Pagar e Receber (23/11/2026): trocar fornecedor de conta já lançada (fin_trocar_contraparte).
-- Fixtures isoladas, sem dado real. Rodar: npx supabase db test

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

update fin_acesso_exclusivo set ativo = true where id;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000fc001', 'gestao.tc@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000fc002', 'oper.tc@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000fc003', 'intruso.tc@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-tc', 'Org TC', 'saas', true), ('org-tc-outra', 'Outra TC', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, financeiro_gerencial_habilitado, financeiro_liberado_equipe) values
  ('uni-tc', 'org-tc', 'TC', 'banco', true, true, true),
  ('uni-tc-outra', 'org-tc-outra', 'Outra TC', 'banco', true, true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000fc001', 'org-tc', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000fc002', 'org-tc', 'uni-tc', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000fc003', 'org-tc-outra', null, 'gestao', 'ativo');

select public.semear_categorias_financeiras('uni-tc');
select public.semear_categorias_financeiras('uni-tc-outra');
insert into fin_contrapartes (id, unidade_id, nome, documento, tipo) values
  ('00000000-0000-0000-0000-0000000fcf01', 'uni-tc', 'Minerva S.A.', '67620377000114', 'fornecedor'),
  ('00000000-0000-0000-0000-0000000fcf02', 'uni-tc-outra', 'De outra unidade', null, 'fornecedor');

create temp table cat as
  select (select id from fin_categorias where unidade_id = 'uni-tc' and codigo_sistema = 'cmc_compras_mercadorias') as merc,
         (select id from fin_categorias where unidade_id = 'uni-tc' and codigo_sistema = 'cmc_compras_embalagens') as emb;
grant select on cat to authenticated;

-- Lançamento avulso, sem fornecedor.
insert into fin_lancamentos (id, unidade_id, tipo, categoria_id, descricao, data_competencia, criado_por)
  values ('00000000-0000-0000-0000-0000000fca01', 'uni-tc', 'despesa', (select merc from cat), 'Compra avulsa', '2026-11-10',
          '00000000-0000-0000-0000-0000000fc001');

create function pg_temp.como(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;

set local role authenticated;

-- Nota com 2 Plano de Contas, lançada sem fornecedor.
select pg_temp.como('00000000-0000-0000-0000-0000000fc001');
create temp table d1 as select public.fin_documento_criar(jsonb_build_object('unidade', 'uni-tc', 'chave', 'chave-tc-0001',
  'tipo', 'despesa', 'descricao', 'NF 9 sem fornecedor', 'data_competencia', '2026-11-10',
  'vencimentos', jsonb_build_array('2026-11-20'),
  'linhas', jsonb_build_array(
    jsonb_build_object('categoria_id', (select merc from cat), 'valor', 30000, 'celulas', jsonb_build_array(30000)),
    jsonb_build_object('categoria_id', (select emb from cat), 'valor', 1000, 'celulas', jsonb_build_array(1000))))) as id;
create temp table l1 as select id from fin_lancamentos where documento_id = (select id from d1) limit 1;

-- Operacional e outra organização não trocam.
select pg_temp.como('00000000-0000-0000-0000-0000000fc002');
select throws_ok($$ select public.fin_trocar_contraparte('uni-tc', (select id from l1), '00000000-0000-0000-0000-0000000fcf01') $$,
  '42501', null, 'Operacional não troca fornecedor');
select pg_temp.como('00000000-0000-0000-0000-0000000fc003');
select throws_ok($$ select public.fin_trocar_contraparte('uni-tc', (select id from l1), '00000000-0000-0000-0000-0000000fcf01') $$,
  '42501', null, 'Gestão de outra organização não troca');

-- Gestão troca: documento e todos os lançamentos dele juntos.
select pg_temp.como('00000000-0000-0000-0000-0000000fc001');
select throws_ok($$ select public.fin_trocar_contraparte('uni-tc', (select id from l1), '00000000-0000-0000-0000-0000000fcf02') $$,
  '23514', null, 'fornecedor de outra unidade é recusado');
select is(public.fin_trocar_contraparte('uni-tc', (select id from l1), '00000000-0000-0000-0000-0000000fcf01'), 2,
  'troca os 2 lançamentos da nota');
select is((select contraparte_id from fin_documentos where id = (select id from d1)), '00000000-0000-0000-0000-0000000fcf01'::uuid,
  'documento fica com o fornecedor');
select is((select count(*)::int from fin_lancamentos where documento_id = (select id from d1)
           and contraparte_id = '00000000-0000-0000-0000-0000000fcf01'), 2, 'lançamentos da nota ficam com o fornecedor');
select is((select sum(pa.valor) from fin_parcelas pa join fin_lancamentos l on l.id = pa.lancamento_id
           where l.documento_id = (select id from d1)), 310.00::numeric, 'valores não mudam');

-- Lançamento avulso: troca só ele; null tira o fornecedor.
select is(public.fin_trocar_contraparte('uni-tc', '00000000-0000-0000-0000-0000000fca01', '00000000-0000-0000-0000-0000000fcf01'), 1,
  'lançamento avulso recebe fornecedor');
select is(public.fin_trocar_contraparte('uni-tc', '00000000-0000-0000-0000-0000000fca01', null), 1, 'fornecedor pode ser retirado');
select throws_ok($$ select public.fin_trocar_contraparte('uni-tc', gen_random_uuid(), null) $$,
  '23514', null, 'lançamento inexistente é recusado');

select * from finish();
rollback;
