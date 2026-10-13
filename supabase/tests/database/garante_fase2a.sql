-- Checklist Garante, Fase 2a: nota P-E-Q, janelas versionadas e dias sem operação.
-- Prova: os 3 cenários manuais da nota, não iniciada = 0, sem ocorrência fechada = nulo,
-- agregação por pessoa, setor e unidade; janela (iniciar antes de abrir e responder
-- depois de fechar falham, inclusive no Storage); regra nova só vale para o futuro e
-- não muda a nota passada; dia sem operação some da agenda e da nota e é recusado em
-- data passada e em data com checklist; operacional não lê a nota; outra unidade não
-- lê nada; parar o modelo e encerrar a programação não tiram da nota a ocorrência de
-- hoje com a janela já fechada. Só fixtures de teste, sem depender da hora em que roda.

begin;

create extension if not exists pgtap with schema extensions;

select plan(70);

-- ── Fixture ──────────────────────────────────────────────────────────────
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000a2001', 'gestor-n@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a2002', 'op-n@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a2003', 'outro-n@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a2004', 'master-n@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-n-a', 'Nota A', 'saas', true), ('org-n-b', 'Nota B', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, garante_habilitado) values
  ('org-n-a-loja', 'org-n-a', 'Loja NA', 'banco', true, true),
  ('org-n-b-loja', 'org-n-b', 'Loja NB', 'banco', true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000a2001', 'org-n-a', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000a2002', 'org-n-a', 'org-n-a-loja', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000a2003', 'org-n-b', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000a2004', 'org-n-b', null, 'master', 'ativo');

insert into setores (id, unidade_id, nome, ordem, ativo) values
  ('00000000-0000-0000-0000-0000000a5001', 'org-n-a-loja', 'Cozinha', 1, true);

insert into garante_modelos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-0000000a3001', 'org-n-a-loja', 'Abertura');
insert into garante_itens (id, modelo_id, unidade_id, ordem, titulo, tipo, critico, permite_na, foto_obrigatoria, meta_min, meta_max) values
  ('00000000-0000-0000-0000-0000000a4001', '00000000-0000-0000-0000-0000000a3001', 'org-n-a-loja', 1, 'Fogão', 'check', false, true, false, null, null),
  ('00000000-0000-0000-0000-0000000a4002', '00000000-0000-0000-0000-0000000a3001', 'org-n-a-loja', 2, 'Temperatura', 'numero', false, true, true, 0, 5),
  ('00000000-0000-0000-0000-0000000a4003', '00000000-0000-0000-0000-0000000a3001', 'org-n-a-loja', 3, 'Banheiro', 'check', false, true, false, null, null);

-- Todo dia até 10:00, responsável o operador, setor Cozinha, há 20 dias.
insert into garante_publicacoes (id, modelo_id, unidade_id, setor_id, responsavel_id, dias_semana, horario_limite, vigente_desde) values
  ('00000000-0000-0000-0000-0000000a6001', '00000000-0000-0000-0000-0000000a3001', 'org-n-a-loja',
   '00000000-0000-0000-0000-0000000a5001', '00000000-0000-0000-0000-0000000a2002',
   array[0,1,2,3,4,5,6]::smallint[], '10:00', public.garante_hoje() - 20);

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
create or replace function pg_temp.prazo(p_data date)
returns timestamptz language sql as $$ select (p_data + time '10:00') at time zone 'America/Sao_Paulo' $$;
create or replace function pg_temp.snap()
returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000a4001', 'tipo', 'check', 'critico', false, 'foto_obrigatoria', false, 'permite_na', true),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000a4002', 'tipo', 'numero', 'critico', false, 'foto_obrigatoria', true, 'permite_na', true, 'meta_min', 0, 'meta_max', 5),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000a4003', 'tipo', 'check', 'critico', false, 'foto_obrigatoria', false, 'permite_na', true))
$$;
-- Nota de um dia (linha da unidade).
create or replace function pg_temp.nota_dia(p_data date)
returns table (previstas int, concluidas int, p numeric, e numeric, q numeric, nota numeric, adesao numeric, versao int)
language sql as $$
  select n.previstas, n.concluidas, n.pontualidade, n.execucao, n.qualidade, n.nota, n.adesao, n.versao_formula
    from public.garante_nota('org-n-a-loja', p_data, p_data) n where n.nivel = 'unidade'
