-- Gestão de Clientes - as garantias que só o banco pode dar.
--   1. só master em aal2 lê e escreve (gestão, master em aal1 e anon: nada);
--   2. só cliente ativo de consultoria ou híbrido entra na carteira, uma vez;
--   3. o início do acompanhamento monta jornada, onboarding e diagnóstico;
--   4. integridade: tarefa com dono, item preso à reunião do mesmo cliente,
--      uma reunião aberta por vez, link só https, no máximo 3 prioridades;
--   5. nada some pela aplicação: item não tem delete.
--
-- Rodar com o Supabase local no ar: `npx supabase test db`.
-- Sem dado real - fixtures isoladas.

begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-0000000c1001', 'clientes.master@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c1002', 'clientes.gestao@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-cli-consultoria', 'Cliente Consultoria Teste', 'consultoria', true),
  ('org-cli-hibrido', 'Cliente Híbrido Teste', 'hybrid', true),
  ('org-cli-saas', 'Cliente SaaS Teste', 'saas', true),
  ('org-cli-livre', 'Cliente Consultoria Livre', 'consultoria', true);

insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000c1001', 'org-cli-consultoria', null, 'master', 'ativo'),
  ('00000000-0000-0000-0000-0000000c1002', 'org-cli-consultoria', null, 'gestao', 'ativo');

create or replace function pg_temp.entrar(p_user uuid, p_aal text)
returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

-- ── 3. Master em aal2 inicia o acompanhamento ─────────────────────────────
select pg_temp.entrar('00000000-0000-0000-0000-0000000c1001', 'aal2');

select lives_ok(
  $$ select iniciar_acompanhamento_cliente('org-cli-consultoria') $$,
  'master aal2 inicia acompanhamento de cliente de consultoria'
);

select is((select count(*)::int from zh_clientes_etapas e join zh_clientes_acompanhamentos a on a.id = e.acompanhamento_id
  where a.organizacao_id = 'org-cli-consultoria'), 8, 'jornada nasce com as 8 etapas');
select is((select count(*)::int from zh_clientes_onboarding o join zh_clientes_acompanhamentos a on a.id = o.acompanhamento_id
  where a.organizacao_id = 'org-cli-consultoria'), 24, 'onboarding nasce com os 24 itens nos 3 blocos');
select is((select count(*)::int from zh_clientes_diagnostico d join zh_clientes_acompanhamentos a on a.id = d.acompanhamento_id
  where a.organizacao_id = 'org-cli-consultoria'), 5, 'diagnóstico nasce com as 5 dimensões');

-- ── 2. Carteira: consultoria ou híbrido, uma vez só ───────────────────────
select throws_ok($$ select iniciar_acompanhamento_cliente('org-cli-saas') $$, '23514', null,
  'cliente só SaaS não entra na Gestão de Clientes');
select throws_ok($$ select iniciar_acompanhamento_cliente('org-cli-consultoria') $$, '23505', null,
  'o mesmo cliente não ganha dois acompanhamentos');
select lives_ok($$ select iniciar_acompanhamento_cliente('org-cli-hibrido') $$, 'cliente híbrido entra na carteira');

create temp table ids on commit drop as
  select organizacao_id, id from zh_clientes_acompanhamentos;
grant select on ids to authenticated;

-- ── 4. Integridade ─────────────────────────────────────────────────────────
select throws_ok(
  $$ insert into zh_clientes_itens (acompanhamento_id, tipo, texto)
     select id, 'tarefa', 'Sem dono' from ids where organizacao_id = 'org-cli-consultoria' $$,
  '23514', null, 'tarefa sem responsável é recusada');

insert into zh_clientes_reunioes (acompanhamento_id, data, titulo)
  select id, '2026-09-24', 'Reunião do outro cliente' from ids where organizacao_id = 'org-cli-hibrido';

select throws_ok(
  $$ insert into zh_clientes_itens (acompanhamento_id, reuniao_id, tipo, texto)
     select c.id, r.id, 'fato', 'Fato no lugar errado'
     from ids c, zh_clientes_reunioes r
     where c.organizacao_id = 'org-cli-consultoria' and r.titulo = 'Reunião do outro cliente' $$,
  '23503', null, 'item não aponta para reunião de outro cliente');

select throws_ok(
  $$ insert into zh_clientes_reunioes (acompanhamento_id, data, titulo)
     select id, '2026-09-25', 'Segunda aberta' from ids where organizacao_id = 'org-cli-hibrido' $$,
  '23505', null, 'só uma reunião aberta por cliente');

