-- Vínculo do fornecedor no Cadastro com duas confirmações AO MESMO TEMPO (parecer do Codex
-- de 24/10/2026, ponto 1). Duas sessões de verdade, pelo dblink: a primeira liga JM e segura a
-- transação aberta; a segunda (Bahia) precisa esperar a trava da linha e, quando a primeira
-- confirma, pegar a vaga seguinte - nunca a mesma vaga, apagando o JM.
-- As sessões do dblink gravam de verdade (cada uma é uma conexão própria), então o fixture é
-- criado por elas e o produto apagado no fim. Só roda no banco local do CI. Sem dado real.

begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(4);

select extensions.dblink_connect('prep', 'host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('a', 'host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect('b', 'host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres');

select extensions.dblink_exec('prep', $q$
  insert into public.organizacoes (id, nome, tipo_cliente, ativo)
  values ('org-vinc-conc', 'Organização da concorrência', 'saas', true);
  insert into public.unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo)
  values ('uni-vinc-conc', 'org-vinc-conc', 'Unidade da concorrência', 'banco', true);
  insert into public.produtos (unidade_id, sku, grupo, nome, preco_unitario,
                               fornecedor_1, fornecedor_2, fornecedor_3, fornecedor_4)
  values ('uni-vinc-conc', 'HORTOM001', 'HOR', 'tomate', 10, '', '', '', '');
$q$);

-- Sessão A: liga JM e segura a transação (linha travada).
select extensions.dblink_exec('a', 'begin');
select is(
  (select r from extensions.dblink('a',
     $q$select public.vincular_fornecedor_produto('uni-vinc-conc', 'HORTOM001', 'JM')$q$) as t(r text)),
  'fornecedor_1',
  'a primeira confirmação pega a vaga 1 (transação ainda aberta)');

-- Sessão B: liga Bahia ao mesmo tempo. Com a trava, fica esperando a A.
select extensions.dblink_send_query('b',
  $q$select public.vincular_fornecedor_produto('uni-vinc-conc', 'HORTOM001', 'Bahia')$q$);
select pg_sleep(0.5);
select is(extensions.dblink_is_busy('b'), 1, 'a segunda confirmação espera a trava da linha');

select extensions.dblink_exec('a', 'commit');
select is(
  (select r from extensions.dblink_get_result('b') as t(r text)),
  'fornecedor_2',
  'liberada a trava, a segunda pega a vaga seguinte');
select extensions.dblink_get_result('b');

select results_eq(
  $q$select f1, f2 from extensions.dblink('prep',
       'select fornecedor_1, fornecedor_2 from public.produtos
        where unidade_id = ''uni-vinc-conc'' and sku = ''HORTOM001''') as t(f1 text, f2 text)$q$,
  $q$values ('JM'::text, 'Bahia'::text)$q$,
  'os dois vínculos ficam gravados; nenhum apaga o outro');

select extensions.dblink_exec('prep', $q$
  delete from public.produtos where unidade_id = 'uni-vinc-conc';
$q$);
-- Organização e unidade ficam (gatilhos de unidade criam linhas dependentes); o banco do CI
-- é descartado no fim e os ids não colidem com nenhum outro teste.
select extensions.dblink_disconnect('a');
select extensions.dblink_disconnect('b');
select extensions.dblink_disconnect('prep');

select * from finish();
rollback;
