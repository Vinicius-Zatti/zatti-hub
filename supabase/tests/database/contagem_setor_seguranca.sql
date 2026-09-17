-- Contagem por setor - as garantias que só o banco pode dar.
--
-- A aplicação valida tudo isto antes, com mensagem boa. O que se prova aqui é
-- o que sobra quando alguém chama a Data API direto, ou quando dois setores
-- clicam "Iniciar contagem" no mesmo segundo:
--   1. produto de uma unidade não se vincula a setor de outra;
--   2. "Bar", "bar" e " Bar " são o mesmo setor;
--   3. o snapshot de escopo é congelado na abertura e não muda depois;
--   4. abrir a mesma data duas vezes não cria duas contagens nem dois
--      snapshots (idempotência);
--   5. reenviar um setor substitui aquele setor inteiro e não encosta nos
--      outros;
--   6. o mesmo SKU não se repete dentro do mesmo setor na mesma contagem.
--
-- Rodar com o Supabase local no ar: `npx supabase db test`.
-- Sem dado real - fixtures isoladas por um id de âncora de teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

-- ── Fixture ──────────────────────────────────────────────────────────────

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-0000000c9001', 'setor.master@teste.local', 'x', now(),
        'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo)
values ('org-ancora-setor', 'Organização Âncora do Setor', 'saas', true);

insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo)
values
  ('uni-ancora-setor-a', 'org-ancora-setor', 'Unidade A', 'banco', true),
  ('uni-ancora-setor-b', 'org-ancora-setor', 'Unidade B', 'banco', true);

insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
values ('00000000-0000-0000-0000-0000000c9001', 'org-ancora-setor', null, 'master', 'ativo');

insert into produtos (unidade_id, sku, grupo, nome, unidade_base, ativo)
values
  ('uni-ancora-setor-a', 'HORLTA001', 'HOR', 'limao tahiti', 'KG', true),
  ('uni-ancora-setor-a', 'BALCER001', 'BAL', 'cerveja', 'UN', true),
  ('uni-ancora-setor-a', 'MERARR001', 'MER', 'arroz branco', 'KG', true),
  ('uni-ancora-setor-a', 'MERSEM001', 'MER', 'produto sem setor', 'KG', true),
  ('uni-ancora-setor-b', 'HOROUT001', 'HOR', 'produto de outra unidade', 'KG', true);

insert into setores (id, unidade_id, nome, ordem, ativo)
values
  ('00000000-0000-0000-0000-0000000c1001', 'uni-ancora-setor-a', 'Bar', 0, true),
  ('00000000-0000-0000-0000-0000000c1002', 'uni-ancora-setor-a', 'Cozinha', 1, true),
  ('00000000-0000-0000-0000-0000000c1003', 'uni-ancora-setor-b', 'Bar da outra', 0, true);

-- Limão nos dois setores, cerveja só no bar, arroz só na cozinha e um
-- produto de propósito sem setor nenhum.
insert into produto_setores (produto_id, setor_id, unidade_id)
select p.id, s.id, 'uni-ancora-setor-a'
from produtos p
join setores s on s.unidade_id = 'uni-ancora-setor-a'
where p.unidade_id = 'uni-ancora-setor-a'
  and (
    (p.sku = 'HORLTA001')
    or (p.sku = 'BALCER001' and s.nome = 'Bar')
    or (p.sku = 'MERARR001' and s.nome = 'Cozinha')
  );

-- ── 1. Unidade cruzada ───────────────────────────────────────────────────

select throws_ok(
  $$insert into produto_setores (produto_id, setor_id, unidade_id)
    select p.id, '00000000-0000-0000-0000-0000000c1003', 'uni-ancora-setor-a'
    from produtos p where p.unidade_id = 'uni-ancora-setor-a' and p.sku = 'HORLTA001'$$,
  '23503',
  NULL,
  'produto da unidade A não se vincula a setor da unidade B'
);

-- ── 2. Nome único ignorando caixa e espaço ───────────────────────────────

select throws_ok(
  $$insert into setores (unidade_id, nome, ordem, ativo)
    values ('uni-ancora-setor-a', '  bar ', 0, true)$$,
  '23505',
  NULL,
  '"  bar " colide com "Bar" na mesma unidade'
);

select lives_ok(
  $$insert into setores (unidade_id, nome, ordem, ativo)
    values ('uni-ancora-setor-b', 'Bar', 0, true)$$,
  'o mesmo nome em OUTRA unidade é permitido'
);

