-- Editar acesso sem revogar (24/10/2026).
-- Prova: só o servidor chama; master edita qualquer vínculo não master; gestão da
-- organização inteira edita a equipe dela; operacional nunca; ninguém promove a master
-- nem edita vínculo master; ninguém edita o próprio vínculo; outra organização recusada;
-- gestor de loja não dá "todas as unidades"; duplicata recusada; Equipe não deixa o
-- cliente sem gestão; auditoria com dados antigos e novos; papel menor vale na hora para
-- a sessão aberta (RLS lê o vínculo a cada consulta). Só fixtures de teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(36);

grant select on setores to authenticated;

-- ── Fixture ──────────────────────────────────────────────────────────────
-- e001 master | e002 dono (gestão org A inteira) | e003 gestão loja A1 |
-- e004 operacional A1 | e005 gestão org A (outro dono, alvo) | e006 operacional A2 |
-- e007 gestão org B | e008 operacional A1 com vínculo de gestão A2 também (duplicata)
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000e001', 'ea-master@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e002', 'ea-dono@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e003', 'ea-gestor-loja@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e004', 'ea-operacional@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e005', 'ea-dono2@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e006', 'ea-loja2@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e007', 'ea-gestor-b@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e008', 'ea-duplo@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo, equipe_habilitado) values
  ('org-ea-a', 'Cliente EA A', 'saas', true, true),
  ('org-ea-b', 'Cliente EA B', 'saas', true, true);

insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo) values
  ('org-ea-a-1', 'org-ea-a', 'Loja A1', 'banco', true),
  ('org-ea-a-2', 'org-ea-a', 'Loja A2', 'banco', true),
  ('org-ea-a-x', 'org-ea-a', 'Loja A fechada', 'banco', false),
  ('org-ea-b-1', 'org-ea-b', 'Loja B1', 'banco', true);

insert into setores (unidade_id, nome) values ('org-ea-a-1', 'Cozinha EA'), ('org-ea-a-2', 'Salão EA');

insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-00000000ea01', '00000000-0000-0000-0000-00000000e001', 'org-ea-b', null, 'master', 'ativo'),
  ('00000000-0000-0000-0000-00000000ea02', '00000000-0000-0000-0000-00000000e002', 'org-ea-a', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-00000000ea03', '00000000-0000-0000-0000-00000000e003', 'org-ea-a', 'org-ea-a-1', 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-00000000ea04', '00000000-0000-0000-0000-00000000e004', 'org-ea-a', 'org-ea-a-1', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-00000000ea05', '00000000-0000-0000-0000-00000000e005', 'org-ea-a', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-00000000ea06', '00000000-0000-0000-0000-00000000e006', 'org-ea-a', 'org-ea-a-2', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-00000000ea07', '00000000-0000-0000-0000-00000000e007', 'org-ea-b', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-00000000ea08', '00000000-0000-0000-0000-00000000e008', 'org-ea-a', 'org-ea-a-1', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-00000000ea09', '00000000-0000-0000-0000-00000000e008', 'org-ea-a', 'org-ea-a-2', 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-00000000ea10', '00000000-0000-0000-0000-00000000e006', 'org-ea-a', 'org-ea-a-1', 'operacional', 'revogado');

-- Sessão aberta do dono 2 (vai ser rebaixado) antes da edição.
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000005e5', '00000000-0000-0000-0000-00000000e005', now() - interval '1 hour', now());

create or replace function pg_temp.autenticar_como(p_user_id uuid, p_sessao uuid default null, p_aal text default 'aal1')
returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated', 'aal', p_aal,
      'session_id', coalesce(p_sessao::text, ''))::text, true);
$$;

create or replace function pg_temp.como_servidor()
returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', null, true);
$$;

create or replace function pg_temp.editar(p_ator text, p_vinculo text, p_escopo text, p_org text, p_role text, p_unidade text)
returns text language sql as $$
  select public.editar_vinculo_acesso(p_ator::uuid, p_vinculo::uuid, p_escopo, p_org, p_role, p_unidade);
$$;

