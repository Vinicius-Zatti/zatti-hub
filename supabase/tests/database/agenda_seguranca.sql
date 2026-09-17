-- Módulo Agenda - as garantias que só o banco pode dar.
--
-- A camada de aplicação valida tudo isto antes, com mensagem boa. O que se
-- prova aqui é o que sobra quando alguém chama a Data API direto, ou quando
-- duas requisições chegam ao mesmo tempo:
--   1. só o service role publica a grade (senão qualquer usuário logado
--      reescreveria a rotina inteira pela Data API);
--   2. identidade de faixa é o agenda-id escrito na grade - mudar texto,
--      horário ou ordem atualiza a mesma linha; faixa retirada fica inativa,
--      com tarefa e histórico preservados; grade inválida não grava nada;
--   3. o teto de 4 prioridades por dia é do banco, não de um count() que
--      duas requisições simultâneas leem antes de qualquer uma gravar;
--   4. tarefa e execução só apontam para faixa do próprio usuário, do mesmo
--      dia da semana e de um tipo que aquela seção aceita.
--
-- Rodar com o Supabase local no ar: `npx supabase db test`.
-- Sem dado real - fixtures isoladas por um id de âncora de teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

-- ── Fixture ──────────────────────────────────────────────────────────────

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-0000000a9001', 'agenda.master1@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a9002', 'agenda.master2@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo)
values ('org-ancora-agenda', 'Organização Âncora da Agenda', 'saas', true);

insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
values
  ('00000000-0000-0000-0000-0000000a9001', 'org-ancora-agenda', null, 'master', 'ativo'),
  ('00000000-0000-0000-0000-0000000a9002', 'org-ancora-agenda', null, 'master', 'ativo');

-- ── 1. Quem pode publicar a grade ────────────────────────────────────────

select is(
  has_function_privilege('anon', 'public.publicar_agenda_semanal(jsonb,uuid)', 'EXECUTE'),
  false,
  'anon NÃO executa publicar_agenda_semanal'
);

select is(
  has_function_privilege('authenticated', 'public.publicar_agenda_semanal(jsonb,uuid)', 'EXECUTE'),
  false,
  'authenticated NÃO executa publicar_agenda_semanal - nem o master logado reescreve a grade pela Data API'
);

select is(
  has_function_privilege('service_role', 'public.publicar_agenda_semanal(jsonb,uuid)', 'EXECUTE'),
  true,
  'service_role executa publicar_agenda_semanal (é o caminho do script agenda:publicar)'
);

-- ── 2. Identidade pelo agenda-id e histórico preservado ──────────────────
-- Terça com três faixas. Depois a grade muda como muda na vida real: texto e
-- horário do Relatórios, faixa nova no meio, ordem empurrada, faixa retirada
-- e faixa que volta. Id, tarefa e histórico têm que sobreviver a tudo isso.

select is(
  (select publicar_agenda_semanal(
    '[{"dia_semana":2,"chave":"ter-horizzon-manha","ordem":0,"hora_inicio":"10:00","hora_fim":"11:00","rotulo":"Horizzon (fixo)","horario_texto":"10h-11h","tipo":"bloco"},
      {"dia_semana":2,"chave":"ter-relatorios-verato","ordem":1,"hora_inicio":"11:00","hora_fim":"12:00","rotulo":"Relatórios Verato","horario_texto":"11h-12h","tipo":"rotina"},
      {"dia_semana":2,"chave":"ter-protegido-tarde","ordem":2,"hora_inicio":"15:00","hora_fim":"17:00","rotulo":"Protegido","horario_texto":"15h-17h","tipo":"bloco"}]'::jsonb,
    '00000000-0000-0000-0000-0000000a9001')),
  '{"publicadas":3,"inativadas":[],"reativadas":[]}'::jsonb,
  'publicação inicial grava as 3 faixas da terça'
);

create temp table agenda_ids on commit drop as
  select chave, id from zh_agenda_rotinas where criado_por = '00000000-0000-0000-0000-0000000a9001';

