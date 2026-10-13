-- Checklist Garante: janela até o fim do dia (decisão 3 de Vinícius, 13/10/2026).
-- Prova: sem regra (ou regra sem tolerância) o checklist aceita até 23:59:59 do dia;
-- tolerância em minutos continua valendo (inclusive 0); a gestão (e o master com
-- segundo fator) troca entre os dois a partir de amanhã; execução já iniciada mantém
-- o fecha_em (inclusive a que nasceu com 60 min); concluir depois do horário limite
-- e antes do fim do dia conta P = 0; ocorrência de ontem não iniciada fecha no fim
-- do dia de ontem e a de hoje continua aberta; a transição da migration
-- (garante_aplicar_padrao_fim_do_dia) só mexe na regra padrão sem autor, dá a regra
-- antiga a quem não tinha nenhuma e é idempotente. Só fixtures, qualquer hora do dia.

begin;

create extension if not exists pgtap with schema extensions;

select plan(38);

-- ── Fixture ──────────────────────────────────────────────────────────────
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000d2001', 'gestor-j@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000d2004', 'master-j@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-j-a', 'Janela A', 'saas', true), ('org-j-b', 'Janela B', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, garante_habilitado) values
  ('org-j-a-sem', 'org-j-a', 'Sem regra', 'banco', true, true),
  ('org-j-a-com', 'org-j-a', 'Com 60 min', 'banco', true, true),
  -- Transição da migration: padrão sem autor, regra da gestão (com autor), sem regra nenhuma.
  ('org-j-a-pad', 'org-j-a', 'Padrão fase 2a', 'banco', true, true),
  ('org-j-a-ges', 'org-j-a', 'Regra da gestão', 'banco', true, true),
  ('org-j-a-nen', 'org-j-a', 'Sem regra, com programação', 'banco', true, true),
  ('org-j-a-fora', 'org-j-a', 'Sem Garante', 'banco', true, false);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000d2001', 'org-j-a', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000d2004', 'org-j-b', null, 'master', 'ativo');
insert into garante_regras_unidade (unidade_id, vigente_desde, antecedencia_min, atraso_max_min, criado_por) values
  ('org-j-a-com', public.garante_hoje() - 30, 120, 60, null),
  ('org-j-a-pad', public.garante_hoje() - 10, 120, 60, null),
  ('org-j-a-ges', public.garante_hoje() - 10, 120, 60, '00000000-0000-0000-0000-0000000d2001');

insert into garante_modelos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-0000000d3001', 'org-j-a-sem', 'Abertura'),
  ('00000000-0000-0000-0000-0000000d3002', 'org-j-a-nen', 'Abertura'),
  ('00000000-0000-0000-0000-0000000d3003', 'org-j-a-com', 'Abertura');
insert into garante_itens (id, modelo_id, unidade_id, ordem, titulo, tipo) values
  ('00000000-0000-0000-0000-0000000d4001', '00000000-0000-0000-0000-0000000d3001', 'org-j-a-sem', 1, 'Fogão', 'check'),
  ('00000000-0000-0000-0000-0000000d4002', '00000000-0000-0000-0000-0000000d3002', 'org-j-a-nen', 1, 'Fogão', 'check'),
  ('00000000-0000-0000-0000-0000000d4003', '00000000-0000-0000-0000-0000000d3003', 'org-j-a-com', 1, 'Fogão', 'check');
