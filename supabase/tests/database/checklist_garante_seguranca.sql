-- Checklist Garante V1 - regras e fronteira de segurança no banco.
-- Prova: só quem tem acesso à unidade (e módulo ligado) enxerga; só gestão monta
-- modelo e publica; execução só por RPC, com responsável, janela de data e snapshot;
-- meta calculada no banco; "não se aplica" proibido em item crítico e exige motivo;
-- foto obrigatória trava a conclusão; concluída não muda; Storage só aceita a foto no
-- caminho da execução em andamento. Só fixtures de teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(53);

grant select, insert, update, delete on garante_modelos, garante_itens, garante_publicacoes,
  garante_execucoes, garante_respostas to authenticated;

-- ── Fixture ──────────────────────────────────────────────────────────────
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000f0001', 'gestor-g@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f0002', 'op1-g@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f0003', 'op2-g@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f0004', 'outro-g@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-g-a', 'Garante A', 'saas', true), ('org-g-b', 'Garante B', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, garante_habilitado) values
  ('org-g-a-loja', 'org-g-a', 'Loja GA', 'banco', true, true),
  ('org-g-a-off', 'org-g-a', 'Loja GA sem módulo', 'banco', true, false),
  ('org-g-b-loja', 'org-g-b', 'Loja GB', 'banco', true, true);

insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000f0001', 'org-g-a', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f0002', 'org-g-a', 'org-g-a-loja', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000f0003', 'org-g-a', 'org-g-a-loja', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000f0004', 'org-g-b', null, 'gestao', 'ativo');

insert into garante_modelos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-00000000b001', 'org-g-a-loja', 'Abertura'),
  ('00000000-0000-0000-0000-00000000b002', 'org-g-a-off', 'Abertura sem módulo');

insert into garante_itens (id, modelo_id, unidade_id, ordem, titulo, tipo, critico, permite_na, foto_obrigatoria, meta_min, meta_max) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001', 'org-g-a-loja', 1, 'Ligar e testar o fogão', 'check', false, true, false, null, null),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000b001', 'org-g-a-loja', 2, 'Temperatura dos refrigerados (°C)', 'numero', true, false, true, 0, 5),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-00000000b001', 'org-g-a-loja', 3, 'Banheiros abastecidos', 'check', false, true, false, null, null);

insert into garante_publicacoes (id, modelo_id, unidade_id, responsavel_id, dias_semana, horario_limite, vigente_desde) values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000b001', 'org-g-a-loja',
   '00000000-0000-0000-0000-0000000f0002', array[0,1,2,3,4,5,6]::smallint[], '10:00', current_date - 7);

create or replace function pg_temp.como(p_user_id uuid)
returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
create or replace function pg_temp.servidor()
returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', null, true);
$$;
create temp table t (nome text primary key, id uuid);
grant all on t to authenticated;

-- ── Leitura e montagem ──────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000f0002');
select is((select count(*)::int from garante_modelos), 1, 'operacional vê o modelo da própria unidade com módulo ligado');
select is((select count(*)::int from garante_modelos where unidade_id = 'org-g-a-off'), 0, 'unidade com módulo desligado não aparece');
select throws_ok($$ insert into garante_modelos (unidade_id, nome) values ('org-g-a-loja', 'Meu') $$,
  '42501', null, 'operacional não cria modelo');
select throws_ok($$ insert into garante_execucoes (publicacao_id, unidade_id, data, prazo, snapshot, modelo_nome)
  values ('00000000-0000-0000-0000-00000000d001', 'org-g-a-loja', current_date, now(), '[]', 'x') $$,
  '42501', null, 'ninguém grava execução direto, só pela RPC');

select pg_temp.como('00000000-0000-0000-0000-0000000f0004');
select is((select count(*)::int from garante_modelos), 0, 'gestor de outro cliente não vê nada');
select throws_ok($$ select public.garante_iniciar('00000000-0000-0000-0000-00000000d001', public.garante_hoje()) $$,
  '42501', null, 'gestor de outro cliente não inicia');

select pg_temp.como('00000000-0000-0000-0000-0000000f0001');
select lives_ok($$ insert into garante_modelos (unidade_id, nome) values ('org-g-a-loja', 'Fechamento') $$,
  'gestão cria modelo');

