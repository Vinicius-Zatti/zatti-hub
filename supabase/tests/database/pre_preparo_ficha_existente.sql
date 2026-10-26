-- Pré-preparo "usar a ficha existente" (26/10/2026) - as garantias do banco:
--   1. produto mais antigo, com histórico: a ficha recebe o SKU do produto; contagem,
--      extrato, conversão e quem usa o produto ou a ficha continuam no lugar;
--   2. recusa quando a ficha ou o produto já têm vínculo;
--   3. ficha mais antiga, produto sem histórico (feito como master): o produto recebe o
--      SKU da ficha, com a conversão e os ingredientes de outras fichas;
--   4. ficha mais antiga e produto com histórico: recusa e nada muda;
--   5. unidade diferente, ficha que usa o próprio produto e unidade fora do piloto: recusa;
--   6. a exceção da união não vaza: vínculo com SKU diferente segue recusado.
-- Sem dado real - fixtures isoladas.

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-0000000e8001', 'gestao.fichaexistente@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e8002', 'master.fichaexistente@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo)
values
  ('org-fichaexistente', 'Organização da ficha existente', 'saas', true),
  ('org-fichaexistente-ancora', 'Âncora da ficha existente', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, fichas_tecnicas_habilitado, pre_preparo_vinculado_habilitado)
values
  ('uni-fe', 'org-fichaexistente', 'Piloto', 'banco', true, true, true),
  ('uni-fe-fora', 'org-fichaexistente', 'Fora', 'banco', true, true, false);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
