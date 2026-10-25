-- Senha provisória para conta que já existe (24/10/2026).
-- Prova: só o servidor chama; master gera para qualquer conta (menos a própria); gestão
-- só para conta exclusiva da organização dela (e da unidade, se for gestor de loja);
-- operacional nunca; a conta volta a pendente (senha antiga não entra, sessões caem,
-- sessão aberta perde o acesso, nenhuma sessão nova até o primeiro acesso); limite de 2
-- minutos; auditoria; provisória vencida não conclui; o primeiro acesso de 12/10 segue
-- funcionando. Só fixtures de teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(57);

grant select on setores to authenticated;

-- ── Fixture ──────────────────────────────────────────────────────────────
-- f001 master | f002 gestão org A | f003 gestão loja A1 | f004 operacional A1 (alvo
-- exclusivo, senha antiga conhecida) | f005 operacional A1 + B (duas organizações) |
-- f006 operacional A2 | f007 gestão org B (alvo do master)
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000f001', 'sp-master@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f002', 'sp-gestor@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f003', 'sp-gestor-loja@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f004', 'sp-operacional@teste.local',
     extensions.crypt('SenhaAntiga123', extensions.gen_salt('bf', 4)), now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f005', 'sp-duas-orgs@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f006', 'sp-loja2@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f007', 'sp-gestor-b@teste.local',
     extensions.crypt('SenhaAntigaB123', extensions.gen_salt('bf', 4)), now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f008', 'sp-gestao-e-master@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f009', 'sp-duas-lojas@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f010', 'sp-service-role@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f011', 'sp-whatsapp-novo@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo, equipe_habilitado) values
  ('org-sp-a', 'Cliente SP A', 'saas', true, true),
  ('org-sp-b', 'Cliente SP B', 'saas', true, true),
  ('org-sp-off', 'Cliente SP sem Equipe', 'saas', true, false);

insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo) values
  ('org-sp-a-1', 'org-sp-a', 'Loja A1', 'banco', true),
  ('org-sp-a-2', 'org-sp-a', 'Loja A2', 'banco', true),
  ('org-sp-b-1', 'org-sp-b', 'Loja B1', 'banco', true),
  ('org-sp-off-1', 'org-sp-off', 'Loja Off', 'banco', true);

insert into setores (unidade_id, nome) values ('org-sp-a-1', 'Cozinha SP');

insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status, whatsapp) values
  ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-00000000f001', 'org-sp-b', null, 'master', 'ativo', null),
  ('00000000-0000-0000-0000-00000000bb02', '00000000-0000-0000-0000-00000000f002', 'org-sp-a', null, 'gestao', 'ativo', null),
  ('00000000-0000-0000-0000-00000000bb03', '00000000-0000-0000-0000-00000000f003', 'org-sp-a', 'org-sp-a-1', 'gestao', 'ativo', null),
  ('00000000-0000-0000-0000-00000000bb04', '00000000-0000-0000-0000-00000000f004', 'org-sp-a', 'org-sp-a-1', 'operacional', 'ativo', '+5531999990004'),
  ('00000000-0000-0000-0000-00000000bb05', '00000000-0000-0000-0000-00000000f005', 'org-sp-a', 'org-sp-a-1', 'operacional', 'ativo', null),
  ('00000000-0000-0000-0000-00000000bb06', '00000000-0000-0000-0000-00000000f005', 'org-sp-b', 'org-sp-b-1', 'operacional', 'ativo', null),
  ('00000000-0000-0000-0000-00000000bb07', '00000000-0000-0000-0000-00000000f006', 'org-sp-a', 'org-sp-a-2', 'operacional', 'ativo', null),
  ('00000000-0000-0000-0000-00000000bb08', '00000000-0000-0000-0000-00000000f007', 'org-sp-b', null, 'gestao', 'ativo', null),
  ('00000000-0000-0000-0000-00000000bb09', '00000000-0000-0000-0000-00000000f002', 'org-sp-off', null, 'gestao', 'ativo', null),
  ('00000000-0000-0000-0000-00000000bb10', '00000000-0000-0000-0000-00000000f006', 'org-sp-off', 'org-sp-off-1', 'operacional', 'revogado', null),
  ('00000000-0000-0000-0000-00000000bb11', '00000000-0000-0000-0000-00000000f008', 'org-sp-a', null, 'gestao', 'ativo', '+5531999990011'),
  ('00000000-0000-0000-0000-00000000bb12', '00000000-0000-0000-0000-00000000f008', 'org-sp-b', null, 'master', 'ativo', null),
  ('00000000-0000-0000-0000-00000000bb13', '00000000-0000-0000-0000-00000000f009', 'org-sp-a', 'org-sp-a-1', 'operacional', 'ativo', '+5531999990013'),
  ('00000000-0000-0000-0000-00000000bb14', '00000000-0000-0000-0000-00000000f009', 'org-sp-a', 'org-sp-a-2', 'operacional', 'ativo', null),
  ('00000000-0000-0000-0000-00000000bb15', '00000000-0000-0000-0000-00000000f010', 'org-sp-a', 'org-sp-a-1', 'operacional', 'ativo', '+5531999990015'),
  ('00000000-0000-0000-0000-00000000bb16', '00000000-0000-0000-0000-00000000f011', 'org-sp-a', 'org-sp-a-1', 'operacional', 'ativo', '+5531999990016');