-- ── Iniciar ─────────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000f0003');
select throws_ok($$ select public.garante_iniciar('00000000-0000-0000-0000-00000000d001', public.garante_hoje()) $$,
  '42501', null, 'operacional que não é o responsável não inicia');

select pg_temp.como('00000000-0000-0000-0000-0000000f0002');
select throws_ok($$ select public.garante_iniciar('00000000-0000-0000-0000-00000000d001', public.garante_hoje() + 1) $$,
  '22023', null, 'não inicia checklist de amanhã');
insert into t values ('exec', public.garante_iniciar('00000000-0000-0000-0000-00000000d001', public.garante_hoje()));
select isnt((select id from t where nome = 'exec'), null, 'responsável inicia o checklist de hoje');
select is(public.garante_iniciar('00000000-0000-0000-0000-00000000d001', public.garante_hoje()),
  (select id from t where nome = 'exec'), 'iniciar de novo continua a mesma execução');
select is((select jsonb_array_length(snapshot) from garante_execucoes where id = (select id from t where nome = 'exec')), 3,
  'snapshot guarda os 3 itens');

-- ── Responder ───────────────────────────────────────────────────────────
select is(public.garante_responder((select id from t where nome = 'exec'), '00000000-0000-0000-0000-00000000c002', p_valor_numero => 9),
  false, 'temperatura 9 °C fica fora da meta 0 a 5');
select is((select dentro_meta from garante_respostas where item_id = '00000000-0000-0000-0000-00000000c002'), false,
  'fora da meta gravado pelo banco');
select throws_ok($$ select public.garante_responder((select id from t where nome = 'exec'), '00000000-0000-0000-0000-00000000c002',
  p_nao_se_aplica => true, p_justificativa => 'sem câmara hoje') $$, '22023', null, 'não se aplica é proibido em item crítico');
select throws_ok($$ select public.garante_responder((select id from t where nome = 'exec'), '00000000-0000-0000-0000-00000000c003',
  p_nao_se_aplica => true) $$, '22023', null, 'não se aplica exige justificativa');
select throws_ok($$ select public.garante_responder((select id from t where nome = 'exec'), '00000000-0000-0000-0000-00000000c999',
  p_valor_bool => true) $$, '22023', null, 'item fora do checklist é recusado');
update garante_respostas set dentro_meta = true where item_id = '00000000-0000-0000-0000-00000000c002';
select is((select dentro_meta from garante_respostas where item_id = '00000000-0000-0000-0000-00000000c002'), false,
  'resposta não se edita direto (o update não pega nenhuma linha)');
select is(public.garante_responder((select id from t where nome = 'exec'), '00000000-0000-0000-0000-00000000c001', p_valor_bool => true),
  true, 'check marcado fica dentro da meta');
select lives_ok($$ select public.garante_responder((select id from t where nome = 'exec'), '00000000-0000-0000-0000-00000000c003',
  p_nao_se_aplica => true, p_justificativa => 'banheiro em reforma') $$, 'não se aplica com motivo em item comum');

-- ── Foto e conclusão ────────────────────────────────────────────────────
select is(public.garante_concluir((select id from t where nome = 'exec')), 1, 'sem a foto obrigatória falta 1 item');
select is((select respondidos from public.garante_agenda('org-g-a-loja', public.garante_hoje())), 2,
  'progresso não conta o item respondido sem a foto obrigatória (mesmo critério da conclusão)');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('garante-evidencias',
  'org-g-b-loja/' || (select id from t where nome = 'exec') || '/00000000-0000-0000-0000-00000000c002-abcdef12.jpg') $$,
  '42501', null, 'Storage recusa foto com unidade trocada no caminho');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('garante-evidencias',
  'org-g-a-loja/' || (select id from t where nome = 'exec') || '/00000000-0000-0000-0000-00000000c002-abcdef12.jpg') $$,
  'Storage aceita a foto no caminho da execução em andamento');
select throws_ok($$ select public.garante_registrar_foto((select id from t where nome = 'exec'), '00000000-0000-0000-0000-00000000c002',
  'org-g-a-loja/outra/foto.jpg') $$, '22023', null, 'registrar foto com caminho de outra execução é recusado');
select lives_ok($$ select public.garante_registrar_foto((select id from t where nome = 'exec'), '00000000-0000-0000-0000-00000000c002',
  'org-g-a-loja/' || (select id from t where nome = 'exec') || '/00000000-0000-0000-0000-00000000c002-abcdef12.jpg') $$,
  'registrar a foto recebida');