select throws_ok(
  $$ insert into zh_clientes_links (acompanhamento_id, tipo, titulo, url)
     select id, 'documento', 'Link inseguro', 'http://exemplo.com' from ids where organizacao_id = 'org-cli-consultoria' $$,
  '23514', null, 'link só aceita https');

select throws_ok(
  $$ update zh_clientes_acompanhamentos set prioridades = array['a','b','c','d']
     where organizacao_id = 'org-cli-consultoria' $$,
  '23514', null, 'no máximo três prioridades');

-- ── 6. Fechamento de reunião atômico ───────────────────────────────────────
-- Cliente híbrido: reunião aberta acima, etapa atual "venda" (2 itens).
select throws_ok(
  $$ select fechar_reuniao_cliente(i.id, r.id, 'Resumo', 'Pauta', 'Texto', array[0, 5])
     from ids i join zh_clientes_reunioes r on r.acompanhamento_id = i.id
     where i.organizacao_id = 'org-cli-hibrido' $$,
  '22023', null, 'índice fora do checklist é recusado');

select is(
  (select r.situacao || '|' || (e.checklist -> 0 ->> 'feito')
   from ids i join zh_clientes_reunioes r on r.acompanhamento_id = i.id
   join zh_clientes_etapas e on e.acompanhamento_id = i.id and e.etapa = 'venda'
   where i.organizacao_id = 'org-cli-hibrido'),
  'aberta|false', 'falha no meio não deixa nada gravado: reunião aberta e checklist intacto');

select throws_ok(
  $$ select fechar_reuniao_cliente(i.id, r.id, 'x', 'x', 'x', '{}')
     from ids i, zh_clientes_reunioes r
     where i.organizacao_id = 'org-cli-consultoria' and r.titulo = 'Reunião do outro cliente' $$,
  'P0002', null, 'reunião de outro cliente não é fechada por esta ficha');

select lives_ok(
  $$ select fechar_reuniao_cliente(i.id, r.id, 'Resumo', 'Pauta', 'Texto', array[0])
     from ids i join zh_clientes_reunioes r on r.acompanhamento_id = i.id
     where i.organizacao_id = 'org-cli-hibrido' $$,
  'fechamento válido passa');

select is(
  (select r.situacao || '|' || r.resumo_whatsapp || '|' || (e.checklist -> 0 ->> 'feito') || '|' || e.situacao
   from ids i join zh_clientes_reunioes r on r.acompanhamento_id = i.id
   join zh_clientes_etapas e on e.acompanhamento_id = i.id and e.etapa = 'venda'
   where i.organizacao_id = 'org-cli-hibrido'),
  'fechada|Texto|true|em_andamento', 'reunião, checklist e etapa gravados juntos');

select throws_ok(
  $$ select fechar_reuniao_cliente(i.id, r.id, 'x', 'x', 'x', '{}')
     from ids i join zh_clientes_reunioes r on r.acompanhamento_id = i.id
     where i.organizacao_id = 'org-cli-hibrido' $$,
  '23514', null, 'reunião fechada não fecha de novo');

-- ── 5. Nada some pela aplicação ────────────────────────────────────────────
insert into zh_clientes_itens (acompanhamento_id, tipo, texto, responsavel)
  select id, 'tarefa', 'Não pode sumir', 'cliente' from ids where organizacao_id = 'org-cli-consultoria';
select throws_ok($$ delete from zh_clientes_itens where texto = 'Não pode sumir' $$, '42501', null,
  'item não pode ser apagado pela Data API (sem grant de delete)');

select ok(public.consumir_limite_requisicao('clientes_salvar'), 'chave de rate limit clientes_salvar existe');

-- ── 1. Quem não é master em aal2 não vê nada ─────────────────────────────
select pg_temp.entrar('00000000-0000-0000-0000-0000000c1001', 'aal1');
select is((select count(*)::int from zh_clientes_acompanhamentos), 0, 'master em aal1 não vê acompanhamentos');

select pg_temp.entrar('00000000-0000-0000-0000-0000000c1002', 'aal2');
select is((select count(*)::int from zh_clientes_itens), 0, 'usuário de gestão não vê itens de cliente');
select throws_ok(
  $$ insert into zh_clientes_acompanhamentos (organizacao_id) values ('org-cli-livre') $$,
  '42501', null, 'usuário de gestão não cria acompanhamento');

reset role;
set local role anon;
select throws_ok($$ select count(*) from zh_clientes_acompanhamentos $$, '42501', null,
  'anon não tem acesso nenhum às tabelas');

select * from finish();

rollback;
