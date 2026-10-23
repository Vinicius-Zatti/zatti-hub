-- Pré-preparo vinculado (23/10/2026, piloto Zatti Burger) - as garantias do banco:
--   1. produto PRE marcado ganha rascunho de ficha com o SKU, o nome e a unidade dele;
--   2. de novo não duplica (idempotente) e a FK adiada fecha na hora do commit;
--   3. o "Salvar" da grade (upsert) e o salvar da ficha seguem funcionando com o SKU repetido;
--   4. unidade e SKU do par não divergem, por nenhum dos dois lados;
--   5. o pré-preparo não é ingrediente da própria ficha, nem por dentro de outro pré-preparo;
--   6. ficha primeiro: o produto nasce com o SKU da ficha; sem vínculo continua recusado;
--   7. a troca do código da categoria preserva o SKU da ficha vinculada;
--   8. unidade fora do piloto e produto fora do grupo PRE são recusados;
--   9. desmarcar muda produto e ficha juntos; ficha excluída solta o produto.
-- Sem dado real - fixtures isoladas.

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-0000000e7001', 'gestao.prepreparo@teste.local', 'x', now(),
        'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo)
values ('org-prepreparo', 'Organização do pré-preparo', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, fichas_tecnicas_habilitado, pre_preparo_vinculado_habilitado)
values
  ('uni-prepreparo-piloto', 'org-prepreparo', 'Piloto', 'banco', true, true, true),
  ('uni-prepreparo-fora', 'org-prepreparo', 'Fora do piloto', 'banco', true, true, false);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
values ('00000000-0000-0000-0000-0000000e7001', 'org-prepreparo', null, 'gestao', 'ativo');

insert into produtos (unidade_id, sku, grupo, nome, unidade_base, preco_unitario, ativo)
values
  ('uni-prepreparo-piloto', 'PRECOXCOS', 'PRE', 'coxinha de costela da casa', 'UN', 2, true),
  ('uni-prepreparo-piloto', 'CARCOS001', 'CAR', 'costela', 'KG', 40, true),
  ('uni-prepreparo-piloto', 'MERFAR001', 'MER', 'farinha', 'KG', 5, true),
  ('uni-prepreparo-piloto', 'PREPPRSOL', 'PRE', 'produto solto da casa', 'KG', 1, true),
  ('uni-prepreparo-piloto', 'PREMAICAS', 'PRE', 'maionese da casa', 'KG', 12, true),
  ('uni-prepreparo-fora', 'PREMOLTOM', 'PRE', 'molho de tomate da casa', 'KG', 8, true);
insert into categorias_ficha (unidade_id, camada, codigo, nome)
values ('uni-prepreparo-piloto', 'PRE', 'MOL', 'Molhos');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000e7001","role":"authenticated","aal":"aal2"}';

-- 1 e 2. Produto primeiro
select lives_ok(
  $$select criar_ficha_pre_preparo_do_produto('uni-prepreparo-piloto', 'PRECOXCOS')$$,
  'produto PRE marcado gera o rascunho da ficha'
);
select results_eq(
  $$select f.sku, f.camada, f.nome, f.rendimento_unidade, f.status, c.codigo
      from fichas_tecnicas f join categorias_ficha c on c.id = f.categoria_id
     where f.unidade_id = 'uni-prepreparo-piloto' and f.sku = 'PRECOXCOS'$$,
  $$values ('PRECOXCOS'::text, 'PRE'::text, 'coxinha de costela da casa'::text, 'UN'::text, 'rascunho'::text, 'PPR'::text)$$,
  'rascunho com SKU, nome e unidade do produto, na categoria Pré-preparos'
);
select ok(
  (select pre_preparo and ficha_pre_preparo_id = (select id from fichas_tecnicas where unidade_id = 'uni-prepreparo-piloto' and sku = 'PRECOXCOS')
     from produtos where unidade_id = 'uni-prepreparo-piloto' and sku = 'PRECOXCOS'),
  'produto fica marcado e apontando para a ficha'
);
select is(
  criar_ficha_pre_preparo_do_produto('uni-prepreparo-piloto', 'PRECOXCOS'),
  (select id from fichas_tecnicas where unidade_id = 'uni-prepreparo-piloto' and sku = 'PRECOXCOS'),
  'chamar de novo devolve a mesma ficha'
);
select is(
  (select count(*)::int from fichas_tecnicas where unidade_id = 'uni-prepreparo-piloto' and sku = 'PRECOXCOS'),
  1, 'sem ficha duplicada'
);
select is(
  (select count(*)::int from ficha_versoes v join fichas_tecnicas f on f.id = v.ficha_id where f.sku = 'PRECOXCOS'),
  1, 'rascunho nasce com a versão 1 registrada'
);
select lives_ok($$set constraints produtos_ficha_pre_preparo_id_fkey immediate$$, 'FK adiada fecha no fim');
set constraints produtos_ficha_pre_preparo_id_fkey deferred;