-- ── 3 e 4. Abertura: snapshot congelado e idempotente ────────────────────

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000c9001","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $$select abrir_contagem_setor('uni-ancora-setor-a', date '2026-09-17', 'setembro 2026')$$,
  'abrir_contagem_setor roda pro usuário com acesso à unidade'
);

select is(
  (select count(*)::int from contagem_escopo e
   join contagens c on c.id = e.contagem_id
   where c.unidade_id = 'uni-ancora-setor-a'),
  4,
  'snapshot tem 4 linhas: limão nos 2 setores, cerveja no bar, arroz na cozinha'
);

select is(
  (select count(*)::int from contagem_escopo e
   join contagens c on c.id = e.contagem_id
   where c.unidade_id = 'uni-ancora-setor-a' and e.sku = 'MERSEM001'),
  0,
  'produto sem setor não entra no snapshot - e por isso não entra em contagem nenhuma'
);

select is(
  (select count(*)::int from contagem_setores cs
   join contagens c on c.id = cs.contagem_id
   where c.unidade_id = 'uni-ancora-setor-a' and cs.situacao = 'pendente'),
  2,
  'os dois setores com produto nascem pendentes'
);

-- Designação nova DEPOIS da abertura não pode mudar a contagem já aberta.
insert into produto_setores (produto_id, setor_id, unidade_id)
select p.id, '00000000-0000-0000-0000-0000000c1002', 'uni-ancora-setor-a'
from produtos p where p.unidade_id = 'uni-ancora-setor-a' and p.sku = 'MERSEM001';

select lives_ok(
  $$select abrir_contagem_setor('uni-ancora-setor-a', date '2026-09-17', 'setembro 2026')$$,
  'abrir a mesma data de novo não estoura'
);

select is(
  (select count(*)::int from contagens where unidade_id = 'uni-ancora-setor-a'),
  1,
  'abrir duas vezes gera UMA contagem'
);

select is(
  (select count(*)::int from contagem_escopo e
   join contagens c on c.id = e.contagem_id
   where c.unidade_id = 'uni-ancora-setor-a'),
  4,
  'o snapshot continua com 4 linhas: designar produto depois não mexe na contagem aberta'
);

-- ── 5. Reenvio substitui o setor inteiro ─────────────────────────────────

select substituir_contagem_setor(
  (select id from contagens where unidade_id = 'uni-ancora-setor-a'),
  '00000000-0000-0000-0000-0000000c1001',
  '[{"sku":"HORLTA001","quantidade":2,"nome":"limao tahiti","unidade_base":"KG"},
    {"sku":"BALCER001","quantidade":10,"nome":"cerveja","unidade_base":"UN"}]'::jsonb
);

select substituir_contagem_setor(
  (select id from contagens where unidade_id = 'uni-ancora-setor-a'),
  '00000000-0000-0000-0000-0000000c1002',
  '[{"sku":"HORLTA001","quantidade":4,"nome":"limao tahiti","unidade_base":"KG"}]'::jsonb
);

-- Reenvio do bar sem a cerveja: ela tem que sumir, e a cozinha tem que ficar
-- intacta.
select substituir_contagem_setor(
  (select id from contagens where unidade_id = 'uni-ancora-setor-a'),
  '00000000-0000-0000-0000-0000000c1001',
  '[{"sku":"HORLTA001","quantidade":3,"nome":"limao tahiti","unidade_base":"KG"}]'::jsonb
);

select results_eq(
  $$select ci.sku, ci.quantidade::numeric, s.nome
    from contagem_itens ci
    join setores s on s.id = ci.setor_id
    join contagens c on c.id = ci.contagem_id
    where c.unidade_id = 'uni-ancora-setor-a'
    order by s.nome, ci.sku$$,
  $$values ('HORLTA001', 3::numeric, 'Bar'), ('HORLTA001', 4::numeric, 'Cozinha')$$,
  'reenvio do bar apagou a cerveja e preservou a cozinha - soma do limão vira 7'
);

-- ── 6. Mesmo SKU não se repete dentro do setor ───────────────────────────

select throws_ok(
  $$insert into contagem_itens (contagem_id, setor_id, sku, quantidade)
    select c.id, '00000000-0000-0000-0000-0000000c1001', 'HORLTA001', 9
    from contagens c where c.unidade_id = 'uni-ancora-setor-a'$$,
  '23505',
  NULL,
  'o mesmo SKU não entra duas vezes pelo mesmo setor na mesma contagem'
);

select * from finish();
rollback;
