-- "Usar a ficha existente" v2 (parecer do Codex de 26/10/2026, P2): com a ficha mais antiga,
-- a união tira e devolve a conversão do produto e os ingredientes de outras fichas com o SKU
-- novo. Duas sessões de verdade, pelo dblink: a A edita o fator da conversão e a quantidade do
-- ingrediente e segura a transação; a B une ao mesmo tempo, precisa esperar e, quando a A
-- confirma, levar os valores NOVOS para o SKU novo (antes, a cópia era lida antes do DELETE e
-- devolvia os valores antigos). As sessões gravam de verdade; o que foi criado é apagado no
-- fim. Só roda no banco local do CI. Sem dado real.

begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(4);

select format('host=%s port=%s dbname=postgres user=postgres password=postgres',
              coalesce(host(inet_server_addr()), 'localhost'), coalesce(inet_server_port(), 5432)) as conexao
\gset

select extensions.dblink_connect('prep', :'conexao');
select extensions.dblink_connect('a', :'conexao');
select extensions.dblink_connect('b', :'conexao');

select extensions.dblink_exec('prep', $q$
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
  values ('00000000-0000-0000-0000-0000000ec001', 'conc.uniao@teste.local', 'x', now(), 'authenticated', 'authenticated');
  insert into public.organizacoes (id, nome, tipo_cliente, ativo)
  values ('org-fe-conc', 'Organização da concorrência da união', 'saas', true);
  insert into public.unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo,
                               fichas_tecnicas_habilitado, pre_preparo_vinculado_habilitado)
  values ('uni-fe-conc', 'org-fe-conc', 'Unidade da concorrência da união', 'banco', true, true, true);
  insert into public.produtos (id, unidade_id, sku, grupo, nome, unidade_base, preco_unitario, ativo, criado_em)
  values ('00000000-0000-0000-0000-0000000ec101', 'uni-fe-conc', 'PREBARGOI', 'PRE', 'Barbecue de Goiabada',
          'KG', 20, true, '2026-09-01');
  insert into public.categorias_ficha (id, unidade_id, camada, codigo, nome)
  values
    ('00000000-0000-0000-0000-0000000ec201', 'uni-fe-conc', 'PRE', 'MOL', 'Molhos'),
    ('00000000-0000-0000-0000-0000000ec202', 'uni-fe-conc', 'VEN', 'HAM', 'Hambúrgueres');
  insert into public.fichas_tecnicas (id, unidade_id, categoria_id, sku, camada, nome, rendimento_quantidade,
    rendimento_unidade, status, criado_por, atualizado_por, criado_em)
  values
    ('00000000-0000-0000-0000-0000000ec301', 'uni-fe-conc', '00000000-0000-0000-0000-0000000ec201', 'PREMOLBGO', 'PRE',
     'Barbecue de goiabada', 2, 'KG', 'ativa', '00000000-0000-0000-0000-0000000ec001',
     '00000000-0000-0000-0000-0000000ec001', '2026-08-01'),
    ('00000000-0000-0000-0000-0000000ec302', 'uni-fe-conc', '00000000-0000-0000-0000-0000000ec202', 'VENHAMBBQ', 'VEN',
     'Burger Barbecue', 1, 'UN', 'ativa', '00000000-0000-0000-0000-0000000ec001',
     '00000000-0000-0000-0000-0000000ec001', '2026-08-27');
  insert into public.ficha_componentes (id, unidade_id, ficha_id, produto_sku, quantidade, unidade_uso)
  values ('00000000-0000-0000-0000-0000000ec401', 'uni-fe-conc', '00000000-0000-0000-0000-0000000ec302',
          'PREBARGOI', 0.03, 'KG');
  insert into public.produto_conversoes (unidade_id, produto_sku, unidade_saida, fator_por_unidade_base)
  values ('uni-fe-conc', 'PREBARGOI', 'UN', 25);
$q$);

-- Sessão A: edita a conversão e o ingrediente e segura a transação (linhas travadas).
select extensions.dblink_exec('a', 'begin');
select extensions.dblink_exec('a', $q$
  update public.produto_conversoes set fator_por_unidade_base = 30
   where unidade_id = 'uni-fe-conc' and produto_sku = 'PREBARGOI';
  update public.ficha_componentes set quantidade = 0.05
   where id = '00000000-0000-0000-0000-0000000ec401';
$q$);

-- Sessão B: une ao mesmo tempo. Precisa esperar a A.
select extensions.dblink_send_query('b',
  $q$select public.unir_pre_preparo_ficha_existente('uni-fe-conc', 'PREBARGOI', '00000000-0000-0000-0000-0000000ec301')$q$);
select pg_sleep(0.5);
select is(extensions.dblink_is_busy('b'), 1, 'a união espera a edição concorrente da conversão');

select extensions.dblink_exec('a', 'commit');
select is(
  (select r from extensions.dblink_get_result('b') as t(r text)),
  'PREMOLBGO',
  'liberada a trava, a união termina com o SKU da ficha (mais antiga)');
select extensions.dblink_get_result('b');

select results_eq(
  $q$select sku, fator from extensions.dblink('prep',
       'select produto_sku, fator_por_unidade_base from public.produto_conversoes
         where unidade_id = ''uni-fe-conc''') as t(sku text, fator numeric)$q$,
  $q$values ('PREMOLBGO'::text, 30::numeric)$q$,
  'a conversão vai para o SKU novo com o fator editado ao mesmo tempo');
select results_eq(
  $q$select sku, qtd from extensions.dblink('prep',
       'select produto_sku, quantidade from public.ficha_componentes
         where id = ''00000000-0000-0000-0000-0000000ec401''') as t(sku text, qtd numeric)$q$,
  $q$values ('PREMOLBGO'::text, 0.05::numeric)$q$,
  'o ingrediente vai para o SKU novo com a quantidade editada ao mesmo tempo');

select extensions.dblink_exec('prep', $q$
  delete from public.ficha_componentes where unidade_id = 'uni-fe-conc';
  delete from public.produto_conversoes where unidade_id = 'uni-fe-conc';
  delete from public.produtos where unidade_id = 'uni-fe-conc';
  delete from public.fichas_tecnicas where unidade_id = 'uni-fe-conc';
$q$);
-- Organização, unidade, categorias e usuário ficam (ids exclusivos deste teste); o banco do
-- CI é descartado no fim.
select extensions.dblink_disconnect('a');
select extensions.dblink_disconnect('b');
select extensions.dblink_disconnect('prep');

select * from finish();
rollback;
