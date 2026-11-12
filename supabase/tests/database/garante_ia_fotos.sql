-- Garante: IA confere as fotos (fase de teste, 12/11/2026).
-- Prova: regra desligada por padrão; só gestão da unidade ou master (com segundo fator) liga e
-- desliga; reserva só com a regra ligada, só da foto atual do item, uma por foto e até o teto
-- do mês por organização; gravar o resultado é só do servidor e só vale para a foto atual;
-- usuário não escreve o resultado nem o uso; foto nova e "não se aplica" apagam o resultado;
-- uso visível só para a gestão da unidade. Só fixtures.

begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

-- ── Fixture ──────────────────────────────────────────────────────────────
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000e1001', 'gestora-ia@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e1002', 'op-ia@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e1003', 'gestor-b-ia@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e1004', 'master-ia@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-i-a', 'IA A', 'saas', true), ('org-i-b', 'IA B', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, garante_habilitado) values
  ('org-i-a-loja', 'org-i-a', 'Loja IA', 'banco', true, true),
  ('org-i-b-loja', 'org-i-b', 'Loja IB', 'banco', true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000e1001', 'org-i-a', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000e1002', 'org-i-a', 'org-i-a-loja', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000e1003', 'org-i-b', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000e1004', 'org-i-b', null, 'master', 'ativo');

insert into garante_modelos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-0000000e3001', 'org-i-a-loja', 'Fechamento');
insert into garante_itens (id, modelo_id, unidade_id, ordem, titulo, tipo, critico, permite_na, foto_obrigatoria) values
  ('00000000-0000-0000-0000-0000000e4001', '00000000-0000-0000-0000-0000000e3001', 'org-i-a-loja', 1, 'Balcão limpo', 'check', false, true, true);
insert into garante_publicacoes (id, modelo_id, unidade_id, responsavel_id, dias_semana, horario_limite, vigente_desde) values
  ('00000000-0000-0000-0000-0000000e6001', '00000000-0000-0000-0000-0000000e3001', 'org-i-a-loja',
   '00000000-0000-0000-0000-0000000e1002', array[0,1,2,3,4,5,6]::smallint[], '23:00', public.garante_hoje() - 7);
insert into garante_execucoes (id, publicacao_id, unidade_id, data, prazo, abre_em, fecha_em, snapshot, modelo_nome) values
  ('00000000-0000-0000-0000-0000000e7001', '00000000-0000-0000-0000-0000000e6001', 'org-i-a-loja', public.garante_hoje(),
   now() + interval '1 hour', now() - interval '1 hour', now() + interval '2 hours',
   jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000e4001', 'titulo', 'Balcão limpo', 'tipo', 'check',
     'critico', false, 'foto_obrigatoria', true, 'permite_na', true)),
   'Fechamento');
insert into storage.objects (bucket_id, name) values
  ('garante-evidencias', 'org-i-a-loja/00000000-0000-0000-0000-0000000e7001/00000000-0000-0000-0000-0000000e4001-foto0001.jpg'),
  ('garante-evidencias', 'org-i-a-loja/00000000-0000-0000-0000-0000000e7001/00000000-0000-0000-0000-0000000e4001-foto0002.jpg'),
  ('garante-evidencias', 'org-i-a-loja/00000000-0000-0000-0000-0000000e7001/00000000-0000-0000-0000-0000000e4001-foto0003.jpg');

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
create or replace function pg_temp.foto(p_n text)
returns text language sql as $$
  select 'org-i-a-loja/00000000-0000-0000-0000-0000000e7001/00000000-0000-0000-0000-0000000e4001-foto' || p_n || '.jpg'
$$;
create or replace function pg_temp.reservar(p_n text)
returns text language sql as $$
  select public.garante_ia_reservar('00000000-0000-0000-0000-0000000e7001', '00000000-0000-0000-0000-0000000e4001',
    pg_temp.foto(p_n), 'claude-haiku-4-5', '2026-09-25') ->> 'situacao'
$$;
create or replace function pg_temp.resultado()
returns text language sql as $$
  select r.ia_veredito from public.garante_respostas r
   where r.execucao_id = '00000000-0000-0000-0000-0000000e7001' and r.item_id = '00000000-0000-0000-0000-0000000e4001'
$$;
create or replace function pg_temp.chamada(p_n text)
returns uuid language sql as $$
  select c.id from public.garante_ia_chamadas c where c.foto_path = pg_temp.foto(p_n)
$$;