-- Sessão aberta do alvo antes da geração.
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000005f4', '00000000-0000-0000-0000-00000000f004', now() - interval '1 hour', now());
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000005f7', '00000000-0000-0000-0000-00000000f007', now() - interval '1 hour', now());

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

-- Atalho: gerar com a provisória em texto (o hash é o mesmo do servidor).
create or replace function pg_temp.gerar(p_ator text, p_vinculo text, p_escopo text, p_org text, p_alvo text, p_provisoria text)
returns text language sql as $$
  select public.gerar_senha_provisoria_conta(p_ator::uuid, p_vinculo::uuid, p_escopo, p_org,
    public.equipe_hash_provisoria(p_alvo::uuid, p_provisoria), now() + interval '7 days');
$$;

-- ── Só o servidor chama ──────────────────────────────────────────────────
select pg_temp.autenticar_como('00000000-0000-0000-0000-00000000f002');
select throws_ok($$ select public.gerar_senha_provisoria_conta('00000000-0000-0000-0000-00000000f002',
    '00000000-0000-0000-0000-00000000bb04', 'equipe', 'org-sp-a', repeat('a', 64), now() + interval '7 days') $$,
  '42501', null, 'usuário logado não chama a função pela Data API');
select pg_temp.como_servidor();

-- O operador do Vini (vini_operador) ganha EXECUTE em toda função nova de public por
-- default privileges (19/10): estas mexem em senha e no Auth e são revogadas dele.
select is(has_function_privilege('vini_operador',
  'public.gerar_senha_provisoria_conta(uuid, uuid, text, text, text, timestamptz)', 'execute'), false,
  'vini_operador sem EXECUTE em gerar_senha_provisoria_conta');
select is(has_function_privilege('vini_operador',
  'public.rotacionar_senha_temporaria(uuid, uuid, text, timestamptz)', 'execute'), false,
  'vini_operador sem EXECUTE em rotacionar_senha_temporaria');
-- Só dentro desta transação (desfeito no rollback): o postgres do teste assume o papel.
grant vini_operador to postgres;
select set_config('role', 'vini_operador', true);
select throws_ok($$ select public.gerar_senha_provisoria_conta('00000000-0000-0000-0000-00000000f002',
    '00000000-0000-0000-0000-00000000bb04', 'equipe', 'org-sp-a', repeat('a', 64), now() + interval '7 days') $$,
  '42501', null, 'vini_operador não gera senha provisória');
select throws_ok($$ select public.rotacionar_senha_temporaria('00000000-0000-0000-0000-00000000f004',
    '00000000-0000-0000-0000-00000000bb04', repeat('a', 64), now() + interval '7 days') $$,
  '42501', null, 'vini_operador não reenvia senha provisória');
select pg_temp.como_servidor();

select throws_ok($$ select public.gerar_senha_provisoria_conta('00000000-0000-0000-0000-00000000f002',
    '00000000-0000-0000-0000-00000000bb04', 'equipe', 'org-sp-a', 'nao-e-hash', now() + interval '7 days') $$,
  '22023', 'parametro_invalido', 'hash fora do formato é recusado');