-- Trabalho planejado e histórico: uma prioridade no Protegido de uma terça
-- futura e duas execuções do Relatórios (uma passada, uma futura - fora do
-- dia 22, que a seção 4 usa).
insert into zh_agenda_tarefas (criado_por, data, titulo, prioridade, prioridade_posicao, rotina_id)
values ('00000000-0000-0000-0000-0000000a9001', '2026-09-22', 'Contrato do This Burguer', true, 1,
        (select id from agenda_ids where chave = 'ter-protegido-tarde'));

insert into zh_agenda_execucoes (criado_por, data, rotina_id, situacao)
values ('00000000-0000-0000-0000-0000000a9001', '2026-09-15', (select id from agenda_ids where chave = 'ter-relatorios-verato'), 'feita'),
       ('00000000-0000-0000-0000-0000000a9001', '2026-09-29', (select id from agenda_ids where chave = 'ter-relatorios-verato'), 'nao_feita');

-- Republica mudando texto e horário do Relatórios e com uma faixa nova no
-- meio, que empurra a ordem do Relatórios e do Protegido.
do $do$ begin perform publicar_agenda_semanal(
  '[{"dia_semana":2,"chave":"ter-horizzon-manha","ordem":0,"hora_inicio":"10:00","hora_fim":"11:00","rotulo":"Horizzon (fixo)","horario_texto":"10h-11h","tipo":"bloco"},
    {"dia_semana":2,"chave":"ter-cafe-beto","ordem":1,"hora_inicio":"11:00","hora_fim":"11:30","rotulo":"Café com o Beto","horario_texto":"11h-11h30","tipo":"bloco"},
    {"dia_semana":2,"chave":"ter-relatorios-verato","ordem":2,"hora_inicio":"11:30","hora_fim":"12:30","rotulo":"Relatórios Verato + entregas ⚠️ deadline 11h não cabe mais","horario_texto":"11h30-12h30","tipo":"rotina"},
    {"dia_semana":2,"chave":"ter-protegido-tarde","ordem":3,"hora_inicio":"15:00","hora_fim":"17:00","rotulo":"Protegido","horario_texto":"15h-17h","tipo":"bloco"}]'::jsonb,
  '00000000-0000-0000-0000-0000000a9001'
); end $do$;

select is(
  (select id from zh_agenda_rotinas where criado_por = '00000000-0000-0000-0000-0000000a9001' and chave = 'ter-relatorios-verato'),
  (select id from agenda_ids where chave = 'ter-relatorios-verato'),
  'mudar texto e horário mantém a MESMA linha (mesmo id)'
);

select is(
  (select rotulo || ' @ ' || hora_inicio::text || '-' || hora_fim::text from zh_agenda_rotinas
    where criado_por = '00000000-0000-0000-0000-0000000a9001' and chave = 'ter-relatorios-verato'),
  'Relatórios Verato + entregas ⚠️ deadline 11h não cabe mais @ 11:30:00-12:30:00',
  'texto e horário novos foram gravados nessa mesma linha'
);

select is(
  (select ordem::int from zh_agenda_rotinas
    where criado_por = '00000000-0000-0000-0000-0000000a9001' and chave = 'ter-protegido-tarde'),
  3,
  'a ordem de exibição do Protegido mudou de 2 para 3 com a faixa nova no meio'
);

select is(
  (select rotina_id from zh_agenda_tarefas where titulo = 'Contrato do This Burguer'),
  (select id from agenda_ids where chave = 'ter-protegido-tarde'),
  'a tarefa continua ligada à mesma faixa depois de mudar a ordem'
);

select is(
  (select count(*)::int from zh_agenda_execucoes
    where rotina_id = (select id from agenda_ids where chave = 'ter-relatorios-verato')),
  2,
  'o histórico de execução do Relatórios sobrevive à mudança de texto e horário'
);