create or replace function pg_temp.papel(p_vinculo text)
returns text language sql as $$
  select role || '@' || coalesce(unidade_id, 'todas') from public.vinculos where id = p_vinculo::uuid;
$$;

-- ── Só o servidor chama ──────────────────────────────────────────────────
select pg_temp.autenticar_como('00000000-0000-0000-0000-00000000e002');
select throws_ok($$ select public.editar_vinculo_acesso('00000000-0000-0000-0000-00000000e002',
    '00000000-0000-0000-0000-00000000ea04', 'equipe', 'org-ea-a', 'gestao', null) $$,
  '42501', null, 'usuário logado não chama a função pela Data API');
select pg_temp.como_servidor();
select throws_ok($$ select public.editar_vinculo_acesso('00000000-0000-0000-0000-00000000e002',
    '00000000-0000-0000-0000-00000000ea04', 'outro', 'org-ea-a', 'gestao', null) $$,
  '22023', 'parametro_invalido', 'escopo desconhecido é recusado');

-- ── Recusas (nada muda) ──────────────────────────────────────────────────
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-00000000ea06', 'equipe', 'org-ea-a',
  'gestao', 'org-ea-a-2'), 'sem_permissao', 'operacional não edita');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000ea04', 'master', null,
  'gestao', 'org-ea-a-1'), 'sem_permissao', 'dono não usa o escopo master');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000ea04', 'equipe', 'org-ea-a',
  'master', null), 'papel_invalido', 'dono não promove a master');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000ea04', 'master', null,
  'master', null), 'papel_invalido', 'nem o master promove a master pelo painel');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000ea01', 'equipe', 'org-ea-b',
  'gestao', null), 'sem_permissao', 'dono não age em organização onde não é gestão');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000ea07', 'equipe', 'org-ea-a',
  'operacional', 'org-ea-b-1'), 'nao_encontrado', 'dono não alcança vínculo de outra organização');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000ea01', 'equipe', 'org-ea-a',
  'gestao', null), 'nao_encontrado', 'dono não edita vínculo master (mesma resposta de inexistente)');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000ea01', 'master', null,
  'gestao', null), 'vinculo_master', 'master não edita vínculo master pelo painel');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000ea02', 'equipe', 'org-ea-a',
  'operacional', 'org-ea-a-1'), 'proprio_vinculo', 'dono não edita o próprio vínculo');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000ea04', 'equipe', 'org-ea-a',
  'operacional', 'org-ea-b-1'), 'unidade_invalida', 'unidade de outra organização é recusada');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000ea04', 'equipe', 'org-ea-a',
  'operacional', 'org-ea-a-x'), 'unidade_invalida', 'unidade inativa é recusada');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000ea04', 'equipe', 'org-ea-a',
  'operacional', null), 'operacional_sem_unidade', 'operacional precisa de unidade');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000ea10', 'equipe', 'org-ea-a',
  'gestao', 'org-ea-a-1'), 'revogado', 'vínculo revogado não é editado');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000ea04', 'equipe', 'org-ea-a',
  'gestao', null), 'fora_da_unidade', 'gestor de loja não promove a gestão da organização inteira');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000ea04', 'equipe', 'org-ea-a',
  'operacional', 'org-ea-a-2'), 'fora_da_unidade', 'gestor de loja não manda ninguém para outra loja');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000ea06', 'equipe', 'org-ea-a',
  'operacional', 'org-ea-a-1'), 'nao_encontrado', 'gestor de loja não alcança vínculo de outra loja');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000ea08', 'equipe', 'org-ea-a',
  'gestao', 'org-ea-a-2'), 'duplicado', 'duplicata (mesma pessoa, unidade e papel já vigente) é recusada');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000ea04', 'equipe', 'org-ea-a',
  'operacional', 'org-ea-a-1'), 'sem_mudanca', 'sem mudança não grava');
select is((select count(*)::int from logs_auditoria where acao = 'editar_vinculo'
  and entidade_id like '00000000-0000-0000-0000-00000000ea%'), 0, 'nenhuma recusa gravou auditoria');