$$;
create temp table t (nome text primary key, valor text);
grant all on t to authenticated;

-- Execuções fechadas, gravadas pelo servidor (o banco já calculou a meta ao responder).
insert into garante_execucoes (id, publicacao_id, unidade_id, data, prazo, situacao, snapshot, modelo_nome, concluida_em) values
  -- Cenário 1: pontual, tudo dentro.
  ('00000000-0000-0000-0000-0000000a7001', '00000000-0000-0000-0000-0000000a6001', 'org-n-a-loja',
   public.garante_hoje() - 3, pg_temp.prazo(public.garante_hoje() - 3), 'concluida', pg_temp.snap(), 'Abertura',
   pg_temp.prazo(public.garante_hoje() - 3) - interval '1 hour'),
  -- Cenário 2: concluído no atraso, 1 item fora da meta.
  ('00000000-0000-0000-0000-0000000a7002', '00000000-0000-0000-0000-0000000a6001', 'org-n-a-loja',
   public.garante_hoje() - 4, pg_temp.prazo(public.garante_hoje() - 4), 'concluida', pg_temp.snap(), 'Abertura',
   pg_temp.prazo(public.garante_hoje() - 4) + interval '30 minutes'),
  -- Cenário 3: tudo "não se aplica", pontual.
  ('00000000-0000-0000-0000-0000000a7003', '00000000-0000-0000-0000-0000000a6001', 'org-n-a-loja',
   public.garante_hoje() - 5, pg_temp.prazo(public.garante_hoje() - 5), 'concluida', pg_temp.snap(), 'Abertura',
   pg_temp.prazo(public.garante_hoje() - 5) - interval '5 minutes');
-- Ontem: começou e ficou aberto (a janela fechou no fim do dia de ontem).
insert into garante_execucoes (id, publicacao_id, unidade_id, data, prazo, situacao, snapshot, modelo_nome) values
  ('00000000-0000-0000-0000-0000000a7004', '00000000-0000-0000-0000-0000000a6001', 'org-n-a-loja',
   public.garante_hoje() - 1, pg_temp.prazo(public.garante_hoje() - 1), 'em_andamento', pg_temp.snap(), 'Abertura');

insert into garante_respostas (execucao_id, unidade_id, item_id, valor_bool, valor_numero, nao_se_aplica, justificativa, foto_path, dentro_meta) values
  ('00000000-0000-0000-0000-0000000a7001', 'org-n-a-loja', '00000000-0000-0000-0000-0000000a4001', true, null, false, null, null, true),
  ('00000000-0000-0000-0000-0000000a7001', 'org-n-a-loja', '00000000-0000-0000-0000-0000000a4002', null, 3, false, null, 'x.jpg', true),
  ('00000000-0000-0000-0000-0000000a7001', 'org-n-a-loja', '00000000-0000-0000-0000-0000000a4003', true, null, false, null, null, true),
  ('00000000-0000-0000-0000-0000000a7002', 'org-n-a-loja', '00000000-0000-0000-0000-0000000a4001', true, null, false, null, null, true),
  ('00000000-0000-0000-0000-0000000a7002', 'org-n-a-loja', '00000000-0000-0000-0000-0000000a4002', null, 9, false, null, 'y.jpg', false),
  ('00000000-0000-0000-0000-0000000a7002', 'org-n-a-loja', '00000000-0000-0000-0000-0000000a4003', true, null, false, null, null, true),
  ('00000000-0000-0000-0000-0000000a7003', 'org-n-a-loja', '00000000-0000-0000-0000-0000000a4001', null, null, true, 'reforma', null, null),
  ('00000000-0000-0000-0000-0000000a7003', 'org-n-a-loja', '00000000-0000-0000-0000-0000000a4002', null, null, true, 'reforma', null, null),
  ('00000000-0000-0000-0000-0000000a7003', 'org-n-a-loja', '00000000-0000-0000-0000-0000000a4003', null, null, true, 'reforma', null, null);

