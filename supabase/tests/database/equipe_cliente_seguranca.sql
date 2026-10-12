-- Equipe do cliente V1 - fronteira de segurança no banco.
-- Prova: conta pendente ('convidado') não enxerga dado de negócio nem foto;
-- todo helper exige vínculo ativo e sessão vigente; segredo ilegível pela
-- Data API; primeiro acesso exige a senha provisória vigente e uma trava
-- com token; reenvio só pelo vínculo de origem e nunca com a trava ocupada;
-- sessão aberta antes da troca perde o acesso mesmo renovando o token;
-- revogação não zera a gestão; telefone de outra pessoa não é legível.
-- Só fixtures de teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(62);

grant select, insert, update on organizacoes, unidades, vinculos, perfis, setores to authenticated;

-- ── Estrutura: helpers e policies ───────────────────────────────────────
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'usuario\_%'
      and pg_get_functiondef(p.oid) !~ 'status = ''ativo'''
      and pg_get_functiondef(p.oid) !~ 'public\.usuario_(tem_acesso_(unidade|organizacao|pedido|contagem|setor)|e_master|e_titular_financeiro|pode_)'),
  0, 'todo helper usuario_* exige vínculo ativo, direto ou por outro helper');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'usuario\_%'
      and pg_get_functiondef(p.oid) ~ 'status = ''ativo'''
      and pg_get_functiondef(p.oid) !~ 'sessao_vigente\(\)'),
  0, 'todo helper que confere vínculo direto também confere a sessão vigente');

select is(
  (select count(*)::int from pg_policies
    where schemaname in ('public', 'storage')
      and not ('vini_leitura' = any (roles))
      and coalesce(qual, '') || coalesce(with_check, '') !~ '(usuario_|auth\.uid\(\)|^false$)'
      and policyname <> 'fin_regras_classificacao_versoes_select'),
  0, 'toda policy de usuário passa por helper de acesso ou pelo próprio usuário');

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'vinculos'),
  1, 'vinculos tem uma única policy (cada um lê só o próprio vínculo)');

-- ── Fixture ──────────────────────────────────────────────────────────────
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000e0001', 'pendente@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e0002', 'gestor-a@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e0003', 'gestor-a2@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e0004', 'gestor-loja@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e0005', 'master@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-eq-a', 'Cliente A', 'saas', true),
  ('org-eq-b', 'Cliente B', 'saas', true),
  ('org-eq-c', 'Cliente C inativo', 'saas', false);

insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, fichas_tecnicas_habilitado) values
  ('org-eq-a-loja', 'org-eq-a', 'Loja A', 'banco', true, true),
  ('org-eq-a-fechada', 'org-eq-a', 'Loja A fechada', 'banco', false, false),
  ('org-eq-b-loja', 'org-eq-b', 'Loja B', 'banco', true, false),
  ('org-eq-c-loja', 'org-eq-c', 'Loja C', 'banco', true, false);

insert into setores (unidade_id, nome) values ('org-eq-a-loja', 'Cozinha teste');

insert into storage.buckets (id, name, public) values ('fichas-tecnicas', 'fichas-tecnicas', false)
  on conflict (id) do nothing;
insert into storage.objects (bucket_id, name) values ('fichas-tecnicas', 'org-eq-a-loja/foto-teste.jpg');

insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status, whatsapp) values
  ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000e0001', 'org-eq-a', 'org-eq-a-loja', 'operacional', 'convidado', '+5531999990001'),
  ('00000000-0000-0000-0000-00000000aa02', '00000000-0000-0000-0000-0000000e0001', 'org-eq-b', 'org-eq-b-loja', 'operacional', 'revogado', null),
  ('00000000-0000-0000-0000-00000000aa06', '00000000-0000-0000-0000-0000000e0001', 'org-eq-a', 'org-eq-a-fechada', 'operacional', 'convidado', null),
  ('00000000-0000-0000-0000-00000000aa07', '00000000-0000-0000-0000-0000000e0001', 'org-eq-c', 'org-eq-c-loja', 'operacional', 'convidado', null),
  ('00000000-0000-0000-0000-00000000aa03', '00000000-0000-0000-0000-0000000e0002', 'org-eq-a', null, 'gestao', 'ativo', '+5531999990002'),
  ('00000000-0000-0000-0000-00000000aa04', '00000000-0000-0000-0000-0000000e0003', 'org-eq-a', null, 'gestao', 'ativo', null),
  ('00000000-0000-0000-0000-00000000aa05', '00000000-0000-0000-0000-0000000e0004', 'org-eq-a', 'org-eq-a-loja', 'gestao', 'ativo', null),
  ('00000000-0000-0000-0000-00000000aa08', '00000000-0000-0000-0000-0000000e0005', 'org-eq-b', null, 'master', 'ativo', null);

