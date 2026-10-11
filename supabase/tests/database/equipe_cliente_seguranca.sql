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

select plan(44);

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

insert into senhas_temporarias (user_id, vinculo_id, hash, expira_em, versao, enviada_em) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000aa01', 'hash-vigente',
   now() + interval '7 days', 3, now() - interval '10 minutes');

-- Sessão antiga (antes da troca) e sessão nova (depois), como o Auth grava.
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-0000000e0001', now() - interval '1 hour', now()),
  ('00000000-0000-0000-0000-0000000005e2', '00000000-0000-0000-0000-0000000e0001', now() + interval '1 second', now());

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
select throws_ok($$ select public.iniciar_primeiro_acesso('00000000-0000-0000-0000-0000000e0001', 'hash-vigente') $$,
  '42501', null, 'usuário não inicia o primeiro acesso direto pela API');
select throws_ok($$ select public.concluir_primeiro_acesso('00000000-0000-0000-0000-0000000e0001', gen_random_uuid()) $$,
  '42501', null, 'usuário não conclui o primeiro acesso direto pela API');
select throws_ok($$ select public.liberar_trava_senha('00000000-0000-0000-0000-0000000e0001', gen_random_uuid()) $$,
  '42501', null, 'usuário não mexe na trava pela API');
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

-- ── Reenvio: só pelo vínculo de origem, com limite e trava ──────────────
select is(public.rotacionar_senha_temporaria('00000000-0000-0000-0000-0000000e0001',
  '00000000-0000-0000-0000-00000000aa02', 'invasor', now() + interval '7 days'),
  null, 'vínculo de outro cliente não redefine a senha da conta');
create temp table t_tokens (nome text primary key, token uuid);
insert into t_tokens values ('reenvio', public.rotacionar_senha_temporaria('00000000-0000-0000-0000-0000000e0001',
  '00000000-0000-0000-0000-00000000aa01', 'hash-vigente', now() + interval '7 days'));
select isnt((select token from t_tokens where nome = 'reenvio'), null, 'vínculo de origem reenvia e pega a trava');
select is(public.iniciar_primeiro_acesso('00000000-0000-0000-0000-0000000e0001', 'hash-vigente'), null,
  'troca não começa enquanto o reenvio segura a trava');
select public.liberar_trava_senha('00000000-0000-0000-0000-0000000e0001', gen_random_uuid());
select is(public.iniciar_primeiro_acesso('00000000-0000-0000-0000-0000000e0001', 'hash-vigente'), null,
  'token errado não libera a trava');
select public.liberar_trava_senha('00000000-0000-0000-0000-0000000e0001', (select token from t_tokens where nome = 'reenvio'));
select is(public.rotacionar_senha_temporaria('00000000-0000-0000-0000-0000000e0001',
  '00000000-0000-0000-0000-00000000aa01', 'outro', now() + interval '7 days'),
  null, 'segundo reenvio em menos de 2 minutos é barrado');

-- ── Primeiro acesso: prova, trava com token, conclusão ──────────────────
select is(public.iniciar_primeiro_acesso('00000000-0000-0000-0000-0000000e0001', 'hash-errado'), null,
  'sem a senha provisória vigente não inicia');
insert into t_tokens values ('troca', public.iniciar_primeiro_acesso('00000000-0000-0000-0000-0000000e0001', 'hash-vigente'));
select isnt((select token from t_tokens where nome = 'troca'), null, 'com a senha vigente inicia e recebe token');
select is(public.iniciar_primeiro_acesso('00000000-0000-0000-0000-0000000e0001', 'hash-vigente'), null,
  'segunda troca simultânea é barrada');
update senhas_temporarias set enviada_em = now() - interval '10 minutes';
select is(public.rotacionar_senha_temporaria('00000000-0000-0000-0000-0000000e0001',
  '00000000-0000-0000-0000-00000000aa01', 'x', now() + interval '7 days'), null, 'reenvio é barrado durante a troca');
select is(public.concluir_primeiro_acesso('00000000-0000-0000-0000-0000000e0001', gen_random_uuid()), false,
  'token de outra operação não conclui');
select is(public.concluir_primeiro_acesso('00000000-0000-0000-0000-0000000e0001', (select token from t_tokens where nome = 'troca')),
  true, 'token da troca conclui');
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