-- Republica sem o Protegido.
select is(
  (select publicar_agenda_semanal(
    '[{"dia_semana":2,"chave":"ter-horizzon-manha","ordem":0,"hora_inicio":"10:00","hora_fim":"11:00","rotulo":"Horizzon (fixo)","horario_texto":"10h-11h","tipo":"bloco"},
      {"dia_semana":2,"chave":"ter-cafe-beto","ordem":1,"hora_inicio":"11:00","hora_fim":"11:30","rotulo":"Café com o Beto","horario_texto":"11h-11h30","tipo":"bloco"},
      {"dia_semana":2,"chave":"ter-relatorios-verato","ordem":2,"hora_inicio":"11:30","hora_fim":"12:30","rotulo":"Relatórios Verato","horario_texto":"11h30-12h30","tipo":"rotina"}]'::jsonb,
    '00000000-0000-0000-0000-0000000a9001')),
  '{"publicadas":3,"inativadas":["ter-protegido-tarde"],"reativadas":[]}'::jsonb,
  'a publicação informa qual faixa saiu da grade'
);

select is(
  (select ativa from zh_agenda_rotinas
    where criado_por = '00000000-0000-0000-0000-0000000a9001' and chave = 'ter-protegido-tarde'),
  false,
  'faixa retirada da grade continua no banco, inativa - nunca é apagada'
);

select is(
  (select rotina_id from zh_agenda_tarefas where titulo = 'Contrato do This Burguer'),
  (select id from agenda_ids where chave = 'ter-protegido-tarde'),
  'a tarefa da faixa retirada é preservada e continua ligada a ela'
);

select throws_ok(
  $$ insert into zh_agenda_tarefas (criado_por, data, titulo, rotina_id)
     values ('00000000-0000-0000-0000-0000000a9001', '2026-09-29', 'Planejar em faixa retirada',
             (select id from agenda_ids where chave = 'ter-protegido-tarde')) $$,
  '23514',
  'A faixa escolhida saiu da agenda semanal.',
  'não dá para planejar tarefa nova numa faixa inativa'
);

select lives_ok(
  $$ update zh_agenda_tarefas set situacao = 'feita' where titulo = 'Contrato do This Burguer' $$,
  'a tarefa antiga da faixa inativa ainda pode ser marcada como feita'
);

-- A grade inicial volta: o Protegido é reativado e o Café sai.
select is(
  (select publicar_agenda_semanal(
    '[{"dia_semana":2,"chave":"ter-horizzon-manha","ordem":0,"hora_inicio":"10:00","hora_fim":"11:00","rotulo":"Horizzon (fixo)","horario_texto":"10h-11h","tipo":"bloco"},
      {"dia_semana":2,"chave":"ter-relatorios-verato","ordem":1,"hora_inicio":"11:00","hora_fim":"12:00","rotulo":"Relatórios Verato","horario_texto":"11h-12h","tipo":"rotina"},
      {"dia_semana":2,"chave":"ter-protegido-tarde","ordem":2,"hora_inicio":"15:00","hora_fim":"17:00","rotulo":"Protegido","horario_texto":"15h-17h","tipo":"bloco"}]'::jsonb,
    '00000000-0000-0000-0000-0000000a9001')),
  '{"publicadas":3,"inativadas":["ter-cafe-beto"],"reativadas":["ter-protegido-tarde"]}'::jsonb,
  'a publicação informa a faixa reativada e a que saiu'
);

select is(
  (select id from zh_agenda_rotinas
    where criado_por = '00000000-0000-0000-0000-0000000a9001' and chave = 'ter-protegido-tarde' and ativa),
  (select id from agenda_ids where chave = 'ter-protegido-tarde'),
  'a faixa volta ativa com o mesmo id, e a tarefa antiga reencontra o bloco'
);

select throws_ok(
  $$ delete from zh_agenda_rotinas
     where criado_por = '00000000-0000-0000-0000-0000000a9001' and chave = 'ter-relatorios-verato' $$,
  '23503',
  null,
  'nem um delete manual apaga faixa que tem histórico de execução'
);