select is(pg_temp.papel('00000000-0000-0000-0000-00000000ea04') || '|' || pg_temp.papel('00000000-0000-0000-0000-00000000ea08'),
  'operacional@org-ea-a-1|operacional@org-ea-a-1', 'nenhuma recusa mudou vínculo');

-- ── Dono edita a equipe dele ─────────────────────────────────────────────
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000ea04', 'equipe', 'org-ea-a',
  'gestao', 'org-ea-a-1'), 'ok', 'dono promove operacional a gestão da loja');
select is(pg_temp.papel('00000000-0000-0000-0000-00000000ea04'), 'gestao@org-ea-a-1', 'papel novo gravado na mesma linha');
select is((select status from vinculos where id = '00000000-0000-0000-0000-00000000ea04'), 'ativo', 'vínculo continua ativo (não revogou)');
select is((select count(*)::int from logs_auditoria where acao = 'editar_vinculo'
  and entidade_id = '00000000-0000-0000-0000-00000000ea04' and user_id = '00000000-0000-0000-0000-00000000e002'
  and unidade_id = 'org-ea-a-1'
  and dados_antigos = jsonb_build_object('role', 'operacional', 'unidadeId', 'org-ea-a-1')
  and dados_novos ->> 'role' = 'gestao' and dados_novos ->> 'unidadeId' = 'org-ea-a-1'
  and dados_novos ->> 'escopo' = 'equipe'), 1, 'auditoria: quem, quando, dados antigos e novos');

-- Gestor de loja rebaixa dentro da loja dele (agora há outra gestão na loja).
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000ea04', 'equipe', 'org-ea-a',
  'operacional', 'org-ea-a-1'), 'ok', 'gestor de loja troca o papel dentro da loja dele');

-- Dono rebaixa o outro dono para operacional da loja A2: sessão aberta perde o que era de gestão.
select pg_temp.autenticar_como('00000000-0000-0000-0000-00000000e005', '00000000-0000-0000-0000-0000000005e5');
select is((select count(*)::int from setores where unidade_id in ('org-ea-a-1', 'org-ea-a-2')), 2,
  'controle: antes, a sessão aberta do dono 2 lê as duas lojas');
select pg_temp.como_servidor();
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000ea05', 'equipe', 'org-ea-a',
  'operacional', 'org-ea-a-2'), 'ok', 'dono rebaixa outro dono para operacional de uma loja');
select pg_temp.autenticar_como('00000000-0000-0000-0000-00000000e005', '00000000-0000-0000-0000-0000000005e5');
select is((select count(*)::int from setores where unidade_id in ('org-ea-a-1', 'org-ea-a-2')), 1,
  'sessão continua válida, mas o acesso menor vale na hora (só a loja nova)');
select pg_temp.como_servidor();

-- ── Equipe não deixa o cliente sem gestão geral ─────────────────────────
-- Master pela Equipe tenta rebaixar o último dono (e002).
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000ea02', 'equipe', 'org-ea-a',
  'operacional', 'org-ea-a-1'), 'ultima_gestao', 'Equipe recusa tirar a última gestão geral do cliente');

-- ── Master edita qualquer vínculo não master ────────────────────────────
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000ea07', 'master', null,
  'operacional', 'org-ea-b-1'), 'ok', 'master edita vínculo de qualquer cliente');
select is(pg_temp.papel('00000000-0000-0000-0000-00000000ea07'), 'operacional@org-ea-b-1', 'master: papel e unidade novos');
select is((select count(*)::int from logs_auditoria where acao = 'editar_vinculo'
  and entidade_id = '00000000-0000-0000-0000-00000000ea07' and user_id = '00000000-0000-0000-0000-00000000e001'
  and dados_antigos ->> 'role' = 'gestao' and dados_antigos ->> 'unidadeId' is null
  and dados_novos ->> 'escopo' = 'master'), 1, 'auditoria do master');
select is(pg_temp.editar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000ea06', 'master', null,
  'gestao', null), 'ok', 'master promove a gestão da organização inteira');
select is(pg_temp.papel('00000000-0000-0000-0000-00000000ea06'), 'gestao@todas', 'organização inteira = unidade nula');

select * from finish();
rollback;