values
  ('00000000-0000-0000-0000-0000000e8001', 'org-fichaexistente', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000e8002', 'org-fichaexistente-ancora', null, 'master', 'ativo');

insert into produtos (id, unidade_id, sku, grupo, nome, unidade_base, preco_unitario, ativo, criado_em)
values
  ('00000000-0000-0000-0000-0000000e8101', 'uni-fe', 'PRECEBCAR', 'PRE', 'Cebola Caramelizada', 'KG', 30, true, '2026-08-10'),
  ('00000000-0000-0000-0000-0000000e8102', 'uni-fe', 'PREBARGOI', 'PRE', 'Barbecue de Goiabada', 'KG', 20, true, '2026-09-01'),
  ('00000000-0000-0000-0000-0000000e8103', 'uni-fe', 'PREMAILIM', 'PRE', 'Maionese de Limão', 'KG', 15, true, '2026-09-01'),
  ('00000000-0000-0000-0000-0000000e8104', 'uni-fe', 'PREMAIVER', 'PRE', 'Maionese Verde', 'KG', 15, true, '2026-08-10'),
  ('00000000-0000-0000-0000-0000000e8105', 'uni-fe', 'PREMOLQUE', 'PRE', 'Molho de queijo', 'KG', 25, true, '2026-08-10'),
  ('00000000-0000-0000-0000-0000000e8106', 'uni-fe', 'PREOUTCEB', 'PRE', 'Cebola caramelizada 2', 'KG', 30, true, '2026-08-10'),
  ('00000000-0000-0000-0000-0000000e8107', 'uni-fe', 'MERCEB001', 'MER', 'cebola branca', 'KG', 5, true, '2026-08-10'),
  ('00000000-0000-0000-0000-0000000e8108', 'uni-fe-fora', 'PREMOLTOM', 'PRE', 'Molho de tomate', 'KG', 8, true, '2026-08-10');

insert into categorias_ficha (id, unidade_id, camada, codigo, nome)
values
  ('00000000-0000-0000-0000-0000000e8201', 'uni-fe', 'PRE', 'REC', 'Recheios'),
  ('00000000-0000-0000-0000-0000000e8202', 'uni-fe', 'PRE', 'MOL', 'Molhos'),
  ('00000000-0000-0000-0000-0000000e8203', 'uni-fe', 'VEN', 'HAM', 'Hambúrgueres'),
  ('00000000-0000-0000-0000-0000000e8204', 'uni-fe-fora', 'PRE', 'MOL', 'Molhos');

insert into fichas_tecnicas (id, unidade_id, categoria_id, sku, camada, nome, rendimento_quantidade,
  rendimento_unidade, status, criado_por, atualizado_por, criado_em)
values
  ('00000000-0000-0000-0000-0000000e8301', 'uni-fe', '00000000-0000-0000-0000-0000000e8201', 'PRERECCCA', 'PRE',
   'Cebola caramelizada', 1, 'KG', 'inativa', '00000000-0000-0000-0000-0000000e8001', '00000000-0000-0000-0000-0000000e8001', '2026-08-27'),
  ('00000000-0000-0000-0000-0000000e8302', 'uni-fe', '00000000-0000-0000-0000-0000000e8202', 'PREMOLBGO', 'PRE',
   'Barbecue de goiabada', 2, 'KG', 'ativa', '00000000-0000-0000-0000-0000000e8001', '00000000-0000-0000-0000-0000000e8001', '2026-08-01'),
  ('00000000-0000-0000-0000-0000000e8303', 'uni-fe', '00000000-0000-0000-0000-0000000e8202', 'PREMOLMLS', 'PRE',
   'Maionese de limão', 1, 'KG', 'rascunho', '00000000-0000-0000-0000-0000000e8001', '00000000-0000-0000-0000-0000000e8001', '2026-08-01'),
  ('00000000-0000-0000-0000-0000000e8304', 'uni-fe', '00000000-0000-0000-0000-0000000e8202', 'PREMOLVER', 'PRE',
   'Maionese verde', 1, 'LT', 'rascunho', '00000000-0000-0000-0000-0000000e8001', '00000000-0000-0000-0000-0000000e8001', '2026-08-27'),
  ('00000000-0000-0000-0000-0000000e8305', 'uni-fe', '00000000-0000-0000-0000-0000000e8202', 'PREMOLMQJ', 'PRE',
   'Molho de queijo', 1, 'KG', 'rascunho', '00000000-0000-0000-0000-0000000e8001', '00000000-0000-0000-0000-0000000e8001', '2026-08-27'),
  ('00000000-0000-0000-0000-0000000e8306', 'uni-fe', '00000000-0000-0000-0000-0000000e8203', 'VENHAMCBA', 'VEN',
   'Cheese Bacon', 1, 'UN', 'ativa', '00000000-0000-0000-0000-0000000e8001', '00000000-0000-0000-0000-0000000e8001', '2026-08-27'),
  ('00000000-0000-0000-0000-0000000e8307', 'uni-fe', '00000000-0000-0000-0000-0000000e8203', 'VENHAMBBQ', 'VEN',
   'Burger Barbecue', 1, 'UN', 'ativa', '00000000-0000-0000-0000-0000000e8001', '00000000-0000-0000-0000-0000000e8001', '2026-08-27'),
  ('00000000-0000-0000-0000-0000000e8308', 'uni-fe-fora', '00000000-0000-0000-0000-0000000e8204', 'PREMOLTMC', 'PRE',
   'Molho de tomate', 1, 'KG', 'rascunho', '00000000-0000-0000-0000-0000000e8001', '00000000-0000-0000-0000-0000000e8001', '2026-08-27');

insert into ficha_componentes (id, unidade_id, ficha_id, produto_sku, ficha_componente_id, quantidade, unidade_uso)
values
  -- a ficha antiga da cebola usa cebola branca; o Cheese Bacon usa a ficha (pelo id) e o produto (pelo SKU)
  ('00000000-0000-0000-0000-0000000e8401', 'uni-fe', '00000000-0000-0000-0000-0000000e8301', 'MERCEB001', null, 1.2, 'KG'),
  ('00000000-0000-0000-0000-0000000e8402', 'uni-fe', '00000000-0000-0000-0000-0000000e8306', null, '00000000-0000-0000-0000-0000000e8301', 0.05, 'KG'),
  ('00000000-0000-0000-0000-0000000e8403', 'uni-fe', '00000000-0000-0000-0000-0000000e8306', 'PRECEBCAR', null, 0.02, 'KG'),
  -- o Burger Barbecue usa o produto PREBARGOI (mais novo que a ficha)
  ('00000000-0000-0000-0000-0000000e8404', 'uni-fe', '00000000-0000-0000-0000-0000000e8307', 'PREBARGOI', null, 30, 'G'),
  -- a ficha do molho de queijo usa o próprio produto como ingrediente
  ('00000000-0000-0000-0000-0000000e8405', 'uni-fe', '00000000-0000-0000-0000-0000000e8305', 'PREMOLQUE', null, 0.1, 'KG');

insert into produto_conversoes (unidade_id, produto_sku, unidade_saida, fator_por_unidade_base)
values
  ('uni-fe', 'PRECEBCAR', 'G', 1000),
  ('uni-fe', 'PREBARGOI', 'G', 1000);

-- Histórico: a cebola e a maionese de limão já foram contadas; a cebola tem extrato.
insert into contagens (id, unidade_id, data, mes, modalidade)
values ('00000000-0000-0000-0000-0000000e8501', 'uni-fe', '2026-10-20', 'teste', 'legada');
insert into contagem_itens (contagem_id, sku, grupo, nome, unidade_base, quantidade, preco_unitario, total)
values
  ('00000000-0000-0000-0000-0000000e8501', 'PRECEBCAR', 'PRE', 'Cebola Caramelizada', 'KG', 2, 30, 60),
  ('00000000-0000-0000-0000-0000000e8501', 'PREMAILIM', 'PRE', 'Maionese de Limão', 'KG', 1, 15, 15);
insert into estoque_movimentacoes (unidade_id, produto_id, sku, unidade_base, tipo, origem, quantidade, data)
values ('uni-fe', '00000000-0000-0000-0000-0000000e8101', 'PRECEBCAR', 'KG', 'entrada', 'manual', 1, '2026-10-21');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000e8001","role":"authenticated","aal":"aal2"}';

-- 1. Produto mais antigo, com histórico (Gestão)
select is(
  unir_pre_preparo_ficha_existente('uni-fe', 'PRECEBCAR', '00000000-0000-0000-0000-0000000e8301'),
  'PRECEBCAR', 'produto mais antigo: o item fica com o SKU do produto'
);
select results_eq(
  $$select sku, status from fichas_tecnicas where id = '00000000-0000-0000-0000-0000000e8301'$$,
  $$values ('PRECEBCAR'::text, 'ativa'::text)$$,
  'a ficha existente recebe o SKU do produto e volta ativa (tinha ingrediente)'
);
select ok(
  (select pre_preparo and ficha_pre_preparo_id = '00000000-0000-0000-0000-0000000e8301'
     from produtos where id = '00000000-0000-0000-0000-0000000e8101'),
  'o produto fica com a chave ligada e apontando para a ficha existente'
);
select is(
  (select count(*)::int from fichas_tecnicas where unidade_id = 'uni-fe' and camada = 'PRE'),
  5, 'nenhuma ficha nova criada'
);
select is(
  (select count(*)::int from fichas_tecnicas where unidade_id = 'uni-fe' and sku = 'PRERECCCA'),
  0, 'o SKU antigo da ficha deixa de existir'
);
select is(
  (select ficha_componente_id from ficha_componentes where id = '00000000-0000-0000-0000-0000000e8402'),
  '00000000-0000-0000-0000-0000000e8301'::uuid, 'quem usava a ficha continua usando a mesma ficha'
);
select is(
  (select produto_sku from ficha_componentes where id = '00000000-0000-0000-0000-0000000e8403'),
  'PRECEBCAR', 'quem usava o produto continua usando o mesmo SKU'
);
select is(
  (select count(*)::int from contagem_itens where contagem_id = '00000000-0000-0000-0000-0000000e8501' and sku = 'PRECEBCAR'),
  1, 'a contagem antiga continua no SKU do produto'
);
select is(
  (select count(*)::int from estoque_movimentacoes where produto_id = '00000000-0000-0000-0000-0000000e8101' and sku = 'PRECEBCAR'),
  1, 'o extrato continua no produto'
);
select is(
  (select count(*)::int from produto_conversoes where unidade_id = 'uni-fe' and produto_sku = 'PRECEBCAR'),
  1, 'a conversão do produto continua'
);

-- 2. Recusa quando já existe vínculo
select throws_ok(
  $$select unir_pre_preparo_ficha_existente('uni-fe', 'PREOUTCEB', '00000000-0000-0000-0000-0000000e8301')$$,
  'P0001', 'Esta ficha ja esta vinculada a outro produto da contagem',
  'ficha já vinculada não une com outro produto'
);
select throws_ok(
  $$select unir_pre_preparo_ficha_existente('uni-fe', 'PRECEBCAR', '00000000-0000-0000-0000-0000000e8304')$$,
  'P0001', 'Este produto ja tem ficha tecnica vinculada',
  'produto já vinculado não une com outra ficha'
);

-- 3. Ficha mais antiga, produto sem histórico (Master)
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000e8002","role":"authenticated","aal":"aal2"}';
select is(
  unir_pre_preparo_ficha_existente('uni-fe', 'PREBARGOI', '00000000-0000-0000-0000-0000000e8302'),
  'PREMOLBGO', 'master une; ficha mais antiga: o item fica com o SKU da ficha'
);
select results_eq(
  $$select sku, pre_preparo, ficha_pre_preparo_id from produtos where id = '00000000-0000-0000-0000-0000000e8102'$$,
  $$values ('PREMOLBGO'::text, true, '00000000-0000-0000-0000-0000000e8302'::uuid)$$,
  'o mesmo produto (mesmo id) passa a usar o SKU da ficha'
);
select is(
  (select sku from fichas_tecnicas where id = '00000000-0000-0000-0000-0000000e8302'),
  'PREMOLBGO', 'a ficha mais antiga não muda de SKU'
);
select results_eq(
  $$select id, produto_sku, quantidade, unidade_uso from ficha_componentes
     where ficha_id = '00000000-0000-0000-0000-0000000e8307'$$,
  $$values ('00000000-0000-0000-0000-0000000e8404'::uuid, 'PREMOLBGO'::text, 30.0000::numeric(14,4), 'G'::text)$$,
  'o ingrediente de outra ficha vai para o SKU novo, com o mesmo id e quantidade'
);
select results_eq(
  $$select produto_sku, unidade_saida, fator_por_unidade_base from produto_conversoes
     where unidade_id = 'uni-fe' and produto_sku in ('PREBARGOI', 'PREMOLBGO')$$,
  $$values ('PREMOLBGO'::text, 'G'::text, 1000.0000::numeric(14,4))$$,
  'a conversão vai junto para o SKU novo'
);
select is(
  (select count(*)::int from produtos where unidade_id = 'uni-fe' and sku = 'PREBARGOI'),
  0, 'não sobra produto com o SKU antigo'
);
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000e8001","role":"authenticated","aal":"aal2"}';

-- 4. Ficha mais antiga e produto com histórico: recusa, nada muda
select throws_ok(
  $$select unir_pre_preparo_ficha_existente('uni-fe', 'PREMAILIM', '00000000-0000-0000-0000-0000000e8303')$$,
  'P0001',
  'A ficha PREMOLMLS e mais antiga, entao o produto passaria de PREMAILIM para PREMOLMLS, mas ele ja aparece em contagem ou pedido e o historico nao troca de SKU',
  'produto mais novo com contagem não troca de SKU'
);
select results_eq(
  $$select p.sku, p.ficha_pre_preparo_id, f.sku from produtos p, fichas_tecnicas f
     where p.id = '00000000-0000-0000-0000-0000000e8103' and f.id = '00000000-0000-0000-0000-0000000e8303'$$,
  $$values ('PREMAILIM'::text, null::uuid, 'PREMOLMLS'::text)$$,
  'recusado: produto e ficha como estavam'
);

-- 5. Outras recusas
select throws_ok(
  $$select unir_pre_preparo_ficha_existente('uni-fe', 'PREMAIVER', '00000000-0000-0000-0000-0000000e8304')$$,
  'P0001', 'O produto e contado em KG e a ficha rende em LT: deixe os dois na mesma unidade antes de unir',
  'unidade da contagem diferente do rendimento é recusada'
);
select throws_ok(
  $$select unir_pre_preparo_ficha_existente('uni-fe', 'PREMOLQUE', '00000000-0000-0000-0000-0000000e8305')$$,
  'P0001',
  'A ficha PREMOLMQJ usa o proprio produto PREMOLQUE como ingrediente (direto ou dentro de outro pre-preparo): tire esse ingrediente antes de unir',
  'ficha que usa o próprio produto é recusada'
);
select throws_ok(
  $$select unir_pre_preparo_ficha_existente('uni-fe', 'MERCEB001', '00000000-0000-0000-0000-0000000e8305')$$,
  'P0001', 'Para ter ficha tecnica, o produto precisa estar no grupo PRE (SKU comecando com PRE)',
  'produto fora do grupo PRE é recusado'
);
select throws_ok(
  $$select unir_pre_preparo_ficha_existente('uni-fe', 'PREMAIVER', '00000000-0000-0000-0000-0000000e8306')$$,
  'P0001', 'So ficha de pre-preparo entra na lista de contagem',
  'ficha de venda é recusada'
);
select throws_ok(
  $$select unir_pre_preparo_ficha_existente('uni-fe-fora', 'PREMOLTOM', '00000000-0000-0000-0000-0000000e8308')$$,
  'P0001', 'Pre-preparo com ficha tecnica ainda nao esta liberado nesta unidade',
  'unidade fora do piloto é recusada'
);
select is(
  (select ficha_pre_preparo_id from produtos where id = '00000000-0000-0000-0000-0000000e8108'),
  null::uuid, 'fora do piloto nada muda'
);

-- 6. A exceção da união não vaza para fora dela
select throws_ok(
  $$update produtos set ficha_pre_preparo_id = '00000000-0000-0000-0000-0000000e8305'
     where id = '00000000-0000-0000-0000-0000000e8104'$$,
  'P0001', 'Produto e ficha vinculados precisam ter o mesmo SKU',
  'vínculo direto com SKU diferente segue recusado'
);
select throws_ok(
  $$update fichas_tecnicas set sku = 'PREMAIVER' where id = '00000000-0000-0000-0000-0000000e8304'$$,
  'P0001', 'SKU ja usado por um produto do estoque',
  'ficha solta não pega o SKU de um produto'
);
select lives_ok(
  $$set constraints produtos_ficha_pre_preparo_id_fkey immediate$$,
  'vínculos fecham no fim da transação'
);

select * from finish();
rollback;