-- P1: todo dia até 10:00, há 20 dias. P2: todo dia até 00:00 (já passou, hoje, em qualquer hora).
-- P3: unidade sem regra nenhuma, programação há 5 dias (a transição dá a regra antiga desde aí).
-- P4: unidade com 60 min, todo dia até 10:00.
insert into garante_publicacoes (id, modelo_id, unidade_id, dias_semana, horario_limite, vigente_desde) values
  ('00000000-0000-0000-0000-0000000d6001', '00000000-0000-0000-0000-0000000d3001', 'org-j-a-sem', array[0,1,2,3,4,5,6]::smallint[], '10:00', public.garante_hoje() - 20),
  ('00000000-0000-0000-0000-0000000d6002', '00000000-0000-0000-0000-0000000d3001', 'org-j-a-sem', array[0,1,2,3,4,5,6]::smallint[], '00:00', public.garante_hoje()),
  ('00000000-0000-0000-0000-0000000d6003', '00000000-0000-0000-0000-0000000d3002', 'org-j-a-nen', array[0,1,2,3,4,5,6]::smallint[], '10:00', public.garante_hoje() - 5),
  ('00000000-0000-0000-0000-0000000d6004', '00000000-0000-0000-0000-0000000d3003', 'org-j-a-com', array[0,1,2,3,4,5,6]::smallint[], '10:00', public.garante_hoje() - 20);

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
create or replace function pg_temp.prazo(p_data date, p_hora time default '10:00')
returns timestamptz language sql as $$ select (p_data + p_hora) at time zone 'America/Sao_Paulo' $$;
create temp table t (nome text primary key, valor uuid);
grant all on t to authenticated;

-- ── Coluna e fim do dia ─────────────────────────────────────────────────
select col_is_null('public', 'garante_regras_unidade', 'atraso_max_min', 'tolerância de atraso aceita nulo (= fim do dia)');
select col_hasnt_default('public', 'garante_regras_unidade', 'atraso_max_min', 'sem padrão de 60 min na coluna');
select is(public.garante_fim_do_dia(date '2026-10-13'), timestamptz '2026-10-13 23:59:59-03', 'fim do dia = 23:59:59 de São Paulo');

-- ── Janela pela regra vigente ───────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000d2001');
select results_eq($$ select abre_em, fecha_em from public.garante_janela('org-j-a-sem', public.garante_hoje(), '10:00') $$,
  $$ values (pg_temp.prazo(public.garante_hoje()) - interval '120 minutes', public.garante_fim_do_dia(public.garante_hoje())) $$,
  'sem regra: abre 2 h antes e fecha no fim do dia');
select is((select fecha_em from public.garante_janela('org-j-a-com', public.garante_hoje(), '10:00')),
  pg_temp.prazo(public.garante_hoje()) + interval '60 minutes', 'regra com tolerância em minutos continua: prazo + 60');
select is((select fecha_em from public.garante_janela('org-j-a-sem', public.garante_hoje(), '23:59:59')),
  public.garante_fim_do_dia(public.garante_hoje()), 'checklist de 23:59:59 fecha junto com o dia (nunca antes do prazo)');

-- Execução gravada pelo servidor sem janela, ontem, 10:00: fecha no fim de ontem.
-- Na unidade com 60 min, a execução de hoje nasce com prazo + 60 (regra da época).
select pg_temp.servidor();
insert into garante_execucoes (id, publicacao_id, unidade_id, data, prazo, snapshot, modelo_nome) values
  ('00000000-0000-0000-0000-0000000d7001', '00000000-0000-0000-0000-0000000d6001', 'org-j-a-sem', public.garante_hoje() - 1,
   pg_temp.prazo(public.garante_hoje() - 1), '[]'::jsonb, 'Abertura');
insert into garante_execucoes (id, publicacao_id, unidade_id, data, prazo, snapshot, modelo_nome) values
  ('00000000-0000-0000-0000-0000000d7002', '00000000-0000-0000-0000-0000000d6004', 'org-j-a-com', public.garante_hoje(),
   pg_temp.prazo(public.garante_hoje()), '[]'::jsonb, 'Abertura');
select is((select fecha_em from garante_execucoes where id = '00000000-0000-0000-0000-0000000d7001'),
  public.garante_fim_do_dia(public.garante_hoje() - 1), 'execução sem janela ganha o fim do dia da data dela');
select is((select fecha_em from garante_execucoes where id = '00000000-0000-0000-0000-0000000d7002'),
  pg_temp.prazo(public.garante_hoje()) + interval '60 minutes', 'na unidade com 60 min a execução nasce com prazo + 60');