-- Dia sem operação no passado (só o servidor consegue gravar; serve para a nota).
insert into garante_dias_sem_operacao (unidade_id, data, motivo) values ('org-n-a-loja', public.garante_hoje() - 7, 'Feriado');

-- ── Janela gravada ──────────────────────────────────────────────────────
select is((select fecha_em from garante_execucoes where id = '00000000-0000-0000-0000-0000000a7004'),
  public.garante_fim_do_dia(public.garante_hoje() - 1), 'execução sem janela ganha a da regra padrão (até o fim do dia, decisão de 13/10)');
select is((select abre_em from garante_execucoes where id = '00000000-0000-0000-0000-0000000a7004'),
  pg_temp.prazo(public.garante_hoje() - 1) - interval '120 minutes', 'e abre 120 min antes do prazo');

-- ── Nota: os 3 cenários manuais ─────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000a2001');
select results_eq($$ select p, e, q, nota from pg_temp.nota_dia(public.garante_hoje() - 3) $$,
  $$ values (100.0, 100.0, 100.0, 100.0) $$, 'cenário 1: pontual com tudo dentro = 100');
select results_eq($$ select p, e, q, nota from pg_temp.nota_dia(public.garante_hoje() - 4) $$,
  $$ values (0.0, 100.0, 66.7, 55.6) $$, 'cenário 2: concluído no atraso com 1 item fora = P 0, E 100, Q 66,7, nota 55,6');
select results_eq($$ select p, e, q, nota from pg_temp.nota_dia(public.garante_hoje() - 5) $$,
  $$ values (100.0, null::numeric, null::numeric, 100.0) $$, 'cenário 3: tudo "não se aplica" = só P');
select results_eq($$ select previstas, concluidas, p, e, q, nota, adesao from pg_temp.nota_dia(public.garante_hoje() - 6) $$,
  $$ values (1, 0, 0.0, 0.0, 0.0, 0.0, 0.0) $$, 'não iniciada = P, E e Q 0 e adesão 0');
select results_eq($$ select previstas, p, e, q, nota, adesao from pg_temp.nota_dia(public.garante_hoje() - 40) $$,
  $$ values (0, null::numeric, null::numeric, null::numeric, null::numeric, null::numeric) $$, 'sem ocorrência fechada = nulo');
select is((select versao from pg_temp.nota_dia(public.garante_hoje() - 3)), 1, 'fórmula versão 1');
select results_eq($$ select p, e, q, nota from pg_temp.nota_dia(public.garante_hoje() - 1) $$,
  $$ values (0.0, 0.0, 0.0, 0.0) $$, 'iniciada, sem resposta e com a janela vencida = 0');

-- Período de 4 dias: média simples das ocorrências com valor.
select results_eq($$ select previstas, concluidas, no_prazo, pontualidade, execucao, qualidade, nota, adesao
    from public.garante_nota('org-n-a-loja', public.garante_hoje() - 6, public.garante_hoje() - 3) where nivel = 'unidade' $$,
  $$ values (4, 3, 2, 50.0, 66.7, 55.6, 57.4, 75.0) $$, 'agregado da unidade: P 50, E 66,7, Q 55,6, nota 57,4, adesão 75');
select results_eq($$ select chave, nota from public.garante_nota('org-n-a-loja', public.garante_hoje() - 6, public.garante_hoje() - 3)
    where nivel = 'pessoa' $$,
  $$ values ('00000000-0000-0000-0000-0000000a2002'::text, 57.4) $$, 'linha da pessoa = responsável da publicação');
select results_eq($$ select chave, previstas from public.garante_nota('org-n-a-loja', public.garante_hoje() - 6, public.garante_hoje() - 3)
    where nivel = 'setor' $$,
  $$ values ('00000000-0000-0000-0000-0000000a5001'::text, 4) $$, 'linha do setor');
select is((select previstas from public.garante_nota('org-n-a-loja', public.garante_hoje() + 1, public.garante_hoje() + 4) where nivel = 'unidade'),
  0, 'ocorrência com a janela ainda aberta (ou que nem abriu) não conta');
select throws_ok($$ select * from public.garante_nota('org-n-a-loja', public.garante_hoje() - 93, public.garante_hoje()) $$,
  '22023', 'periodo_invalido', 'período acima de 93 dias é recusado');