select is(public.garante_concluir((select id from t where nome = 'exec')), 0, 'com tudo respondido e a foto, conclui');
select throws_ok($$ select public.garante_responder((select id from t where nome = 'exec'), '00000000-0000-0000-0000-00000000c001',
  p_valor_bool => false) $$, '22023', null, 'execução concluída não muda');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('garante-evidencias',
  'org-g-a-loja/' || (select id from t where nome = 'exec') || '/00000000-0000-0000-0000-00000000c001-abcdef99.jpg') $$,
  '42501', null, 'Storage recusa foto nova em execução concluída');

-- ── Agenda ──────────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000f0001');
select is((select situacao from public.garante_agenda('org-g-a-loja', public.garante_hoje())), 'concluida',
  'agenda do gestor mostra o checklist concluído');
select is((select fora_da_meta from public.garante_agenda('org-g-a-loja', public.garante_hoje())), 1,
  'agenda conta 1 item fora da meta');

-- ══ Correções da revisão final do Codex (12/10) ═════════════════════════
select pg_temp.servidor();
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000f0005', 'master-g@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000f0005', 'org-g-b', null, 'master', 'ativo');
insert into garante_modelos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-00000000b003', 'org-g-a-loja', 'Fechamento antigo'),
  ('00000000-0000-0000-0000-00000000b004', 'org-g-a-loja', 'Sem itens');
insert into garante_itens (id, modelo_id, unidade_id, ordem, titulo, tipo) values
  ('00000000-0000-0000-0000-00000000c010', '00000000-0000-0000-0000-00000000b003', 'org-g-a-loja', 1, 'Desligar o forno', 'check'),
  ('00000000-0000-0000-0000-00000000c011', '00000000-0000-0000-0000-00000000b003', 'org-g-a-loja', 2, 'Temperatura da câmara', 'numero');
insert into garante_publicacoes (id, modelo_id, unidade_id, dias_semana, horario_limite, vigente_desde) values
  ('00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-00000000b003', 'org-g-a-loja',
   array[0,1,2,3,4,5,6]::smallint[], '23:00', public.garante_hoje() - 5);
insert into garante_execucoes (id, publicacao_id, unidade_id, data, prazo, snapshot, modelo_nome) values
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000d003', 'org-g-a-loja',
   public.garante_hoje() - 2, now() - interval '2 days',
   jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000c010', 'tipo', 'check',
     'critico', false, 'foto_obrigatoria', false, 'permite_na', true)), 'Fechamento antigo');

create or replace function pg_temp.como_aal2(p_user_id uuid)
returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;

-- 3: programação só pelas RPCs, responsável com vínculo na unidade.
select pg_temp.como('00000000-0000-0000-0000-0000000f0001');
update garante_publicacoes set horario_limite = '23:59' where id = '00000000-0000-0000-0000-00000000d001';
select is((select horario_limite from garante_publicacoes where id = '00000000-0000-0000-0000-00000000d001'), '10:00'::time,
  'gestão não altera programação direto pela API (horário fica como era)');
select throws_ok($$ insert into garante_publicacoes (modelo_id, unidade_id, dias_semana, horario_limite)
  values ('00000000-0000-0000-0000-00000000b001', 'org-g-a-loja', array[1]::smallint[], '10:00') $$,
  '42501', null, 'gestão não cria programação direto, só pela RPC');
select throws_ok($$ select public.garante_publicar('00000000-0000-0000-0000-00000000b001', null,
  '00000000-0000-0000-0000-0000000f0004', array[1]::smallint[], '10:00') $$,
  '22023', 'responsavel_sem_acesso', 'responsável sem vínculo com a unidade é recusado');
select throws_ok($$ select public.garante_publicar('00000000-0000-0000-0000-00000000b004', null, null,
  array[1]::smallint[], '10:00') $$, '22023', 'checklist_sem_itens', '5: checklist sem itens não publica');
select lives_ok($$ select public.garante_publicar('00000000-0000-0000-0000-00000000b001', null,
  '00000000-0000-0000-0000-0000000f0003', array[1,2]::smallint[], '11:00') $$,
  'gestão publica para alguém da unidade');