select throws_ok($$ select public.gerar_senha_provisoria_conta('00000000-0000-0000-0000-00000000f002',
    '00000000-0000-0000-0000-00000000bb04', 'equipe', 'org-sp-a', repeat('a', 64), now() + interval '30 days') $$,
  '22023', 'parametro_invalido', 'validade acima de 7 dias é recusada');

-- ── Recusas (nada muda) ──────────────────────────────────────────────────
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-00000000bb07', 'equipe', 'org-sp-a',
  '00000000-0000-0000-0000-00000000f006', 'Provisoria234'), 'sem_permissao', 'operacional não gera');
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-00000000bb08', 'master', null,
  '00000000-0000-0000-0000-00000000f007', 'Provisoria234'), 'sem_permissao', 'operacional não usa o escopo master');
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000bb08', 'master', null,
  '00000000-0000-0000-0000-00000000f007', 'Provisoria234'), 'sem_permissao', 'gestão não usa o escopo master');
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000bb05', 'equipe', 'org-sp-a',
  '00000000-0000-0000-0000-00000000f005', 'Provisoria234'), 'outra_organizacao',
  'gestão recusa conta com vínculo em outra organização');
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000bb08', 'equipe', 'org-sp-a',
  '00000000-0000-0000-0000-00000000f007', 'Provisoria234'), 'nao_encontrado',
  'gestão não alcança vínculo de outra organização (mesma resposta de inexistente)');
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000bb01', 'equipe', 'org-sp-b',
  '00000000-0000-0000-0000-00000000f001', 'Provisoria234'), 'sem_permissao',
  'gestão não age em organização onde não é gestão');
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000bb07', 'equipe', 'org-sp-a',
  '00000000-0000-0000-0000-00000000f006', 'Provisoria234'), 'nao_encontrado', 'gestor de loja não alcança outra loja');
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000bb02', 'equipe', 'org-sp-a',
  '00000000-0000-0000-0000-00000000f002', 'Provisoria234'), 'propria_conta', 'ninguém gera para a própria conta');
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000bb10', 'equipe', 'org-sp-off',
  '00000000-0000-0000-0000-00000000f006', 'Provisoria234'), 'sem_permissao', 'organização sem a Equipe ligada não gera');
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000bb11', 'equipe', 'org-sp-a',
  '00000000-0000-0000-0000-00000000f008', 'Provisoria234'), 'nao_encontrado',
  'gestão não alcança conta que também é master (vínculo de gestão na organização dela)');
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000bb13', 'equipe', 'org-sp-a',
  '00000000-0000-0000-0000-00000000f009', 'Provisoria234'), 'outra_unidade',
  'gestor de loja recusa conta que também está em outra loja');
update vinculos set whatsapp = '+5531988880016' where id = '00000000-0000-0000-0000-00000000bb16';
select isnt((select whatsapp_alterado_em from vinculos where id = '00000000-0000-0000-0000-00000000bb16'), null,
  'troca de WhatsApp fica registrada no vínculo');
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000bb16', 'equipe', 'org-sp-a',
  '00000000-0000-0000-0000-00000000f011', 'Provisoria234'), 'whatsapp_recente',
  'Equipe não gera logo depois de trocar o WhatsApp');
update vinculos set whatsapp_alterado_em = null where id = '00000000-0000-0000-0000-00000000bb16';
select isnt((select whatsapp_alterado_em from vinculos where id = '00000000-0000-0000-0000-00000000bb16'), null,
  'a data da troca não é apagada por fora');
select is((select count(*)::int from senhas_temporarias where user_id in (
  '00000000-0000-0000-0000-00000000f005', '00000000-0000-0000-0000-00000000f006', '00000000-0000-0000-0000-00000000f007',
  '00000000-0000-0000-0000-00000000f008', '00000000-0000-0000-0000-00000000f009', '00000000-0000-0000-0000-00000000f011')), 0,
  'nenhuma recusa deixou pendência');

-- ── Gestão da mesma organização gera para conta exclusiva ───────────────
select pg_temp.autenticar_como('00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000005f4');
select is((select count(*)::int from setores where unidade_id = 'org-sp-a-1'), 1, 'controle: antes, a sessão aberta lê');
select pg_temp.como_servidor();
create temp table t_antes as select encrypted_password from auth.users where id = '00000000-0000-0000-0000-00000000f004';
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000bb04', 'equipe', 'org-sp-a',
  '00000000-0000-0000-0000-00000000f004', 'Provisoria234'), 'ok', 'gestão da organização gera');
