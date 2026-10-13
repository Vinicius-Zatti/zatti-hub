-- Checklist Garante, Fase 2b: plano de ação.
-- Prova: geração na conclusão (só itens fora da meta, na mesma transação), geração do
-- crítico em execução vencida incompleta (só o crítico, só depois da janela, só a partir
-- do início da nota), idempotência das duas, plano único por execução e item (constraint),
-- origem/responsável/prazo imutáveis (até para o servidor), resolver só responsável ou
-- gestão, descartar só gestão, prazo pela regra vigente na data, regra nova com e sem o
-- prazo do plano, isolamento entre unidades e organizações, operacional só vê os dele,
-- folga de 5 minutos depois do fim da janela antes de gerar o 'vencida', resumo do card
-- do Painel no banco (garante_resumo_planos, só gestão da unidade),
-- e flag desligada esconde tudo. Só fixtures de teste, sem depender da hora em que roda.

begin;

create extension if not exists pgtap with schema extensions;

select plan(66);

-- ── Fixture ──────────────────────────────────────────────────────────────
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000b2001', 'gestor-p@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b2002', 'op1-p@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b2003', 'op2-p@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b2004', 'gestor-u2-p@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b2005', 'gestor-b-p@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b2006', 'master-p@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-p-a', 'Plano A', 'saas', true), ('org-p-b', 'Plano B', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, garante_habilitado) values
  ('org-p-a-loja', 'org-p-a', 'Loja PA', 'banco', true, true),
  ('org-p-a-loja2', 'org-p-a', 'Loja PA 2', 'banco', true, true),
  ('org-p-b-loja', 'org-p-b', 'Loja PB', 'banco', true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000b2001', 'org-p-a', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000b2002', 'org-p-a', 'org-p-a-loja', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000b2003', 'org-p-a', 'org-p-a-loja', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000b2004', 'org-p-a', 'org-p-a-loja2', 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000b2005', 'org-p-b', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000b2006', 'org-p-b', null, 'master', 'ativo');

insert into garante_modelos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-0000000b3001', 'org-p-a-loja', 'Abertura');
insert into garante_itens (id, modelo_id, unidade_id, ordem, titulo, tipo, critico, permite_na, foto_obrigatoria, meta_min, meta_max) values
  ('00000000-0000-0000-0000-0000000b4001', '00000000-0000-0000-0000-0000000b3001', 'org-p-a-loja', 1, 'Fogão', 'check', false, true, false, null, null),
  ('00000000-0000-0000-0000-0000000b4002', '00000000-0000-0000-0000-0000000b3001', 'org-p-a-loja', 2, 'Temperatura', 'numero', true, false, false, 0, 5),
  ('00000000-0000-0000-0000-0000000b4003', '00000000-0000-0000-0000-0000000b3001', 'org-p-a-loja', 3, 'Banheiro', 'check', false, true, false, null, null);

-- P1: responsável op1. P2: sem responsável. Todo dia até 10:00, há 40 dias.
insert into garante_publicacoes (id, modelo_id, unidade_id, responsavel_id, dias_semana, horario_limite, vigente_desde) values
  ('00000000-0000-0000-0000-0000000b6001', '00000000-0000-0000-0000-0000000b3001', 'org-p-a-loja',
   '00000000-0000-0000-0000-0000000b2002', array[0,1,2,3,4,5,6]::smallint[], '10:00', public.garante_hoje() - 40),
  ('00000000-0000-0000-0000-0000000b6002', '00000000-0000-0000-0000-0000000b3001', 'org-p-a-loja',
   null, array[0,1,2,3,4,5,6]::smallint[], '10:00', public.garante_hoje() - 40);

-- Regras: 48 h para o plano desde 20 dias atrás (início da nota), 6 h desde ontem.
insert into garante_regras_unidade (unidade_id, vigente_desde, antecedencia_min, atraso_max_min, prazo_plano_horas) values
  ('org-p-a-loja', public.garante_hoje() - 20, 120, 60, 48),
  ('org-p-a-loja', public.garante_hoje() - 1, 120, 60, 6);

