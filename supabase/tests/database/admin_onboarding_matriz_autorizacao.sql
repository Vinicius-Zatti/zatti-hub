-- Matriz de autorização do onboarding administrativo (admin_criar_cliente,
-- admin_buscar_usuario_por_email) - testes via pgTAP.
--
-- IMPORTANTE (mesmo bloqueio já registrado em p0_matriz_autorizacao.sql):
-- este arquivo não foi executado nesta máquina - sem Docker local nem
-- projeto de staging disponível. Escrito seguindo a mesma convenção
-- (helper pg_temp.autenticar_como) pra rodar assim que houver acesso a um
-- Postgres de verdade. Cobre os cenários pedidos na revisão desta
-- funcionalidade, além dos já cobertos em vitest (que usa mock, não
-- Postgres de verdade - esses dois arquivos são complementares, não
-- redundantes):
--   1. master + AAL2 executa as duas funções
--   2. master sem AAL2 é bloqueado nas duas
--   3. gestão é bloqueada nas duas
--   4. operacional é bloqueado nas duas
--   5. anônimo é bloqueado nas duas
--   6. admin_buscar_usuario_por_email normaliza e-mail (maiúscula/espaço)
--   7. admin_buscar_usuario_por_email devolve só o id, nunca outro campo
--   8. admin_criar_cliente rejeita role="master" mesmo vindo direto do SQL
--      (sem passar pelo Zod da Server Action)
--   9. admin_criar_cliente é idempotente - rodar duas vezes com os mesmos
--      parâmetros não duplica organização/unidade/vínculo
--  10. admin_criar_cliente aborta tudo (organização incluída) se um
--      vínculo divergir do esperado

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-0000000c1001', 'gestao.onboarding@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c1002', 'operacional.onboarding@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c1003', 'master.onboarding@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c1004', 'Cliente.Novo@Teste.Local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo)
values ('org-onboarding-existente', 'Organização Existente', 'saas', true);

insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
values
  ('00000000-0000-0000-0000-0000000c1001', 'org-onboarding-existente', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000c1002', 'org-onboarding-existente', null, 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000c1003', 'org-onboarding-existente', null, 'master', 'ativo');

create or replace function pg_temp.autenticar_como(p_user_id uuid, p_aal text default 'aal1')
returns void
language sql
as $$
  select set_config('role', 'authenticated', true);
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'aal', p_aal, 'role', 'authenticated')::text,
    true
  );
$$;

create or replace function pg_temp.autenticar_como_anon()
returns void
language sql
as $$
  select set_config('role', 'anon', true);
  select set_config('request.jwt.claims', '{}', true);
$$;

-- ── 1. Master + AAL2 executa as duas funções ────────────────────────────

select pg_temp.autenticar_como('00000000-0000-0000-0000-0000000c1003', 'aal2');

select is(
  admin_buscar_usuario_por_email('cliente.novo@teste.local'),
  '00000000-0000-0000-0000-0000000c1004'::uuid,
  'master com AAL2 consegue buscar e-mail existente'
);

select lives_ok(
  $$ select admin_criar_cliente(
    'org-onboarding-novo', 'Organização Onboarding Novo', 'saas',
    'org-onboarding-novo', 'Unidade Única', 'banco',
    jsonb_build_array(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-0000000c1004',
      'nome', 'Cliente Novo', 'role', 'gestao', 'unidade_id', null
    ))
  ) $$,
  'master com AAL2 consegue criar cliente novo'
);

-- ── 9. Idempotência: repetir a mesma chamada não duplica nada ───────────

select is(
  (select count(*)::int from organizacoes where id = 'org-onboarding-novo'),
  1,
  'organização criada uma única vez após a primeira chamada'
);

select lives_ok(
  $$ select admin_criar_cliente(
    'org-onboarding-novo', 'Organização Onboarding Novo', 'saas',
    'org-onboarding-novo', 'Unidade Única', 'banco',
    jsonb_build_array(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-0000000c1004',
      'nome', 'Cliente Novo', 'role', 'gestao', 'unidade_id', null
    ))
  ) $$,
  'repetir a chamada idêntica não lança erro'
);

