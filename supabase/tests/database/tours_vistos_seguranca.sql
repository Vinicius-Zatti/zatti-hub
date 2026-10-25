-- Tour do primeiro acesso (Navegação V2, fase 4, 25/10/2026) - fronteira no banco.
-- Prova: cada usuário lê e insere só as próprias linhas; outro usuário não lê
-- nem insere em nome dele; o app não atualiza nem apaga; anon não vê nada;
-- módulo com formato estranho é recusado; o mesmo módulo não grava duas vezes.

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-00000007a001', 'tour.a@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000007a002', 'tour.b@teste.local', 'x', now(), 'authenticated', 'authenticated');

create or replace function pg_temp.autenticar_como(p_user_id uuid)
returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
$$;

create or replace function pg_temp.como_servidor()
returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', null, true);
$$;

-- ── Usuário A grava e lê o próprio ──────────────────────────────────────
select pg_temp.autenticar_como('00000000-0000-0000-0000-00000007a001');

select lives_ok(
  $$insert into public.tours_vistos (user_id, modulo) values ('00000000-0000-0000-0000-00000007a001', 'estoque')$$,
  'usuário insere o próprio tour visto'
);
select is((select count(*)::int from public.tours_vistos), 1, 'usuário lê o próprio tour visto');

select throws_ok(
  $$insert into public.tours_vistos (user_id, modulo) values ('00000000-0000-0000-0000-00000007a001', 'estoque')$$,
  '23505',
  null,
  'o mesmo módulo não grava duas vezes'
);

select throws_ok(
  $$insert into public.tours_vistos (user_id, modulo) values ('00000000-0000-0000-0000-00000007a001', 'Estoque; drop')$$,
  '23514',
  null,
  'módulo fora do formato é recusado'
);

-- ── Usuário B não lê nem insere pelo A ──────────────────────────────────
select pg_temp.autenticar_como('00000000-0000-0000-0000-00000007a002');

select is((select count(*)::int from public.tours_vistos), 0, 'outro usuário não lê o tour visto do A');

select throws_ok(
  $$insert into public.tours_vistos (user_id, modulo) values ('00000000-0000-0000-0000-00000007a001', 'garante')$$,
  '42501',
  null,
  'outro usuário não insere em nome do A'
);

select lives_ok(
  $$insert into public.tours_vistos (user_id, modulo) values ('00000000-0000-0000-0000-00000007a002', 'estoque')$$,
  'B grava o próprio, mesmo módulo do A'
);

-- ── Sem update nem delete para o app ────────────────────────────────────
select pg_temp.autenticar_como('00000000-0000-0000-0000-00000007a001');

select throws_ok(
  $$update public.tours_vistos set visto_em = now() - interval '1 day' where modulo = 'estoque'$$,
  '42501',
  null,
  'app não atualiza tour visto'
);

select throws_ok(
  $$delete from public.tours_vistos where modulo = 'estoque'$$,
  '42501',
  null,
  'app não apaga tour visto'
);

-- ── anon não enxerga ────────────────────────────────────────────────────
select pg_temp.como_servidor();
select set_config('role', 'anon', true);

select throws_ok(
  $$select count(*) from public.tours_vistos$$,
  '42501',
  null,
  'anon não lê tours_vistos'
);

-- ── Estado final visto pelo servidor ────────────────────────────────────
select pg_temp.como_servidor();

select is(
  (select count(*)::int from public.tours_vistos where user_id = '00000000-0000-0000-0000-00000007a001'),
  1,
  'A continua com uma linha só (estoque)'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'tours_vistos' and cmd in ('UPDATE', 'DELETE', 'ALL')
      and roles <> array['vini_operador']::name[]),
  0,
  'nenhuma policy de update/delete fora do operador do Vini'
);

select * from finish();
rollback;