-- 12: flag isolada (gestão da organização inteira, unidade com módulo desligado).
select throws_ok($$ select public.garante_publicar('00000000-0000-0000-0000-00000000b002', null, null,
  array[1]::smallint[], '10:00') $$, '42501', null, 'gestão com acesso à unidade, mas módulo desligado, não publica');
select is((select count(*)::int from garante_modelos where unidade_id = 'org-g-a-off'), 0,
  'gestão com acesso à unidade, mas módulo desligado, não lê');

-- 12: Master.
select pg_temp.como('00000000-0000-0000-0000-0000000f0005');
select is((select count(*)::int from garante_modelos), 0, 'master sem segundo fator não vê nada do Garante');
select pg_temp.como_aal2('00000000-0000-0000-0000-0000000f0005');
select lives_ok($$ select public.garante_publicar('00000000-0000-0000-0000-00000000b001', null, null,
  array[3]::smallint[], '12:00') $$, 'master com segundo fator publica');
select ok((select count(*) from garante_execucoes where unidade_id = 'org-g-a-loja') >= 2,
  'master com segundo fator lê as execuções da unidade');

-- 2: operacional só lê a execução que pode cumprir.
select pg_temp.como('00000000-0000-0000-0000-0000000f0003');
select is((select count(*)::int from garante_execucoes where publicacao_id = '00000000-0000-0000-0000-00000000d001'), 0,
  'operacional não lê a execução de outra pessoa');
select is((select count(*)::int from garante_respostas where execucao_id = (select id from t where nome = 'exec')), 0,
  'nem as respostas dela');

-- 10: janela hoje/ontem em todas as RPCs.
select throws_ok($$ select public.garante_responder('00000000-0000-0000-0000-00000000e003',
  '00000000-0000-0000-0000-00000000c010', p_valor_bool => true) $$, '22023', 'data_fora_da_janela',
  'execução de anteontem não aceita resposta');

-- 5: número não finito.
insert into t values ('exec3', public.garante_iniciar('00000000-0000-0000-0000-00000000d003', public.garante_hoje()));
select throws_ok($$ select public.garante_responder((select id from t where nome = 'exec3'),
  '00000000-0000-0000-0000-00000000c011', p_valor_numero => 'NaN'::numeric) $$, '22023', null, 'resposta NaN é recusada');
select pg_temp.como('00000000-0000-0000-0000-0000000f0001');
select throws_ok($$ insert into garante_itens (modelo_id, unidade_id, titulo, tipo, meta_min)
  values ('00000000-0000-0000-0000-00000000b003', 'org-g-a-loja', 'x', 'numero', 'Infinity'::numeric) $$,
  '23514', null, 'meta infinita é recusada');

-- 6: Storage valida item e nome.
select pg_temp.como('00000000-0000-0000-0000-0000000f0003');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('garante-evidencias',
  'org-g-a-loja/' || (select id from t where nome = 'exec3') || '/00000000-0000-0000-0000-00000000c001-abcdef12.jpg') $$,
  '42501', null, 'Storage recusa foto de item que não é deste checklist');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('garante-evidencias',
  'org-g-a-loja/' || (select id from t where nome = 'exec3') || '/foto.jpg') $$,
  '42501', null, 'Storage recusa nome fora do padrão');

-- 8: parar de usar não apaga o histórico.
select pg_temp.como('00000000-0000-0000-0000-0000000f0001');
select lives_ok($$ select public.garante_parar_modelo('00000000-0000-0000-0000-00000000b003') $$, 'gestão para de usar o checklist');
select is((select count(*)::int from public.garante_agenda('org-g-a-loja', public.garante_hoje() - 2)
  where modelo_id = '00000000-0000-0000-0000-00000000b003'), 1, 'a execução de anteontem continua no quadro');
select is((select situacao from public.garante_agenda('org-g-a-loja', public.garante_hoje() - 3)
  where modelo_id = '00000000-0000-0000-0000-00000000b003'), 'pendente', 'dia que ficou sem fazer continua no quadro');
select is((select count(*)::int from public.garante_agenda('org-g-a-loja', public.garante_hoje())
  where modelo_id = '00000000-0000-0000-0000-00000000b003'), 1, 'o de hoje, que já tinha começado, continua');
select is((select count(*)::int from public.garante_agenda('org-g-a-loja', public.garante_hoje() + 1)
  where modelo_id = '00000000-0000-0000-0000-00000000b003'), 0, 'e some dos próximos dias');

select pg_temp.servidor();
select * from finish();
rollback;