-- Falha fechada: nada disto grava.
select throws_ok(
  $$ select publicar_agenda_semanal('[]'::jsonb, '00000000-0000-0000-0000-0000000a9001') $$,
  'P0001',
  'A grade veio vazia - publicação abortada para não desativar a rotina inteira.',
  'grade vazia é recusada (arquivo mal lido não desativa a rotina inteira)'
);

select throws_ok(
  $$ select publicar_agenda_semanal(
       '[{"dia_semana":2,"ordem":0,"hora_inicio":"10:00","hora_fim":"11:00","rotulo":"Sem id","horario_texto":"10h-11h","tipo":"bloco"}]'::jsonb,
       '00000000-0000-0000-0000-0000000a9001') $$,
  'P0001',
  'A faixa "Sem id" veio sem agenda-id válido - publicação abortada.',
  'faixa sem agenda-id é recusada'
);

select throws_ok(
  $$ select publicar_agenda_semanal(
       '[{"dia_semana":2,"chave":"ter-horizzon-manha","ordem":0,"hora_inicio":"10:00","hora_fim":"11:00","rotulo":"Horizzon","horario_texto":"10h-11h","tipo":"bloco"},
         {"dia_semana":2,"chave":"ter-horizzon-manha","ordem":1,"hora_inicio":"15:00","hora_fim":"16:00","rotulo":"Horizzon tarde","horario_texto":"15h-16h","tipo":"bloco"}]'::jsonb,
       '00000000-0000-0000-0000-0000000a9001') $$,
  'P0001',
  'O agenda-id "ter-horizzon-manha" está repetido na grade - publicação abortada.',
  'agenda-id repetido é recusado'
);

select throws_ok(
  $$ select publicar_agenda_semanal(
       '[{"dia_semana":3,"chave":"ter-horizzon-manha","ordem":0,"hora_inicio":"09:00","hora_fim":"10:00","rotulo":"Horizzon (fixo)","horario_texto":"9h-10h","tipo":"bloco"}]'::jsonb,
       '00000000-0000-0000-0000-0000000a9001') $$,
  'P0001',
  'O agenda-id "ter-horizzon-manha" mudou de dia da semana. Faixa de outro dia precisa de id novo - publicação abortada.',
  'agenda-id que troca de dia é recusado (as tarefas dele são de datas do dia antigo)'
);

-- ── 3. Propriedade reforçada no banco ────────────────────────────────────

select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.zh_agenda_tarefas'::regclass
      and contype = 'f'
      and array_length(conkey, 1) = 2),
  1,
  'zh_agenda_tarefas tem chave estrangeira COMPOSTA (criado_por, rotina_id) - faixa de outro usuário não entra'
);

-- Publica uma grade pro segundo master, para tentar o cruzamento.
do $do$ begin perform publicar_agenda_semanal(
  '[{"dia_semana":2,"chave":"ter-bloco-do-outro","ordem":0,"hora_inicio":"10:00","hora_fim":"11:00","rotulo":"Bloco do outro master","horario_texto":"10h-11h","tipo":"bloco"}]'::jsonb,
  '00000000-0000-0000-0000-0000000a9002'
); end $do$;

select throws_ok(
  $$ insert into zh_agenda_tarefas (criado_por, data, titulo, rotina_id)
     values ('00000000-0000-0000-0000-0000000a9001', '2026-09-22', 'Tarefa cruzada',
             (select id from zh_agenda_rotinas where chave = 'ter-bloco-do-outro')) $$,
  '23514',
  'Faixa da agenda não encontrada para este usuário.',
  'tarefa de um master não aponta para faixa de outro master'
);

-- ── 4. Coerência de dia e de tipo ────────────────────────────────────────