select is(
  (select count(*)::int from organizacoes where id = 'org-onboarding-novo'),
  1,
  'organização continua existindo uma única vez depois da repetição (sem duplicar)'
);

select is(
  (select count(*)::int from vinculos where organizacao_id = 'org-onboarding-novo'),
  1,
  'vínculo continua existindo uma única vez depois da repetição (sem duplicar)'
);

-- ── 10. Vínculo divergente aborta tudo, organização incluída ────────────

select throws_ok(
  $$ select admin_criar_cliente(
    'org-onboarding-novo', 'Organização Onboarding Novo', 'saas',
    'org-onboarding-novo', 'Unidade Única', 'banco',
    jsonb_build_array(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-0000000c1004',
      'nome', 'Cliente Novo', 'role', 'operacional', 'unidade_id', 'org-onboarding-novo'
    ))
  ) $$,
  'admin_criar_cliente aborta quando o vínculo já existe com papel diferente do pedido'
);

-- ── 8. Rejeita role="master" mesmo direto no SQL ────────────────────────

select throws_ok(
  $$ select admin_criar_cliente(
    'org-onboarding-tentativa-master', 'Tentativa Master', 'saas',
    'org-onboarding-tentativa-master', 'Unidade', 'banco',
    jsonb_build_array(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-0000000c1004',
      'nome', 'Cliente Novo', 'role', 'master', 'unidade_id', null
    ))
  ) $$,
  'admin_criar_cliente rejeita role=master mesmo chamada direto no SQL, sem passar pelo Zod'
);

select is(
  (select count(*)::int from organizacoes where id = 'org-onboarding-tentativa-master'),
  0,
  'tentativa com role=master não cria organização nenhuma'
);

-- ── 6 e 7. Normalização de e-mail e retorno mínimo ──────────────────────

select is(
  admin_buscar_usuario_por_email('  CLIENTE.NOVO@teste.local  '),
  '00000000-0000-0000-0000-0000000c1004'::uuid,
  'admin_buscar_usuario_por_email normaliza maiúscula/minúscula e espaço nas pontas'
);

select is(
  admin_buscar_usuario_por_email('nao-existe@teste.local'),
  null::uuid,
  'admin_buscar_usuario_por_email devolve null pra e-mail que não existe (não lança erro)'
);

-- ── 2. Master sem AAL2 é bloqueado nas duas funções ─────────────────────

select pg_temp.autenticar_como('00000000-0000-0000-0000-0000000c1003', 'aal1');

select throws_ok(
  $$ select admin_buscar_usuario_por_email('cliente.novo@teste.local') $$,
  'master sem AAL2 não consegue chamar admin_buscar_usuario_por_email'
);

select throws_ok(
  $$ select admin_criar_cliente('x', 'x', 'saas', 'x', 'x', 'banco', '[]'::jsonb) $$,
  'master sem AAL2 não consegue chamar admin_criar_cliente'
);

-- ── 3, 4 e 5. Gestão, operacional e anônimo são bloqueados ──────────────

select pg_temp.autenticar_como('00000000-0000-0000-0000-0000000c1001');

select throws_ok(
  $$ select admin_buscar_usuario_por_email('cliente.novo@teste.local') $$,
  'gestão (não-master) não consegue chamar admin_buscar_usuario_por_email'
);

select pg_temp.autenticar_como('00000000-0000-0000-0000-0000000c1002');

select throws_ok(
  $$ select admin_buscar_usuario_por_email('cliente.novo@teste.local') $$,
  'operacional não consegue chamar admin_buscar_usuario_por_email'
);

select pg_temp.autenticar_como_anon();

select throws_ok(
  $$ select admin_buscar_usuario_por_email('cliente.novo@teste.local') $$,
  'usuário anônimo (sem sessão) não consegue chamar admin_buscar_usuario_por_email'
);

select * from finish();

rollback;