create or replace function pg_temp.como(p_user_id uuid, p_aal text default 'aal1')
returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
create or replace function pg_temp.servidor()
returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', null, true);
$$;
create or replace function pg_temp.snap()
returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000b4001', 'titulo', 'Fogão', 'tipo', 'check', 'critico', false, 'foto_obrigatoria', false, 'permite_na', true),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000b4002', 'titulo', 'Temperatura', 'tipo', 'numero', 'critico', true, 'foto_obrigatoria', false, 'permite_na', false, 'meta_min', 0, 'meta_max', 5),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000b4003', 'titulo', 'Banheiro', 'tipo', 'check', 'critico', false, 'foto_obrigatoria', false, 'permite_na', true))
$$;
create or replace function pg_temp.prazo(p_data date)
returns timestamptz language sql as $$ select (p_data + time '10:00') at time zone 'America/Sao_Paulo' $$;
create or replace function pg_temp.plano(p_exec uuid, p_item uuid)
returns uuid language sql as $$ select id from public.garante_planos_acao where execucao_id = p_exec and item_id = p_item $$;

-- E1 (P1, hoje): janela aberta, será cumprida pelas RPCs. E6 (P2, hoje): idem, tudo dentro.
insert into garante_execucoes (id, publicacao_id, unidade_id, data, prazo, abre_em, fecha_em, snapshot, modelo_nome) values
  ('00000000-0000-0000-0000-0000000b7001', '00000000-0000-0000-0000-0000000b6001', 'org-p-a-loja', public.garante_hoje(),
   now() + interval '1 hour', now() - interval '1 hour', now() + interval '1 day', pg_temp.snap(), 'Abertura'),
  ('00000000-0000-0000-0000-0000000b7006', '00000000-0000-0000-0000-0000000b6002', 'org-p-a-loja', public.garante_hoje(),
   now() + interval '1 hour', now() - interval '1 hour', now() + interval '1 day', pg_temp.snap(), 'Abertura');
-- Vencidas sem concluir (gravadas pelo servidor, meta já calculada):
--   E2 (P1, -3): crítico fora + comum fora.  E4 (P2, -2): crítico fora.
--   E3 (P1, -30): crítico fora, antes do início da nota.  E5 (P1, -2): crítico fora, janela aberta.
insert into garante_execucoes (id, publicacao_id, unidade_id, data, prazo, abre_em, fecha_em, snapshot, modelo_nome) values
  ('00000000-0000-0000-0000-0000000b7002', '00000000-0000-0000-0000-0000000b6001', 'org-p-a-loja', public.garante_hoje() - 3,
   pg_temp.prazo(public.garante_hoje() - 3), pg_temp.prazo(public.garante_hoje() - 3) - interval '2 hours',
   pg_temp.prazo(public.garante_hoje() - 3) + interval '1 hour', pg_temp.snap(), 'Abertura'),
  ('00000000-0000-0000-0000-0000000b7004', '00000000-0000-0000-0000-0000000b6002', 'org-p-a-loja', public.garante_hoje() - 2,
   pg_temp.prazo(public.garante_hoje() - 2), pg_temp.prazo(public.garante_hoje() - 2) - interval '2 hours',
   pg_temp.prazo(public.garante_hoje() - 2) + interval '1 hour', pg_temp.snap(), 'Abertura'),
  ('00000000-0000-0000-0000-0000000b7003', '00000000-0000-0000-0000-0000000b6001', 'org-p-a-loja', public.garante_hoje() - 30,
   pg_temp.prazo(public.garante_hoje() - 30), pg_temp.prazo(public.garante_hoje() - 30) - interval '2 hours',
   pg_temp.prazo(public.garante_hoje() - 30) + interval '1 hour', pg_temp.snap(), 'Abertura'),
  ('00000000-0000-0000-0000-0000000b7005', '00000000-0000-0000-0000-0000000b6001', 'org-p-a-loja', public.garante_hoje() - 2,
   pg_temp.prazo(public.garante_hoje() - 2), now() - interval '1 hour', now() + interval '1 day', pg_temp.snap(), 'Abertura');