select lives_ok($$ select * from public.garante_nota('org-n-a-loja', public.garante_hoje() - 92, public.garante_hoje()) $$,
  'período de 93 dias passa');

-- ── Dia sem operação ────────────────────────────────────────────────────
select results_eq($$ select previstas, nota from pg_temp.nota_dia(public.garante_hoje() - 7) $$,
  $$ values (0, null::numeric) $$, 'dia sem operação sai da nota');
select is((select count(*)::int from public.garante_agenda('org-n-a-loja', public.garante_hoje() - 7)), 0, 'e da agenda');
select is((select count(*)::int from public.garante_agenda('org-n-a-loja', public.garante_hoje() - 8)), 1, 'o dia anterior continua');
select throws_ok($$ select public.garante_marcar_dia_sem_operacao('org-n-a-loja', public.garante_hoje(), 'Feriado') $$,
  '22023', 'so_data_futura', 'hoje não vira dia sem operação');
select throws_ok($$ select public.garante_marcar_dia_sem_operacao('org-n-a-loja', public.garante_hoje() - 2, 'Feriado') $$,
  '22023', 'so_data_futura', 'data passada não vira dia sem operação');
select throws_ok($$ select public.garante_marcar_dia_sem_operacao('org-n-a-loja', public.garante_hoje() + 3, 'x') $$,
  '22023', 'motivo_obrigatorio', 'dia sem operação exige motivo');

select pg_temp.servidor();
insert into garante_execucoes (publicacao_id, unidade_id, data, prazo, snapshot, modelo_nome) values
  ('00000000-0000-0000-0000-0000000a6001', 'org-n-a-loja', public.garante_hoje() + 2,
   pg_temp.prazo(public.garante_hoje() + 2), pg_temp.snap(), 'Abertura');
select pg_temp.como('00000000-0000-0000-0000-0000000a2001');
select throws_ok($$ select public.garante_marcar_dia_sem_operacao('org-n-a-loja', public.garante_hoje() + 2, 'Feriado') $$,
  '22023', 'data_com_checklist', 'data com checklist iniciado não vira dia sem operação');
select lives_ok($$ select public.garante_marcar_dia_sem_operacao('org-n-a-loja', public.garante_hoje() + 3, 'Feriado municipal') $$,
  'gestão marca dia futuro sem operação');
select is((select count(*)::int from public.garante_agenda('org-n-a-loja', public.garante_hoje() + 3)), 0, 'o dia some da agenda');
select is((select count(*)::int from public.garante_agenda('org-n-a-loja', public.garante_hoje() + 2)), 1,
  'data com execução continua na agenda');

select pg_temp.como('00000000-0000-0000-0000-0000000a2002');
select throws_ok($$ select public.garante_iniciar('00000000-0000-0000-0000-0000000a6001', public.garante_hoje() + 3) $$,
  '22023', 'unidade_fechada_nesta_data', 'ninguém inicia checklist em dia sem operação');
select throws_ok($$ select public.garante_marcar_dia_sem_operacao('org-n-a-loja', public.garante_hoje() + 4, 'Feriado') $$,
  '42501', 'sem_permissao', 'operacional não marca dia sem operação');
select is((select count(*)::int from garante_dias_sem_operacao), 2, 'operacional lê os dias sem operação da unidade');

select pg_temp.como('00000000-0000-0000-0000-0000000a2001');
select lives_ok($$ select public.garante_desmarcar_dia_sem_operacao('org-n-a-loja', public.garante_hoje() + 3) $$,
  'gestão desmarca dia futuro');
select is((select count(*)::int from public.garante_agenda('org-n-a-loja', public.garante_hoje() + 3)), 1, 'e o dia volta para a agenda');
select throws_ok($$ select public.garante_desmarcar_dia_sem_operacao('org-n-a-loja', public.garante_hoje() - 7) $$,
  '22023', 'so_data_futura', 'dia sem operação passado não se desmarca');
select throws_ok($$ insert into garante_dias_sem_operacao (unidade_id, data, motivo) values ('org-n-a-loja', public.garante_hoje() + 9, 'Direto') $$,
  '42501', null, 'ninguém grava dia sem operação direto, só pela RPC');

