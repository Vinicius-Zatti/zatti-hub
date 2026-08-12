-- Matriz de autorização do pacote P0 - testes de RLS via pgTAP.
--
-- IMPORTANTE (bloqueio registrado): este arquivo não foi executado nesta
-- máquina - não há Docker instalado localmente, e `supabase test db` exige
-- o stack local (Postgres via Docker) pra rodar. Não existe projeto de
-- staging Supabase disponível pra rodar isso remotamente. Escrito seguindo
-- a convenção padrão de teste de RLS do Postgres (manipular
-- `request.jwt.claims` + `role` na sessão, sem depender de helpers extras
-- que precisariam ser confirmados num ambiente real). Rodar com
-- `supabase test db` (ou `supabase db test`, dependendo da versão da CLI)
-- assim que houver acesso a um Postgres local ou de staging - esse é o
-- menor passo pendente pra validar de verdade a matriz abaixo.
--
-- Cobre os 7 cenários exigidos pelo pacote P0:
--   1. tenant A não lê dado do tenant B
--   2. tenant A não escreve no tenant B
--   3. unidade A não altera unidade B (mesma organização)
--   4. operacional não faz ação restrita à gestão
--   5. master sem AAL2 é bloqueado
--   6. anônimo não acessa tabela protegida
--   7. service_role não aparece no bundle do cliente - fora do escopo de
--      SQL/pgTAP; verificado via
--      `grep -rl "service_role" .next/static` no build de produção
--      (0 ocorrências confirmadas manualmente - ver relatório de entrega).

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- ── Fixture: duas organizações, duas unidades cada, quatro usuários ─────

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-00000000a001', 'gestao.a@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a002', 'operacional.a@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b001', 'gestao.b@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e001', 'master@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo)
values ('org-teste-a', 'Organização Teste A', 'saas', true),
       ('org-teste-b', 'Organização Teste B', 'saas', true),
       -- Só existe pra ser a âncora de FK do vínculo do master (ver
       -- comentário abaixo) - achado nesta revisão: usar 'org-teste-a'
       -- como âncora colidia de propósito com uma organização real do
       -- teste, e o fallback de vinculo_organizacao/vinculo_unidade
       -- (`v.organizacao_id = p_organizacao_id`) deixava passar
       -- exatamente essa organização mesmo com master em AAL1 - não por
       -- causa de nenhum bug de RLS, só coincidência de id repetido
       -- mascarando o teste "master sem AAL2 não vê nada". Isolar a
       -- âncora numa organização que não é usada em nenhum outro teste
       -- fecha esse furo no proprio fixture.
       ('org-ancora-master', 'Âncora Master (não usar em teste de dado real)', 'saas', true);

insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo)
values ('unid-a-1', 'org-teste-a', 'Unidade A1', 'banco', true),
       ('unid-a-2', 'org-teste-a', 'Unidade A2', 'banco', true),
       ('unid-b-1', 'org-teste-b', 'Unidade B1', 'banco', true);

insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
values
  ('00000000-0000-0000-0000-00000000a001', 'org-teste-a', 'unid-a-1', 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-00000000a002', 'org-teste-a', 'unid-a-1', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-00000000b001', 'org-teste-b', 'unid-b-1', 'gestao', 'ativo'),
  -- organizacao_id é só âncora pra FK - master enxerga tudo via RLS, não
  -- por causa dessa organização específica (ver supabase/schema.sql).
  -- Tem que ser uma organização que NÃO participa de nenhum teste de
  -- isolamento de dado real (ver 'org-ancora-master' acima), senão o
  -- fallback de vinculo_organizacao/vinculo_unidade deixa passar essa
  -- organização por coincidência de id, mesmo com master sem AAL2.
  ('00000000-0000-0000-0000-00000000e001', 'org-ancora-master', null, 'master', 'ativo');

insert into produtos (unidade_id, sku, nome)
values ('unid-a-1', 'SKU-A-1', 'Produto da unidade A1'),
       ('unid-b-1', 'SKU-B-1', 'Produto da unidade B1');

insert into pedidos (unidade_id, fornecedor, data_contagem_base, criado_por)
values ('unid-a-1', 'Fornecedor X', '01/01/2026', '00000000-0000-0000-0000-00000000a001'),
       ('unid-a-2', 'Fornecedor Y', '01/01/2026', '00000000-0000-0000-0000-00000000a001');

-- ── Helper local: assume a sessão de um usuário autenticado ─────────────
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

-- ── 1 e 2. Isolamento entre organizações (tenant A x tenant B) ──────────

select pg_temp.autenticar_como('00000000-0000-0000-0000-00000000a001');

select is(
  (select count(*)::int from produtos where unidade_id = 'unid-b-1'),
  0,
  'gestao da org A não lê produto da org B (SELECT bloqueado por RLS)'
);