select ok((select encrypted_password is distinct from (select encrypted_password from t_antes) from auth.users
  where id = '00000000-0000-0000-0000-00000000f004'), 'senha do Auth foi trocada');
select ok((select encrypted_password <> extensions.crypt('SenhaAntiga123', encrypted_password) from auth.users
  where id = '00000000-0000-0000-0000-00000000f004'), 'a senha antiga deixa de entrar');
select ok((select encrypted_password <> extensions.crypt('Provisoria234', encrypted_password) from auth.users
  where id = '00000000-0000-0000-0000-00000000f004'), 'a provisória não é a senha do Auth');
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-00000000f004'), 0, 'sessões caem');
select is((select vinculo_id from senhas_temporarias where user_id = '00000000-0000-0000-0000-00000000f004'),
  '00000000-0000-0000-0000-00000000bb04'::uuid, 'pendência gravada com o vínculo escolhido');
select isnt((select sessoes_validas_desde from perfis where id = '00000000-0000-0000-0000-00000000f004'), null, 'corte de sessão gravado');
select is((select count(*)::int from logs_auditoria where acao = 'gerar_senha_provisoria'
  and entidade_id = '00000000-0000-0000-0000-00000000f004' and user_id = '00000000-0000-0000-0000-00000000f002'
  and unidade_id = 'org-sp-a-1'), 1, 'auditoria: quem, para quem e onde');
select throws_ok($$ insert into auth.sessions (id, user_id, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-00000000f004', now(), now()) $$, '42501', 'conta_pendente_sem_sessao',
  'conta volta a pendente: login não cria sessão');
select throws_ok($$ update auth.users set recovery_token = 'link' where id = '00000000-0000-0000-0000-00000000f004' $$,
  '42501', 'conta_pendente_sem_acesso', 'nem recuperação de senha começa');
select pg_temp.autenticar_como('00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000005f4');
select is((select count(*)::int from setores where unidade_id = 'org-sp-a-1'), 0, 'sessão aberta antes perde o acesso na hora');
select pg_temp.como_servidor();

select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000bb04', 'equipe', 'org-sp-a',
  '00000000-0000-0000-0000-00000000f004', 'OutraProv2345'), 'limite', 'segunda geração em menos de 2 minutos é barrada');
select is(public.equipe_conferir_provisoria('sp-operacional@teste.local', 'Provisoria234'), true,
  'a tela de login reconhece a provisória (cai no primeiro acesso)');

-- ── Primeiro acesso já existente conclui ────────────────────────────────
select is(public.concluir_primeiro_acesso('sp-operacional@teste.local', 'Provisoria234', 'SenhaNovaOp12345'), 'ok',
  'primeiro acesso conclui com a provisória');
select ok((select encrypted_password = extensions.crypt('SenhaNovaOp12345', encrypted_password) from auth.users
  where id = '00000000-0000-0000-0000-00000000f004'), 'senha nova vale');
select is((select status from vinculos where id = '00000000-0000-0000-0000-00000000bb04'), 'ativo', 'vínculo continua ativo');
select lives_ok($$ insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000005f8', '00000000-0000-0000-0000-00000000f004', now() + interval '1 second', now()) $$,
  'login normal volta a criar sessão');
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000bb04', 'equipe', 'org-sp-a',
  '00000000-0000-0000-0000-00000000f004', 'Terceira23456'), 'limite',
  'limite de 2 minutos vale também depois de concluir (pela auditoria)');

-- ── Gestor de loja gera para conta só da loja dele ──────────────────────
-- (a conta de f004 já foi usada; libera o limite movendo a auditoria para trás)
update logs_auditoria set criado_em = now() - interval '5 minutes'
 where acao = 'gerar_senha_provisoria' and entidade_id = '00000000-0000-0000-0000-00000000f004';
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000bb04', 'equipe', 'org-sp-a',
  '00000000-0000-0000-0000-00000000f004', 'DaLoja2345678'), 'ok', 'gestor de loja gera para conta só da loja dele');