-- 3. Grade e ficha continuam salvando
select lives_ok(
  $$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, preco_unitario, ativo)
    values ('uni-prepreparo-piloto', 'PRECOXCOS', 'PRE', 'coxinha de costela da casa', 'UN', 3, true)
    on conflict (unidade_id, sku) do update set sku = excluded.sku, preco_unitario = excluded.preco_unitario,
      nome = excluded.nome, unidade_base = excluded.unidade_base$$,
  'upsert da grade num produto vinculado passa'
);
select lives_ok(
  $$select salvar_ficha_tecnica('uni-prepreparo-piloto', f.id, f.categoria_id, 'PRE', 'coxinha de costela',
      10, 'UN', null, null, null, '', '', 'ativa',
      '[{"produto_sku":"CARCOS001","quantidade":0.5,"unidade_uso":"KG","ordem":0}]'::jsonb, '[]'::jsonb)
    from fichas_tecnicas f where f.unidade_id = 'uni-prepreparo-piloto' and f.sku = 'PRECOXCOS'$$,
  'salvar a ficha vinculada com ingredientes passa'
);

-- 4. Unidade e SKU não divergem
select throws_ok(
  $$select salvar_ficha_tecnica('uni-prepreparo-piloto', f.id, f.categoria_id, 'PRE', 'coxinha de costela',
      1, 'KG', null, null, null, '', '', 'ativa', '[]'::jsonb, '[]'::jsonb)
    from fichas_tecnicas f where f.unidade_id = 'uni-prepreparo-piloto' and f.sku = 'PRECOXCOS'$$,
  'P0001', 'Esta ficha esta na lista de contagem em UN: o rendimento precisa ficar em UN',
  'rendimento da ficha não sai da unidade da contagem'
);
select throws_ok(
  $$update produtos set unidade_base = 'KG' where unidade_id = 'uni-prepreparo-piloto' and sku = 'PRECOXCOS'$$,
  'P0001', 'A unidade da contagem precisa ser a mesma do rendimento da ficha (UN)',
  'unidade da contagem não sai da unidade da ficha'
);
select throws_ok(
  $$update produtos set sku = 'PRECOXCAS' where unidade_id = 'uni-prepreparo-piloto' and sku = 'PRECOXCOS'$$,
  'P0001', 'Produto vinculado a uma ficha tecnica: o SKU nao pode mudar', 'SKU do produto vinculado não muda'
);

-- 5. Não é ingrediente de si mesmo
select throws_ok(
  $$select salvar_ficha_tecnica('uni-prepreparo-piloto', f.id, f.categoria_id, 'PRE', 'coxinha de costela',
      10, 'UN', null, null, null, '', '', 'ativa',
      '[{"produto_sku":"PRECOXCOS","quantidade":1,"unidade_uso":"UN","ordem":0}]'::jsonb, '[]'::jsonb)
    from fichas_tecnicas f where f.unidade_id = 'uni-prepreparo-piloto' and f.sku = 'PRECOXCOS'$$,
  'P0001', 'O pre-preparo nao pode ser ingrediente da propria ficha, nem por dentro de outro pre-preparo',
  'pré-preparo não entra na própria receita'
);

