-- Financeiro V2 (11/10/2026): acesso por unidade liberada (F0) e documento com rateio (F1).
-- Fixtures isoladas, sem dado real. Rodar: npx supabase db test

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

update fin_acesso_exclusivo set ativo = true where id;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000f2001', 'gestao.v2@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f2002', 'oper.v2@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f2003', 'intruso.v2@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-v2', 'Org V2', 'saas', true), ('org-v2-outra', 'Outra', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, financeiro_gerencial_habilitado) values
  ('uni-v2', 'org-v2', 'V2', 'banco', true, true),
  ('uni-v2-fechada', 'org-v2', 'V2 sem liberação', 'banco', true, true),
  ('uni-v2-outra', 'org-v2-outra', 'Outra', 'banco', true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000f2001', 'org-v2', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f2002', 'org-v2', 'uni-v2', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000f2003', 'org-v2-outra', null, 'gestao', 'ativo');

select public.semear_categorias_financeiras('uni-v2');
insert into fin_contas_financeiras (id, unidade_id, nome, tipo)
  values ('00000000-0000-0000-0000-0000000f2c01', 'uni-v2', 'Banco V2', 'banco');

create temp table cat as
  select (select id from fin_categorias where unidade_id = 'uni-v2' and codigo_sistema = 'cmc_compras_mercadorias') as merc,
         (select id from fin_categorias where unidade_id = 'uni-v2' and codigo_sistema = 'cmc_compras_embalagens') as emb;
grant select on cat to authenticated;

create function pg_temp.como(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;

create function pg_temp.doc(p_chave text, p_digest text, p_linhas jsonb, p_unidade text default 'uni-v2') returns jsonb
language sql as $$
  select jsonb_build_object('unidade', p_unidade, 'chave', p_chave, 'digest', p_digest, 'tipo', 'despesa',
    'descricao', 'NF 123 Atacadão', 'numero', '123', 'data_competencia', '2026-10-05',
    'conta_financeira_id', '00000000-0000-0000-0000-0000000f2c01',
    'vencimentos', jsonb_build_array('2026-10-20', '2026-11-20'), 'linhas', p_linhas);
$$;

select ok(not has_column_privilege('authenticated', 'public.unidades', 'financeiro_liberado_equipe', 'UPDATE')
  or not exists (select 1 from pg_policies where tablename = 'unidades' and cmd in ('UPDATE', 'ALL')),
  'liberação por unidade não tem caminho de escrita pela API');

set local role authenticated;

-- ── F0: restrição global segue; unidade liberada abre para a equipe dela ──
select pg_temp.como('00000000-0000-0000-0000-0000000f2001');
select ok(not public.usuario_pode_usar_financeiro_gerencial('uni-v2', null), 'Gestão sem liberação não acessa');
reset role;
update unidades set financeiro_liberado_equipe = true where id = 'uni-v2';
set local role authenticated;
select ok(public.usuario_pode_usar_financeiro_gerencial('uni-v2', null), 'Gestão acessa a unidade liberada');
select ok(public.usuario_pode_usar_financeiro_gerencial('uni-v2', array['gestao']), 'Gestão segue Gestão na unidade liberada');
select ok(not public.usuario_pode_usar_financeiro_gerencial('uni-v2-fechada', null), 'outra unidade da mesma organização segue fechada');
select pg_temp.como('00000000-0000-0000-0000-0000000f2002');
select ok(public.usuario_pode_usar_financeiro_gerencial('uni-v2', null), 'Operacional acessa a unidade liberada');
select ok(not public.usuario_pode_usar_financeiro_gerencial('uni-v2', array['gestao']), 'liberação não vira permissão de Gestão');
select pg_temp.como('00000000-0000-0000-0000-0000000f2003');
select ok(not public.usuario_pode_usar_financeiro_gerencial('uni-v2', null), 'quem é de outra organização não acessa');

-- ── F1: documento com rateio (mercadoria 300,00 + embalagem 100,01 em 2 vencimentos) ──
select pg_temp.como('00000000-0000-0000-0000-0000000f2002');
create temp table d1 as select public.fin_documento_criar(pg_temp.doc('chave-doc-0001', repeat('a', 64),
  jsonb_build_array(
    jsonb_build_object('categoria_id', (select merc from cat), 'valor', 30000, 'celulas', jsonb_build_array(15000, 15000)),
    jsonb_build_object('categoria_id', (select emb from cat), 'valor', 10001, 'celulas', jsonb_build_array(5001, 5000))
  ))) as id;
select is((select count(*)::int from fin_lancamentos where documento_id = (select id from d1)), 2, 'documento vira 2 lançamentos');
select is((select sum(pa.valor) from fin_parcelas pa join fin_lancamentos l on l.id = pa.lancamento_id
            where l.documento_id = (select id from d1)), 400.01::numeric, 'parcelas somam o total do documento');
select is((select sum(pa.valor) from fin_parcelas pa join fin_lancamentos l on l.id = pa.lancamento_id
            where l.documento_id = (select id from d1) and pa.vencimento_documento = 1), 200.01::numeric,
  'vencimento 1 fecha em centavos');
select is((select total from fin_documentos where id = (select id from d1)), 400.01::numeric, 'total gravado no documento');
select is(public.fin_documento_criar(pg_temp.doc('chave-doc-0001', repeat('a', 64),
  jsonb_build_array(jsonb_build_object('categoria_id', (select merc from cat), 'valor', 30000, 'celulas', jsonb_build_array(15000, 15000))))),
  (select id from d1), 'mesma chave e mesmo conteúdo devolvem o mesmo documento');
select throws_ok($$ select public.fin_documento_criar(pg_temp.doc('chave-doc-0001', repeat('b', 64),
  jsonb_build_array(jsonb_build_object('categoria_id', (select merc from cat), 'valor', 100, 'celulas', jsonb_build_array(50, 50))))) $$,
  '23505', null, 'mesma chave com outro conteúdo é recusada');
select throws_ok($$ select public.fin_documento_criar(pg_temp.doc('chave-doc-0002', repeat('c', 64),
  jsonb_build_array(jsonb_build_object('categoria_id', (select merc from cat), 'valor', 101, 'celulas', jsonb_build_array(50, 50))))) $$,
  '23514', null, 'linha que não fecha com o próprio valor é recusada');
select throws_ok($$ select public.fin_documento_criar(pg_temp.doc('chave-doc-0003', repeat('d', 64),
  jsonb_build_array(jsonb_build_object('categoria_id', (select merc from cat), 'valor', 100, 'celulas', jsonb_build_array(150, -50))))) $$,
  '23514', null, 'célula negativa é recusada');

-- Célula zero não vira parcela.
create temp table d2 as select public.fin_documento_criar(pg_temp.doc('chave-doc-0004', repeat('e', 64),
  jsonb_build_array(
    jsonb_build_object('categoria_id', (select merc from cat), 'valor', 1000, 'celulas', jsonb_build_array(999, 1)),
    jsonb_build_object('categoria_id', (select emb from cat), 'valor', 1, 'celulas', jsonb_build_array(1, 0))
  ))) as id;
select is((select count(*)::int from fin_parcelas pa join fin_lancamentos l on l.id = pa.lancamento_id
            where l.documento_id = (select id from d2)), 3, 'célula zero não gera parcela');

-- Baixa parcial do vencimento 1 (200,01 em aberto): paga 100,00 distribuído pelo saldo.
select is(public.fin_documento_baixar(jsonb_build_object('unidade', 'uni-v2', 'documento_id', (select id from d1),
  'vencimento', 1, 'conta_financeira_id', '00000000-0000-0000-0000-0000000f2c01', 'data', '2026-10-20', 'valor', 10000)),
  2, 'baixa parcial gera uma baixa por linha');
select is((select sum(b.valor) from fin_baixas b join fin_parcelas pa on pa.id = b.parcela_id
            join fin_lancamentos l on l.id = pa.lancamento_id where l.documento_id = (select id from d1)), 100.00::numeric,
  'baixas somam exatamente o valor pago');
select throws_ok($$ select public.fin_documento_baixar(jsonb_build_object('unidade', 'uni-v2', 'documento_id', (select id from d1),
  'vencimento', 1, 'conta_financeira_id', '00000000-0000-0000-0000-0000000f2c01', 'data', '2026-10-20', 'valor', 10002)) $$,
  '23514', null, 'baixa acima do saldo restante é recusada');

-- Contraparte do lançamento não pode divergir do documento.
reset role;
insert into fin_contrapartes (id, unidade_id, nome, documento) values
  ('00000000-0000-0000-0000-0000000f2e01', 'uni-v2', 'Atacadão', '75315333000109');
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000f2002');
select throws_ok($$ insert into fin_lancamentos (unidade_id, tipo, categoria_id, descricao, data_competencia, criado_por, documento_id, contraparte_id)
  values ('uni-v2', 'despesa', (select merc from cat), 'x', '2026-10-05', '00000000-0000-0000-0000-0000000f2002',
          (select id from d1), '00000000-0000-0000-0000-0000000f2e01') $$,
  '23514', null, 'contraparte diferente da do documento é recusada');

-- Estorno com valor diferente da baixa original é recusado (Gestão).
select pg_temp.como('00000000-0000-0000-0000-0000000f2001');
select throws_ok($$ insert into fin_baixas (unidade_id, parcela_id, tipo, estorno_de_baixa_id, conta_financeira_id, valor, data, criado_por)
  select b.unidade_id, b.parcela_id, 'estorno', b.id, b.conta_financeira_id, b.valor - 0.01, '2026-10-21', '00000000-0000-0000-0000-0000000f2001'
    from fin_baixas b join fin_parcelas pa on pa.id = b.parcela_id join fin_lancamentos l on l.id = pa.lancamento_id
   where l.documento_id = (select id from d1) limit 1 $$,
  '23514', null, 'estorno parcial de baixa é recusado');

-- Mês fechado barra o Operacional.
reset role;
insert into fin_fechamentos (unidade_id, competencia, fechado, atualizado_por)
  values ('uni-v2', '2026-09-01', true, '00000000-0000-0000-0000-0000000f2001');
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000f2002');
select throws_ok($$ select public.fin_documento_criar(jsonb_set(pg_temp.doc('chave-doc-0005', repeat('f', 64),
  jsonb_build_array(jsonb_build_object('categoria_id', (select merc from cat), 'valor', 100, 'celulas', jsonb_build_array(50, 50)))),
  '{data_competencia}', '"2026-09-10"')) $$,
  '42501', null, 'documento em mês fechado é recusado para o Operacional');

-- Unidade não liberada recusa a RPC.
select throws_ok($$ select public.fin_documento_criar(pg_temp.doc('chave-doc-0006', repeat('0', 64),
  jsonb_build_array(jsonb_build_object('categoria_id', (select merc from cat), 'valor', 100, 'celulas', jsonb_build_array(50, 50))), 'uni-v2-fechada')) $$,
  '42501', null, 'unidade sem liberação recusa a criação');

select * from finish();
rollback;