insert into garante_respostas (execucao_id, unidade_id, item_id, valor_bool, valor_numero, dentro_meta) values
  ('00000000-0000-0000-0000-0000000b7002', 'org-p-a-loja', '00000000-0000-0000-0000-0000000b4001', false, null, false),
  ('00000000-0000-0000-0000-0000000b7002', 'org-p-a-loja', '00000000-0000-0000-0000-0000000b4002', null, 9, false),
  ('00000000-0000-0000-0000-0000000b7004', 'org-p-a-loja', '00000000-0000-0000-0000-0000000b4002', null, -3, false),
  ('00000000-0000-0000-0000-0000000b7003', 'org-p-a-loja', '00000000-0000-0000-0000-0000000b4002', null, 9, false),
  ('00000000-0000-0000-0000-0000000b7005', 'org-p-a-loja', '00000000-0000-0000-0000-0000000b4002', null, 9, false);

-- ── Geração na conclusão ────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000b2002');
select public.garante_responder('00000000-0000-0000-0000-0000000b7001', '00000000-0000-0000-0000-0000000b4001', p_valor_bool => false);
select public.garante_responder('00000000-0000-0000-0000-0000000b7001', '00000000-0000-0000-0000-0000000b4002', p_valor_numero => 3);
select public.garante_responder('00000000-0000-0000-0000-0000000b7001', '00000000-0000-0000-0000-0000000b4003',
  p_nao_se_aplica => true, p_justificativa => 'interditado');
select is((select count(*)::int from garante_planos_acao where execucao_id = '00000000-0000-0000-0000-0000000b7001'), 0,
  'responder fora da meta ainda não cria plano');
select is(public.garante_concluir('00000000-0000-0000-0000-0000000b7001'), 0, 'operador conclui');
select results_eq($$ select item_id, origem, situacao, responsavel_id, item ->> 'titulo', modelo_nome
    from garante_planos_acao where execucao_id = '00000000-0000-0000-0000-0000000b7001' $$,
  $$ values ('00000000-0000-0000-0000-0000000b4001'::uuid, 'conclusao', 'aberto', '00000000-0000-0000-0000-0000000b2002'::uuid, 'Fogão', 'Abertura') $$,
  'concluir cria um plano só para o item fora da meta (não para o dentro nem o "não se aplica")');
select is((select prazo from garante_planos_acao where execucao_id = '00000000-0000-0000-0000-0000000b7001'),
  (select concluida_em + interval '6 hours' from garante_execucoes where id = '00000000-0000-0000-0000-0000000b7001'),
  'prazo = conclusão + horas da regra vigente na data (6 h desde ontem)');
select is((select resposta_id from garante_planos_acao where execucao_id = '00000000-0000-0000-0000-0000000b7001'),
  (select id from garante_respostas where execucao_id = '00000000-0000-0000-0000-0000000b7001' and item_id = '00000000-0000-0000-0000-0000000b4001'),
  'plano guarda a resposta de origem');
select is(public.garante_concluir('00000000-0000-0000-0000-0000000b7001'), 0, 'concluir de novo não falha');
select is((select count(*)::int from garante_planos_acao where execucao_id = '00000000-0000-0000-0000-0000000b7001'), 1,
  'e não duplica o plano');

select pg_temp.como('00000000-0000-0000-0000-0000000b2003');
select public.garante_responder('00000000-0000-0000-0000-0000000b7006', '00000000-0000-0000-0000-0000000b4001', p_valor_bool => true);
select public.garante_responder('00000000-0000-0000-0000-0000000b7006', '00000000-0000-0000-0000-0000000b4002', p_valor_numero => 2);
select public.garante_responder('00000000-0000-0000-0000-0000000b7006', '00000000-0000-0000-0000-0000000b4003', p_valor_bool => true);
select is(public.garante_concluir('00000000-0000-0000-0000-0000000b7006'), 0, 'checklist sem responsável concluído por outro operador');
select is((select count(*)::int from garante_planos_acao where execucao_id = '00000000-0000-0000-0000-0000000b7006'), 0,
  'tudo dentro da meta: nenhum plano');
select throws_ok($$ select public.garante_criar_planos('00000000-0000-0000-0000-0000000b7001', 'conclusao', now()) $$,
  '42501', null, 'ninguém chama a criação interna de planos');

-- ── Plano único (constraint) ────────────────────────────────────────────
select pg_temp.servidor();
select is(public.garante_criar_planos('00000000-0000-0000-0000-0000000b7001', 'conclusao', now()), 0,
  'gerar de novo para a mesma execução não cria nada');
