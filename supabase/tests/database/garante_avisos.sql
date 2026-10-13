-- Checklist Garante: responsável por acompanhar e avisos pelo Vini.
-- Prova: token no escopo 'garante'; só gestão da unidade ou master (com segundo fator) marca o
-- responsável, e só vínculo ativo de gestão (ou master) que alcança a unidade e tem WhatsApp;
-- um ativo por unidade; sem escrita direta; geração dos 3 tipos de aviso (atrasado ainda na
-- janela, não concluído depois da janela, crítico fora da meta) a partir do primeiro responsável
-- e só nos últimos 7 dias; concluído tarde não gera; revalidação cancela resolvido (concluído,
-- corrigido, janela fechada) e expira velho; reserva única por ciclo, só das 7h às 23h, só com
-- responsável válido; reserva vencida (15 min) vira incerto e nunca volta; 'falhou' volta à
-- fila até 3 tentativas; confirmação repetida é inócua; isolamento entre unidades e papéis;
-- flag desligada esconde e trava tudo. Só fixtures, sem depender da hora em que roda.

begin;

create extension if not exists pgtap with schema extensions;

select plan(65);

-- ── Fixture ──────────────────────────────────────────────────────────────
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000c2001', 'gestora-v@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c2002', 'gestor-loja2-v@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c2003', 'op-v@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c2004', 'gestor-sem-wpp-v@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c2005', 'gestor-b-v@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c2006', 'master-v@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into perfis (id, nome) values
  ('00000000-0000-0000-0000-0000000c2001', 'Ana Gestora'),
  ('00000000-0000-0000-0000-0000000c2003', 'Caio Operador');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-v-a', 'Avisos A', 'saas', true), ('org-v-b', 'Avisos B', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, garante_habilitado) values
  ('org-v-a-loja', 'org-v-a', 'Loja VA', 'banco', true, true),
  ('org-v-a-loja2', 'org-v-a', 'Loja VA 2', 'banco', true, true),
  ('org-v-b-loja', 'org-v-b', 'Loja VB', 'banco', true, true);
insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status, whatsapp) values
  ('00000000-0000-0000-0000-0000000c8001', '00000000-0000-0000-0000-0000000c2001', 'org-v-a', null, 'gestao', 'ativo', '+5516999990001'),
  ('00000000-0000-0000-0000-0000000c8002', '00000000-0000-0000-0000-0000000c2002', 'org-v-a', 'org-v-a-loja2', 'gestao', 'ativo', '+5516999990002'),
  ('00000000-0000-0000-0000-0000000c8003', '00000000-0000-0000-0000-0000000c2003', 'org-v-a', 'org-v-a-loja', 'operacional', 'ativo', '+5516999990003'),
  ('00000000-0000-0000-0000-0000000c8004', '00000000-0000-0000-0000-0000000c2004', 'org-v-a', null, 'gestao', 'ativo', null),
  ('00000000-0000-0000-0000-0000000c8005', '00000000-0000-0000-0000-0000000c2005', 'org-v-b', null, 'gestao', 'ativo', '+5516999990005'),
  ('00000000-0000-0000-0000-0000000c8006', '00000000-0000-0000-0000-0000000c2006', 'org-v-b', null, 'master', 'ativo', '+5516999990006');

insert into fin_integracao_tokens (escopo, versao, hash) values
  ('garante', 1, encode(extensions.digest('token-garante-0123456789abcdef0123456789', 'sha256'), 'hex'));

insert into garante_modelos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-0000000c3001', 'org-v-a-loja', 'Abertura');
insert into garante_itens (id, modelo_id, unidade_id, ordem, titulo, tipo, critico, permite_na, foto_obrigatoria, meta_min, meta_max) values
  ('00000000-0000-0000-0000-0000000c4001', '00000000-0000-0000-0000-0000000c3001', 'org-v-a-loja', 1, 'Fogão', 'check', false, true, false, null, null),
  ('00000000-0000-0000-0000-0000000c4002', '00000000-0000-0000-0000-0000000c3001', 'org-v-a-loja', 2, 'Temperatura', 'numero', true, false, false, 0, 5),
  ('00000000-0000-0000-0000-0000000c4003', '00000000-0000-0000-0000-0000000c3001', 'org-v-a-loja', 3, 'Óleo', 'numero', true, false, false, 0, 10),
  ('00000000-0000-0000-0000-0000000c4004', '00000000-0000-0000-0000-0000000c3001', 'org-v-a-loja', 4, 'Gás', 'numero', true, false, false, 0, 3);