-- Sessão antiga (antes da troca) e sessão nova (depois), como o Auth grava.
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-0000000e0001', now() - interval '1 hour', now()),
  ('00000000-0000-0000-0000-0000000005e2', '00000000-0000-0000-0000-0000000e0001', now() + interval '1 second', now());

insert into senhas_temporarias (user_id, vinculo_id, hash, expira_em, versao, enviada_em) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000aa01', 'hash-vigente',
   now() + interval '7 days', 3, now() - interval '10 minutes');

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

-- ── Conta pendente não enxerga nada do cliente ──────────────────────────
select pg_temp.autenticar_como('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000005e1');
select is((select count(*)::int from unidades where id = 'org-eq-a-loja'), 0, 'pendente não lê a unidade');
select is((select count(*)::int from organizacoes where id = 'org-eq-a'), 0, 'pendente não lê a organização');
select is((select count(*)::int from setores where unidade_id = 'org-eq-a-loja'), 0, 'pendente não lê tabela de negócio (setores)');
select is((select count(*)::int from storage.objects where bucket_id = 'fichas-tecnicas'), 0, 'pendente não lê foto no Storage');
select is((select count(*)::int from vinculos), 4, 'pendente lê os próprios vínculos (o app manda para /primeiro-acesso)');
select throws_ok($$ select * from senhas_temporarias $$, '42501', null, 'segredo ilegível pela Data API');
select throws_ok($$ select public.equipe_conferir_provisoria('pendente@teste.local', 'x') $$,
  '42501', null, 'usuário não confere provisória direto pela API');
select throws_ok($$ select public.concluir_primeiro_acesso('pendente@teste.local', 'x', 'MinhaSenhaNova123') $$,
  '42501', null, 'usuário não conclui o primeiro acesso direto pela API');
select hasnt_function('public', 'liberar_trava_senha', array['uuid', 'uuid'],
  'a trava com prazo (e a liberação dela) não existe mais');
select throws_ok($$ select public.rotacionar_senha_temporaria('00000000-0000-0000-0000-0000000e0001',
  '00000000-0000-0000-0000-00000000aa01', 'h', now()) $$, '42501', null, 'usuário não rotaciona a senha pela API');
select throws_ok($$ select public.revogar_vinculo_equipe('00000000-0000-0000-0000-00000000aa03') $$,
  '42501', null, 'usuário não revoga vínculo direto pela API');

-- ── Gestor ativo: próprio cliente sim, outro não, telefone alheio nunca ─
select pg_temp.autenticar_como('00000000-0000-0000-0000-0000000e0002');
select is((select count(*)::int from unidades where id = 'org-eq-a-loja'), 1, 'gestor ativo lê a unidade');
select is((select count(*)::int from setores where unidade_id = 'org-eq-a-loja'), 1, 'gestor ativo lê tabela de negócio');
select is((select count(*)::int from storage.objects where bucket_id = 'fichas-tecnicas'), 1, 'gestor ativo lê a foto do próprio cliente');
select is((select count(*)::int from unidades where id = 'org-eq-b-loja'), 0, 'gestor não lê outro cliente');
select is((select count(*)::int from vinculos where whatsapp is not null and user_id <> auth.uid()), 0,
  'gestor não lê vínculo (nem WhatsApp) de outra pessoa pela Data API');

-- ── Master sem segundo fator não lê nada ────────────────────────────────
select pg_temp.autenticar_como('00000000-0000-0000-0000-0000000e0005');
select is((select count(*)::int from unidades where id = 'org-eq-a-loja'), 0, 'master sem aal2 não lê');
select pg_temp.autenticar_como('00000000-0000-0000-0000-0000000e0005', null, 'aal2');
select is((select count(*)::int from unidades where id = 'org-eq-a-loja'), 1, 'master com aal2 lê');

select pg_temp.como_servidor();

-- ── Integridade dos vínculos ────────────────────────────────────────────
select throws_ok($$ insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
  values ('00000000-0000-0000-0000-0000000e0002', 'org-eq-a', null, 'gestao', 'convidado') $$,
  '23505', null, 'índice único trata unidade nula como igual');
select throws_ok($$ insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
  values ('00000000-0000-0000-0000-0000000e0002', 'org-eq-a', 'org-eq-b-loja', 'operacional', 'ativo') $$,
  '23503', null, 'vínculo não aponta unidade de outro cliente');
select throws_ok($$ update vinculos set whatsapp = '31999998888' where id = '00000000-0000-0000-0000-00000000aa03' $$,
  '23514', null, 'WhatsApp fora do E.164 é recusado');

