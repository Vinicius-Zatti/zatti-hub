-- Painel de Acessos - fronteira de autorização real.
--
-- Prova a premissa que o painel inteiro assume: `organizacoes`, `unidades`,
-- `vinculos` e `perfis` não têm NENHUMA policy de RLS de escrita (ver
-- comentário em supabase/schema.sql: "inserts, convites e revogações são
-- feitos direto no painel do Supabase... nunca pelo app"). Isso significa
-- que `requireMaster()` em cada Server Action de
-- src/app/(app)/acessos/actions.ts não é um checkpoint a mais - é a ÚNICA
-- barreira que existe. Escondê-lo do menu (ver comentário em
-- src/app/(app)/layout.tsx) não conta como segurança nenhuma: mesmo um
-- master de verdade, autenticado, sem passar pelo service role, não
-- consegue escrever nessas quatro tabelas - só o client
-- `src/lib/supabase/admin.ts` (service role, sempre atrás de
-- `requireMaster()`) consegue.
--
-- Sem dado real de cliente - só fixtures de teste, mesmo padrão da suíte
-- de RLS da branch de segurança (organizações/usuários fake, isolados por
-- um id de âncora que não aparece em nenhum teste de dado real).

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- Grant mínimo que produção já tem hoje (aplicado pelo painel do Supabase
-- quando a tabela é criada pela UI) - concedido aqui manualmente porque
-- este banco local foi montado só com `supabase/migrations/*.sql`, que
-- nunca inclui GRANT (mesma lacuna documentada na branch de segurança).
-- Sem isso, o teste bloquearia por "permission denied" (falta de GRANT)
-- em vez do que realmente queremos provar (falta de policy de RLS) - e as
-- duas causas têm o mesmo SQLSTATE (42501), então a distinção importa.
grant select, insert, update on organizacoes, unidades, vinculos, perfis to authenticated;

-- ── Fixture ──────────────────────────────────────────────────────────────

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-00000000f001', 'master.teste@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo)
values ('org-ancora-teste', 'Organização Âncora de Teste', 'saas', true);

insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
values ('00000000-0000-0000-0000-00000000f001', 'org-ancora-teste', null, 'master', 'ativo');

create or replace function pg_temp.autenticar_como(p_user_id uuid)
returns void
language sql
as $$
  select set_config('role', 'authenticated', true);
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
$$;

select pg_temp.autenticar_como('00000000-0000-0000-0000-00000000f001');

-- ── Leitura funciona (RLS já concede isso pra master hoje) ──────────────

select is(
  (select count(*)::int from organizacoes where id = 'org-ancora-teste'),
  1,
  'master autenticado lê a própria organização normalmente (RLS de SELECT já existe)'
);

-- ── Escrita direta (sem passar pelo service role) falha nas 4 tabelas ───
-- Mesmo com GRANT de tabela concedido acima e sendo master de verdade -
-- zero policy de INSERT/UPDATE nessas tabelas, RLS nega tudo por padrão.

select throws_ok(
  $$ insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-invasora', 'x', 'saas', true) $$,
  '42501',
  null,
  'master autenticado NÃO consegue INSERT direto em organizacoes (sem RLS policy de escrita - só o service role, atrás de requireMaster(), consegue)'
);

select throws_ok(
  $$ insert into unidades (id, organizacao_id, nome) values ('unid-invasora', 'org-ancora-teste', 'x') $$,
  '42501',
  null,
  'master autenticado NÃO consegue INSERT direto em unidades'
);

select throws_ok(
  $$ insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
     values ('00000000-0000-0000-0000-00000000f001', 'org-ancora-teste', null, 'gestao', 'ativo') $$,
  '42501',
  null,
  'master autenticado NÃO consegue INSERT direto em vinculos (nem pra si mesmo)'
);

select throws_ok(
  $$ insert into perfis (id, nome) values ('00000000-0000-0000-0000-00000000f001', 'x') $$,
  '42501',
  null,
  'master autenticado NÃO consegue INSERT direto em perfis'
);

-- UPDATE sem policy própria não lança exceção (diferente de INSERT/WITH
-- CHECK) - a cláusula USING implícita nega tudo, e a linha simplesmente
-- não é encontrada pra atualizar. 0 linhas afetadas é o sinal correto
-- aqui, não uma exceção 42501 (achado rodando este teste pela primeira
-- vez - `throws_ok` não é a asserção certa pra UPDATE bloqueado por RLS).
select results_eq(
  $$ update organizacoes set ativo = false where id = 'org-ancora-teste' returning id $$,
  'select null::text where false',
  'master autenticado NÃO consegue UPDATE direto em organizacoes (RLS sem policy de UPDATE = 0 linhas afetadas, não exceção)'
);

-- ── O caminho que o painel usa (service role = dono da tabela, dentro
--    deste teste) funciona - é exatamente o que src/lib/supabase/admin.ts
--    faz em produção, sempre atrás de requireMaster(). ───────────────────

reset role;
reset request.jwt.claims;

select lives_ok(
  $$ insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-via-admin', 'Via Admin', 'saas', true) $$,
  'o caminho "sem RLS" (equivalente ao service role) consegue escrever - prova que a barreira real está na aplicação (requireMaster()), não numa trava de banco que bloqueia todo mundo'
);

select is(
  (select count(*)::int from organizacoes where id = 'org-via-admin'),
  1,
  'a organização criada pelo caminho "sem RLS" existe de verdade'
);

select * from finish();

rollback;