-- P1: todo dia até 10:00, responsável o operador, desde anteontem. P2: todo dia até 14:00, sem
-- responsável, desde hoje. Regra: abre 2 h antes, aceita 600 min de atraso (fecha às 20:00).
insert into garante_publicacoes (id, modelo_id, unidade_id, responsavel_id, dias_semana, horario_limite, vigente_desde) values
  ('00000000-0000-0000-0000-0000000c6001', '00000000-0000-0000-0000-0000000c3001', 'org-v-a-loja',
   '00000000-0000-0000-0000-0000000c2003', array[0,1,2,3,4,5,6]::smallint[], '10:00', public.garante_hoje() - 2),
  ('00000000-0000-0000-0000-0000000c6002', '00000000-0000-0000-0000-0000000c3001', 'org-v-a-loja',
   null, array[0,1,2,3,4,5,6]::smallint[], '14:00', public.garante_hoje());
insert into garante_regras_unidade (unidade_id, vigente_desde, antecedencia_min, atraso_max_min) values
  ('org-v-a-loja', public.garante_hoje() - 10, 120, 600);

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
-- Instante no fuso da operação: dias a partir de hoje + hora.
create or replace function pg_temp.agora(p_dias integer, p_hora time)
returns timestamptz language sql as $$
  select ((public.garante_hoje() + p_dias) + p_hora) at time zone 'America/Sao_Paulo'
$$;
create or replace function pg_temp.snap()
returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000c4001', 'titulo', 'Fogão', 'tipo', 'check', 'critico', false, 'foto_obrigatoria', false, 'permite_na', true),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000c4002', 'titulo', 'Temperatura', 'tipo', 'numero', 'critico', true, 'foto_obrigatoria', false, 'permite_na', false, 'meta_min', 0, 'meta_max', 5),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000c4003', 'titulo', 'Óleo', 'tipo', 'numero', 'critico', true, 'foto_obrigatoria', false, 'permite_na', false, 'meta_min', 0, 'meta_max', 10),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000c4004', 'titulo', 'Gás', 'tipo', 'numero', 'critico', true, 'foto_obrigatoria', false, 'permite_na', false, 'meta_min', 0, 'meta_max', 3))
$$;

-- E_hoje (P1, hoje): em andamento, crítico fora da meta às 10:15. E_ontem (P1, ontem): em
-- andamento, crítico fora às 10:30. E_-2 (P1, anteontem): concluída com atraso, tudo dentro.
-- E_-9 (P1, 9 dias atrás, antes da vigência): nunca concluída, fora dos 7 dias.
insert into garante_execucoes (id, publicacao_id, unidade_id, data, prazo, abre_em, fecha_em, snapshot, modelo_nome, situacao, concluida_em, concluida_por) values
  ('00000000-0000-0000-0000-0000000c7001', '00000000-0000-0000-0000-0000000c6001', 'org-v-a-loja', public.garante_hoje(),
   pg_temp.agora(0, '10:00'), pg_temp.agora(0, '08:00'), pg_temp.agora(0, '20:00'), pg_temp.snap(), 'Abertura', 'em_andamento', null, null),
  ('00000000-0000-0000-0000-0000000c7002', '00000000-0000-0000-0000-0000000c6001', 'org-v-a-loja', public.garante_hoje() - 1,
   pg_temp.agora(-1, '10:00'), pg_temp.agora(-1, '08:00'), pg_temp.agora(-1, '20:00'), pg_temp.snap(), 'Abertura', 'em_andamento', null, null),
  ('00000000-0000-0000-0000-0000000c7003', '00000000-0000-0000-0000-0000000c6001', 'org-v-a-loja', public.garante_hoje() - 2,
   pg_temp.agora(-2, '10:00'), pg_temp.agora(-2, '08:00'), pg_temp.agora(-2, '20:00'), pg_temp.snap(), 'Abertura', 'concluida',
   pg_temp.agora(-2, '11:00'), '00000000-0000-0000-0000-0000000c2003'),
  ('00000000-0000-0000-0000-0000000c7004', '00000000-0000-0000-0000-0000000c6001', 'org-v-a-loja', public.garante_hoje() - 9,
   pg_temp.agora(-9, '10:00'), pg_temp.agora(-9, '08:00'), pg_temp.agora(-9, '20:00'), pg_temp.snap(), 'Abertura', 'em_andamento', null, null);
