-- Contas a Pagar e Receber (24/11/2026): editar a nota inteira depois de lançada (fin_documento_editar).
-- Fixtures isoladas, sem dado real. Rodar: npx supabase db test

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

update fin_acesso_exclusivo set ativo = true where id;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000ed001', 'gestao.ed@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000ed002', 'oper.ed@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000ed003', 'intruso.ed@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-ed', 'Org ED', 'saas', true), ('org-ed-outra', 'Outra ED', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, financeiro_gerencial_habilitado, financeiro_liberado_equipe) values
  ('uni-ed', 'org-ed', 'ED', 'banco', true, true, true),
  ('uni-ed-outra', 'org-ed-outra', 'Outra ED', 'banco', true, true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000ed001', 'org-ed', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000ed002', 'org-ed', 'uni-ed', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000ed003', 'org-ed-outra', null, 'gestao', 'ativo');

select public.semear_categorias_financeiras('uni-ed');
select public.semear_categorias_financeiras('uni-ed-outra');
insert into fin_contrapartes (id, unidade_id, nome, documento, tipo) values
  ('00000000-0000-0000-0000-0000000edf01', 'uni-ed', 'Minerva S.A.', '67620377000114', 'fornecedor');
insert into fin_contas_financeiras (id, unidade_id, nome, tipo) values
  ('00000000-0000-0000-0000-0000000edc01', 'uni-ed', 'Banco ED', 'banco');

create temp table cat as
  select (select id from fin_categorias where unidade_id = 'uni-ed' and codigo_sistema = 'cmc_compras_mercadorias') as merc,
         (select id from fin_categorias where unidade_id = 'uni-ed' and codigo_sistema = 'cmc_compras_embalagens') as emb;
grant select on cat to authenticated;

create function pg_temp.como(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000ed001');

-- Nota de R$ 310: 2 linhas, 1 vencimento, sem fornecedor.
create temp table d1 as select public.fin_documento_criar(jsonb_build_object('unidade', 'uni-ed', 'chave', 'chave-ed-0001',
  'tipo', 'despesa', 'descricao', 'NF 9', 'data_competencia', '2026-11-10',
  'vencimentos', jsonb_build_array('2026-11-20'),
  'linhas', jsonb_build_array(
    jsonb_build_object('categoria_id', (select merc from cat), 'valor', 30000, 'celulas', jsonb_build_array(30000)),
    jsonb_build_object('categoria_id', (select emb from cat), 'valor', 1000, 'celulas', jsonb_build_array(1000))))) as id;
create temp table antigos as select id from fin_lancamentos where documento_id = (select id from d1);

-- Nova versão: fornecedor, número, 1 linha só de R$ 320 em 2 vencimentos.
create function pg_temp.nova(p_doc uuid, p_valor1 bigint, p_valor2 bigint) returns jsonb language sql as $$
  select jsonb_build_object('unidade', 'uni-ed', 'documento_id', p_doc,
    'contraparte_id', '00000000-0000-0000-0000-0000000edf01', 'numero', '123', 'descricao', 'NF 123 Minerva',
    'data_emissao', '2026-11-09', 'data_competencia', '2026-11-09', 'conta_financeira_id', '00000000-0000-0000-0000-0000000edc01',
    'observacao', 'corrigida', 'vencimentos', jsonb_build_array('2026-11-25', '2026-12-25'),
    'linhas', jsonb_build_array(jsonb_build_object('categoria_id', (select merc from cat), 'valor', p_valor1 + p_valor2,
      'celulas', jsonb_build_array(p_valor1, p_valor2))));
$$;

-- Quem não é Gestão da organização não edita.
select pg_temp.como('00000000-0000-0000-0000-0000000ed002');
select throws_ok($$ select public.fin_documento_editar(pg_temp.nova((select id from d1), 16000, 16000)) $$,
  '42501', null, 'Operacional não edita nota');
select pg_temp.como('00000000-0000-0000-0000-0000000ed003');
select throws_ok($$ select public.fin_documento_editar(pg_temp.nova((select id from d1), 16000, 16000)) $$,
  '42501', null, 'Gestão de outra organização não edita');

select pg_temp.como('00000000-0000-0000-0000-0000000ed001');
select throws_ok($$ select public.fin_documento_editar(jsonb_set(pg_temp.nova((select id from d1), 16000, 16000), '{linhas,0,valor}', '1')) $$,
  '23514', null, 'linha que não fecha com o rateio é recusada');

-- Sem pagamento: tudo muda, reaproveitando o 1º lançamento.
select lives_ok($$ select public.fin_documento_editar(pg_temp.nova((select id from d1), 16000, 16000)) $$, 'gestão edita a nota inteira');
select is((select total from fin_documentos where id = (select id from d1)), 320.00::numeric, 'total da nota atualizado');
select is((select numero || '|' || descricao || '|' || contraparte_id::text from fin_documentos where id = (select id from d1)),
  '123|NF 123 Minerva|00000000-0000-0000-0000-0000000edf01', 'cabeçalho da nota atualizado');
select is((select count(*)::int from fin_lancamentos where documento_id = (select id from d1)), 1, 'linha retirada sai');
select ok((select id from fin_lancamentos where documento_id = (select id from d1)) in (select id from antigos),
  'o lançamento que fica é o mesmo de antes (anexos continuam apontando para ele)');
select is((select string_agg(data_prevista::text || '=' || valor::text, ',' order by data_prevista) from fin_parcelas pa
           join fin_lancamentos l on l.id = pa.lancamento_id where l.documento_id = (select id from d1)),
  '2026-11-25=160.00,2026-12-25=160.00', 'parcelas regravadas com os vencimentos novos');
select is((select contraparte_id from fin_lancamentos where documento_id = (select id from d1)),
  '00000000-0000-0000-0000-0000000edf01'::uuid, 'lançamento acompanha o fornecedor da nota');

-- Com pagamento: valor e vencimento ficam travados; dados mudam.
select public.fin_documento_baixar(jsonb_build_object('unidade', 'uni-ed', 'documento_id', (select id from d1), 'vencimento', 1,
  'conta_financeira_id', '00000000-0000-0000-0000-0000000edc01', 'data', '2026-11-25', 'valor', 16000, 'chave', 'baixa-ed-0001'));
select throws_ok($$ select public.fin_documento_editar(pg_temp.nova((select id from d1), 15000, 17000)) $$,
  'P0001', null, 'nota paga não muda valor');
select throws_ok($$ select public.fin_documento_editar(jsonb_set(pg_temp.nova((select id from d1), 16000, 16000), '{vencimentos,1}', '"2026-12-26"')) $$,
  'P0001', null, 'nota paga não muda vencimento');
select lives_ok($$ select public.fin_documento_editar(jsonb_set(jsonb_set(pg_temp.nova((select id from d1), 16000, 16000),
  '{descricao}', '"NF 123 Minerva carnes"'), '{linhas,0,categoria_id}', to_jsonb((select emb from cat)))) $$,
  'nota paga muda descrição e Plano de Contas');
select is((select categoria_id from fin_lancamentos where documento_id = (select id from d1)), (select emb from cat),
  'Plano de Contas trocado na nota paga');
select is((select count(*)::int from fin_baixas b join fin_parcelas pa on pa.id = b.parcela_id
           join fin_lancamentos l on l.id = pa.lancamento_id where l.documento_id = (select id from d1)), 1, 'pagamento continua');

select throws_ok($$ select public.fin_documento_editar(jsonb_set(pg_temp.nova((select id from d1), 16000, 16000), '{documento_id}', to_jsonb(gen_random_uuid()))) $$,
  '23514', null, 'nota inexistente é recusada');

select * from finish();
rollback;