-- ── Estrutura ────────────────────────────────────────────────────────────
select is((select garante_ia_fotos from unidades where id = 'org-i-a-loja'), false, 'regra nasce desligada');
select ok(not has_table_privilege('authenticated', 'public.garante_ia_chamadas', 'INSERT')
  and not has_table_privilege('authenticated', 'public.garante_ia_chamadas', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.garante_ia_chamadas', 'DELETE'), 'uso da IA: usuário não escreve');
select ok(not has_function_privilege('authenticated', 'public.garante_ia_gravar_resultado(uuid, text, text)', 'EXECUTE'),
  'gravar o resultado: usuário não executa');
select ok(has_function_privilege('service_role', 'public.garante_ia_gravar_resultado(uuid, text, text)', 'EXECUTE'),
  'gravar o resultado: servidor executa');
select is(public.garante_ia_limite_mensal(), 1500, 'teto mensal por organização');

-- ── Ligar e desligar ─────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000e1002');
select throws_ok($$ select public.garante_definir_ia_fotos('org-i-a-loja', true) $$, '42501', null, 'operacional não liga a IA');
select is(pg_temp.reservar('0001'), 'desligada', 'regra desligada: reserva não passa');

select pg_temp.como('00000000-0000-0000-0000-0000000e1003');
select throws_ok($$ select public.garante_definir_ia_fotos('org-i-a-loja', true) $$, '42501', null, 'gestão de outra empresa não liga');

select pg_temp.como('00000000-0000-0000-0000-0000000e1001');
select is(public.garante_definir_ia_fotos('org-i-a-loja', true), true, 'gestão da unidade liga');
select pg_temp.servidor();
select is((select garante_ia_fotos from unidades where id = 'org-i-a-loja'), true, 'regra ligada gravada');
select is((select count(*)::int from logs_auditoria where acao = 'garante_definir_ia_fotos' and unidade_id = 'org-i-a-loja'), 1,
  'ligar fica na auditoria');

select pg_temp.como('00000000-0000-0000-0000-0000000e1004', 'aal1');
select throws_ok($$ select public.garante_definir_ia_fotos('org-i-a-loja', false) $$, '42501', null, 'master sem segundo fator não muda');
select pg_temp.como('00000000-0000-0000-0000-0000000e1004', 'aal2');
select is(public.garante_definir_ia_fotos('org-i-a-loja', false), false, 'master com segundo fator desliga');
select is(public.garante_definir_ia_fotos('org-i-a-loja', true), true, 'master com segundo fator liga');

-- ── Reserva, resultado e foto nova ───────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000e1002');
select lives_ok($$ select public.garante_registrar_foto('00000000-0000-0000-0000-0000000e7001',
  '00000000-0000-0000-0000-0000000e4001', pg_temp.foto('0001')) $$, 'operador registra a foto');
select is(pg_temp.reservar('0002'), 'sem_foto', 'foto que não é a atual do item não reserva');
select is(pg_temp.reservar('0001'), 'reservada', 'foto atual com a regra ligada reserva');
select is(pg_temp.reservar('0001'), 'repetida', 'mesma foto não é conferida duas vezes');

-- Usuário não escreve o resultado direto (sem linha pela RLS ou sem privilégio).
do $$
begin
  update public.garante_respostas
     set ia_veredito = 'aprovado', ia_motivo = 'eu mesmo aprovei', ia_analisado_em = now(), ia_foto_path = foto_path
   where execucao_id = '00000000-0000-0000-0000-0000000e7001';
exception when insufficient_privilege then null;
end $$;
select is(pg_temp.resultado(), null, 'usuário não grava o resultado da IA');

select pg_temp.servidor();
select is(public.garante_ia_gravar_resultado(pg_temp.chamada('0001'), 'reprovado', 'Pano de prato em cima do balcão.'), true,
  'servidor grava o resultado da foto atual');
select is(pg_temp.resultado(), 'reprovado', 'resultado gravado na resposta');
select is((select ia_foto_path from garante_respostas where item_id = '00000000-0000-0000-0000-0000000e4001'), pg_temp.foto('0001'),
  'resultado guarda a foto conferida');

select pg_temp.como('00000000-0000-0000-0000-0000000e1002');
select lives_ok($$ select public.garante_registrar_foto('00000000-0000-0000-0000-0000000e7001',
  '00000000-0000-0000-0000-0000000e4001', pg_temp.foto('0002')) $$, 'operador tira outra foto');
select is(pg_temp.resultado(), null, 'foto nova apaga o resultado anterior');
select pg_temp.servidor();
select is(public.garante_ia_gravar_resultado(pg_temp.chamada('0001'), 'aprovado', 'Balcão limpo.'), false,
  'resultado atrasado da foto antiga não grava');

select pg_temp.como('00000000-0000-0000-0000-0000000e1002');
select is(pg_temp.reservar('0002'), 'reservada', 'foto nova é conferida de novo');
select pg_temp.servidor();
select public.garante_ia_gravar_resultado(pg_temp.chamada('0002'), 'aprovado', 'Balcão limpo e seco.');
select pg_temp.como('00000000-0000-0000-0000-0000000e1002');
select public.garante_responder('00000000-0000-0000-0000-0000000e7001', '00000000-0000-0000-0000-0000000e4001',
  p_nao_se_aplica => true, p_justificativa => 'balcão em reforma');
select is(pg_temp.resultado(), null, '"não se aplica" apaga o resultado');

-- ── Teto do mês ──────────────────────────────────────────────────────────
select pg_temp.servidor();
insert into garante_ia_chamadas (organizacao_id, unidade_id, execucao_id, item_id, foto_path, mes, modelo, tabela_precos_versao)
select 'org-i-a', 'org-i-a-loja', '00000000-0000-0000-0000-0000000e7001', '00000000-0000-0000-0000-0000000e4001',
       'teto/' || g || '.jpg', date_trunc('month', public.garante_hoje())::date, 'claude-haiku-4-5', '2026-09-25'
  from generate_series(1, public.garante_ia_limite_mensal() - 2) g;
select pg_temp.como('00000000-0000-0000-0000-0000000e1002');
select lives_ok($$ select public.garante_registrar_foto('00000000-0000-0000-0000-0000000e7001',
  '00000000-0000-0000-0000-0000000e4001', pg_temp.foto('0003')) $$, 'operador tira a terceira foto');
select is(pg_temp.reservar('0003'), 'limite', 'teto do mês atingido: não reserva');

-- ── Quem vê o uso ────────────────────────────────────────────────────────
select is((select count(*)::int from garante_ia_chamadas), 0, 'operacional não vê o uso da IA');
select pg_temp.como('00000000-0000-0000-0000-0000000e1001');
select is((select count(*)::int from garante_ia_chamadas), 1500, 'gestão da unidade vê o uso da IA');

select * from finish();
rollback;