insert into garante_respostas (execucao_id, unidade_id, item_id, valor_bool, valor_numero, dentro_meta, respondido_por, respondido_em) values
  ('00000000-0000-0000-0000-0000000c7001', 'org-v-a-loja', '00000000-0000-0000-0000-0000000c4001', true, null, true, '00000000-0000-0000-0000-0000000c2003', pg_temp.agora(0, '10:10')),
  ('00000000-0000-0000-0000-0000000c7001', 'org-v-a-loja', '00000000-0000-0000-0000-0000000c4002', null, 9, false, '00000000-0000-0000-0000-0000000c2003', pg_temp.agora(0, '10:15')),
  ('00000000-0000-0000-0000-0000000c7002', 'org-v-a-loja', '00000000-0000-0000-0000-0000000c4002', null, 8, false, '00000000-0000-0000-0000-0000000c2003', pg_temp.agora(-1, '10:30')),
  ('00000000-0000-0000-0000-0000000c7003', 'org-v-a-loja', '00000000-0000-0000-0000-0000000c4002', null, 3, true, '00000000-0000-0000-0000-0000000c2003', pg_temp.agora(-2, '10:40'));

-- ── Estrutura e token ───────────────────────────────────────────────────
select ok(not has_table_privilege('authenticated', 'public.garante_avisos', 'INSERT')
  and not has_table_privilege('authenticated', 'public.garante_avisos', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.garante_avisos', 'DELETE'), 'avisos: usuário não escreve');
select ok(not has_table_privilege('authenticated', 'public.garante_avisos_destinatarios', 'INSERT')
  and not has_table_privilege('authenticated', 'public.garante_avisos_destinatarios', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.garante_avisos_destinatarios', 'DELETE'), 'destinatários: só pela RPC');
select ok(public.fin_integracao_token_valido('token-garante-0123456789abcdef0123456789', 'garante'), 'token do escopo garante vale');
select ok(not public.fin_integracao_token_valido('token-garante-0123456789abcdef0123456789', 'alertas'), 'token do garante não vale no alerta');
select ok(not has_function_privilege('authenticated', 'public.garante_avisos_reservar(timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.garante_avisos_reservar(timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.garante_avisos_confirmar(uuid,text)', 'EXECUTE'),
  'ciclo e confirmação são só do servidor');

-- ── Marcar o responsável ────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000c2003');
select throws_ok($$ select public.garante_definir_responsavel_avisos('org-v-a-loja', '00000000-0000-0000-0000-0000000c8001') $$,
  '42501', 'sem_permissao', 'operacional não marca');
select pg_temp.como('00000000-0000-0000-0000-0000000c2005');
select throws_ok($$ select public.garante_definir_responsavel_avisos('org-v-a-loja', '00000000-0000-0000-0000-0000000c8001') $$,
  '42501', 'sem_permissao', 'gestão de outra organização não marca');
select pg_temp.como('00000000-0000-0000-0000-0000000c2001');
select throws_ok($$ select public.garante_definir_responsavel_avisos('org-v-a-loja', '00000000-0000-0000-0000-0000000c8003') $$,
  '22023', 'vinculo_nao_elegivel', 'operacional não pode ser o responsável');
select throws_ok($$ select public.garante_definir_responsavel_avisos('org-v-a-loja', '00000000-0000-0000-0000-0000000c8004') $$,
  '22023', 'vinculo_sem_whatsapp', 'gestão sem WhatsApp não pode');
select throws_ok($$ select public.garante_definir_responsavel_avisos('org-v-a-loja', '00000000-0000-0000-0000-0000000c8002') $$,
  '22023', 'vinculo_nao_elegivel', 'gestão presa a outra unidade não alcança esta');
select throws_ok($$ select public.garante_definir_responsavel_avisos('org-v-a-loja', '00000000-0000-0000-0000-0000000c8005') $$,
  '22023', 'vinculo_nao_elegivel', 'gestão de outra organização não pode ser o responsável');
select is(public.garante_definir_responsavel_avisos('org-v-a-loja', '00000000-0000-0000-0000-0000000c8001'),
  '00000000-0000-0000-0000-0000000c8001'::uuid, 'gestão da organização marca a si mesma');
select results_eq($$ select vinculo_id from garante_avisos_destinatarios where unidade_id = 'org-v-a-loja' and ativo $$,
  $$ values ('00000000-0000-0000-0000-0000000c8001'::uuid) $$, 'um responsável ativo na unidade');
select pg_temp.servidor();
select is((select count(*)::int from logs_auditoria where unidade_id = 'org-v-a-loja' and user_id = '00000000-0000-0000-0000-0000000c2001'
  and acao = 'garante_definir_responsavel_avisos'), 1, 'auditoria na unidade alterada');
select pg_temp.como('00000000-0000-0000-0000-0000000c2001');
select public.garante_definir_responsavel_avisos('org-v-a-loja', '00000000-0000-0000-0000-0000000c8001');
select is((select count(*)::int from garante_avisos_destinatarios where unidade_id = 'org-v-a-loja'), 1, 'marcar o mesmo não grava de novo');
select pg_temp.como('00000000-0000-0000-0000-0000000c2002');
select lives_ok($$ select public.garante_definir_responsavel_avisos('org-v-a-loja2', '00000000-0000-0000-0000-0000000c8002') $$,
  'gestão presa à unidade marca na própria unidade');
select throws_ok($$ select public.garante_definir_responsavel_avisos('org-v-a-loja', '00000000-0000-0000-0000-0000000c8002') $$,
  '42501', 'sem_permissao', 'gestão presa à unidade não marca em outra');
select pg_temp.como('00000000-0000-0000-0000-0000000c2006', 'aal2');
select lives_ok($$ select public.garante_definir_responsavel_avisos('org-v-a-loja', '00000000-0000-0000-0000-0000000c8006') $$,
  'master com segundo fator marca a si mesmo em qualquer unidade');
select results_eq($$ select vinculo_id, ativo from garante_avisos_destinatarios where unidade_id = 'org-v-a-loja' order by ativo $$,
  $$ values ('00000000-0000-0000-0000-0000000c8001'::uuid, false), ('00000000-0000-0000-0000-0000000c8006'::uuid, true) $$,
  'trocar desativa o anterior e deixa um ativo');
select pg_temp.como('00000000-0000-0000-0000-0000000c2006', 'aal1');
select throws_ok($$ select public.garante_definir_responsavel_avisos('org-v-a-loja', '00000000-0000-0000-0000-0000000c8006') $$,
  '42501', 'sem_permissao', 'master sem segundo fator não marca');
select pg_temp.como('00000000-0000-0000-0000-0000000c2001');
select is(public.garante_definir_responsavel_avisos('org-v-a-loja', null), null::uuid, 'nulo desmarca');
select is((select count(*)::int from garante_avisos_destinatarios where unidade_id = 'org-v-a-loja' and ativo), 0, 'sem responsável ativo depois de desmarcar');
select public.garante_definir_responsavel_avisos('org-v-a-loja', '00000000-0000-0000-0000-0000000c8001');
select throws_ok($$ insert into garante_avisos_destinatarios (unidade_id, vinculo_id) values ('org-v-a-loja', '00000000-0000-0000-0000-0000000c8001') $$,
  '42501', null, 'gestão não grava direto na tabela');
select is((select count(*)::int from garante_avisos_destinatarios), 4, 'gestão da organização lê o histórico das suas unidades');
select pg_temp.como('00000000-0000-0000-0000-0000000c2003');
select is((select count(*)::int from garante_avisos_destinatarios), 0, 'operacional não lê o responsável');
select pg_temp.como('00000000-0000-0000-0000-0000000c2005');
select is((select count(*)::int from garante_avisos_destinatarios), 0, 'outra organização não lê o responsável');

-- Avisos só valem a partir do primeiro responsável: para o teste, a unidade tem responsável há 10 dias.
select pg_temp.servidor();
update garante_avisos_destinatarios set criado_em = pg_temp.agora(-10, '09:00');

-- ── Ciclo 1 (hoje 12:00): gera e reserva ────────────────────────────────
-- Esperado: atrasado P1 hoje (10:00 < 12:00 <= 20:00), crítico hoje, não concluído P1 ontem (fechou
-- às 20:00 de ontem), crítico ontem. Anteontem concluída (nada), 9 dias atrás fora dos 7 dias,
-- P2 ainda não venceu. Loja 2 tem responsável mas não tem checklist: nenhuma linha.
create temp table c1 as select * from public.garante_avisos_reservar(pg_temp.agora(0, '12:00'));
select is((select count(*)::int from c1), 1, 'ciclo 1: uma mensagem, só para a loja com pendências');
select results_eq($$ select unidade_id, telefone, destinatario_nome from c1 $$,
  $$ values ('org-v-a-loja'::text, '+5516999990001'::text, 'Ana Gestora'::text) $$, 'ciclo 1: unidade, WhatsApp e nome do responsável');
select is((select jsonb_array_length(avisos) from c1), 4, 'ciclo 1: 4 avisos na mesma mensagem');
select results_eq($$ select chave, estado from garante_avisos order by chave $$,
  $$ values
    ('atrasado:00000000-0000-0000-0000-0000000c6001:' || public.garante_hoje()::text, 'reservado'),
    ('critico:00000000-0000-0000-0000-0000000c7001:00000000-0000-0000-0000-0000000c4002', 'reservado'),
    ('critico:00000000-0000-0000-0000-0000000c7002:00000000-0000-0000-0000-0000000c4002', 'reservado'),
    ('nao_concluido:00000000-0000-0000-0000-0000000c6001:' || (public.garante_hoje() - 1)::text, 'reservado') $$,
  'ciclo 1: chaves estáveis dos 4 avisos, todos reservados');
select is((select count(distinct tentativa_id)::int from garante_avisos where tentativas = 1), 1, 'ciclo 1: uma tentativa só para os 4');
select is((select detalhes - 'data' from garante_avisos where chave like 'critico:00000000-0000-0000-0000-0000000c7001%'),
  '{"meta_max": 5, "meta_min": 0, "item_tipo": "numero", "valor_bool": null, "modelo_nome": "Abertura", "item_titulo": "Temperatura", "valor_numero": 9, "responsavel_nome": "Caio Operador"}'::jsonb,
  'crítico: item, valor, meta e quem respondeu');
select is((select detalhes - 'data' from garante_avisos where chave like 'atrasado:%'),
  '{"modelo_nome": "Abertura", "horario_limite": "10:00", "responsavel_nome": "Caio Operador"}'::jsonb,
  'atrasado: checklist, horário limite e responsável da programação');
select is((select count(*)::int from public.garante_avisos_reservar(pg_temp.agora(0, '12:01'))), 0, 'ciclo logo depois: nada novo, reservado não repete');

-- ── Confirmação 'falhou' volta à fila ───────────────────────────────────
select is(public.garante_avisos_confirmar((select tentativa_id from c1), 'falhou'), 4, 'falhou: fecha a tentativa dos 4');
select is((select count(*)::int from garante_avisos where estado = 'pendente' and fechado_em is null and tentativas = 1 and motivo = 'falhou_1'), 4,
  'falhou: os 4 voltam para a fila com 1 tentativa');
select is(public.garante_avisos_confirmar((select tentativa_id from c1), 'falhou'), 0, 'confirmar de novo é inócuo');
select throws_ok($$ select public.garante_avisos_confirmar((select tentativa_id from c1), 'ok') $$, '22023', 'resultado_invalido', 'resultado inválido é recusado');

-- ── Revalidação: resolvido não se cobra ─────────────────────────────────
update garante_respostas set valor_numero = 3, dentro_meta = true
 where execucao_id = '00000000-0000-0000-0000-0000000c7001' and item_id = '00000000-0000-0000-0000-0000000c4002';
update garante_execucoes set situacao = 'concluida', concluida_em = pg_temp.agora(0, '12:05'), concluida_por = '00000000-0000-0000-0000-0000000c2003'
 where id = '00000000-0000-0000-0000-0000000c7001';
create temp table c2 as select * from public.garante_avisos_reservar(pg_temp.agora(0, '12:10'));
select is((select jsonb_array_length(avisos) from c2), 2, 'ciclo 2: só os 2 de ontem saem');
select is((select motivo from garante_avisos where chave like 'atrasado:%'), 'concluido', 'atrasado de checklist concluído é cancelado');
select is((select motivo from garante_avisos where chave like 'critico:00000000-0000-0000-0000-0000000c7001%'), 'corrigido', 'crítico corrigido é cancelado');
select is((select count(*)::int from garante_avisos where estado = 'reservado' and tentativas = 2 and tentativa_id = (select tentativa_id from c2)), 2,
  'ciclo 2: os 2 de ontem na 2ª tentativa');
select is(public.garante_avisos_confirmar((select tentativa_id from c2), 'enviado'), 2, 'enviado: fecha os 2');
select is((select count(*)::int from garante_avisos where estado = 'enviado' and fechado_em is not null and motivo is null), 2, 'enviado fica fechado');

-- ── Janela 7h-23h: fora dela gera mas não reserva ───────────────────────
select is((select count(*)::int from public.garante_avisos_reservar(pg_temp.agora(0, '23:30'))), 0, '23:30: nada sai');
select is((select estado from garante_avisos where chave = 'atrasado:00000000-0000-0000-0000-0000000c6002:' || public.garante_hoje()::text), 'pendente',
  '23:30: atrasado de P2 (até 14:00, fecha no fim do dia) fica gerado e esperando');

-- ── Manhã seguinte: janela fechou, vira não concluído ───────────────────
create temp table c3 as select * from public.garante_avisos_reservar(pg_temp.agora(1, '07:30'));
select is((select motivo from garante_avisos where chave = 'atrasado:00000000-0000-0000-0000-0000000c6002:' || public.garante_hoje()::text), 'janela_fechada',
  'atrasado cuja janela fechou é cancelado (o não concluído assume)');
select results_eq($$ select jsonb_array_length(avisos), avisos -> 0 ->> 'chave' from c3 $$,
  $$ values (1, 'nao_concluido:00000000-0000-0000-0000-0000000c6002:' || public.garante_hoje()::text) $$,
  '07:30: só o não concluído de P2 de ontem sai');

-- ── Reserva vencida (15 min) vira incerto e nunca volta ──────────────────
select is((select count(*)::int from public.garante_avisos_reservar(pg_temp.agora(1, '07:50'))), 0, '20 min depois sem confirmação: nada sai');
select is((select estado || ':' || motivo from garante_avisos where tentativa_id = (select tentativa_id from c3)), 'incerto:reserva_vencida',
  'reserva vencida vira incerto');
select is(public.garante_avisos_confirmar((select tentativa_id from c3), 'falhou'), 0, 'falhou tardio na reserva vencida é ignorado');
select is((select estado from garante_avisos where tentativa_id = (select tentativa_id from c3)), 'incerto', 'incerto não volta à fila');

-- ── Responsável sem WhatsApp: pendência fica parada ─────────────────────
update vinculos set whatsapp = null where id = '00000000-0000-0000-0000-0000000c8001';
insert into garante_respostas (execucao_id, unidade_id, item_id, valor_numero, dentro_meta, respondido_por, respondido_em) values
  ('00000000-0000-0000-0000-0000000c7002', 'org-v-a-loja', '00000000-0000-0000-0000-0000000c4003', 12, false, '00000000-0000-0000-0000-0000000c2003', pg_temp.agora(1, '08:00'));
select is((select count(*)::int from public.garante_avisos_reservar(pg_temp.agora(1, '08:10'))), 0, 'responsável sem WhatsApp: nada sai');
select is((select estado from garante_avisos where chave = 'critico:00000000-0000-0000-0000-0000000c7002:00000000-0000-0000-0000-0000000c4003'), 'pendente',
  'responsável sem WhatsApp: o aviso novo fica gerado e esperando');
-- Pendência com mais de 7 dias expira.
update garante_avisos set evento_em = pg_temp.agora(1, '08:10') - interval '8 days'
 where chave = 'critico:00000000-0000-0000-0000-0000000c7002:00000000-0000-0000-0000-0000000c4003';
select public.garante_avisos_reservar(pg_temp.agora(1, '08:20'));
select is((select estado || ':' || motivo from garante_avisos where chave = 'critico:00000000-0000-0000-0000-0000000c7002:00000000-0000-0000-0000-0000000c4003'),
  'expirado:mais_de_7_dias', 'pendência velha expira');
update vinculos set whatsapp = '+5516999990001' where id = '00000000-0000-0000-0000-0000000c8001';

-- ── 3 falhas: falhou definitivo ─────────────────────────────────────────
insert into garante_respostas (execucao_id, unidade_id, item_id, valor_numero, dentro_meta, respondido_por, respondido_em) values
  ('00000000-0000-0000-0000-0000000c7002', 'org-v-a-loja', '00000000-0000-0000-0000-0000000c4004', 7, false, '00000000-0000-0000-0000-0000000c2003', pg_temp.agora(1, '08:25'));
create temp table c4 as select * from public.garante_avisos_reservar(pg_temp.agora(1, '08:30'));
select is((select jsonb_array_length(avisos) from c4), 1, '1ª tentativa do crítico novo');
select public.garante_avisos_confirmar((select tentativa_id from c4), 'falhou');
create temp table c5 as select * from public.garante_avisos_reservar(pg_temp.agora(1, '08:40'));
select public.garante_avisos_confirmar((select tentativa_id from c5), 'falhou');
create temp table c6 as select * from public.garante_avisos_reservar(pg_temp.agora(1, '08:50'));
select public.garante_avisos_confirmar((select tentativa_id from c6), 'falhou');
select is((select estado || ':' || motivo || ':' || tentativas::text || ':' || (fechado_em is not null)::text from garante_avisos
            where chave = 'critico:00000000-0000-0000-0000-0000000c7002:00000000-0000-0000-0000-0000000c4004'),
  'falhou:falhou_3:3:true', '3ª falha fecha de vez');
select is((select count(*)::int from public.garante_avisos_reservar(pg_temp.agora(1, '09:00'))), 0, 'falhou definitivo não volta');

-- ── Isolamento ──────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000c2001');
select ok((select count(*) from garante_avisos) > 0, 'gestão da unidade lê os avisos');
select pg_temp.como('00000000-0000-0000-0000-0000000c2003');
select is((select count(*)::int from garante_avisos), 0, 'operacional não lê avisos');
select pg_temp.como('00000000-0000-0000-0000-0000000c2002');
select is((select count(*)::int from garante_avisos), 0, 'gestão presa a outra unidade não lê');
select pg_temp.como('00000000-0000-0000-0000-0000000c2005');
select is((select count(*)::int from garante_avisos), 0, 'outra organização não lê');

-- ── Flag desligada ──────────────────────────────────────────────────────
select pg_temp.servidor();
update unidades set garante_habilitado = false where id = 'org-v-a-loja';
insert into garante_respostas (execucao_id, unidade_id, item_id, valor_numero, dentro_meta, respondido_por, respondido_em) values
  ('00000000-0000-0000-0000-0000000c7002', 'org-v-a-loja', '00000000-0000-0000-0000-0000000c4001', 1, false, '00000000-0000-0000-0000-0000000c2003', pg_temp.agora(1, '09:05'));
select is((select count(*)::int from public.garante_avisos_reservar(pg_temp.agora(1, '09:10'))), 0, 'flag desligada: nada sai');
select pg_temp.como('00000000-0000-0000-0000-0000000c2001');
select throws_ok($$ select public.garante_definir_responsavel_avisos('org-v-a-loja', '00000000-0000-0000-0000-0000000c8001') $$,
  '42501', 'sem_permissao', 'flag desligada: não marca responsável');
select is((select count(*)::int from garante_avisos), 0, 'flag desligada: gestão não vê avisos');

select pg_temp.servidor();
select * from finish();
rollback;
