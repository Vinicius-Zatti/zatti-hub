-- Captura de NF-e pela SEFAZ (30/10/2026). Fixtures isoladas, sem dado nem certificado real.
-- Prova: certificado e notas invisíveis para anon e usuário logado (até gestão da unidade);
-- trava de chave de acesso na Caixa de Entrada; NSU só anda para frente; uma rodada boa por dia
-- e no máximo 3 tentativas; bloqueio do 656 respeitado.

begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000f5001', 'gestao.sefaz@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-sefaz', 'Org SEFAZ', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, financeiro_gerencial_habilitado, financeiro_liberado_equipe) values
  ('uni-sefaz', 'org-sefaz', 'SEFAZ', 'banco', true, true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000f5001', 'org-sefaz', null, 'gestao', 'ativo');

insert into fin_sefaz_certificados (id, unidade_id, cnpj, uf, titular, valido_ate, envelope) values
  ('00000000-0000-0000-0000-0000000f5c01', 'uni-sefaz', '12345678000199', 'MG', 'EMPRESA TESTE', now() + interval '200 days',
   '{"chave":"a","iv":"b","tag":"c","dados":"d"}');

create function pg_temp.como(p_user text) returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
create function pg_temp.servidor() returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', null, true);
$$;

-- ── Fronteira ─────────────────────────────────────────────────────────────
select ok(not has_table_privilege('authenticated', 'public.fin_sefaz_certificados', 'SELECT')
  and not has_table_privilege('anon', 'public.fin_sefaz_certificados', 'SELECT'), 'certificado não é legível pelo app nem por anon');
select ok(not has_table_privilege('authenticated', 'public.fin_sefaz_notas', 'SELECT')
  and not has_table_privilege('authenticated', 'public.fin_sefaz_rodadas', 'SELECT'), 'notas e rodadas só pelo servidor');
select ok(not has_function_privilege('authenticated', 'public.fin_sefaz_pendencias()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.fin_sefaz_progresso(uuid,jsonb)', 'EXECUTE'), 'RPCs do robô só do servidor');
select ok(not has_function_privilege('authenticated', 'public.fin_caixa_entrada_registrar(text,text,text,text,text,integer,text,uuid,text)', 'EXECUTE'),
  'registrar com chave é só do servidor');

select pg_temp.como('00000000-0000-0000-0000-0000000f5001');
select throws_ok($$select count(*) from public.fin_sefaz_certificados$$, '42501', null, 'gestão da unidade não lê o certificado');
select pg_temp.servidor();

select throws_ok($$insert into fin_sefaz_certificados (unidade_id, cnpj, uf, titular, valido_ate, envelope)
  values ('uni-sefaz', '12345678000199', 'MG', 'X', now(), '{"chave":"a","iv":"b","tag":"c","dados":"d"}')$$, '23505', null,
  'um CNPJ tem um certificado só');
select throws_ok($$insert into fin_sefaz_certificados (unidade_id, cnpj, uf, titular, valido_ate, envelope)
  values ('uni-sefaz', '99999999000199', 'MG', 'X', now(), null)$$, '23514', null, 'certificado ativo exige envelope');
select lives_ok($$insert into fin_integracao_tokens (escopo, versao, hash) values ('sefaz', 1, repeat('e', 64))$$,
  'escopo de token sefaz existe');

-- ── Caixa de Entrada: chave de acesso ─────────────────────────────────────
create temp table s1 as select public.fin_caixa_entrada_registrar('uni-sefaz', 'sefaz', 'SEFAZ', 'NFe.xml',
  'application/xml', 500, repeat('1', 64), null, repeat('3', 44)) as r;
select is((select chave_acesso from fin_caixa_entrada where id = (select (r->>'id')::uuid from s1)), repeat('3', 44), 'entrada guarda a chave');
select is((public.fin_caixa_entrada_registrar('uni-sefaz', 'sefaz', 'SEFAZ', 'NFe.xml', 'application/xml', 510,
  repeat('2', 64), null, repeat('3', 44)))->>'novo', 'false', 'mesma chave pela SEFAZ reaproveita a entrada');
select throws_ok($$select public.fin_caixa_entrada_registrar('uni-sefaz', 'upload', 'Ana', 'nota.xml', 'application/xml', 520,
  repeat('4', 64), null, repeat('3', 44))$$, 'P0001', 'Nota ja esta na Caixa de Entrada', 'XML na mão com a mesma chave é recusado');
select is((select count(*)::int from fin_caixa_entrada where unidade_id = 'uni-sefaz'), 1, 'nenhuma entrada em dobro');
select is((public.fin_caixa_entrada_registrar('uni-sefaz', 'upload', 'Ana', 'boleto.pdf', 'application/pdf', 100,
  repeat('5', 64), null))->>'novo', 'true', 'versão antiga de 8 parâmetros segue funcionando');

-- ── Progresso e pendências ────────────────────────────────────────────────
select public.fin_sefaz_progresso('00000000-0000-0000-0000-0000000f5c01', jsonb_build_object(
  'ultNsu', '000000000000120', 'maxNsu', '000000000000150',
  'resumos', jsonb_build_array(
    jsonb_build_object('chave', repeat('6', 44), 'situacaoNfe', '1', 'emitenteNome', 'Fornecedor', 'emissao', '2026-10-20', 'valorCentavos', 1000),
    jsonb_build_object('chave', repeat('7', 44), 'situacaoNfe', '3')),
  'xmlSalvos', jsonb_build_array(repeat('3', 44))));
select is((select ult_nsu from fin_sefaz_certificados where cnpj = '12345678000199'), '120', 'NSU gravado sem zeros à esquerda');
select is((select situacao from fin_sefaz_notas where chave = repeat('7', 44)), 'sem_ciencia', 'nota cancelada não pede Ciência');
select public.fin_sefaz_progresso('00000000-0000-0000-0000-0000000f5c01', '{"ultNsu": "000000000000050"}');
select is((select ult_nsu from fin_sefaz_certificados where cnpj = '12345678000199'), '120', 'NSU não volta');

select public.fin_sefaz_progresso('00000000-0000-0000-0000-0000000f5c01', jsonb_build_object(
  'ciencias', jsonb_build_array(jsonb_build_object('chave', repeat('6', 44), 'ok', true, 'cStat', '135'))));
select is((select situacao from fin_sefaz_notas where chave = repeat('6', 44)), 'ciencia', 'Ciência registrada');
select public.fin_sefaz_progresso('00000000-0000-0000-0000-0000000f5c01', jsonb_build_object('resumos',
  jsonb_build_array(jsonb_build_object('chave', repeat('6', 44), 'situacaoNfe', '1'))));
select is((select situacao from fin_sefaz_notas where chave = repeat('6', 44)), 'ciencia', 'resumo repetido não desfaz a Ciência');

create temp table p1 as select public.fin_sefaz_pendencias() as r;
select is(jsonb_array_length((select r from p1) -> 'certificados'), 1, 'sem rodada hoje, o certificado aparece');
select is(((select r from p1) -> 'pendentes' -> 0 ->> 'situacao'), 'ciencia', 'pendente esperando o XML vai junto');
select is(jsonb_array_length(public.fin_sefaz_pendencias() -> 'certificados'), 0,
  'quem recebe reserva: segunda chamada (outro contêiner ou repetição) não recebe');
select ok((select bloqueado_ate > now() + interval '60 minutes' from fin_sefaz_certificados where cnpj = '12345678000199'),
  'reserva dura mais de 1 hora (regra do 137)');

update fin_sefaz_certificados set bloqueado_ate = null;
select public.fin_sefaz_progresso('00000000-0000-0000-0000-0000000f5c01', '{"fim": {"situacao": "ok", "notasNovas": 1}}');
select is(jsonb_array_length(public.fin_sefaz_pendencias() -> 'certificados'), 0, 'rodada boa hoje tira o certificado do dia');

delete from fin_sefaz_rodadas;
select public.fin_sefaz_progresso('00000000-0000-0000-0000-0000000f5c01', jsonb_build_object('bloqueadoAte', (now() + interval '1 hour')::text));
select is(jsonb_array_length(public.fin_sefaz_pendencias() -> 'certificados'), 0, 'bloqueio do 656 é respeitado');

update fin_sefaz_certificados set bloqueado_ate = null;
insert into fin_sefaz_rodadas (certificado_id, iniciado_em, situacao)
  select '00000000-0000-0000-0000-0000000f5c01', now(), 'erro' from generate_series(1, 3);
select is(jsonb_array_length(public.fin_sefaz_pendencias() -> 'certificados'), 0, 'três tentativas com erro encerram o dia');

select public.fin_sefaz_progresso('00000000-0000-0000-0000-0000000f5c01', jsonb_build_object('xmlRecusados', jsonb_build_array(repeat('8', 44))));
select is((select situacao from fin_sefaz_notas where chave = repeat('8', 44)), 'erro', 'XML recusado pelo Hub vira erro');

update fin_caixa_entrada set extracao = '{"observacao": null}'::jsonb, situacao = 'lido', arquivo_gravado = true
  where chave_acesso = repeat('3', 44);
select public.fin_sefaz_progresso('00000000-0000-0000-0000-0000000f5c01', jsonb_build_object('canceladas', jsonb_build_array(repeat('3', 44))));
select is((select situacao from fin_sefaz_notas where chave = repeat('3', 44)), 'cancelada', 'cancelamento registrado');
select ok((select extracao ->> 'observacao' like 'Nota cancelada%' from fin_caixa_entrada where chave_acesso = repeat('3', 44)),
  'entrada não lançada ganha o aviso de cancelada');

select * from finish();
rollback;
