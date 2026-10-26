-- "Usar a ficha existente" v2 (parecer do Codex de 26/10/2026, P1): a RPC chamada direto
-- exige, na entrada, Gestão ou master com edição em Cadastros E no Cardápio da unidade.
-- O caso testado é o "produto mais antigo", que só mexe em pre_preparo/ficha_pre_preparo_id
-- e antes não passava por nenhum gatilho de Cadastros. Sem dado real - fixtures isoladas.

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-0000000e9a01', 'gestao.semcadastros@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e9a02', 'gestao.semcardapio@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e9a03', 'operacional.uniao@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e9a04', 'master.uniao@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e9a05', 'gestao.completa.uniao@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo)
values
  ('org-fe-perm', 'Organização da permissão da união', 'saas', true),
  ('org-fe-perm-ancora', 'Âncora da permissão da união', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, fichas_tecnicas_habilitado, pre_preparo_vinculado_habilitado)
values ('uni-fe-perm', 'org-fe-perm', 'Unidade', 'banco', true, true, true);
insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status)
values
  ('00000000-0000-0000-0000-0000000e9b01', '00000000-0000-0000-0000-0000000e9a01', 'org-fe-perm', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000e9b02', '00000000-0000-0000-0000-0000000e9a02', 'org-fe-perm', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000e9b03', '00000000-0000-0000-0000-0000000e9a03', 'org-fe-perm', null, 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000e9b04', '00000000-0000-0000-0000-0000000e9a04', 'org-fe-perm-ancora', null, 'master', 'ativo'),
  ('00000000-0000-0000-0000-0000000e9b05', '00000000-0000-0000-0000-0000000e9a05', 'org-fe-perm', null, 'gestao', 'ativo');
insert into permissoes_modulo (vinculo_id, modulo, nivel)
values
  ('00000000-0000-0000-0000-0000000e9b01', 'cadastros', 'ver'),
  ('00000000-0000-0000-0000-0000000e9b02', 'cardapio', 'ver');

insert into produtos (id, unidade_id, sku, grupo, nome, unidade_base, preco_unitario, ativo, criado_em)
values ('00000000-0000-0000-0000-0000000e9c01', 'uni-fe-perm', 'PRECEBCAR', 'PRE', 'Cebola Caramelizada', 'KG', 30, true, '2026-08-10');
insert into categorias_ficha (id, unidade_id, camada, codigo, nome)
values ('00000000-0000-0000-0000-0000000e9d01', 'uni-fe-perm', 'PRE', 'REC', 'Recheios');
insert into fichas_tecnicas (id, unidade_id, categoria_id, sku, camada, nome, rendimento_quantidade,
  rendimento_unidade, status, criado_por, atualizado_por, criado_em)
values ('00000000-0000-0000-0000-0000000e9e01', 'uni-fe-perm', '00000000-0000-0000-0000-0000000e9d01', 'PRERECCCA', 'PRE',
  'Cebola caramelizada', 1, 'KG', 'rascunho', '00000000-0000-0000-0000-0000000e9a01', '00000000-0000-0000-0000-0000000e9a01', '2026-08-27');

set local role authenticated;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000e9a01","role":"authenticated","aal":"aal2"}';
select throws_ok(
  $$select unir_pre_preparo_ficha_existente('uni-fe-perm', 'PRECEBCAR', '00000000-0000-0000-0000-0000000e9e01')$$,
  '42501', 'Unir pre-preparo exige edicao em Cadastros e no Cardapio nesta unidade',
  'Gestão com Cadastros só para ver não une pela RPC'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000e9a02","role":"authenticated","aal":"aal2"}';
select throws_ok(
  $$select unir_pre_preparo_ficha_existente('uni-fe-perm', 'PRECEBCAR', '00000000-0000-0000-0000-0000000e9e01')$$,
  '42501', 'Unir pre-preparo exige edicao em Cadastros e no Cardapio nesta unidade',
  'Gestão com Cardápio só para ver não une pela RPC'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000e9a03","role":"authenticated","aal":"aal2"}';
select throws_ok(
  $$select unir_pre_preparo_ficha_existente('uni-fe-perm', 'PRECEBCAR', '00000000-0000-0000-0000-0000000e9e01')$$,
  '42501', 'Unir pre-preparo exige edicao em Cadastros e no Cardapio nesta unidade',
  'operacional não une pela RPC'
);

set local request.jwt.claims to '{"role":"authenticated"}';
select throws_ok(
  $$select unir_pre_preparo_ficha_existente('uni-fe-perm', 'PRECEBCAR', '00000000-0000-0000-0000-0000000e9e01')$$,
  '42501', 'Unir pre-preparo exige edicao em Cadastros e no Cardapio nesta unidade',
  'sem usuário não une pela RPC'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000e9a04","role":"authenticated","aal":"aal2"}';
select results_eq(
  $$select p.sku, p.ficha_pre_preparo_id, f.sku from produtos p, fichas_tecnicas f
     where p.id = '00000000-0000-0000-0000-0000000e9c01' and f.id = '00000000-0000-0000-0000-0000000e9e01'$$,
  $$values ('PRECEBCAR'::text, null::uuid, 'PRERECCCA'::text)$$,
  'as recusas não mudaram nada'
);
select is(
  unir_pre_preparo_ficha_existente('uni-fe-perm', 'PRECEBCAR', '00000000-0000-0000-0000-0000000e9e01'),
  'PRECEBCAR', 'master une pela RPC'
);
select results_eq(
  $$select p.pre_preparo, p.ficha_pre_preparo_id, f.sku from produtos p, fichas_tecnicas f
     where p.id = '00000000-0000-0000-0000-0000000e9c01' and f.id = '00000000-0000-0000-0000-0000000e9e01'$$,
  $$values (true, '00000000-0000-0000-0000-0000000e9e01'::uuid, 'PRECEBCAR'::text)$$,
  'unido pelo master: a ficha recebe o SKU do produto'
);

-- Gestão com edição nos dois módulos passa pela trava (cai na regra seguinte: já vinculada).
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000e9a05","role":"authenticated","aal":"aal2"}';
select throws_ok(
  $$select unir_pre_preparo_ficha_existente('uni-fe-perm', 'PRECEBCAR', '00000000-0000-0000-0000-0000000e9e01')$$,
  'P0001', 'Este produto ja tem ficha tecnica vinculada',
  'Gestão com edição em Cadastros e Cardápio passa pela autorização'
);

select * from finish();
rollback;
