-- Edição de Dados grava só os campos alterados (parecer do Codex de 26/10/2026).
--   1. cenário do Codex: grade carregada, a cotação liga um fornecedor pela RPC, a grade salva
--      outro campo e o vínculo continua;
--   2. nome de compra e valores nulos gravam quando vêm em `campos`;
--   3. produto ausente ou de outra unidade recusa o lote inteiro;
--   4. velocidade: 300 produtos pela função x o upsert da linha inteira de antes.
-- Sem dado real - fixtures isoladas.

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-0000000f9001', 'gestao.campos@teste.local', 'x', now(),
        'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo)
values ('org-campos', 'Organização dos campos', 'saas', true),
       ('org-campos-outra', 'Outra organização', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo)
values ('uni-campos', 'org-campos', 'Unidade dos campos', 'banco', true),
       ('uni-campos-outra', 'org-campos-outra', 'Outra unidade', 'banco', true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
values ('00000000-0000-0000-0000-0000000f9001', 'org-campos', null, 'gestao', 'ativo');

insert into produtos (unidade_id, sku, grupo, nome, preco_unitario, fornecedor_1, fornecedor_2)
values ('uni-campos', 'HORTOM001', 'HOR', 'tomate', 10, 'Ceasa', ''),
       ('uni-campos-outra', 'HORALH001', 'HOR', 'alho', 7, '', '');
insert into produtos (unidade_id, sku, grupo, nome, preco_unitario)
select 'uni-campos', 'MERVEL' || lpad(g::text, 3, '0'), 'MER', 'item ' || g, g
from generate_series(1, 300) g;

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000f9001","role":"authenticated","aal":"aal2"}';

-- 1. A grade carregou o tomate com a vaga 2 vazia. A cotação liga a JM depois.
select is(vincular_fornecedor_produto('uni-campos', 'HORTOM001', 'JM'), 'fornecedor_2',
  'a cotação liga a JM depois de a grade carregar');
-- A grade salva só o que a pessoa mudou (nome e nome de compra padrão).
select lives_ok(
  $$select salvar_produtos_campos('uni-campos',
      '[{"sku": "HORTOM001", "campos": {"nome": "tomate italiano", "nome_compra": "tomate italiano"}}]'::jsonb)$$,
  'a grade salva outro campo');
select results_eq(
  $$select nome, nome_compra, fornecedor_1, fornecedor_2, preco_unitario
    from produtos where unidade_id = 'uni-campos' and sku = 'HORTOM001'$$,
  $$values ('tomate italiano'::text, 'tomate italiano'::text, 'Ceasa'::text, 'JM'::text, 10::numeric)$$,
  'o vínculo da cotação continua; só nome e nome de compra mudaram');

-- 2. Valor nulo e campo de fornecedor mudados de propósito gravam.
select lives_ok(
  $$select salvar_produtos_campos('uni-campos',
      '[{"sku": "HORTOM001", "campos": {"preco_unitario": null, "fornecedor_1": "", "ativo": false}}]'::jsonb)$$,
  'nulo, vaga limpa e inativo de propósito');
select results_eq(
  $$select preco_unitario, fornecedor_1, fornecedor_2, ativo
    from produtos where unidade_id = 'uni-campos' and sku = 'HORTOM001'$$,
  $$values (null::numeric, ''::text, 'JM'::text, false)$$,
  'grava exatamente os campos enviados');

-- 3. Lote com um produto que não existe: recusa e não grava nenhum.
select throws_ok(
  $$select salvar_produtos_campos('uni-campos',
      '[{"sku": "MERVEL001", "campos": {"nome": "mudou"}}, {"sku": "NAOEXISTE", "campos": {"nome": "x"}}]'::jsonb)$$,
  'P0001', NULL,
  'produto ausente recusa o lote');
select is((select nome from produtos where unidade_id = 'uni-campos' and sku = 'MERVEL001'), 'item 1',
  'e nada do lote é gravado');
select throws_ok(
  $$select salvar_produtos_campos('uni-campos-outra', '[{"sku": "HORALH001", "campos": {"nome": "x"}}]'::jsonb)$$,
  'P0001', NULL,
  'produto de unidade sem acesso fica invisível (RLS) e recusa');

-- 4. Velocidade: Salvar todos com 300 produtos, como antes (upsert da linha inteira) e agora.
do $$
declare
  t0 timestamptz;
  v_rodada int;
begin
  -- Duas rodadas de cada; vale a segunda (a primeira paga cache frio).
  for v_rodada in 1..2 loop
    t0 := clock_timestamp();
    insert into public.produtos (unidade_id, sku, grupo, nome, preco_unitario, fornecedor_1, fornecedor_2,
                                 fornecedor_3, fornecedor_4, observacoes, ativo, atualizado_em)
    select 'uni-campos', 'MERVEL' || lpad(g::text, 3, '0'), 'MER', 'item a ' || g, g + 1, '', '', '', '', '', true, now()
    from generate_series(1, 300) g
    on conflict (unidade_id, sku) do update
    set grupo = excluded.grupo, nome = excluded.nome, preco_unitario = excluded.preco_unitario,
        fornecedor_1 = excluded.fornecedor_1, fornecedor_2 = excluded.fornecedor_2,
        fornecedor_3 = excluded.fornecedor_3, fornecedor_4 = excluded.fornecedor_4,
        observacoes = excluded.observacoes, ativo = excluded.ativo, atualizado_em = excluded.atualizado_em;
    perform set_config('teste.ms_upsert', (extract(epoch from clock_timestamp() - t0) * 1000)::text, true);

    t0 := clock_timestamp();
    perform public.salvar_produtos_campos('uni-campos', (
      select jsonb_agg(jsonb_build_object('sku', 'MERVEL' || lpad(g::text, 3, '0'),
                                          'campos', jsonb_build_object('nome', 'item b ' || g, 'preco_unitario', g + 2)))
      from generate_series(1, 300) g));
    perform set_config('teste.ms_funcao', (extract(epoch from clock_timestamp() - t0) * 1000)::text, true);
  end loop;
end;
$$;

select diag('300 produtos: upsert da linha inteira ' || round(current_setting('teste.ms_upsert')::numeric, 1)
  || ' ms; salvar_produtos_campos ' || round(current_setting('teste.ms_funcao')::numeric, 1) || ' ms');
select is((select count(*)::int from produtos where unidade_id = 'uni-campos' and nome like 'item b %'), 300,
  'os 300 produtos são gravados numa chamada');
select ok(current_setting('teste.ms_funcao')::numeric <= 1.5 * current_setting('teste.ms_upsert')::numeric + 20,
  'a função não fica mais lenta que o upsert de antes (margem de ruído)');

select * from finish();
rollback;