do $do$ begin perform publicar_agenda_semanal(
  '[{"dia_semana":2,"chave":"ter-horizzon-manha","ordem":0,"hora_inicio":"10:00","hora_fim":"11:00","rotulo":"Horizzon (fixo)","horario_texto":"10h-11h","tipo":"bloco"},
    {"dia_semana":2,"chave":"ter-relatorios-verato","ordem":1,"hora_inicio":"11:00","hora_fim":"12:00","rotulo":"Relatórios Verato","horario_texto":"11h-12h","tipo":"rotina"},
    {"dia_semana":2,"chave":"ter-almoco","ordem":2,"hora_inicio":"12:00","hora_fim":"13:00","rotulo":"Almoço família","horario_texto":"12h-13h","tipo":"pessoal"}]'::jsonb,
  '00000000-0000-0000-0000-0000000a9001'
); end $do$;

-- 2026-09-21 é segunda; a faixa é de terça.
select throws_ok(
  $$ insert into zh_agenda_tarefas (criado_por, data, titulo, rotina_id)
     values ('00000000-0000-0000-0000-0000000a9001', '2026-09-21', 'Tarefa no dia errado',
             (select id from zh_agenda_rotinas where chave = 'ter-horizzon-manha'
                and criado_por = '00000000-0000-0000-0000-0000000a9001')) $$,
  '23514',
  'A faixa escolhida é de outro dia da semana.',
  'tarefa de segunda não encaixa num bloco de terça'
);

select throws_ok(
  $$ insert into zh_agenda_tarefas (criado_por, data, titulo, rotina_id)
     values ('00000000-0000-0000-0000-0000000a9001', '2026-09-22', 'Trabalhar no almoço',
             (select id from zh_agenda_rotinas where chave = 'ter-almoco'
                and criado_por = '00000000-0000-0000-0000-0000000a9001')) $$,
  '23514',
  'A faixa "pessoal" não aceita esse tipo de marcação.',
  'tarefa não entra em faixa pessoal (almoço, família, treino)'
);

select throws_ok(
  $$ insert into zh_agenda_execucoes (criado_por, data, rotina_id, situacao)
     values ('00000000-0000-0000-0000-0000000a9001', '2026-09-22',
             (select id from zh_agenda_rotinas where chave = 'ter-horizzon-manha'
                and criado_por = '00000000-0000-0000-0000-0000000a9001'), 'feita') $$,
  '23514',
  'A faixa "bloco" não aceita esse tipo de marcação.',
  'execução de rotina não pode ser marcada num bloco de trabalho'
);

select lives_ok(
  $$ insert into zh_agenda_execucoes (criado_por, data, rotina_id, situacao)
     values ('00000000-0000-0000-0000-0000000a9001', '2026-09-22',
             (select id from zh_agenda_rotinas where chave = 'ter-relatorios-verato'
                and criado_por = '00000000-0000-0000-0000-0000000a9001'), 'feita') $$,
  'marcar uma rotina de verdade como feita funciona'
);

-- ── 5. Teto de 4 prioridades, garantido pelo banco ───────────────────────

delete from zh_agenda_tarefas where criado_por = '00000000-0000-0000-0000-0000000a9001';

select lives_ok(
  $$ insert into zh_agenda_tarefas (criado_por, data, titulo, prioridade, prioridade_posicao)
     values ('00000000-0000-0000-0000-0000000a9001', '2026-09-22', 'P1', true, 1),
            ('00000000-0000-0000-0000-0000000a9001', '2026-09-22', 'P2', true, 2),
            ('00000000-0000-0000-0000-0000000a9001', '2026-09-22', 'P3', true, 3),
            ('00000000-0000-0000-0000-0000000a9001', '2026-09-22', 'P4', true, 4) $$,
  'as 4 prioridades do dia cabem'
);

-- A quinta não tem posição livre: qualquer valor de 1 a 4 colide, e o índice
-- único parcial resolve isso mesmo com duas requisições simultâneas.
select throws_ok(
  $$ insert into zh_agenda_tarefas (criado_por, data, titulo, prioridade, prioridade_posicao)
     values ('00000000-0000-0000-0000-0000000a9001', '2026-09-22', 'P5', true, 3) $$,
  '23505',
  null,
  'a quinta prioridade do dia é barrada pelo banco, não por um count() que corre'
);

select * from finish();

rollback;
