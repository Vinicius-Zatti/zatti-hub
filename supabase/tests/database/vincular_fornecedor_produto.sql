-- Vínculo do fornecedor no Cadastro pela cotação (24/10/2026): vaga livre, duplicidade
-- ignorando espaço e maiúscula, 4 vagas cheias, produto inexistente e RLS de outra unidade.
-- Sem dado real - fixtures isoladas.

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-0000000f7001', 'gestao.vinculo@teste.local', 'x', now(),
        'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo)
values ('org-vinculo', 'Organização do vínculo', 'saas', true),
       ('org-vinculo-outra', 'Outra organização', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo)
values ('uni-vinculo', 'org-vinculo', 'Unidade do vínculo', 'banco', true),
       ('uni-vinculo-outra', 'org-vinculo-outra', 'Outra unidade', 'banco', true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
values ('00000000-0000-0000-0000-0000000f7001', 'org-vinculo', null, 'gestao', 'ativo');

insert into produtos (unidade_id, sku, grupo, nome, preco_unitario, fornecedor_1, fornecedor_2, fornecedor_3, fornecedor_4)
values
  ('uni-vinculo', 'HORTOM001', 'HOR', 'tomate', 10, 'Ceasa', '', '', ''),
  ('uni-vinculo', 'HORCEB001', 'HOR', 'cebola', 5, 'A', 'B', 'C', 'D'),
  ('uni-vinculo-outra', 'HORALH001', 'HOR', 'alho', 7, '', '', '', '');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000f7001","role":"authenticated","aal":"aal2"}';

select is(vincular_fornecedor_produto('uni-vinculo', 'HORTOM001', 'JM'), 'fornecedor_2',
  'grava na primeira vaga livre');
select results_eq(
  $$select fornecedor_1, fornecedor_2, preco_unitario from produtos where unidade_id = 'uni-vinculo' and sku = 'HORTOM001'$$,
  $$values ('Ceasa'::text, 'JM'::text, 10::numeric)$$,
  'só a vaga muda; fornecedor 1 e preço ficam como estavam');
select is(vincular_fornecedor_produto('uni-vinculo', 'HORTOM001', '  jm '), 'ja_vinculado',
  'mesmo fornecedor com espaço e minúscula não grava de novo');
select is(vincular_fornecedor_produto('uni-vinculo', 'HORTOM001', 'Bahia'), 'fornecedor_3',
  'o segundo fornecedor vai para a vaga seguinte, sem apagar o primeiro');
select is(vincular_fornecedor_produto('uni-vinculo', 'HORCEB001', 'JM'), 'sem_vaga',
  '4 vagas cheias não sobrescrevem ninguém');
select is(vincular_fornecedor_produto('uni-vinculo', 'NAOEXISTE', 'JM'), 'sem_produto',
  'SKU inexistente não cria produto');
select is(vincular_fornecedor_produto('uni-vinculo-outra', 'HORALH001', 'JM'), 'sem_produto',
  'produto de unidade sem acesso fica invisível (RLS)');

reset role;
select is((select fornecedor_1 from produtos where unidade_id = 'uni-vinculo-outra' and sku = 'HORALH001'), '',
  'produto da outra unidade continua sem fornecedor');

select * from finish();
rollback;