select throws_ok($$ insert into garante_planos_acao (unidade_id, execucao_id, item_id, resposta_id, origem, item, data, modelo_nome, prazo)
  values ('org-p-a-loja', '00000000-0000-0000-0000-0000000b7001', '00000000-0000-0000-0000-0000000b4001', gen_random_uuid(),
          'vencida', '{}'::jsonb, public.garante_hoje(), 'Abertura', now()) $$,
  '23505', null, 'segundo plano para a mesma execução e item é barrado pela constraint (duas conclusões concorrentes)');

-- ── Geração do crítico em execução vencida incompleta ───────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000b2003');
select is(public.garante_gerar_planos_vencidos('org-p-a-loja'), 2, 'leitura gera 2 planos (E2 e E4)');
select is(public.garante_gerar_planos_vencidos('org-p-a-loja'), 0, 'gerar de novo não cria nada (idempotente)');
select pg_temp.servidor();
select results_eq($$ select item_id, origem from garante_planos_acao where execucao_id = '00000000-0000-0000-0000-0000000b7002' $$,
  $$ values ('00000000-0000-0000-0000-0000000b4002'::uuid, 'vencida') $$, 'vencida: só o item crítico fora da meta vira plano');
select is((select prazo from garante_planos_acao where execucao_id = '00000000-0000-0000-0000-0000000b7002'),
  pg_temp.prazo(public.garante_hoje() - 3) + interval '1 hour' + interval '48 hours',
  'prazo = fim da janela + horas da regra vigente naquela data (48 h)');
select is((select responsavel_id from garante_planos_acao where execucao_id = '00000000-0000-0000-0000-0000000b7004'), null,
  'publicação sem responsável: plano da gestão (sem pessoa)');
select is((select count(*)::int from garante_planos_acao where execucao_id = '00000000-0000-0000-0000-0000000b7005'), 0,
  'execução com a janela ainda aberta não gera plano');
select is((select count(*)::int from garante_planos_acao where execucao_id = '00000000-0000-0000-0000-0000000b7003'), 0,
  'execução de antes do início da nota não gera plano');

-- IDs lidos pelo servidor (operador não enxerga todos).
create temp table ids as select
  pg_temp.plano('00000000-0000-0000-0000-0000000b7001', '00000000-0000-0000-0000-0000000b4001') as p1,
  pg_temp.plano('00000000-0000-0000-0000-0000000b7002', '00000000-0000-0000-0000-0000000b4002') as p2,
  pg_temp.plano('00000000-0000-0000-0000-0000000b7004', '00000000-0000-0000-0000-0000000b4002') as p4;
grant select on ids to authenticated;

-- ── Leitura: operacional só vê os dele; isolamento ──────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000b2002');
select is((select count(*)::int from garante_planos_acao), 2, 'op1 vê só os planos de que é responsável (E1 e E2)');
select pg_temp.como('00000000-0000-0000-0000-0000000b2003');
select is((select count(*)::int from garante_planos_acao), 0, 'op2 não vê plano de outro nem plano sem responsável');
select pg_temp.como('00000000-0000-0000-0000-0000000b2001');
select is((select count(*)::int from garante_planos_acao), 3, 'gestão da unidade vê todos');
select pg_temp.como('00000000-0000-0000-0000-0000000b2004');
select is((select count(*)::int from garante_planos_acao), 0, 'gestão de outra unidade da mesma organização não vê');
select throws_ok($$ select public.garante_gerar_planos_vencidos('org-p-a-loja') $$, '42501', 'sem_permissao',
  'nem gera planos da outra unidade');
select pg_temp.como('00000000-0000-0000-0000-0000000b2005');
select is((select count(*)::int from garante_planos_acao), 0, 'gestão de outra organização não vê');
select throws_ok($$ select public.garante_resolver_plano((select p4 from ids), 'resolvido aqui') $$,
  '42501', 'sem_permissao', 'nem resolve');
select throws_ok($$ select public.garante_descartar_plano((select p4 from ids), 'não é nosso') $$,
  '42501', 'sem_permissao', 'nem descarta');
select pg_temp.como('00000000-0000-0000-0000-0000000b2006', 'aal2');
select is((select count(*)::int from garante_planos_acao where unidade_id = 'org-p-a-loja'), 3, 'master com segundo fator vê');

-- ── Resolver e descartar ────────────────────────────────────────────────

