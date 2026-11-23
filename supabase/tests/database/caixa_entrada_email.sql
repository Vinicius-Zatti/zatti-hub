-- Caixa de Entrada por e-mail (23/11/2026): remetente autorizado por unidade, apelido automático,
-- só Gestão/master configura, canais 'sefaz' e 'email' aceitos no registro. Fixtures isoladas.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000e5001', 'gestao.em@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e5002', 'oper.em@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e5003', 'master.em@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-em', 'Org EM', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, financeiro_gerencial_habilitado, financeiro_liberado_equipe) values
  ('emteste-loja-um', 'org-em', 'EM 1', 'banco', true, true, true),
  ('emteste-loja-dois', 'org-em', 'EM 2', 'banco', true, true, true),
  ('emteste-loja-tres', 'org-em', 'EM 3', 'banco', true, true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000e5001', 'org-em', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000e5002', 'org-em', 'emteste-loja-um', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000e5003', 'org-em', null, 'master', 'ativo');

create function pg_temp.como(p_user text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

-- Estrutura e canais.
select ok(not has_table_privilege('authenticated', 'public.fin_caixa_entrada_emails', 'INSERT')
  and not has_table_privilege('authenticated', 'public.fin_caixa_entrada_enderecos', 'INSERT'),
  'e-mail autorizado e apelido só mudam pela configuração');
select lives_ok($$ select public.fin_caixa_entrada_registrar('emteste-loja-um', 'email', 'Ana (ana@fornecedor.com)', 'nota.pdf',
  'application/pdf', 500, repeat('e', 64), null) $$, 'canal e-mail é aceito no registro');
select lives_ok($$ select public.fin_caixa_entrada_registrar('emteste-loja-um', 'sefaz', 'SEFAZ (CNPJ final 000100)', 'nota.xml',
  'application/xml', 500, repeat('f', 64), null) $$, 'canal sefaz continua aceito no registro');
select throws_ok($$ select public.fin_caixa_entrada_registrar('emteste-loja-um', 'pombo', 'x', 'nota.pdf',
  'application/pdf', 500, repeat('d', 64), null) $$, '23514', null, 'canal desconhecido é recusado');

set local role authenticated;

-- Só Gestão/master configura.
select pg_temp.como('00000000-0000-0000-0000-0000000e5002');
select throws_ok($$ select public.fin_caixa_entrada_configurar('emteste-loja-um', '{"acao":"adicionar_email","email":"a@b.com","nome":"Ana"}') $$,
  '42501', null, 'Operacional não autoriza e-mail');

select pg_temp.como('00000000-0000-0000-0000-0000000e5001');
select lives_ok($$ select public.fin_caixa_entrada_configurar('emteste-loja-um', '{"acao":"adicionar_email","email":" Ana@Fornecedor.com ","nome":"Ana"}') $$,
  'Gestão autoriza e-mail');
select is((select email from fin_caixa_entrada_emails where unidade_id = 'emteste-loja-um'), 'ana@fornecedor.com',
  'e-mail guardado em minúsculas e sem espaço');
select is((select apelido from fin_caixa_entrada_enderecos where unidade_id = 'emteste-loja-um'), 'emteste',
  'apelido nasce com a primeira parte do id da unidade');
select throws_ok($$ select public.fin_caixa_entrada_configurar('emteste-loja-um', '{"acao":"adicionar_email","email":"ana@fornecedor.com","nome":"De novo"}') $$,
  '23505', null, 'mesmo e-mail duas vezes na unidade não entra');
select public.fin_caixa_entrada_configurar('emteste-loja-dois', '{"acao":"adicionar_email","email":"ana@fornecedor.com","nome":"Ana"}');
select is((select apelido from fin_caixa_entrada_enderecos where unidade_id = 'emteste-loja-dois'), 'emteste-loja-dois',
  'apelido já usado: a outra unidade fica com o id inteiro');
select public.fin_caixa_entrada_configurar('emteste-loja-um', json_build_object('acao', 'remover_email',
  'id', (select id from fin_caixa_entrada_emails where unidade_id = 'emteste-loja-um'))::jsonb);
select is((select count(*)::int from fin_caixa_entrada_emails where unidade_id = 'emteste-loja-um' and ativo), 0,
  'Gestão remove e-mail autorizado');

-- Master também configura (com segundo fator).
select pg_temp.como('00000000-0000-0000-0000-0000000e5003', 'aal2');
select lives_ok($$ select public.fin_caixa_entrada_configurar('emteste-loja-tres', '{"acao":"adicionar_email","email":"bia@contador.com","nome":"Bia"}') $$,
  'Master autoriza e-mail');
select is((select apelido from fin_caixa_entrada_enderecos where unidade_id = 'emteste-loja-tres'), 'emteste-loja-tres',
  'terceira unidade com o mesmo prefixo também ganha o id inteiro');

select pg_temp.como('00000000-0000-0000-0000-0000000e5002');
select is((select count(*)::int from fin_caixa_entrada_emails), 0, 'Operacional não vê a lista de e-mails');

select * from finish();
rollback;