-- ── Gestão troca entre fim do dia e tolerância, só para a frente ────────
select pg_temp.como('00000000-0000-0000-0000-0000000d2001');
select is(public.garante_definir_regra('org-j-a-sem', 30, 45), public.garante_hoje() + 1, 'tolerância de 45 min vale a partir de amanhã');
select is((select fecha_em from public.garante_janela('org-j-a-sem', public.garante_hoje() + 1, '10:00')),
  pg_temp.prazo(public.garante_hoje() + 1) + interval '45 minutes', 'amanhã fecha em prazo + 45');
select is((select fecha_em from public.garante_janela('org-j-a-sem', public.garante_hoje(), '10:00')),
  public.garante_fim_do_dia(public.garante_hoje()), 'hoje continua até o fim do dia (regra base nasce sem tolerância)');
select is(public.garante_definir_regra('org-j-a-sem', 30, null), public.garante_hoje() + 1, 'voltar para "até o fim do dia" é atraso nulo');
select is((select fecha_em from public.garante_janela('org-j-a-sem', public.garante_hoje() + 1, '10:00')),
  public.garante_fim_do_dia(public.garante_hoje() + 1), 'amanhã volta a fechar no fim do dia (nulo sobrescreve os 45)');
select is((select abre_em from public.garante_janela('org-j-a-sem', public.garante_hoje() + 1, '10:00')),
  pg_temp.prazo(public.garante_hoje() + 1) - interval '30 minutes', 'antecedência de 30 min foi mantida');
select throws_ok($$ select public.garante_definir_regra('org-j-a-sem', 30, 1441) $$, '22023', 'regra_invalida',
  'tolerância acima de 24 h continua recusada');
select throws_ok($$ select public.garante_definir_regra('org-j-a-sem', null, null) $$, '22023', 'regra_invalida',
  'antecedência continua obrigatória');
select is((select fecha_em from garante_execucoes where id = '00000000-0000-0000-0000-0000000d7001'),
  public.garante_fim_do_dia(public.garante_hoje() - 1), 'execução já gravada não muda com a regra nova');
-- Tolerância explícita 0: fecha exatamente no horário limite.
select is(public.garante_definir_regra('org-j-a-com', 120, 0), public.garante_hoje() + 1, 'tolerância 0 é aceita');
select is((select fecha_em from public.garante_janela('org-j-a-com', public.garante_hoje() + 1, '10:00')),
  pg_temp.prazo(public.garante_hoje() + 1), 'com tolerância 0 fecha no horário limite');
-- Tolerância grande nunca passa do fim do dia (é sempre um limite menor que o dia).
select is(public.garante_definir_regra('org-j-a-com', 120, 1440), public.garante_hoje() + 1, 'tolerância de 24 h é aceita');
select is((select fecha_em from public.garante_janela('org-j-a-com', public.garante_hoje() + 1, '23:00')),
  public.garante_fim_do_dia(public.garante_hoje() + 1), '23:00 + 24 h fecha às 23:59:59 do mesmo dia, nunca no dia seguinte');
-- Master com segundo fator define a regra de qualquer unidade.
select pg_temp.como('00000000-0000-0000-0000-0000000d2004', 'aal2');
select is(public.garante_definir_regra('org-j-a-com', 120, null), public.garante_hoje() + 1, 'master com aal2 define a regra');
select is((select fecha_em from public.garante_janela('org-j-a-com', public.garante_hoje() + 1, '10:00')),
  public.garante_fim_do_dia(public.garante_hoje() + 1), 'e a versão de amanhã passa a fechar no fim do dia');
select pg_temp.como('00000000-0000-0000-0000-0000000d2001');

-- ── Nota: ontem não iniciado fecha no fim do dia; hoje continua aberto ──
select is((select previstas from public.garante_nota('org-j-a-sem', public.garante_hoje() - 2, public.garante_hoje() - 2) where nivel = 'unidade'),
  1, 'anteontem (não iniciado): a janela fechou no fim daquele dia, conta como previsto');
