-- Extrato do estoque v1 - rodada 2 do Codex: pedido recebido não aceita item
-- que geraria compra sem passar por um novo recebimento.
--
--   1. pedido recebido recusa item novo, item movido de outro pedido, confirmar
--      vencedor e corrigir SKU de item pendente (o que o tornaria elegível);
--   2. nome e preço de item sem vencedor continuam editáveis;
--   3. pedido não recebido continua aceitando item novo e vencedor;
--   4. desmarcar, alterar e receber de novo lança as compras que faltavam.
--
-- Rodar com o Supabase local no ar: `npx supabase test db`. Sem dado real.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- ── Fixture ──────────────────────────────────────────────────────────────

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-0000000e9201', 'extrato.r2@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo)
values ('org-extrato-r2', 'Org Extrato R2', 'saas', true);

insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo)
values ('uni-extrato-r2', 'org-extrato-r2', 'R2', 'banco', true);

insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
values ('00000000-0000-0000-0000-0000000e9201', 'org-extrato-r2', null, 'gestao', 'ativo');

insert into produtos (unidade_id, sku, grupo, nome, unidade_base, preco_unitario, ativo)
values
  ('uni-extrato-r2', 'HORLIM001', 'HOR', 'limao', 'KG', 10, true),
  ('uni-extrato-r2', 'BALCER001', 'BAL', 'cerveja', 'UN', 4, true),
  ('uni-extrato-r2', 'MERARR001', 'MER', 'arroz', 'KG', 5, true),
  ('uni-extrato-r2', 'MERFEI001', 'MER', 'feijao', 'KG', 8, true);

insert into pedidos (id, unidade_id, fornecedor, data_contagem_base, criado_por, recebido)
values
  ('00000000-0000-0000-0000-0000000e7201', 'uni-extrato-r2', 'F1', '2026-10-01', '00000000-0000-0000-0000-0000000e9201', false),
  ('00000000-0000-0000-0000-0000000e7202', 'uni-extrato-r2', 'F2', '2026-10-01', '00000000-0000-0000-0000-0000000e9201', false);

-- F1: limão com vencedor; cerveja sem vencedor; SKU sem cadastro com vencedor
-- (vira pendência no recebimento). F2 fica aberto.
insert into pedido_itens (pedido_id, sku, nome, unidade_base, quantidade_pedida, preco_antigo, preco_atualizado, preco_confirmado, vencedor_confirmado)
values
  ('00000000-0000-0000-0000-0000000e7201', 'HORLIM001', 'limao', 'KG', 5, 10, 8, true, true),
  ('00000000-0000-0000-0000-0000000e7201', 'BALCER001', 'cerveja', 'UN', 12, 4, 4, true, false),
  ('00000000-0000-0000-0000-0000000e7201', 'SEMCAD001', 'feijao digitado errado', 'KG', 2, 8, 8, true, true),
  ('00000000-0000-0000-0000-0000000e7202', 'MERFEI001', 'feijao', 'KG', 1, 8, 8, true, false);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000e9201","role":"authenticated","aal":"aal1"}';

select is(
  (registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7201', true, null, '[]'::jsonb,
     (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7201')) ->> 'gravados')::int,
  1,
  'recebimento lança só o limão (cerveja sem vencedor, SKU sem cadastro fica pendente)'
);

-- ── Pedido recebido ──────────────────────────────────────────────────────

select throws_ok(
  $$insert into pedido_itens (pedido_id, sku, nome, unidade_base, quantidade_pedida, preco_antigo, vencedor_confirmado)
    values ('00000000-0000-0000-0000-0000000e7201', 'MERARR001', 'arroz', 'KG', 3, 5, true)$$,
  'P0001', NULL,
  'item novo em pedido recebido é recusado'
);

select throws_ok(
  $$insert into pedido_itens (pedido_id, sku, nome, unidade_base, quantidade_pedida, preco_antigo, vencedor_confirmado)
    values ('00000000-0000-0000-0000-0000000e7201', 'MERARR001', 'arroz', 'KG', 3, 5, false)$$,
  'P0001', NULL,
  'mesmo sem vencedor, item novo em pedido recebido é recusado'
);

select throws_ok(
  $$update pedido_itens set vencedor_confirmado = true
    where pedido_id = '00000000-0000-0000-0000-0000000e7201' and sku = 'BALCER001'$$,
  'P0001', NULL,
  'confirmar vencedor em pedido recebido é recusado'
);

select throws_ok(
  $$update pedido_itens set sku = 'MERFEI001'
    where pedido_id = '00000000-0000-0000-0000-0000000e7201' and sku = 'SEMCAD001'$$,
  'P0001', NULL,
  'corrigir o SKU de item pendente (que o tornaria elegível) em pedido recebido é recusado'
);

select throws_ok(
  $$update pedido_itens set pedido_id = '00000000-0000-0000-0000-0000000e7201'
    where pedido_id = '00000000-0000-0000-0000-0000000e7202' and sku = 'MERFEI001'$$,
  'P0001', NULL,
  'mover item para pedido recebido é recusado'
);

select lives_ok(
  $$update pedido_itens set nome = 'cerveja lata', preco_atualizado = 5
    where pedido_id = '00000000-0000-0000-0000-0000000e7201' and sku = 'BALCER001'$$,
  'nome e preço de item sem vencedor continuam editáveis em pedido recebido'
);

-- ── Pedido não recebido ──────────────────────────────────────────────────

select lives_ok(
  $$insert into pedido_itens (pedido_id, sku, nome, unidade_base, quantidade_pedida, preco_antigo, vencedor_confirmado)
    values ('00000000-0000-0000-0000-0000000e7202', 'MERARR001', 'arroz', 'KG', 3, 5, false)$$,
  'item novo em pedido não recebido continua passando'
);

select lives_ok(
  $$update pedido_itens set vencedor_confirmado = true, quantidade_pedida = 4
    where pedido_id = '00000000-0000-0000-0000-0000000e7202' and sku = 'MERARR001'$$,
  'confirmar vencedor e mudar quantidade em pedido não recebido continua passando'
);

-- ── Desmarcar, alterar, receber de novo ──────────────────────────────────

select lives_ok(
  $$select registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7201', false, null, '[]'::jsonb,
      (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7201'))$$,
  'Gestão desmarca o recebimento'
);

select lives_ok(
  $$update pedido_itens set vencedor_confirmado = true
    where pedido_id = '00000000-0000-0000-0000-0000000e7201' and sku = 'BALCER001'$$,
  'com o pedido desmarcado, confirmar vencedor passa'
);

select lives_ok(
  $$insert into pedido_itens (pedido_id, sku, nome, unidade_base, quantidade_pedida, preco_antigo, vencedor_confirmado)
    values ('00000000-0000-0000-0000-0000000e7201', 'MERARR001', 'arroz', 'KG', 3, 5, true)$$,
  'com o pedido desmarcado, item novo passa'
);

select is(
  (registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7201', true, null, '[]'::jsonb,
     (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7201')) ->> 'gravados')::int,
  3,
  'receber de novo lança limão, cerveja e arroz'
);

select results_eq(
  $$select sku, quantidade, custo_unitario from estoque_movimentacoes
    where pedido_id = '00000000-0000-0000-0000-0000000e7201' and cancelado_em is null
    order by sku$$,
  $$values ('BALCER001'::text, 12::numeric, 5::numeric),
           ('HORLIM001'::text, 5::numeric, 8::numeric),
           ('MERARR001'::text, 3::numeric, 5::numeric)$$,
  'o extrato fica completo com os itens alterados'
);

select * from finish();
rollback;