select pg_temp.como('00000000-0000-0000-0000-0000000b2003');
select throws_ok($$ select public.garante_resolver_plano((select p1 from ids), 'troquei o fogão') $$,
  '42501', 'sem_permissao', 'operacional não resolve plano de outro');
select pg_temp.como('00000000-0000-0000-0000-0000000b2002');
select throws_ok($$ select public.garante_resolver_plano((select p4 from ids), 'resolvi eu') $$,
  '42501', 'sem_permissao', 'operacional não resolve plano da gestão');
select throws_ok($$ select public.garante_resolver_plano((select p1 from ids), 'ok') $$,
  '22023', 'resolucao_obrigatoria', 'resolver exige texto de 3 a 500');
select throws_ok($$ select public.garante_resolver_plano((select p1 from ids), repeat('a', 501)) $$,
  '22023', 'resolucao_obrigatoria', 'texto acima de 500 é recusado');
select lives_ok($$ select public.garante_resolver_plano((select p1 from ids), '  Fogão regulado pelo técnico  ') $$,
  'responsável resolve');
select results_eq($$ select situacao, resolucao, fechado_por from garante_planos_acao where id = (select p1 from ids) $$,
  $$ values ('resolvido', 'Fogão regulado pelo técnico', '00000000-0000-0000-0000-0000000b2002'::uuid) $$,
  'grava situação, texto e quem resolveu');
select throws_ok($$ select public.garante_resolver_plano((select p1 from ids), 'de novo') $$,
  '22023', 'plano_fechado', 'plano resolvido não muda mais');
select throws_ok($$ select public.garante_descartar_plano((select p2 from ids), 'não precisa') $$,
  '42501', 'sem_permissao', 'responsável não descarta');

select pg_temp.como('00000000-0000-0000-0000-0000000b2001');
select throws_ok($$ select public.garante_descartar_plano((select p2 from ids), ' ') $$,
  '22023', 'motivo_descarte_obrigatorio', 'descartar exige motivo');
select lives_ok($$ select public.garante_descartar_plano((select p2 from ids), 'Termômetro estava quebrado') $$, 'gestão descarta');
select results_eq($$ select situacao, motivo_descarte, resolucao from garante_planos_acao where id = (select p2 from ids) $$,
  $$ values ('descartado', 'Termômetro estava quebrado', null::text) $$, 'grava o motivo');
select throws_ok($$ update garante_planos_acao set prazo = now() where id = (select p4 from ids) $$,
  '42501', null, 'gestão não muda plano direto (só RPC)');
select throws_ok($$ insert into garante_planos_acao (unidade_id, execucao_id, item_id, resposta_id, origem, item, data, modelo_nome, prazo)
  values ('org-p-a-loja', '00000000-0000-0000-0000-0000000b7006', '00000000-0000-0000-0000-0000000b4001', gen_random_uuid(),
          'conclusao', '{}'::jsonb, public.garante_hoje(), 'Abertura', now()) $$,
  '42501', null, 'nem cria plano direto');

-- ── Imutabilidade (até para o servidor) ─────────────────────────────────
select pg_temp.servidor();
select throws_ok($$ update garante_planos_acao set prazo = prazo + interval '1 day' where id = (select p4 from ids) $$,
  '22023', 'plano_imutavel', 'prazo não muda');
select throws_ok($$ update garante_planos_acao set responsavel_id = '00000000-0000-0000-0000-0000000b2003' where id = (select p4 from ids) $$,
  '22023', 'plano_imutavel', 'responsável não muda');
select throws_ok($$ update garante_planos_acao set origem = 'conclusao' where id = (select p4 from ids) $$,
  '22023', 'plano_imutavel', 'origem não muda');
select throws_ok($$ update garante_planos_acao set situacao = 'aberto', resolucao = null, fechado_em = null, fechado_por = null where id = (select p1 from ids) $$,
  '22023', 'plano_fechado', 'plano fechado não reabre');

select pg_temp.como('00000000-0000-0000-0000-0000000b2001');
select lives_ok($$ select public.garante_resolver_plano((select p4 from ids), 'Gestão trocou a borracha da câmara') $$,
  'gestão resolve o plano sem responsável');