select is((select pontualidade from public.garante_nota('org-j-a-sem', public.garante_hoje() - 2, public.garante_hoje() - 2) where nivel = 'unidade'),
  0.0, 'e vale P = 0');
select is((select count(*)::int from public.garante_nota('org-j-a-sem', public.garante_hoje(), public.garante_hoje())
            where nivel = 'unidade' and previstas > 0), 0,
  'hoje (10:00 não iniciado) ainda não fechou: não entra na nota antes do fim do dia');

-- ── Concluir depois do horário limite e antes do fim do dia: P = 0 ──────
-- P2 vence às 00:00 de hoje (já passou) e, pela regra, aceita até 23:59:59.
insert into t select 'exec', public.garante_iniciar('00000000-0000-0000-0000-0000000d6002', public.garante_hoje());
select lives_ok($$ select public.garante_responder((select valor from t where nome = 'exec'),
  '00000000-0000-0000-0000-0000000d4001', p_valor_bool => true) $$, 'responde depois do horário limite, dentro do dia');
select is(public.garante_concluir((select valor from t where nome = 'exec')), 0, 'conclui depois do horário limite, dentro do dia');
select results_eq($$ select previstas, concluidas, pontualidade from public.garante_nota('org-j-a-sem', public.garante_hoje(), public.garante_hoje()) where nivel = 'unidade' $$,
  $$ values (1, 1, 0.0) $$, 'concluído depois do horário limite conta como atraso: P = 0');

-- ── Transição da migration (mesma função que ela chama) ────────────────
select pg_temp.servidor();
select is(public.garante_aplicar_padrao_fim_do_dia(), 3,
  'transição: 1 regra antiga para a unidade sem regra + 2 versões de amanhã (padrão sem autor e a unidade sem regra)');
select results_eq($$ select vigente_desde, antecedencia_min, atraso_max_min from garante_regras_unidade where unidade_id = 'org-j-a-pad' order by vigente_desde $$,
  $$ values (public.garante_hoje() - 10, 120, 60), (public.garante_hoje() + 1, 120, null::integer) $$,
  'regra padrão sem autor ganha a versão de amanhã sem tolerância; hoje continua com 60');
select results_eq($$ select vigente_desde, antecedencia_min, atraso_max_min from garante_regras_unidade where unidade_id = 'org-j-a-nen' order by vigente_desde $$,
  $$ values (public.garante_hoje() - 5, 120, 60), (public.garante_hoje() + 1, 120, null::integer) $$,
  'unidade sem regra ganha a regra antiga desde a primeira programação e a versão de amanhã');
select is((select fecha_em from public.garante_janela('org-j-a-nen', public.garante_hoje(), '10:00')),
  pg_temp.prazo(public.garante_hoje()) + interval '60 minutes', 'hoje, nessa unidade, continua fechando em prazo + 60 (nada reabre)');
select results_eq($$ select atraso_max_min from garante_regras_unidade where unidade_id = 'org-j-a-ges' $$,
  $$ values (60) $$, 'regra definida pela gestão (com autor) não muda');
select is((select count(*)::int from garante_regras_unidade where unidade_id = 'org-j-a-fora'), 0,
  'unidade sem Garante e sem programação não ganha regra');
select is((select count(*)::int from garante_regras_unidade where unidade_id = 'org-j-a-com' and vigente_desde = public.garante_hoje() + 1 and atraso_max_min is null), 1,
  'unidade que já tinha versão futura (da gestão) fica como estava');
select is((select fecha_em from garante_execucoes where id = '00000000-0000-0000-0000-0000000d7002'),
  pg_temp.prazo(public.garante_hoje()) + interval '60 minutes', 'execução que nasceu com 60 min mantém o fecha_em');
select is(public.garante_aplicar_padrao_fim_do_dia(), 0, 'rodar de novo não cria nada (idempotente)');

select * from finish();
rollback;