-- 6. Ficha primeiro
select lives_ok(
  $$select salvar_ficha_tecnica('uni-prepreparo-piloto', null,
      (select id from categorias_ficha where unidade_id = 'uni-prepreparo-piloto' and codigo = 'MOL'),
      'PRE', 'Molho de tomate', 3, 'KG', null, null, null, '', '', 'rascunho', '[]'::jsonb, '[]'::jsonb)$$,
  'ficha PRE nova pela regra de sempre'
);
select throws_ok(
  $$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, ativo)
    select 'uni-prepreparo-piloto', sku, 'PRE', 'molho de tomate da casa', 'KG', true
      from fichas_tecnicas where unidade_id = 'uni-prepreparo-piloto' and nome = 'Molho de tomate'$$,
  'P0001', 'SKU ja usado por uma ficha tecnica', 'produto com SKU de ficha, sem vínculo, segue recusado'
);
select throws_ok(
  $$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, ativo, pre_preparo, ficha_pre_preparo_id)
    select 'uni-prepreparo-piloto', sku, 'PRE', 'molho de tomate da casa', 'UN', true, true, id
      from fichas_tecnicas where unidade_id = 'uni-prepreparo-piloto' and nome = 'Molho de tomate'$$,
  'P0001', 'A unidade da contagem precisa ser a mesma do rendimento da ficha (KG)',
  'produto da ficha nasce na unidade de rendimento dela'
);
select lives_ok(
  $$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, ativo, pre_preparo, ficha_pre_preparo_id)
    select 'uni-prepreparo-piloto', sku, 'PRE', 'molho de tomate da casa', 'KG', true, true, id
      from fichas_tecnicas where unidade_id = 'uni-prepreparo-piloto' and nome = 'Molho de tomate'$$,
  'ficha incluída na contagem vira produto com o SKU dela'
);
select throws_ok(
  $$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, ativo, pre_preparo, ficha_pre_preparo_id)
    select 'uni-prepreparo-piloto', 'PREMOLOUT', 'PRE', 'outro molho da casa', 'KG', true, true, id
      from fichas_tecnicas where unidade_id = 'uni-prepreparo-piloto' and nome = 'Molho de tomate'$$,
  'P0001', 'Produto e ficha vinculados precisam ter o mesmo SKU',
  'a mesma ficha não vira um segundo produto com outro SKU'
);

-- Regras antigas intactas: ficha nova com SKU de produto sem vínculo é
-- recusada, e ficha solta continua presa ao código da categoria.
select throws_ok(
  $$insert into fichas_tecnicas (unidade_id, categoria_id, sku, camada, nome, rendimento_quantidade,
      rendimento_unidade, criado_por, atualizado_por)
    values ('uni-prepreparo-piloto',
      (select id from categorias_ficha where unidade_id = 'uni-prepreparo-piloto' and codigo = 'PPR'),
      'PREPPRSOL', 'PRE', 'produto solto', 1, 'KG', auth.uid(), auth.uid())$$,
  'P0001', 'SKU ja usado por um produto do estoque', 'ficha com SKU de produto sem vínculo segue recusada'
);
select throws_ok(
  $$insert into fichas_tecnicas (unidade_id, categoria_id, sku, camada, nome, rendimento_quantidade,
      rendimento_unidade, criado_por, atualizado_por)
    values ('uni-prepreparo-piloto',
      (select id from categorias_ficha where unidade_id = 'uni-prepreparo-piloto' and codigo = 'PPR'),
      'PREMERFAR', 'PRE', 'farinha', 1, 'KG', auth.uid(), auth.uid())$$,
  'P0001', 'Categoria, camada e SKU nao correspondem', 'ficha solta continua presa ao código da categoria'
);