-- ── Regra: prazo do plano versionado ────────────────────────────────────
select is(public.garante_definir_regra('org-p-a-loja', 30, 10), public.garante_hoje() + 1, 'chamada antiga (3 argumentos) continua');
select is((select prazo_plano_horas from garante_regras_unidade where unidade_id = 'org-p-a-loja' and vigente_desde = public.garante_hoje() + 1), 6,
  'sem o prazo do plano, mantém o que valia');
select lives_ok($$ select public.garante_definir_regra('org-p-a-loja', 30, 10, null, 12) $$, 'gestão muda o prazo do plano');
select is(public.garante_prazo_plano_horas('org-p-a-loja', public.garante_hoje() + 1), 12, 'vale a partir de amanhã');
select is(public.garante_prazo_plano_horas('org-p-a-loja', public.garante_hoje()), 6, 'hoje continua com o que valia');
select throws_ok($$ select public.garante_definir_regra('org-p-a-loja', 30, 10, null, 169) $$,
  '22023', 'regra_invalida', 'prazo do plano acima de 168 h é recusado');
select throws_ok($$ select public.garante_definir_regra('org-p-a-loja', 30, 10, null, 0) $$,
  '22023', 'regra_invalida', 'prazo do plano 0 é recusado');
select is(public.garante_prazo_plano_horas('org-p-b-loja', public.garante_hoje()), 24, 'sem regra, o padrão é 24 h');
select pg_temp.como('00000000-0000-0000-0000-0000000b2002');
select throws_ok($$ select public.garante_definir_regra('org-p-a-loja', 30, 10, null, 12) $$, '42501', 'sem_permissao',
  'operacional não muda o prazo do plano');

-- ── Vencida: folga de 5 minutos e execução concluída ───────────────────
-- A corrida real (leitura gerando enquanto outra transação responde ou conclui) não
-- dá para provar no pgTAP, que roda numa transação só. A garantia vem do "for update"
-- na execução + releitura da situação e do fecha_em depois da trava, e da folga de
-- 5 minutos (transação de responder/concluir que começou antes do fecha_em). Aqui
-- fica provado o corte da folga e que execução concluída não vira 'vencida'.
--   E8 (P2, -5): fechou há 10 min.  E9 (P2, -6): fechou há 2 min.
--   E10 (P2, -7): concluída, janela já fechada.  E11 (P2, -8): fechou há dias (prazo do plano vencido).
-- Todas com o crítico fora da meta. Nesta altura não há plano aberto na unidade.
select pg_temp.servidor();
insert into garante_execucoes (id, publicacao_id, unidade_id, data, prazo, abre_em, fecha_em, snapshot, modelo_nome) values
  ('00000000-0000-0000-0000-0000000b7008', '00000000-0000-0000-0000-0000000b6002', 'org-p-a-loja', public.garante_hoje() - 5,
   pg_temp.prazo(public.garante_hoje() - 5), now() - interval '3 hours', now() - interval '10 minutes', pg_temp.snap(), 'Abertura'),
  ('00000000-0000-0000-0000-0000000b7009', '00000000-0000-0000-0000-0000000b6002', 'org-p-a-loja', public.garante_hoje() - 6,
   pg_temp.prazo(public.garante_hoje() - 6), now() - interval '3 hours', now() - interval '2 minutes', pg_temp.snap(), 'Abertura'),
  ('00000000-0000-0000-0000-0000000b7011', '00000000-0000-0000-0000-0000000b6002', 'org-p-a-loja', public.garante_hoje() - 8,
   pg_temp.prazo(public.garante_hoje() - 8), pg_temp.prazo(public.garante_hoje() - 8) - interval '2 hours',
   pg_temp.prazo(public.garante_hoje() - 8) + interval '1 hour', pg_temp.snap(), 'Abertura');
insert into garante_execucoes (id, publicacao_id, unidade_id, data, prazo, abre_em, fecha_em, snapshot, modelo_nome, situacao, concluida_em) values
  ('00000000-0000-0000-0000-0000000b7010', '00000000-0000-0000-0000-0000000b6002', 'org-p-a-loja', public.garante_hoje() - 7,
   pg_temp.prazo(public.garante_hoje() - 7), pg_temp.prazo(public.garante_hoje() - 7) - interval '2 hours',
   pg_temp.prazo(public.garante_hoje() - 7) + interval '1 hour', pg_temp.snap(), 'Abertura',
   'concluida', pg_temp.prazo(public.garante_hoje() - 7) - interval '30 minutes');
