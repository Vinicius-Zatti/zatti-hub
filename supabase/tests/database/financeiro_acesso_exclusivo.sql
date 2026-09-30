-- Financeiro Gerencial, Conciliação e Uso de IA só para Vinícius (29/09/2026).
-- Garante no banco: titular master com aal2 acessa; Gestão, Operacional e
-- outro master não acessam por RLS nem por RPC; vínculos e outros módulos
-- continuam; a restrição é reversível pela linha de configuração.
-- Fixtures isoladas, sem dado real.

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- ── Fixture ────────────────────────────────────────────────────────────────
update fin_acesso_exclusivo set ativo = true where id;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000fe001', 'titular@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000fe002', 'outro.master@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000fe003', 'gestao@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000fe004', 'oper@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-fe', 'Org FE', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo,
  financeiro_gerencial_habilitado, conciliacao_habilitada) values
  ('uni-fe', 'org-fe', 'FE', 'banco', true, true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000fe001', 'org-fe', null, 'master', 'ativo'),
  ('00000000-0000-0000-0000-0000000fe002', 'org-fe', null, 'master', 'ativo'),
  ('00000000-0000-0000-0000-0000000fe003', 'org-fe', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000fe004', 'org-fe', 'uni-fe', 'operacional', 'ativo');
insert into fin_acesso_titulares (user_id) values ('00000000-0000-0000-0000-0000000fe001');

select public.semear_categorias_financeiras('uni-fe');
insert into fin_contas_financeiras (id, unidade_id, nome, tipo)
  values ('00000000-0000-0000-0000-0000000fec01', 'uni-fe', 'Banco FE', 'banco');
insert into fin_lancamentos (id, unidade_id, tipo, categoria_id, descricao, data_competencia, criado_por)
select '00000000-0000-0000-0000-0000000fed01', 'uni-fe', 'despesa', c.id, 'Fornecedor teste', '2026-09-01',
       '00000000-0000-0000-0000-0000000fe001'
from fin_categorias c where c.unidade_id = 'uni-fe' and c.codigo_sistema = 'cmc_compras_mercadorias';
insert into fin_parcelas (id, unidade_id, lancamento_id, numero, total_parcelas, valor, data_prevista) values
  ('00000000-0000-0000-0000-0000000fed11', 'uni-fe', '00000000-0000-0000-0000-0000000fed01', 1, 1, 100, '2026-09-29');

create temp table vinculos_antes as select count(*) as n from vinculos where organizacao_id = 'org-fe';
grant select on vinculos_antes to authenticated;
create temp table cat_fe as
  select id from fin_categorias where unidade_id = 'uni-fe' and codigo_sistema = 'cmc_compras_mercadorias';
grant select on cat_fe to authenticated;

create function pg_temp.como(p_user text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

-- ── Estrutura ──────────────────────────────────────────────────────────────
select ok(not has_table_privilege('authenticated', 'public.fin_acesso_titulares', 'SELECT'),
  'titulares não são legíveis pela API');
select ok(not has_table_privilege('authenticated', 'public.fin_acesso_exclusivo', 'UPDATE'),
  'restrição não pode ser desligada pela API');
select ok(not has_function_privilege('anon', 'public.usuario_e_titular_financeiro()', 'EXECUTE'),
  'anon não executa o helper');

set local role authenticated;

-- ── Titular (Vinícius) ─────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000fe001', 'aal2');
select ok(public.usuario_pode_usar_financeiro_gerencial('uni-fe', null), 'titular com aal2 acessa o Financeiro');
select ok(public.usuario_pode_usar_conciliacao('uni-fe', array['gestao']), 'titular com aal2 acessa a Conciliação');
select is((select count(*)::int from fin_lancamentos), 1, 'titular vê os lançamentos');
select is((select count(*)::int from fin_parcelas), 1, 'titular vê as parcelas');

select pg_temp.como('00000000-0000-0000-0000-0000000fe001', 'aal1');
select ok(not public.usuario_pode_usar_financeiro_gerencial('uni-fe', null), 'titular sem segundo fator não acessa');
select is((select count(*)::int from fin_lancamentos), 0, 'titular sem segundo fator não vê lançamentos');

-- ── Outro master ───────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000fe002', 'aal2');
select ok(not public.usuario_pode_usar_financeiro_gerencial('uni-fe', null), 'outro master não acessa o Financeiro');
select ok(not public.usuario_pode_usar_conciliacao('uni-fe', null), 'outro master não acessa a Conciliação');
select is((select count(*)::int from fin_lancamentos), 0, 'outro master não vê lançamentos');
select ok(public.usuario_tem_acesso_unidade('uni-fe', null), 'outro master mantém a unidade nos outros módulos');

-- ── Gestão ─────────────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000fe003', 'aal2');
select ok(not public.usuario_pode_usar_financeiro_gerencial('uni-fe', array['gestao']), 'Gestão não acessa o Financeiro');
select is((select count(*)::int from fin_categorias), 0, 'Gestão não vê o Plano de Contas');
select throws_ok($$insert into fin_contas_financeiras (unidade_id, nome, tipo) values ('uni-fe', 'Nova', 'banco')$$,
  '42501', null, 'Gestão não cria conta financeira');
select is((select count(*)::int from public.listar_auditoria_financeiro_gerencial('uni-fe', 10)), 0,
  'Gestão não lê a auditoria do Financeiro');
select ok(public.usuario_tem_acesso_unidade('uni-fe', array['gestao']), 'Gestão mantém a unidade nos outros módulos');

-- ── Operacional ────────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000fe004');
select is((select count(*)::int from fin_parcelas), 0, 'Operacional não vê parcelas');
select throws_ok($$insert into fin_lancamentos (unidade_id, tipo, categoria_id, descricao, data_competencia, criado_por)
  select 'uni-fe', 'despesa', c.id, 'x', '2026-09-01', auth.uid() from cat_fe c$$, null, null,
  'Operacional não lança (recusado pelo gatilho ou pela RLS)');
select is((select count(*)::int from fin_lancamentos), 0, 'nada foi gravado pelo Operacional');
select ok(public.usuario_tem_acesso_unidade('uni-fe', null), 'Operacional mantém a unidade nos outros módulos');

-- ── Vínculos intactos e reversibilidade ────────────────────────────────────
reset role;
select is((select count(*) from vinculos where organizacao_id = 'org-fe'), (select n from vinculos_antes),
  'nenhum vínculo foi apagado');

delete from fin_acesso_exclusivo;
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000fe003', 'aal2');
select ok(not public.usuario_pode_usar_financeiro_gerencial('uni-fe', null),
  'sem a linha de configuração a restrição continua ligada (falha fechada)');

reset role;
insert into fin_acesso_exclusivo (id, ativo, motivo) values (true, false, 'teste: segunda ordem');
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000fe003', 'aal2');
select ok(public.usuario_pode_usar_financeiro_gerencial('uni-fe', array['gestao']),
  'desligar a restrição devolve o acesso por papel');

select * from finish();
rollback;