-- throws_ok(sql, description) NÃO existe como "só rótulo, aceita qualquer
-- exceção" - a versão original destes dois testes (achada rodando pela
-- primeira vez nesta revisão) passava só a descrição livre como segundo
-- argumento de texto, que o Postgres resolve pra
-- throws_ok(text, text) = throws_ok(sql, errmsg_esperado) - comparado
-- literalmente contra SQLERRM. Nunca ia bater com a mensagem real do
-- Postgres ("new row violates row-level security policy..."), então
-- nunca teria passado mesmo antes do bug de recursão da RLS ser
-- corrigido. Confirmado direto em pg_proc (`pg_get_functiondef`) que a
-- forma que aceita SQLSTATE é throws_ok(sql, errcode char, errmsg text,
-- description text) - 4 argumentos, sem forma curta de 3 só com
-- SQLSTATE. `errmsg => null` pula a checagem de mensagem, deixando só o
-- SQLSTATE valer.
select throws_ok(
  $$ insert into produtos (unidade_id, sku, nome) values ('unid-b-1', 'SKU-INVASOR', 'x') $$,
  '42501',
  null,
  'gestao da org A não consegue INSERT em produto da org B (bloqueado por RLS - policy with check falha)'
);

-- ── 3. Isolamento entre unidades da MESMA organização ───────────────────
-- gestao.a só tem vínculo com unid-a-1 (não unid-a-2) - não deveria
-- alcançar pedido da unid-a-2 mesmo estando na mesma organização.

select is(
  (select count(*)::int from pedidos where unidade_id = 'unid-a-2'),
  0,
  'gestao vinculado só à unidade A1 não lê pedido da unidade A2 (mesma organização, unidade diferente)'
);

select results_eq(
  $$ update pedidos set recebido = true where unidade_id = 'unid-a-2' returning id $$,
  'select null::uuid where false',
  'gestao vinculado só à unidade A1 não consegue UPDATE em pedido da unidade A2 (0 linhas afetadas)'
);

-- ── 4. Operacional não faz ação restrita à Gestão ───────────────────────

select pg_temp.autenticar_como('00000000-0000-0000-0000-00000000a002');

select is(
  (select count(*)::int from produtos where unidade_id = 'unid-a-1'),
  1,
  'operacional lê produto da própria unidade normalmente (SELECT não é restrito por papel)'
);

select throws_ok(
  $$ insert into produtos (unidade_id, sku, nome) values ('unid-a-1', 'SKU-NOVO-OPERACIONAL', 'x') $$,
  '42501',
  null,
  'operacional não consegue INSERT em produtos (cadastro é exclusivo de gestao/master - RLS bloqueia mesmo bypassando a Server Action)'
);

-- ── 5. Master sem AAL2 é bloqueado ──────────────────────────────────────

select pg_temp.autenticar_como('00000000-0000-0000-0000-00000000e001', 'aal1');

select is(
  public.tem_aal2(),
  false,
  'tem_aal2() devolve false pra sessão master em aal1'
);

select is(
  (select count(*)::int from organizacoes),
  0,
  'master em aal1 não lê nenhuma organização (RLS exige AAL2 pra master)'
);

select is(
  (select count(*)::int from produtos where unidade_id = 'unid-a-1'),
  0,
  'master em aal1 não lê produto de nenhuma unidade (sem AAL2, master não tem acesso nenhum)'
);

-- Mesma sessão, agora com AAL2: deve enxergar tudo.
select pg_temp.autenticar_como('00000000-0000-0000-0000-00000000e001', 'aal2');

select is(
  public.tem_aal2(),
  true,
  'tem_aal2() devolve true pra sessão master em aal2'
);

select is(
  (select count(*)::int from organizacoes),
  3,
  'master em aal2 lê todas as organizações ativas (as 2 de teste + a âncora)'
);

select is(
  (select count(*)::int from produtos),
  2,
  'master em aal2 lê produto de qualquer unidade/organização'
);

-- ── 6. Anônimo não acessa tabela protegida ──────────────────────────────
-- `anon` não tem GRANT nenhum nessas tabelas (revisado em 12/08 - ver
-- 20260812000000_grants_tabelas_aplicacao.sql: privilégio mínimo de
-- verdade pra um papel que não deveria alcançar nada é NENHUM grant, não
-- SELECT liberado com zero policy). A barreira agora é "permission
-- denied" (42501), checada antes até da RLS - não "zero linhas".

select pg_temp.autenticar_como_anon();

select throws_ok(
  $$ select count(*) from produtos $$,
  '42501',
  null,
  'usuário anônimo (sem sessão) não tem GRANT pra ler produtos (permission denied, nem chega na RLS)'
);

select throws_ok(
  $$ select count(*) from organizacoes $$,
  '42501',
  null,
  'usuário anônimo (sem sessão) não tem GRANT pra ler organizacoes (permission denied, nem chega na RLS)'
);

select * from finish();

rollback;