-- ── Janela ──────────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000a2002');
select throws_ok($$ select public.garante_iniciar('00000000-0000-0000-0000-0000000a6001', public.garante_hoje() + 1) $$,
  '22023', 'janela_ainda_nao_abriu', 'iniciar antes de abrir falha (amanhã 10:00 abre às 08:00 de amanhã)');
select throws_ok($$ select public.garante_iniciar('00000000-0000-0000-0000-0000000a6001', public.garante_hoje() - 2) $$,
  '22023', 'data_fora_da_janela', 'iniciar depois de fechar falha');
select throws_ok($$ select public.garante_responder('00000000-0000-0000-0000-0000000a7004',
  '00000000-0000-0000-0000-0000000a4001', p_valor_bool => true) $$, '22023', 'data_fora_da_janela',
  'responder depois de fechar falha');
select throws_ok($$ select public.garante_concluir('00000000-0000-0000-0000-0000000a7004') $$, '22023', 'data_fora_da_janela',
  'concluir depois de fechar falha');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('garante-evidencias',
  'org-n-a-loja/00000000-0000-0000-0000-0000000a7004/00000000-0000-0000-0000-0000000a4002-abcdef12.jpg') $$,
  '42501', null, 'Storage recusa foto depois de fechar');
select is((select fecha_em from public.garante_agenda('org-n-a-loja', public.garante_hoje() + 4)),
  public.garante_fim_do_dia(public.garante_hoje() + 4), 'agenda mostra quando fecha (fim do dia)');

-- ── Regra nova só vale para o futuro ────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000a2001');
insert into t select 'nota_antes', nota::text from public.garante_nota('org-n-a-loja', public.garante_hoje() - 6, public.garante_hoje() - 3) where nivel = 'unidade';
select throws_ok($$ select public.garante_definir_regra('org-n-a-loja', 30, 10, public.garante_hoje()) $$,
  '22023', 'so_data_futura', 'regra não muda hoje');
select throws_ok($$ select public.garante_definir_regra('org-n-a-loja', 30, 5000) $$,
  '22023', 'regra_invalida', 'atraso acima de 24 h é recusado');
select is(public.garante_definir_regra('org-n-a-loja', 30, 10), public.garante_hoje() + 1, 'nova regra vale a partir de amanhã');
select is((select fecha_em from public.garante_janela('org-n-a-loja', public.garante_hoje(), '10:00')),
  public.garante_fim_do_dia(public.garante_hoje()), 'hoje continua com a regra antiga (fim do dia)');
select is((select fecha_em from public.garante_janela('org-n-a-loja', public.garante_hoje() + 1, '10:00')),
  pg_temp.prazo(public.garante_hoje() + 1) + interval '10 minutes', 'amanhã já usa a nova');
select is((select fecha_em from garante_execucoes where id = '00000000-0000-0000-0000-0000000a7004'),
  public.garante_fim_do_dia(public.garante_hoje() - 1), 'execução já gravada não muda');
select is((select nota::text from public.garante_nota('org-n-a-loja', public.garante_hoje() - 6, public.garante_hoje() - 3) where nivel = 'unidade'),
  (select valor from t where nome = 'nota_antes'), 'nota passada não muda');
select is((select min(vigente_desde) from garante_regras_unidade where unidade_id = 'org-n-a-loja'), public.garante_hoje() - 20,
  'a primeira regra da unidade nasce na primeira programação (nota do passado preservada)');
select throws_ok($$ insert into garante_regras_unidade (unidade_id, vigente_desde) values ('org-n-a-loja', public.garante_hoje() + 5) $$,
  '42501', null, 'ninguém grava regra direto, só pela RPC');

-- ── Parar e encerrar não mudam a nota já fechada ────────────────────────
-- Unidade com regra 0/0: checklist de 00:00 tem a janela de hoje sempre fechada;
-- o de 23:59:59 ainda não fechou. Ninguém iniciou nada.
select pg_temp.servidor();
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, garante_habilitado) values
  ('org-n-a-par', 'org-n-a', 'Loja NA Parar', 'banco', true, true);
insert into garante_regras_unidade (unidade_id, vigente_desde, antecedencia_min, atraso_max_min) values
  ('org-n-a-par', public.garante_hoje() - 30, 0, 0);