insert into garante_respostas (execucao_id, unidade_id, item_id, valor_bool, valor_numero, dentro_meta) values
  ('00000000-0000-0000-0000-0000000b7008', 'org-p-a-loja', '00000000-0000-0000-0000-0000000b4002', null, 9, false),
  ('00000000-0000-0000-0000-0000000b7009', 'org-p-a-loja', '00000000-0000-0000-0000-0000000b4002', null, 9, false),
  ('00000000-0000-0000-0000-0000000b7010', 'org-p-a-loja', '00000000-0000-0000-0000-0000000b4002', null, 9, false),
  ('00000000-0000-0000-0000-0000000b7011', 'org-p-a-loja', '00000000-0000-0000-0000-0000000b4002', null, 9, false);

select pg_temp.como('00000000-0000-0000-0000-0000000b2001');
select is(public.garante_gerar_planos_vencidos('org-p-a-loja'), 2, 'leitura gera só E8 e E11');
select pg_temp.servidor();
select is((select count(*)::int from garante_planos_acao where execucao_id = '00000000-0000-0000-0000-0000000b7009'), 0,
  'execução vencida há menos de 5 minutos ainda não gera plano (folga para responder/concluir em curso)');
select results_eq($$ select origem from garante_planos_acao where execucao_id = '00000000-0000-0000-0000-0000000b7008' $$,
  $$ values ('vencida') $$, 'execução vencida há mais de 5 minutos gera o plano do crítico');
select is((select count(*)::int from garante_planos_acao where execucao_id = '00000000-0000-0000-0000-0000000b7010' and origem = 'vencida'), 0,
  'execução concluída não gera plano de origem vencida');

-- ── Resumo do card do Painel (contagens no banco) ───────────────────────
-- Abertos: E8 (prazo no futuro) e E11 (prazo vencido). Os outros já foram fechados.
-- Críticos fora da meta de -8 a hoje: E2, E4, E5, E8, E9, E10, E11 (o comum fora da E2
-- não conta, a E1 respondeu o crítico dentro). De -3 a hoje: E2, E4, E5.
select pg_temp.como('00000000-0000-0000-0000-0000000b2001');
select results_eq($$ select planos_abertos, planos_atrasados, criticos_fora
    from public.garante_resumo_planos('org-p-a-loja', public.garante_hoje() - 8, public.garante_hoje()) $$,
  $$ values (2, 1, 7) $$, 'resumo: 2 abertos, 1 atrasado, 7 críticos fora da meta no período');
select results_eq($$ select criticos_fora from public.garante_resumo_planos('org-p-a-loja', public.garante_hoje() - 3, public.garante_hoje()) $$,
  $$ values (3) $$, 'críticos fora da meta respeitam o período');
select pg_temp.como('00000000-0000-0000-0000-0000000b2004');
select throws_ok($$ select * from public.garante_resumo_planos('org-p-a-loja', public.garante_hoje() - 7, public.garante_hoje()) $$,
  '42501', 'sem_permissao', 'gestão de outra unidade não lê o resumo');
select pg_temp.como('00000000-0000-0000-0000-0000000b2002');
select throws_ok($$ select * from public.garante_resumo_planos('org-p-a-loja', public.garante_hoje() - 7, public.garante_hoje()) $$,
  '42501', 'sem_permissao', 'operacional não lê o resumo');

-- ── Flag desligada ──────────────────────────────────────────────────────
select pg_temp.servidor();
update unidades set garante_habilitado = false where id = 'org-p-a-loja';
select pg_temp.como('00000000-0000-0000-0000-0000000b2001');
select is((select count(*)::int from garante_planos_acao), 0, 'flag desligada: gestão não vê planos');
select throws_ok($$ select public.garante_gerar_planos_vencidos('org-p-a-loja') $$, '42501', 'sem_permissao',
  'flag desligada: não gera planos');
select throws_ok($$ select * from public.garante_resumo_planos('org-p-a-loja', public.garante_hoje() - 7, public.garante_hoje()) $$,
  '42501', 'sem_permissao', 'flag desligada: não lê o resumo');

select pg_temp.servidor();
select * from finish();
rollback;