-- ── Conta pendente: sem sessão e sem troca de senha por fora ───────────
select hasnt_function('public', 'iniciar_primeiro_acesso', array['uuid', 'text'],
  'a versão com trava que vencia sozinha não existe mais');
select throws_ok($$ insert into auth.sessions (id, user_id, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-0000000e0001', now(), now()) $$, '42501', 'conta_pendente_sem_sessao',
  'conta pendente não ganha sessão (login, recuperação, link mágico)');
select throws_ok($$ update auth.users set encrypted_password = 'escrita-de-fora' where id = '00000000-0000-0000-0000-0000000e0001' $$,
  '42501', 'senha_pendente_primeiro_acesso', 'com pendência ninguém troca a senha no Auth (nem o próprio Auth)');

-- Conta recém-criada, marcada no Auth, antes de a pendência ir para o banco.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000e0009', 'recem-criada@teste.local', 'x', now(), 'authenticated', 'authenticated',
   '{"zh_pendente": true}'::jsonb);
select throws_ok($$ insert into auth.sessions (id, user_id, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-0000000e0009', now(), now()) $$, '42501', 'conta_pendente_sem_sessao',
  'conta marcada pendente no Auth não ganha sessão nem antes de a pendência ir para o banco');
select throws_ok($$ update auth.users set recovery_token = 'link' where id = '00000000-0000-0000-0000-0000000e0009' $$,
  '42501', 'conta_pendente_sem_acesso', 'nem link de recuperação');

-- ── Reenvio: só o hash da provisória, pelo vínculo de origem ───────────
create temp table t_senha (nome text primary key, hash text);
insert into t_senha select 'inicial', encrypted_password from auth.users where id = '00000000-0000-0000-0000-0000000e0001';
select is(public.rotacionar_senha_temporaria('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000aa02',
  public.equipe_hash_provisoria('00000000-0000-0000-0000-0000000e0001', 'Invasor234567'), now() + interval '7 days'), false,
  'vínculo de outro cliente não redefine a provisória');
select is(public.rotacionar_senha_temporaria('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000aa01',
  public.equipe_hash_provisoria('00000000-0000-0000-0000-0000000e0001', 'Provisoria234'), now() + interval '7 days'), true, 'vínculo de origem reenvia');
select is((select encrypted_password from auth.users where id = '00000000-0000-0000-0000-0000000e0001'), (select hash from t_senha where nome = 'inicial'),
  'reenvio não escreve nada no Auth');
select is(public.rotacionar_senha_temporaria('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000aa01',
  public.equipe_hash_provisoria('00000000-0000-0000-0000-0000000e0001', 'Outra23456789'), now() + interval '7 days'), false,
  'segundo reenvio em menos de 2 minutos é barrado');

-- ── Conferir a provisória (tela de login) ───────────────────────────────
select is(public.equipe_conferir_provisoria('pendente@teste.local', 'Errada0000000'), false, 'provisória errada não confere');
select is((select tentativas from senhas_temporarias where user_id = '00000000-0000-0000-0000-0000000e0001'), 1, 'e conta uma tentativa');
select is(public.equipe_conferir_provisoria(' PENDENTE@teste.local ', 'Provisoria234'), true,
  'provisória certa confere (e-mail sem diferença de maiúscula ou espaço)');
select is(public.equipe_conferir_provisoria('ninguem@teste.local', 'Provisoria234'), false,
  'e-mail sem pendência tem a mesma resposta');
update senhas_temporarias set tentativas = 10 where user_id = '00000000-0000-0000-0000-0000000e0001';
select is(public.equipe_conferir_provisoria('pendente@teste.local', 'Provisoria234'), false, '10 erros travam a provisória até a gestão reenviar');
update senhas_temporarias set tentativas = 0 where user_id = '00000000-0000-0000-0000-0000000e0001';

-- ── Primeiro acesso sem sessão, numa transação só ──────────────────────
select throws_ok($$ select public.concluir_primeiro_acesso('pendente@teste.local', 'Provisoria234', repeat('é', 37)) $$, '22023', 'senha_invalida',
  'senha acima de 72 bytes (limite do bcrypt) é recusada, mesmo com 37 caracteres');
select throws_ok($$ select public.concluir_primeiro_acesso('pendente@teste.local', 'Provisoria234', 'Provisoria234') $$, '22023', 'senha_invalida',
  'senha nova igual à provisória é recusada');
select is(public.concluir_primeiro_acesso('pendente@teste.local', 'Errada0000000', 'MinhaSenhaNova123'), 'provisoria_invalida',
  'provisória errada não conclui');
update senhas_temporarias set expira_em = now() - interval '1 minute' where user_id = '00000000-0000-0000-0000-0000000e0001';
select is(public.concluir_primeiro_acesso('pendente@teste.local', 'Provisoria234', 'MinhaSenhaNova123'), 'provisoria_invalida',
  'provisória vencida não conclui');
update senhas_temporarias set expira_em = now() + interval '7 days', tentativas = 0 where user_id = '00000000-0000-0000-0000-0000000e0001';
select throws_ok($$ update auth.users set recovery_token = 'recuperacao-aberta' where id = '00000000-0000-0000-0000-0000000e0001' $$,
  '42501', 'conta_pendente_sem_acesso', 'recuperação de senha não começa durante a pendência');
select is(public.concluir_primeiro_acesso('pendente@teste.local', 'Provisoria234', 'MinhaSenhaNova123'), 'ok', 'com a provisória vigente conclui');
select ok((select encrypted_password = extensions.crypt('MinhaSenhaNova123', encrypted_password) from auth.users where id = '00000000-0000-0000-0000-0000000e0001'), 'senha nova gravada no Auth na mesma transação');
select is((select raw_app_meta_data ->> 'zh_pendente' from auth.users where id = '00000000-0000-0000-0000-0000000e0001'), 'false', 'marca de pendência sai junto');
select is((select coalesce(recovery_token, '') from auth.users where id = '00000000-0000-0000-0000-0000000e0001'), '', 'nenhum token de recuperação sobra depois da troca');
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-0000000e0001'), 0, 'sessões anteriores caem no Auth');
select is((select count(*)::int from senhas_temporarias where user_id = '00000000-0000-0000-0000-0000000e0001'), 0, 'pendência apagada');
select is(public.concluir_primeiro_acesso('pendente@teste.local', 'Provisoria234', 'OutraSenha12345'), 'provisoria_invalida',
  'repetir o primeiro acesso depois de concluído não muda nada');
select is(public.rotacionar_senha_temporaria('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000aa01',
  public.equipe_hash_provisoria('00000000-0000-0000-0000-0000000e0001', 'Tarde23456789'), now() + interval '7 days'), false,
  'reenvio que chega depois da troca não toca na conta');
-- A pessoa entra com a senha nova (sessão criada depois do corte).
select lives_ok($$ insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000005e2', '00000000-0000-0000-0000-0000000e0001', now() + interval '1 second', now()) $$,
  'depois do primeiro acesso, o login normal cria sessão');
select lives_ok($$ update auth.users set encrypted_password = 'troca-legitima' where id = '00000000-0000-0000-0000-0000000e0001' $$,
  'e a troca normal de senha volta a funcionar');
select results_eq(
  $$ select id::text || ':' || status from vinculos
     where user_id = '00000000-0000-0000-0000-0000000e0001' order by id $$,
  $$ values ('00000000-0000-0000-0000-00000000aa01:ativo'), ('00000000-0000-0000-0000-00000000aa02:revogado'),
            ('00000000-0000-0000-0000-00000000aa06:convidado'), ('00000000-0000-0000-0000-00000000aa07:convidado') $$,
  'ativa só o convidado válido; revogado, unidade inativa e organização inativa ficam como estão');

-- ── Sessão aberta antes da troca perde o acesso ─────────────────────────
select pg_temp.autenticar_como('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000005e1');
select is((select count(*)::int from setores where unidade_id = 'org-eq-a-loja'), 0,
  'sessão anterior à troca não lê nada, mesmo com token renovado');
select pg_temp.autenticar_como('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000005e2');
select is((select count(*)::int from setores where unidade_id = 'org-eq-a-loja'), 1, 'sessão nova, depois da troca, lê');
-- A própria pessoa tenta apagar o corte para reabilitar a sessão antiga.
update perfis set sessoes_validas_desde = null where id = auth.uid();
delete from perfis where id = auth.uid();
select pg_temp.como_servidor();
select isnt((select sessoes_validas_desde from perfis where id = '00000000-0000-0000-0000-0000000e0001'), null,
  'usuário não apaga nem zera o próprio corte de sessão');
select pg_temp.autenticar_como('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000005e1');
select is((select count(*)::int from setores where unidade_id = 'org-eq-a-loja'), 0, 'sessão antiga continua barrada');
select pg_temp.como_servidor();

-- ── Revogação não zera a gestão ─────────────────────────────────────────
select is(public.revogar_vinculo_equipe('00000000-0000-0000-0000-00000000aa03'), 'ok',
  'revoga gestão geral quando há outra gestão geral');
select is(public.revogar_vinculo_equipe('00000000-0000-0000-0000-00000000aa04'), 'ultima_gestao',
  'não revoga a última gestão geral (gestão de loja não substitui)');
select is(public.revogar_vinculo_equipe('00000000-0000-0000-0000-00000000aa05'), 'ok',
  'gestão de loja sai quando há gestão geral cobrindo a loja');

select * from finish();
rollback;