insert into garante_modelos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-0000000a3101', 'org-n-a-par', 'Fechamento'),
  ('00000000-0000-0000-0000-0000000a3102', 'org-n-a-par', 'Limpeza');
insert into garante_itens (modelo_id, unidade_id, ordem, titulo, tipo) values
  ('00000000-0000-0000-0000-0000000a3101', 'org-n-a-par', 1, 'Caixa', 'check'),
  ('00000000-0000-0000-0000-0000000a3102', 'org-n-a-par', 1, 'Chão', 'check');
insert into garante_publicacoes (id, modelo_id, unidade_id, dias_semana, horario_limite, vigente_desde) values
  -- P1: 00:00 desde anteontem (3 ocorrências fechadas). P2: 00:00 desde hoje (1 fechada).
  ('00000000-0000-0000-0000-0000000a6101', '00000000-0000-0000-0000-0000000a3101', 'org-n-a-par', array[0,1,2,3,4,5,6]::smallint[], '00:00', public.garante_hoje() - 2),
  ('00000000-0000-0000-0000-0000000a6102', '00000000-0000-0000-0000-0000000a3101', 'org-n-a-par', array[0,1,2,3,4,5,6]::smallint[], '00:00', public.garante_hoje()),
  -- P3: 23:59:59 desde anteontem (hoje ainda aberta). P5: 23:59:59 desde hoje (nada fechado).
  ('00000000-0000-0000-0000-0000000a6103', '00000000-0000-0000-0000-0000000a3101', 'org-n-a-par', array[0,1,2,3,4,5,6]::smallint[], '23:59:59', public.garante_hoje() - 2),
  ('00000000-0000-0000-0000-0000000a6105', '00000000-0000-0000-0000-0000000a3101', 'org-n-a-par', array[0,1,2,3,4,5,6]::smallint[], '23:59:59', public.garante_hoje()),
  -- P4 (outro modelo): 00:00 desde anteontem, para encerrar a programação.
  ('00000000-0000-0000-0000-0000000a6104', '00000000-0000-0000-0000-0000000a3102', 'org-n-a-par', array[0,1,2,3,4,5,6]::smallint[], '00:00', public.garante_hoje() - 2);
-- P6: 23:59:59 desde hoje (janela de hoje aberta), com o checklist de AMANHÃ já iniciado.
insert into garante_publicacoes (id, modelo_id, unidade_id, dias_semana, horario_limite, vigente_desde) values
  ('00000000-0000-0000-0000-0000000a6106', '00000000-0000-0000-0000-0000000a3101', 'org-n-a-par', array[0,1,2,3,4,5,6]::smallint[], '23:59:59', public.garante_hoje());
insert into garante_execucoes (publicacao_id, unidade_id, data, prazo, snapshot, modelo_nome) values
  ('00000000-0000-0000-0000-0000000a6106', 'org-n-a-par', public.garante_hoje() + 1,
   ((public.garante_hoje() + 1) + time '23:59:59') at time zone 'America/Sao_Paulo', '[]'::jsonb, 'Fechamento');
create or replace function pg_temp.nota_par()
returns text language sql as $$
  select string_agg(n::text, ';' order by n.nivel, n.chave)
    from public.garante_nota('org-n-a-par', public.garante_hoje() - 2, public.garante_hoje()) n
$$;

select pg_temp.como('00000000-0000-0000-0000-0000000a2001');
insert into t select 'nota_par', pg_temp.nota_par();
select is((select previstas from public.garante_nota('org-n-a-par', public.garante_hoje() - 2, public.garante_hoje()) where nivel = 'unidade'),
  9, 'antes de parar: 9 ocorrências fechadas sem início (P1 3, P2 1, P3 2, P4 3)');
select lives_ok($$ select public.garante_parar_modelo('00000000-0000-0000-0000-0000000a3101') $$, 'gestão para o modelo');
select is(pg_temp.nota_par(), (select valor from t where nome = 'nota_par'), 'nota igual depois de parar o modelo');
select is((select vigente_ate from garante_publicacoes where id = '00000000-0000-0000-0000-0000000a6101'), public.garante_hoje(),
  'janela de hoje fechada: a programação termina hoje, não ontem');
