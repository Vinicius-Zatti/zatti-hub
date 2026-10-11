-- Financeiro V2 (11/10/2026), fatia F4: Caixa de Entrada e configuração do alerta diário.
-- Fixtures isoladas, sem dado real.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000e4001', 'gestao.cx@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e4002', 'oper.cx@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e4003', 'fora.cx@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-cx', 'Org CX', 'saas', true), ('org-cx-fora', 'Fora', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, financeiro_gerencial_habilitado, financeiro_liberado_equipe) values
  ('uni-cx', 'org-cx', 'CX', 'banco', true, true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000e4001', 'org-cx', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000e4002', 'org-cx', 'uni-cx', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000e4003', 'org-cx-fora', null, 'gestao', 'ativo');
select public.semear_categorias_financeiras('uni-cx');
insert into fin_integracao_tokens (escopo, versao, hash) values
  ('caixa_entrada', 1, encode(extensions.digest('token-caixa-0123456789abcdef0123456789', 'sha256'), 'hex'));

create temp table cat as select (select id from fin_categorias where unidade_id = 'uni-cx' and codigo_sistema = 'cmc_compras_mercadorias') as merc;
grant select on cat to authenticated;
create function pg_temp.como(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;

-- Estrutura e token.
select ok(not has_table_privilege('authenticated', 'public.fin_caixa_entrada', 'INSERT')
  and not has_table_privilege('authenticated', 'public.fin_caixa_entrada', 'UPDATE'), 'entrada só muda pelas RPCs');
select ok(not has_function_privilege('authenticated', 'public.fin_caixa_entrada_registrar(text,text,text,text,text,integer,text,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.fin_caixa_entrada_registrar(text,text,text,text,text,integer,text,uuid)', 'EXECUTE'),
  'registrar entrada é só do servidor');
select ok(public.fin_integracao_token_valido('token-caixa-0123456789abcdef0123456789', 'caixa_entrada'), 'token certo no escopo certo vale');
select ok(not public.fin_integracao_token_valido('token-caixa-0123456789abcdef0123456789', 'alertas'), 'token de outro escopo não vale');

-- Registro pelo servidor: mesmo arquivo reaproveita a entrada.
create temp table e1 as select public.fin_caixa_entrada_registrar('uni-cx', 'whatsapp', 'Ana (final 1234)', 'nota.pdf',
  'application/pdf', 1000, repeat('a', 64), null) as r;
select is((public.fin_caixa_entrada_registrar('uni-cx', 'drive', 'Pasta', 'nota-copia.pdf', 'application/pdf', 1000, repeat('a', 64), null))->>'id',
  (select r->>'id' from e1), 'mesmo arquivo por outro canal reaproveita a entrada');
update fin_caixa_entrada set arquivo_gravado = true where id = (select (r->>'id')::uuid from e1);
select ok(public.fin_caixa_entrada_travar_leitura((select (r->>'id')::uuid from e1)), 'trava a leitura');
select ok(public.fin_caixa_entrada_travar_leitura((select (r->>'id')::uuid from e1)) is null, 'segunda leitura simultânea não trava');
update fin_caixa_entrada set situacao = 'lido' where id = (select (r->>'id')::uuid from e1);
grant select on e1 to authenticated;

set local role authenticated;

-- Lançar: documento + vínculo numa transação.
select pg_temp.como('00000000-0000-0000-0000-0000000e4002');
select is((select count(*)::int from fin_caixa_entrada), 1, 'Operacional da unidade vê a entrada');
create temp table d as select public.fin_caixa_entrada_lancar((select (r->>'id')::uuid from e1), jsonb_build_object(
  'chave', 'cx-doc-00001', 'digest', repeat('c', 64), 'tipo', 'despesa', 'descricao', 'NF Atacadão', 'data_competencia', '2026-10-05',
  'vencimentos', jsonb_build_array('2026-10-20'),
  'linhas', jsonb_build_array(jsonb_build_object('categoria_id', (select merc from cat), 'valor', 1000, 'celulas', jsonb_build_array(1000))))) as id;
select is((select situacao from fin_caixa_entrada), 'lancado', 'entrada fica lançada');
select is((select origem from fin_documentos where id = (select id from d)), 'caixa_entrada', 'documento nasce com origem Caixa de Entrada');
select throws_ok($$ select public.fin_caixa_entrada_tratar((select (r->>'id')::uuid from e1), 'descartar', null, 'duplicada') $$,
  'P0001', null, 'entrada já lançada não é tratada de novo');

-- Configuração: só Gestão; número serve uma unidade só.
select throws_ok($$ select public.fin_caixa_entrada_configurar('uni-cx', '{"acao":"adicionar_remetente","telefone":"(16) 99999-0000","nome":"Ana"}') $$,
  '42501', null, 'Operacional não configura');
select pg_temp.como('00000000-0000-0000-0000-0000000e4001');
select lives_ok($$ select public.fin_caixa_entrada_configurar('uni-cx', '{"acao":"adicionar_remetente","telefone":"(16) 99999-0000","nome":"Ana"}') $$,
  'Gestão cadastra número');
select is((select telefone from fin_caixa_entrada_remetentes), '5516999990000', 'número gravado com 55');
select throws_ok($$ select public.fin_caixa_entrada_configurar('uni-cx', '{"acao":"adicionar_remetente","telefone":"5516999990000","nome":"Outra"}') $$,
  '23505', null, 'mesmo número não entra duas vezes');
select lives_ok($$ select public.fin_alerta_configurar('uni-cx', '{"acao":"adicionar","telefone":"16 99999-0000","nome":"Vinícius"}') $$,
  'Gestão cadastra destinatário do alerta');

-- Outra organização não vê nada.
select pg_temp.como('00000000-0000-0000-0000-0000000e4003');
select is((select count(*)::int from fin_caixa_entrada) + (select count(*)::int from fin_alerta_destinatarios), 0,
  'outra organização não vê entradas nem destinatários');

select * from finish();
rollback;