-- ── Master gera para qualquer conta ──────────────────────────────────────
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000bb01', 'master', null,
  '00000000-0000-0000-0000-00000000f001', 'Provisoria234'), 'propria_conta', 'master não gera para a própria conta');
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000bb05', 'master', null,
  '00000000-0000-0000-0000-00000000f005', 'Provisoria234'), 'ok', 'master gera para conta de duas organizações');
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000bb08', 'master', null,
  '00000000-0000-0000-0000-00000000f007', 'ProvMaster234'), 'ok', 'master gera para a gestão de outro cliente');
select ok((select encrypted_password <> extensions.crypt('SenhaAntigaB123', encrypted_password) from auth.users
  where id = '00000000-0000-0000-0000-00000000f007'), 'senha antiga da conta (master) deixa de entrar');
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-00000000f007'), 0, 'sessões da conta caem');
select is((select count(*)::int from logs_auditoria where acao = 'gerar_senha_provisoria'
  and entidade_id = '00000000-0000-0000-0000-00000000f007' and user_id = '00000000-0000-0000-0000-00000000f001'
  and unidade_id = 'org-sp-b-1' and dados_novos ->> 'escopo' = 'master'), 1, 'auditoria do master');

select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000bb16', 'master', null,
  '00000000-0000-0000-0000-00000000f011', 'ProvMaster345'), 'ok', 'a espera do WhatsApp trocado é só da Equipe');
select is((select origem from senhas_temporarias where user_id = '00000000-0000-0000-0000-00000000f011'), 'redefinicao',
  'pendência marcada como redefinição');
update senhas_temporarias set enviada_em = now() - interval '5 minutes' where user_id = '00000000-0000-0000-0000-00000000f011';
select is(public.rotacionar_senha_temporaria('00000000-0000-0000-0000-00000000f011', '00000000-0000-0000-0000-00000000bb16',
  public.equipe_hash_provisoria('00000000-0000-0000-0000-00000000f011', 'Reenvio234567'), now() + interval '7 days'), false,
  'senha redefinida não é reenviada para WhatsApp trocado há pouco');
select is((select origem from senhas_temporarias where user_id = '00000000-0000-0000-0000-00000000f004'), 'redefinicao',
  'conversão pela Equipe também marca redefinição');

-- ── O grant: o servidor (service_role) chama ────────────────────────────
create temp table t_hash_servidor as
  select public.equipe_hash_provisoria('00000000-0000-0000-0000-00000000f010', 'PeloServidor2') as hash;
grant select on t_hash_servidor to service_role;
select set_config('role', 'service_role', true);
select is(public.gerar_senha_provisoria_conta('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000bb15',
  'equipe', 'org-sp-a', (select hash from t_hash_servidor), now() + interval '7 days'), 'ok', 'service_role executa a função');
select pg_temp.como_servidor();

-- ── Teto por pessoa: 5 gerações a cada 10 minutos (Equipe) ──────────────
-- f002 já gerou 2 (f004 e f010); mais 3 registros completam o teto.
insert into logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_novos)
select 'org-sp-a-1', '00000000-0000-0000-0000-00000000f002', 'gerar_senha_provisoria', 'usuario', gen_random_uuid()::text,
       jsonb_build_object('escopo', 'equipe')
  from generate_series(1, 3);
select is(pg_temp.gerar('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000bb07', 'equipe', 'org-sp-a',
  '00000000-0000-0000-0000-00000000f006', 'Provisoria234'), 'limite_ator', 'sexta geração em 10 minutos é barrada');
select is((select count(*)::int from senhas_temporarias where user_id = '00000000-0000-0000-0000-00000000f006'), 0,
  'e não deixou pendência');

-- ── Provisória vencida não entra ────────────────────────────────────────
update senhas_temporarias set expira_em = now() - interval '1 minute' where user_id = '00000000-0000-0000-0000-00000000f007';
select is(public.equipe_conferir_provisoria('sp-gestor-b@teste.local', 'ProvMaster234'), false, 'provisória vencida não confere no login');
select is(public.concluir_primeiro_acesso('sp-gestor-b@teste.local', 'ProvMaster234', 'SenhaNovaB12345'), 'provisoria_invalida',
  'provisória vencida não conclui');

select * from finish();
rollback;
