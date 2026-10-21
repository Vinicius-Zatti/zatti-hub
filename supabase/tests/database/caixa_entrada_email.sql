-- Caixa de Entrada por e-mail (21/10/2026): remetente autorizado por unidade, apelido automático,
-- só Gestão configura, canal 'email' aceito no registro. Fixtures isoladas, sem dado real.

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000e5001', 'gestao.em@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e5002', 'oper.em@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-em', 'Org EM', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, financeiro_gerencial_habilitado, financeiro_liberado_equipe) values
  ('emteste-loja-um', 'org-em', 'EM 1', 'banco', true, true, true),
  ('emteste-loja-dois', 'org-em', 'EM 2', 'banco', true, true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000e5001', 'org-em', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000e5002', 'org-em', 'emteste-loja-um', 'operacional', 'ativo');

create function pg_temp.como(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;

select ok(not has_table_privilege('authenticated', 'public.fin_caixa_entrada_emails', 'INSERT')
  and not has_table_privilege('authenticated', 'public.fin_caixa_entrada_enderecos', 'INSERT'),
  'e-mail autorizado e apelido só mudam pela configuração');
select lives_ok($$ select public.fin_caixa_entrada_registrar('emteste-loja-um', 'email', 'Ana (e-mail)', 'nota.xml',
  'application/xml', 500, repeat('e', 64), null) $$, 'canal e-mail é aceito no registro');

set local role authenticated;

select pg_temp.como('00000000-0000-0000-0000-0000000e5002');
select throws_ok($$ select public.fin_caixa_entrada_configurar('emteste-loja-um', '{"acao":"adicionar_email","email":"a@b.com","nome":"Ana"}') $$,
  '42501', null, 'Operacional não autoriza e-mail');

select pg_temp.como('00000000-0000-0000-0000-0000000e5001');
select lives_ok($$ select public.fin_caixa_entrada_configurar('emteste-loja-um', '{"acao":"adicionar_email","email":" Ana@Fornecedor.com ","nome":"Ana"}') $$,
  'Gestão autoriza e-mail');
select is((select email from fin_caixa_entrada_emails where unidade_id = 'emteste-loja-um'), 'ana@fornecedor.com',
  'e-mail guardado em minúsculas e sem espaço');
select is((select apelido from fin_caixa_entrada_enderecos where unidade_id = 'emteste-loja-um'), 'emteste',
  'apelido nasce com a primeira palavra da unidade');
select throws_ok($$ select public.fin_caixa_entrada_configurar('emteste-loja-um', '{"acao":"adicionar_email","email":"ana@fornecedor.com","nome":"De novo"}') $$,
  '23505', null, 'mesmo e-mail duas vezes na unidade não entra');
select public.fin_caixa_entrada_configurar('emteste-loja-dois', '{"acao":"adicionar_email","email":"ana@fornecedor.com","nome":"Ana"}');
select is((select apelido from fin_caixa_entrada_enderecos where unidade_id = 'emteste-loja-dois'), 'emteste-loja-dois',
  'apelido já usado: a outra unidade fica com o id inteiro');
select public.fin_caixa_entrada_configurar('emteste-loja-um', json_build_object('acao', 'remover_email',
  'id', (select id from fin_caixa_entrada_emails where unidade_id = 'emteste-loja-um'))::jsonb);
select is((select count(*)::int from fin_caixa_entrada_emails where unidade_id = 'emteste-loja-um' and ativo), 0,
  'Gestão remove e-mail autorizado');

select pg_temp.como('00000000-0000-0000-0000-0000000e5002');
select is((select count(*)::int from fin_caixa_entrada_emails), 0, 'Operacional não vê a lista de e-mails');

select * from finish();
rollback;