select is((select ativo::text || ' ' || vigente_ate::text from garante_publicacoes where id = '00000000-0000-0000-0000-0000000a6102'),
  'true ' || public.garante_hoje()::text, 'programação que começou hoje com a janela fechada continua (encerrada hoje)');
select is((select vigente_ate from garante_publicacoes where id = '00000000-0000-0000-0000-0000000a6103'), public.garante_hoje() - 1,
  'janela de hoje ainda aberta e sem início: termina ontem, como antes');
select is((select count(*)::int from public.garante_agenda('org-n-a-par', public.garante_hoje())
            where publicacao_id = '00000000-0000-0000-0000-0000000a6103'), 0, 'e some da agenda de hoje (para a frente nada muda)');
select is((select ativo from garante_publicacoes where id = '00000000-0000-0000-0000-0000000a6106'), false,
  'só com o checklist de amanhã iniciado: a programação é desativada, sem erro');
select is((select count(*)::int from public.garante_agenda('org-n-a-par', public.garante_hoje())
            where publicacao_id = '00000000-0000-0000-0000-0000000a6106'), 0,
  'hoje (aberto e sem início) sai da agenda, então não vira zero na nota quando a janela fechar');
select is((select count(*)::int from public.garante_agenda('org-n-a-par', public.garante_hoje() + 1)
            where publicacao_id = '00000000-0000-0000-0000-0000000a6106' and execucao_id is not null), 1,
  'o checklist de amanhã já iniciado continua na agenda de amanhã');
select is((select previstas from public.garante_nota('org-n-a-par', public.garante_hoje() - 2, public.garante_hoje()) where nivel = 'unidade'),
  9, 'nota de hoje não ganha ocorrência da programação desativada');
select is((select count(*)::int from garante_execucoes where publicacao_id = '00000000-0000-0000-0000-0000000a6106'), 1,
  'a execução de amanhã continua');
select is((select ativo from garante_publicacoes where id = '00000000-0000-0000-0000-0000000a6105'), false,
  'programação de hoje sem nada fechado deixa de existir, como antes');
select lives_ok($$ select public.garante_encerrar_publicacao('00000000-0000-0000-0000-0000000a6104') $$, 'gestão encerra a programação');
select is(pg_temp.nota_par(), (select valor from t where nome = 'nota_par'), 'nota igual depois de encerrar a programação');
select is((select vigente_ate from garante_publicacoes where id = '00000000-0000-0000-0000-0000000a6104'), public.garante_hoje(),
  'encerrar mantém hoje');

-- ── Permissões ──────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000a2002');
select throws_ok($$ select * from public.garante_nota('org-n-a-loja', public.garante_hoje() - 6, public.garante_hoje()) $$,
  '42501', 'sem_permissao', 'operacional não lê a nota');
select throws_ok($$ select public.garante_definir_regra('org-n-a-loja', 30, 10) $$, '42501', 'sem_permissao', 'operacional não muda a regra');
select ok((select count(*) from garante_regras_unidade) >= 1, 'operacional lê a regra da unidade');

select pg_temp.como('00000000-0000-0000-0000-0000000a2003');
select throws_ok($$ select * from public.garante_nota('org-n-a-loja', public.garante_hoje() - 6, public.garante_hoje()) $$,
  '42501', 'sem_permissao', 'gestor de outra unidade não lê a nota');
select is((select count(*)::int from garante_regras_unidade) + (select count(*)::int from garante_dias_sem_operacao), 0,
  'gestor de outra unidade não lê regra nem dia sem operação');
select throws_ok($$ select public.garante_marcar_dia_sem_operacao('org-n-a-loja', public.garante_hoje() + 6, 'Feriado') $$,
  '42501', 'sem_permissao', 'gestor de outra unidade não marca dia sem operação');

select pg_temp.como('00000000-0000-0000-0000-0000000a2004', 'aal2');
select is((select nota from public.garante_nota('org-n-a-loja', public.garante_hoje() - 3, public.garante_hoje() - 3) where nivel = 'unidade'),
  100.0, 'master com segundo fator lê a nota');

select pg_temp.servidor();
select * from finish();
rollback;