-- 5b. Ciclo por dentro de outro pré-preparo: coxinha usa maionese, maionese não usa coxinha.
select lives_ok(
  $$select criar_ficha_pre_preparo_do_produto('uni-prepreparo-piloto', 'PREMAICAS')$$,
  'segundo pré-preparo com ficha'
);
select lives_ok(
  $$select salvar_ficha_tecnica('uni-prepreparo-piloto', f.id, f.categoria_id, 'PRE', 'coxinha de costela',
      10, 'UN', null, null, null, '', '', 'ativa',
      '[{"produto_sku":"CARCOS001","quantidade":0.5,"unidade_uso":"KG","ordem":0},
        {"produto_sku":"PREMAICAS","quantidade":0.1,"unidade_uso":"KG","ordem":1}]'::jsonb, '[]'::jsonb)
    from fichas_tecnicas f where f.unidade_id = 'uni-prepreparo-piloto' and f.sku = 'PRECOXCOS'$$,
  'pré-preparo usa outro pré-preparo como ingrediente'
);
select throws_ok(
  $$select salvar_ficha_tecnica('uni-prepreparo-piloto', f.id, f.categoria_id, 'PRE', f.nome,
      1, 'KG', null, null, null, '', '', 'ativa',
      '[{"produto_sku":"PRECOXCOS","quantidade":1,"unidade_uso":"UN","ordem":0}]'::jsonb, '[]'::jsonb)
    from fichas_tecnicas f where f.unidade_id = 'uni-prepreparo-piloto' and f.sku = 'PREMAICAS'$$,
  'P0001', 'O pre-preparo nao pode ser ingrediente da propria ficha, nem por dentro de outro pre-preparo',
  'ciclo indireto entre pré-preparos é recusado'
);

-- 7. Troca do código da categoria preserva o SKU vinculado
select lives_ok(
  $$select renomear_categoria_ficha('uni-prepreparo-piloto',
      (select id from categorias_ficha where unidade_id = 'uni-prepreparo-piloto' and codigo = 'PPR'),
      'PPX', 'Pré-preparos')$$,
  'trocar o código da categoria com ficha vinculada passa'
);
select is(
  (select sku from fichas_tecnicas where unidade_id = 'uni-prepreparo-piloto' and nome = 'coxinha de costela'),
  'PRECOXCOS', 'ficha vinculada mantém o SKU do produto'
);

-- 8. Recusas
select throws_ok(
  $$select criar_ficha_pre_preparo_do_produto('uni-prepreparo-piloto', 'MERFAR001')$$,
  'P0001', 'Para ter ficha tecnica, o produto precisa estar no grupo PRE (SKU comecando com PRE)',
  'produto fora do grupo PRE não ganha ficha'
);
select throws_ok(
  $$select criar_ficha_pre_preparo_do_produto('uni-prepreparo-fora', 'PREMOLTOM')$$,
  'P0001', 'Pre-preparo com ficha tecnica ainda nao esta liberado nesta unidade',
  'unidade fora do piloto é recusada'
);
select is(
  (select count(*)::int from fichas_tecnicas where unidade_id = 'uni-prepreparo-fora'),
  0, 'unidade fora do piloto fica sem ficha nova'
);

-- 9. Desmarcar e excluir
select lives_ok(
  $$select desmarcar_pre_preparo('uni-prepreparo-piloto', 'PREMAICAS')$$,
  'desmarcar a chave'
);
select results_eq(
  $$select p.pre_preparo, f.status, p.ficha_pre_preparo_id = f.id
      from produtos p join fichas_tecnicas f on f.unidade_id = p.unidade_id and f.sku = p.sku
     where p.unidade_id = 'uni-prepreparo-piloto' and p.sku = 'PREMAICAS'$$,
  $$values (false, 'inativa'::text, true)$$,
  'desmarcado: produto sem a chave, ficha inativa, vínculo mantido para religar'
);
delete from ficha_componentes where ficha_id = (
  select id from fichas_tecnicas where unidade_id = 'uni-prepreparo-piloto' and sku = 'PRECOXCOS');
delete from fichas_tecnicas where unidade_id = 'uni-prepreparo-piloto' and sku = 'PRECOXCOS';
select results_eq(
  $$select pre_preparo, ficha_pre_preparo_id from produtos
     where unidade_id = 'uni-prepreparo-piloto' and sku = 'PRECOXCOS'$$,
  $$values (false, null::uuid)$$,
  'ficha excluída solta o produto (a chave não recria a ficha sozinha)'
);

select * from finish();
rollback;
