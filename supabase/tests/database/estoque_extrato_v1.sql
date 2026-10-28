-- Extrato do estoque v1 - as garantias que só o banco pode dar.
--
--   1. RLS: lançamentos, extrato e saldos só aparecem para quem alcança a unidade;
--      outra organização e vínculo preso a outra unidade não enxergam nada;
--   2. escrita direta pela Data API é recusada (movimento, recebido, quantidade
--      recebida, último preço pago); lançamento não se edita nem se apaga;
--   3. recebimento: RPC única, reenvio idêntico não faz nada, alteração cancela e
--      regrava, desmarcar só cancela, quantidade em branco = pedida "não conferida",
--      preço ausente = custo nulo, pedido recebido antes desta versão não ganha
--      movimento nem data;
--   4. último preço pago recupera o anterior quando a última compra é cancelada;
--   5. perda com motivo obrigatório (Gestão, Master, Operacional), custo pelo
--      último preço pago; cancelamento só Gestão/Master e só de lançamento manual;
--   6. Operacional desmarcando recebimento fica auditado;
--   7. saldo = última posição elegível + lançamentos desde o dia dela; sem
--      posição (ou quantidade nula) o saldo é nulo, nunca zero;
--   8. versão do pedido: edição de item pela Data API sobe a versão e o
--      recebimento com versão desatualizada é recusado. Concorrência real entre
--      duas sessões não cabe no pgTAP (uma transação só): a garantia vem da
--      trava da linha do pedido, a mesma no gatilho dos itens e na RPC;
--   9. INSERT direto não cria pedido já recebido nem item com quantidade recebida;
--  10. posição usa produto e unidade da época (snapshot / linha gravada): produto
--      recriado não herda contagem, unidade divergente não vira número, unidade
--      de produto com lançamento não muda;
--  11. cobertura por setor exata: SKU sem escopo, setor esperado sem linha ou
--      linha fora do snapshot não viram posição;
--  12. marco do extrato por unidade: contagem anterior a ele fica "sem histórico
--      completo" (sem número).
--
-- Rodar com o Supabase local no ar: `npx supabase test db`. Sem dado real.

begin;

create extension if not exists pgtap with schema extensions;

select plan(94);

-- ── Fixture ──────────────────────────────────────────────────────────────

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-0000000e9101', 'extrato.gestao@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e9102', 'extrato.oper@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e9103', 'extrato.master@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e9104', 'extrato.outra@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e9105', 'extrato.a2@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo)
values ('org-extrato-a', 'Org Extrato A', 'saas', true),
       ('org-extrato-b', 'Org Extrato B', 'saas', true);

insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo)
values ('uni-extrato-a1', 'org-extrato-a', 'A1', 'banco', true),
       ('uni-extrato-a2', 'org-extrato-a', 'A2', 'banco', true),
       ('uni-extrato-b1', 'org-extrato-b', 'B1', 'banco', true);

-- Chave "Contagem por setor" (28/10/2026): as datas por setor do fixture exigem a chave ligada.
update unidades set contagem_por_setor_habilitada = true
where id in ('uni-extrato-a1', 'uni-extrato-a2', 'uni-extrato-b1');

insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
values
  ('00000000-0000-0000-0000-0000000e9101', 'org-extrato-a', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000e9102', 'org-extrato-a', 'uni-extrato-a1', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000e9103', 'org-extrato-a', null, 'master', 'ativo'),
  ('00000000-0000-0000-0000-0000000e9104', 'org-extrato-b', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000e9105', 'org-extrato-a', 'uni-extrato-a2', 'gestao', 'ativo');

insert into produtos (unidade_id, sku, grupo, nome, unidade_base, preco_unitario, ativo)
values
  ('uni-extrato-a1', 'HORLIM001', 'HOR', 'limao', 'KG', 10, true),
  ('uni-extrato-a1', 'BALCER001', 'BAL', 'cerveja', 'UN', 4, true),
  ('uni-extrato-a1', 'MERARR001', 'MER', 'arroz', 'KG', 5, true),
  ('uni-extrato-b1', 'HOROUT001', 'HOR', 'outra unidade', 'KG', 1, true);

insert into pedidos (id, unidade_id, fornecedor, data_contagem_base, criado_por, recebido)
values
  ('00000000-0000-0000-0000-0000000e7001', 'uni-extrato-a1', 'F1', '2026-10-01', '00000000-0000-0000-0000-0000000e9101', false),
  ('00000000-0000-0000-0000-0000000e7002', 'uni-extrato-a1', 'F2', '2026-10-01', '00000000-0000-0000-0000-0000000e9101', false),
  -- recebido antes desta versão: sem recebido_em
  ('00000000-0000-0000-0000-0000000e7003', 'uni-extrato-a1', 'F3', '2026-10-01', '00000000-0000-0000-0000-0000000e9101', true),
  ('00000000-0000-0000-0000-0000000e7004', 'uni-extrato-b1', 'FB', '2026-10-01', '00000000-0000-0000-0000-0000000e9104', false);

insert into pedido_itens (pedido_id, sku, nome, unidade_base, quantidade_pedida, preco_antigo, preco_atualizado, preco_confirmado, vencedor_confirmado)
values
  ('00000000-0000-0000-0000-0000000e7001', 'HORLIM001', 'limao', 'KG', 5, 10, 8, true, true),
  ('00000000-0000-0000-0000-0000000e7001', 'BALCER001', 'cerveja', 'UN', 12, null, null, false, true),
  ('00000000-0000-0000-0000-0000000e7001', 'MERARR001', 'arroz', 'KG', 3, 5, 4, true, false),
  ('00000000-0000-0000-0000-0000000e7002', 'HORLIM001', 'limao', 'KG', 2, 10, 9, true, true),
  ('00000000-0000-0000-0000-0000000e7003', 'HORLIM001', 'limao', 'KG', 1, 10, 7, true, true),
  ('00000000-0000-0000-0000-0000000e7004', 'HOROUT001', 'outra', 'KG', 1, 1, 1, true, true);

-- Contagem legada de ontem: limão 10 KG; cerveja com quantidade nula.
insert into contagens (id, unidade_id, data, mes, modalidade)
values ('00000000-0000-0000-0000-0000000e6001', 'uni-extrato-a1',
        (now() at time zone 'America/Sao_Paulo')::date - 1, 'teste', 'legada');
insert into contagem_itens (contagem_id, sku, grupo, nome, unidade_base, quantidade, preco_unitario, total)
values
  ('00000000-0000-0000-0000-0000000e6001', 'HORLIM001', 'HOR', 'limao', 'KG', 10, 10, 100),
  ('00000000-0000-0000-0000-0000000e6001', 'BALCER001', 'BAL', 'cerveja', 'UN', null, 4, null);

-- Produtos para identidade e unidade históricas. HORNOV001 faz o papel de um
-- produto renomeado: no snapshot antigo ele aparece como HORANT001, e hoje outro
-- produto usa HORANT001. MERNOV001 foi (re)criado depois da contagem de hoje.
insert into produtos (id, unidade_id, sku, grupo, nome, unidade_base, preco_unitario, ativo)
values
  ('00000000-0000-0000-0000-0000000e5001', 'uni-extrato-a1', 'HORNOV001', 'HOR', 'limao renomeado', 'KG', 10, true),
  ('00000000-0000-0000-0000-0000000e5002', 'uni-extrato-a1', 'HORANT001', 'HOR', 'novo com SKU antigo', 'KG', 10, true),
  ('00000000-0000-0000-0000-0000000e5003', 'uni-extrato-a1', 'MERFEI001', 'MER', 'feijao', 'KG', 8, true);
insert into produtos (unidade_id, sku, grupo, nome, unidade_base, preco_unitario, ativo, criado_em)
values ('uni-extrato-a1', 'MERNOV001', 'MER', 'recriado depois', 'KG', 1, true, now() + interval '1 hour');

-- Contagem legada de hoje (a unidade nasceu no banco hoje: marco = hoje).
insert into contagens (id, unidade_id, data, mes, modalidade)
values ('00000000-0000-0000-0000-0000000e6002', 'uni-extrato-a1',
        (now() at time zone 'America/Sao_Paulo')::date, 'teste', 'legada');
insert into contagem_itens (contagem_id, sku, grupo, nome, unidade_base, quantidade, preco_unitario, total)
values
  ('00000000-0000-0000-0000-0000000e6002', 'HORLIM001', 'HOR', 'limao', 'KG', 10, 10, 100),
  ('00000000-0000-0000-0000-0000000e6002', 'MERFEI001', 'MER', 'feijao', 'SC', 3, null, null),
  ('00000000-0000-0000-0000-0000000e6002', 'MERNOV001', 'MER', 'recriado', 'KG', 5, null, null);

-- Contagens por setor (todas concluídas).
insert into setores (id, unidade_id, nome, ordem, ativo)
values
  ('00000000-0000-0000-0000-0000000e4001', 'uni-extrato-a1', 'Bar', 0, true),
  ('00000000-0000-0000-0000-0000000e4002', 'uni-extrato-a1', 'Cozinha', 1, true);

insert into contagens (id, unidade_id, data, mes, modalidade, snapshot_criado_em)
values
  ('00000000-0000-0000-0000-0000000e6003', 'uni-extrato-a1',
   (now() at time zone 'America/Sao_Paulo')::date - 2, 'teste', 'setor', now()),
  ('00000000-0000-0000-0000-0000000e6004', 'uni-extrato-a1',
   (now() at time zone 'America/Sao_Paulo')::date - 3, 'teste', 'setor', now());

insert into contagem_setores (contagem_id, setor_id, situacao)
values
  ('00000000-0000-0000-0000-0000000e6003', '00000000-0000-0000-0000-0000000e4001', 'concluido'),
  ('00000000-0000-0000-0000-0000000e6003', '00000000-0000-0000-0000-0000000e4002', 'concluido'),
  ('00000000-0000-0000-0000-0000000e6004', '00000000-0000-0000-0000-0000000e4001', 'concluido');

-- C1 (anteontem): limão nos dois setores (completo); cerveja esperada só no Bar
-- mas com linha também na Cozinha; arroz esperado nos dois, contado só no Bar;
-- feijão contado sem estar no snapshot.
insert into contagem_escopo (contagem_id, setor_id, sku, produto_id, nome, unidade_base)
select '00000000-0000-0000-0000-0000000e6003'::uuid, s.setor::uuid, p.sku, p.id, p.nome, p.unidade_base
from (values ('00000000-0000-0000-0000-0000000e4001', 'HORLIM001'),
             ('00000000-0000-0000-0000-0000000e4002', 'HORLIM001'),
             ('00000000-0000-0000-0000-0000000e4001', 'BALCER001'),
             ('00000000-0000-0000-0000-0000000e4001', 'MERARR001'),
             ('00000000-0000-0000-0000-0000000e4002', 'MERARR001')) s(setor, sku)
join produtos p on p.unidade_id = 'uni-extrato-a1' and p.sku = s.sku;

insert into contagem_itens (contagem_id, setor_id, sku, nome, unidade_base, quantidade)
values
  ('00000000-0000-0000-0000-0000000e6003', '00000000-0000-0000-0000-0000000e4001', 'HORLIM001', 'limao', 'KG', 3),
  ('00000000-0000-0000-0000-0000000e6003', '00000000-0000-0000-0000-0000000e4002', 'HORLIM001', 'limao', 'KG', 4),
  ('00000000-0000-0000-0000-0000000e6003', '00000000-0000-0000-0000-0000000e4001', 'BALCER001', 'cerveja', 'UN', 5),
  ('00000000-0000-0000-0000-0000000e6003', '00000000-0000-0000-0000-0000000e4002', 'BALCER001', 'cerveja', 'UN', 1),
  ('00000000-0000-0000-0000-0000000e6003', '00000000-0000-0000-0000-0000000e4001', 'MERARR001', 'arroz', 'KG', 2),
  ('00000000-0000-0000-0000-0000000e6003', '00000000-0000-0000-0000-0000000e4001', 'MERFEI001', 'feijao', 'KG', 2);

-- C2 (três dias atrás): o snapshot diz que HORANT001 era o produto ...e5001
-- (hoje HORNOV001); BALOLD001 ficou sem produto_id no snapshot.
insert into contagem_escopo (contagem_id, setor_id, sku, produto_id, nome, unidade_base)
values
  ('00000000-0000-0000-0000-0000000e6004', '00000000-0000-0000-0000-0000000e4001', 'HORANT001',
   '00000000-0000-0000-0000-0000000e5001', 'limao antigo', 'KG'),
  ('00000000-0000-0000-0000-0000000e6004', '00000000-0000-0000-0000-0000000e4001', 'BALOLD001',
   null, 'sem produto', 'UN');
insert into contagem_itens (contagem_id, setor_id, sku, nome, unidade_base, quantidade)
values
  ('00000000-0000-0000-0000-0000000e6004', '00000000-0000-0000-0000-0000000e4001', 'HORANT001', 'limao antigo', 'KG', 9),
  ('00000000-0000-0000-0000-0000000e6004', '00000000-0000-0000-0000-0000000e4001', 'BALOLD001', 'sem produto', 'UN', 1);

-- ── Recebimento (Gestão) ─────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000e9101","role":"authenticated","aal":"aal1"}';

select lives_ok(
  $$select registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7001', true, 'ok',
      '[{"sku":"HORLIM001","quantidade_recebida":5},{"sku":"BALCER001","quantidade_recebida":null}]'::jsonb, (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7001'))$$,
  'Gestão marca o pedido como recebido pela RPC'
);

select is(
  (select count(*)::int from estoque_movimentacoes
   where pedido_id = '00000000-0000-0000-0000-0000000e7001' and cancelado_em is null),
  2,
  'gera uma compra por item com vencedor confirmado (arroz sem vencedor fica de fora)'
);

select results_eq(
  $$select quantidade, custo_unitario, quantidade_conferida from estoque_movimentacoes
    where pedido_id = '00000000-0000-0000-0000-0000000e7001' and sku = 'BALCER001'$$,
  $$values (12::numeric, null::numeric, false)$$,
  'quantidade em branco vira a pedida, marcada não conferida; preço ausente fica nulo, nunca zero'
);

select results_eq(
  $$select recebido, recebido_em is not null, recebido_dia = (now() at time zone 'America/Sao_Paulo')::date
    from pedidos where id = '00000000-0000-0000-0000-0000000e7001'$$,
  $$values (true, true, true)$$,
  'transição para recebido grava instante e dia operacional'
);

select is(
  (select data from estoque_movimentacoes
   where pedido_id = '00000000-0000-0000-0000-0000000e7001' and sku = 'HORLIM001'),
  (now() at time zone 'America/Sao_Paulo')::date,
  'a compra entra no dia operacional do recebimento'
);

select is(
  registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7001', true, 'ok',
    '[{"sku":"HORLIM001","quantidade_recebida":5},{"sku":"BALCER001","quantidade_recebida":null}]'::jsonb, (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7001'))
  - 'pendencias' - 'recebido_dia' - 'recebido' - 'versao_itens',
  '{"gravados":0,"cancelados":0,"ativos":2,"sem_preco":1}'::jsonb,
  'reenvio idêntico não grava nem cancela nada'
);

select is(
  (registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7001', true, 'faltou 1 kg',
    '[{"sku":"HORLIM001","quantidade_recebida":4}]'::jsonb, (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7001')) ->> 'cancelados')::int,
  1,
  'alteração da quantidade cancela o lançamento antigo...'
);

select results_eq(
  $$select count(*)::int, count(*) filter (where cancelado_em is null)::int,
           max(quantidade) filter (where cancelado_em is null),
           max(motivo_cancelamento)
    from estoque_movimentacoes
    where pedido_id = '00000000-0000-0000-0000-0000000e7001' and sku = 'HORLIM001'$$,
  $$values (2, 1, 4::numeric, 'Recebimento alterado'::text)$$,
  '...e regrava um só ativo com a quantidade nova'
);

select is(
  (select ultimo_preco_pago from produtos where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'),
  8::numeric,
  'último preço pago = custo da compra ativa'
);

select lives_ok(
  $$select registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7002', true, null, '[]'::jsonb, (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7002'))$$,
  'segundo pedido recebido'
);

select is(
  (select ultimo_preco_pago from produtos where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'),
  9::numeric,
  'compra mais recente vira o último preço pago'
);

select lives_ok(
  $$select registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7002', false, null, '[]'::jsonb, (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7002'))$$,
  'Gestão desmarca o segundo pedido'
);

select is(
  (select ultimo_preco_pago from produtos where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'),
  8::numeric,
  'cancelar a última compra recupera o preço da anterior'
);

select results_eq(
  $$select count(*) filter (where cancelado_em is null)::int, max(motivo_cancelamento)
    from estoque_movimentacoes where pedido_id = '00000000-0000-0000-0000-0000000e7002'$$,
  $$values (0, 'Recebimento desmarcado'::text)$$,
  'desmarcar só cancela, não recria nada'
);

select results_eq(
  $$select recebido, recebido_em, recebido_dia from pedidos where id = '00000000-0000-0000-0000-0000000e7002'$$,
  $$values (false, null::timestamptz, null::date)$$,
  'desmarcar limpa a data atual (o histórico fica nos lançamentos cancelados)'
);

select is(
  (registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7003', true, 'reenvio', '[]'::jsonb, (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7003')) ->> 'gravados')::int,
  0,
  'pedido recebido antes desta versão não ganha movimento retroativo no reenvio'
);

select results_eq(
  $$select recebido, recebido_em from pedidos where id = '00000000-0000-0000-0000-0000000e7003'$$,
  $$values (true, null::timestamptz)$$,
  'e continua sem data inventada'
);

select throws_ok(
  $$select registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7001', true, null,
      '[{"sku":"HOROUT001","quantidade_recebida":1}]'::jsonb, (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7001'))$$,
  'P0001', NULL,
  'item que não é do pedido é recusado'
);

select throws_ok(
  $$select registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7001', true, null,
      '[{"sku":"HORLIM001","quantidade_recebida":-1}]'::jsonb, (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7001'))$$,
  'P0001', NULL,
  'quantidade negativa é recusada'
);

select throws_ok(
  $$select registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7004', true, null, '[]'::jsonb, 0)$$,
  'P0001', NULL,
  'pedido de outra organização: não encontrado'
);

-- ── Escrita direta recusada (Gestão pela Data API) ───────────────────────

select throws_ok(
  $$insert into estoque_movimentacoes (unidade_id, produto_id, sku, unidade_base, tipo, origem, quantidade, data)
    select 'uni-extrato-a1', id, sku, unidade_base, 'perda', 'manual', 1, current_date
    from produtos where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'$$,
  '42501', NULL,
  'insert direto no extrato é recusado'
);

select throws_ok(
  $$update estoque_movimentacoes set quantidade = 99 where unidade_id = 'uni-extrato-a1'$$,
  '42501', NULL,
  'update direto no extrato é recusado'
);

select throws_ok(
  $$delete from estoque_movimentacoes where unidade_id = 'uni-extrato-a1'$$,
  '42501', NULL,
  'delete direto no extrato é recusado'
);

select throws_ok(
  $$update pedidos set recebido = false where id = '00000000-0000-0000-0000-0000000e7001'$$,
  '42501', NULL,
  'marcar/desmarcar recebido direto é recusado'
);

select throws_ok(
  $$update pedido_itens set quantidade_recebida = 1
    where pedido_id = '00000000-0000-0000-0000-0000000e7001' and sku = 'HORLIM001'$$,
  '42501', NULL,
  'quantidade recebida direta é recusada'
);

select throws_ok(
  $$update pedido_itens set preco_atualizado = 1
    where pedido_id = '00000000-0000-0000-0000-0000000e7001' and sku = 'HORLIM001'$$,
  'P0001', NULL,
  'preço de item já lançado no extrato não muda sem desmarcar o recebimento'
);

select lives_ok(
  $$update pedido_itens set preco_atualizado = 5
    where pedido_id = '00000000-0000-0000-0000-0000000e7001' and sku = 'MERARR001'$$,
  'item sem lançamento ativo continua editável'
);

select throws_ok(
  $$update produtos set ultimo_preco_pago = 1 where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'$$,
  '42501', NULL,
  'último preço pago não se grava direto'
);

select throws_ok(
  $$select excluir_produto_estoque('uni-extrato-a1', 'HORLIM001')$$,
  'P0001', NULL,
  'produto com lançamento não é excluído (orienta desativar)'
);

-- ── Versão do pedido (P1 concorrência) ───────────────────────────────────
-- Duas sessões ao mesmo tempo não cabem aqui: a garantia vem da trava da linha
-- do pedido (gatilho dos itens e RPC usam a mesma). Aqui: a versão sobe na
-- edição e o recebimento com a versão velha é recusado.

select throws_ok(
  $$select registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7001', true, null, '[]'::jsonb,
      (select versao_itens - 1 from pedidos where id = '00000000-0000-0000-0000-0000000e7001'))$$,
  'P0001', NULL,
  'recebimento com versão desatualizada é recusado'
);

select throws_ok(
  $$select registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7001', true, null, '[]'::jsonb, null)$$,
  'P0001', NULL,
  'recebimento sem versão é recusado'
);

reset role;
create temporary table versao_antes as
  select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7001';
grant select on versao_antes to authenticated;
set local role authenticated;

select lives_ok(
  $$update pedido_itens set nome = 'arroz tipo 1'
    where pedido_id = '00000000-0000-0000-0000-0000000e7001' and sku = 'MERARR001'$$,
  'Gestão edita item sem lançamento pela Data API'
);

select is(
  (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7001'),
  (select versao_itens + 1 from versao_antes),
  'editar item sobe a versão do pedido (o gatilho trava o pedido antes de olhar o extrato)'
);

select throws_ok(
  $$select registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7001', true, 'faltou 1 kg', '[]'::jsonb,
      (select versao_itens from versao_antes))$$,
  'P0001', NULL,
  'tela que leu o pedido antes da edição não grava o recebimento'
);

select throws_ok(
  $$update pedidos set versao_itens = 0 where id = '00000000-0000-0000-0000-0000000e7001'$$,
  '42501', NULL,
  'versão do pedido não se grava direto'
);

select is(
  (registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7001', true, 'faltou 1 kg', '[]'::jsonb,
     (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7001')) ->> 'versao_itens')::int,
  (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7001'),
  'reenvio idêntico não sobe a versão (não desatualiza outra tela à toa)'
);

select is(
  (registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7001', true, 'faltou 1 kg.', '[]'::jsonb,
     (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7001')) ->> 'versao_itens')::int,
  (select versao_itens + 1 from pedidos where id = '00000000-0000-0000-0000-0000000e7001'),
  'recebimento que muda algo sobe a versão'
);

-- ── INSERT direto (P1 escrita direta) ────────────────────────────────────

select throws_ok(
  $$insert into pedidos (unidade_id, fornecedor, data_contagem_base, criado_por, recebido, recebido_em, recebido_dia)
    values ('uni-extrato-a1', 'FX', '2026-10-02', '00000000-0000-0000-0000-0000000e9101', true,
            '2026-01-01 10:00-03', '2026-01-01')$$,
  '42501', NULL,
  'pedido não nasce recebido com data escolhida pela Data API'
);

select throws_ok(
  $$insert into pedidos (unidade_id, fornecedor, data_contagem_base, criado_por, versao_itens)
    values ('uni-extrato-a1', 'FX', '2026-10-02', '00000000-0000-0000-0000-0000000e9101', 7)$$,
  '42501', NULL,
  'pedido não nasce com versão escolhida'
);

select lives_ok(
  $$insert into pedidos (id, unidade_id, fornecedor, data_contagem_base, criado_por)
    values ('00000000-0000-0000-0000-0000000e7005', 'uni-extrato-a1', 'FX', '2026-10-02',
            '00000000-0000-0000-0000-0000000e9101')$$,
  'pedido como o app cria (não recebido) continua passando'
);

select throws_ok(
  $$insert into pedido_itens (pedido_id, sku, nome, unidade_base, quantidade_pedida, quantidade_recebida, vencedor_confirmado)
    values ('00000000-0000-0000-0000-0000000e7005', 'HORLIM001', 'limao', 'KG', 1, 1, true)$$,
  '42501', NULL,
  'item não nasce com quantidade recebida'
);

select lives_ok(
  $$insert into pedido_itens (pedido_id, sku, nome, unidade_base, quantidade_pedida, preco_antigo, vencedor_confirmado)
    values ('00000000-0000-0000-0000-0000000e7005', 'HORLIM001', 'limao', 'KG', 1, 10, true)$$,
  'item como o app cria continua passando'
);

select is(
  (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7005'),
  1,
  'item novo sobe a versão do pedido'
);

-- ── Identidade e unidade da época (P1) ───────────────────────────────────

select throws_ok(
  $$update produtos set unidade_base = 'G' where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'$$,
  'P0001', NULL,
  'unidade de produto com lançamento no extrato não muda'
);

select lives_ok(
  $$update produtos set unidade_base = 'SC' where unidade_id = 'uni-extrato-a1' and sku = 'MERARR001'$$,
  'produto sem lançamento continua podendo mudar de unidade'
);

select results_eq(
  $$select produto_id, sku, unidade_base, quantidade from estoque_posicoes
    where contagem_id = '00000000-0000-0000-0000-0000000e6004'$$,
  $$values ('00000000-0000-0000-0000-0000000e5001'::uuid, 'HORANT001'::text, 'KG'::text, 9::numeric)$$,
  'posição por setor vai para o produto do snapshot; SKU sem produto no snapshot fica de fora'
);

select is(
  (select data_posicao from estoque_saldos where unidade_id = 'uni-extrato-a1' and sku = 'HORANT001'),
  null::date,
  'produto que hoje usa o mesmo SKU não herda a contagem do outro'
);

select results_eq(
  $$select data_posicao, saldo, situacao_saldo from estoque_saldos
    where unidade_id = 'uni-extrato-a1' and sku = 'MERNOV001'$$,
  $$values (null::date, null::numeric, 'sem_posicao'::text)$$,
  'contagem legada não passa para produto criado depois da linha'
);

select results_eq(
  $$select quantidade_posicao, unidade_posicao, saldo, situacao_saldo from estoque_saldos
    where unidade_id = 'uni-extrato-a1' and sku = 'MERFEI001'$$,
  $$values (3::numeric, 'SC'::text, null::numeric, 'unidade_divergente'::text)$$,
  'contagem em SC com cadastro em KG: unidade divergente, sem número'
);

-- ── Cobertura por setor (P1) ─────────────────────────────────────────────

select results_eq(
  $$select quantidade from estoque_posicoes
    where contagem_id = '00000000-0000-0000-0000-0000000e6003' and sku = 'HORLIM001'$$,
  $$values (7::numeric)$$,
  'SKU contado exatamente nos setores do snapshot vira posição (3 + 4)'
);

select is(
  (select count(*)::int from estoque_posicoes
   where contagem_id = '00000000-0000-0000-0000-0000000e6003' and sku = 'BALCER001'),
  0,
  'linha fora do snapshot (cerveja na Cozinha) derruba a posição: não soma'
);

select is(
  (select count(*)::int from estoque_posicoes
   where contagem_id = '00000000-0000-0000-0000-0000000e6003' and sku = 'MERARR001'),
  0,
  'setor esperado sem linha: sem posição'
);

select is(
  (select count(*)::int from estoque_posicoes
   where contagem_id = '00000000-0000-0000-0000-0000000e6003' and sku = 'MERFEI001'),
  0,
  'SKU sem escopo no snapshot: sem posição'
);

-- ── Operacional: desmarca (auditado) e registra perda ────────────────────

set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000e9102","role":"authenticated","aal":"aal1"}';

select lives_ok(
  $$select registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7001', false, null, '[]'::jsonb, (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7001'))$$,
  'Operacional pode desmarcar o recebimento (exceção)'
);

select is(
  (select count(*)::int from estoque_movimentacoes
   where pedido_id = '00000000-0000-0000-0000-0000000e7001' and cancelado_em is null),
  0,
  'desmarcar pelo Operacional cancela as compras'
);

select is(
  (select ultimo_preco_pago from produtos where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'),
  null::numeric,
  'sem compra válida, último preço pago fica nulo'
);

select lives_ok(
  $$select registrar_recebimento_pedido('00000000-0000-0000-0000-0000000e7001', true, null, '[]'::jsonb, (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000e7001'))$$,
  'Operacional marca recebido de novo'
);

select results_eq(
  $$select count(*) filter (where cancelado_em is null)::int,
           max(quantidade) filter (where cancelado_em is null and sku = 'HORLIM001')
    from estoque_movimentacoes where pedido_id = '00000000-0000-0000-0000-0000000e7001'$$,
  $$values (2, 4::numeric)$$,
  'nova transição regrava as compras com a quantidade conferida'
);

select lives_ok(
  $$select registrar_perda_estoque('uni-extrato-a1',
      (select id from produtos where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'),
      1, (now() at time zone 'America/Sao_Paulo')::date, 'vencido', null)$$,
  'Operacional registra perda'
);

select results_eq(
  $$select tipo, origem, quantidade, custo_unitario, motivo, criado_por
    from estoque_movimentacoes where unidade_id = 'uni-extrato-a1' and tipo = 'perda'$$,
  $$values ('perda'::text, 'manual'::text, 1::numeric, 8::numeric, 'vencido'::text,
            '00000000-0000-0000-0000-0000000e9102'::uuid)$$,
  'custo da perda = último preço pago, autor gravado'
);

select throws_ok(
  $$select registrar_perda_estoque('uni-extrato-a1',
      (select id from produtos where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'),
      1, (now() at time zone 'America/Sao_Paulo')::date, 'furto', null)$$,
  'P0001', NULL,
  'motivo fora da lista é recusado'
);

select throws_ok(
  $$select registrar_perda_estoque('uni-extrato-a1',
      (select id from produtos where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'),
      1, (now() at time zone 'America/Sao_Paulo')::date, 'outro', '  ')$$,
  'P0001', NULL,
  '"outro" sem descrição é recusado'
);

select throws_ok(
  $$select registrar_perda_estoque('uni-extrato-a1',
      (select id from produtos where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'),
      0, (now() at time zone 'America/Sao_Paulo')::date, 'quebra', null)$$,
  'P0001', NULL,
  'quantidade zero é recusada'
);

select throws_ok(
  $$select registrar_perda_estoque('uni-extrato-a1',
      (select id from produtos where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'),
      1, (now() at time zone 'America/Sao_Paulo')::date + 1, 'quebra', null)$$,
  'P0001', NULL,
  'perda no futuro é recusada'
);

select throws_ok(
  $$select cancelar_movimentacao_estoque(
      (select id from estoque_movimentacoes where unidade_id = 'uni-extrato-a1' and tipo = 'perda'),
      'lancei errado')$$,
  '42501', NULL,
  'Operacional não cancela lançamento manual'
);

select ok(
  (select count(*) > 0 from estoque_movimentacoes where unidade_id = 'uni-extrato-a1'),
  'Operacional da unidade lê o extrato'
);

-- ── Outra organização e outra unidade ────────────────────────────────────

set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000e9104","role":"authenticated","aal":"aal1"}';

select is(
  (select count(*)::int from estoque_movimentacoes where unidade_id = 'uni-extrato-a1'),
  0,
  'Gestão de outra organização não vê os lançamentos'
);

select is(
  (select count(*)::int from estoque_extrato_linhas where unidade_id = 'uni-extrato-a1')
  + (select count(*)::int from estoque_saldos where unidade_id = 'uni-extrato-a1'),
  0,
  'nem o extrato nem os saldos'
);

select throws_ok(
  $$select registrar_perda_estoque('uni-extrato-a1',
      (select '00000000-0000-0000-0000-000000000000'::uuid),
      1, (now() at time zone 'America/Sao_Paulo')::date, 'vencido', null)$$,
  '42501', NULL,
  'Gestão de outra organização não registra perda'
);

set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000e9105","role":"authenticated","aal":"aal1"}';

select is(
  (select count(*)::int from estoque_movimentacoes where unidade_id = 'uni-extrato-a1')
  + (select count(*)::int from estoque_extrato_linhas where unidade_id = 'uni-extrato-a1'),
  0,
  'vínculo preso a outra unidade da mesma organização não vê a unidade A1'
);

-- ── Gestão: perdas e cancelamento ────────────────────────────────────────

set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000e9101","role":"authenticated","aal":"aal1"}';

reset role;
create temporary table ids_produto_b as
  select id from produtos where unidade_id = 'uni-extrato-b1' and sku = 'HOROUT001';
grant select on ids_produto_b to authenticated;
set local role authenticated;

select throws_ok(
  $$select registrar_perda_estoque('uni-extrato-a1', (select id from ids_produto_b),
      1, (now() at time zone 'America/Sao_Paulo')::date, 'vencido', null)$$,
  'P0001', NULL,
  'produto de outra unidade não entra na perda'
);

select throws_ok(
  $$select cancelar_movimentacao_estoque(
      (select id from estoque_movimentacoes where unidade_id = 'uni-extrato-a1' and tipo = 'perda'), 'x')$$,
  'P0001', NULL,
  'cancelamento exige motivo'
);

select lives_ok(
  $$select cancelar_movimentacao_estoque(
      (select id from estoque_movimentacoes where unidade_id = 'uni-extrato-a1' and tipo = 'perda'),
      'contagem mostrou que não perdeu')$$,
  'Gestão cancela a perda com motivo'
);

select results_eq(
  $$select cancelado_por, motivo_cancelamento from estoque_movimentacoes
    where unidade_id = 'uni-extrato-a1' and tipo = 'perda'$$,
  $$values ('00000000-0000-0000-0000-0000000e9101'::uuid, 'contagem mostrou que não perdeu'::text)$$,
  'cancelamento guarda quem e por quê'
);

select throws_ok(
  $$select cancelar_movimentacao_estoque(
      (select id from estoque_movimentacoes where unidade_id = 'uni-extrato-a1' and tipo = 'perda'),
      'de novo, por engano')$$,
  'P0001', NULL,
  'lançamento já cancelado não cancela de novo'
);

select throws_ok(
  $$select cancelar_movimentacao_estoque(
      (select id from estoque_movimentacoes
       where pedido_id = '00000000-0000-0000-0000-0000000e7001' and cancelado_em is null and sku = 'HORLIM001'),
      'tentando cancelar compra')$$,
  'P0001', NULL,
  'compra de recebimento não se cancela por aqui (só desmarcando o recebimento)'
);

select lives_ok(
  $$select registrar_perda_estoque('uni-extrato-a1',
      (select id from produtos where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'),
      2, (now() at time zone 'America/Sao_Paulo')::date, 'outro', 'caiu no chão')$$,
  'Gestão registra perda "outro" com descrição'
);

-- ── Master (aal2) ─────────────────────────────────────────────────────────

set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000e9103","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $$select cancelar_movimentacao_estoque(
      registrar_perda_estoque('uni-extrato-a1',
        (select id from produtos where unidade_id = 'uni-extrato-a1' and sku = 'BALCER001'),
        1, (now() at time zone 'America/Sao_Paulo')::date, 'quebra', null),
      'teste do master')$$,
  'Master registra e cancela perda'
);

select is(
  (select custo_unitario from estoque_movimentacoes
   where unidade_id = 'uni-extrato-a1' and tipo = 'perda' and sku = 'BALCER001'),
  null::numeric,
  'perda de item sem compra com preço fica com custo desconhecido, nunca zero'
);

-- ── Saldo e extrato ──────────────────────────────────────────────────────

set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000e9101","role":"authenticated","aal":"aal1"}';

select results_eq(
  $$select data_posicao, quantidade_posicao, entradas, saidas, saldo, situacao_saldo from estoque_saldos
    where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'$$,
  $$values ((now() at time zone 'America/Sao_Paulo')::date, 10::numeric, 4::numeric, 2::numeric,
            12::numeric, 'calculado'::text)$$,
  'saldo = posição de hoje 10 + compra 4 − perda ativa 2 (cancelada não conta)'
);

select results_eq(
  $$select data_posicao, saldo, entradas from estoque_saldos
    where unidade_id = 'uni-extrato-a1' and sku = 'BALCER001'$$,
  $$values (null::date, null::numeric, 0::numeric)$$,
  'quantidade nula na contagem não vira posição: saldo indeterminado, nunca zero'
);

select results_eq(
  $$select tipo, quantidade, valor from estoque_extrato_linhas
    where unidade_id = 'uni-extrato-a1' and natureza = 'posicao'
      and data = (now() at time zone 'America/Sao_Paulo')::date - 1$$,
  $$values ('posicao'::text, 10::numeric, 100::numeric)$$,
  'contagem elegível aparece no extrato como posição (só o SKU com quantidade conhecida)'
);

select is(
  (select count(*)::int from estoque_extrato_linhas
   where unidade_id = 'uni-extrato-a1' and natureza = 'movimento'),
  (select count(*)::int from estoque_movimentacoes where unidade_id = 'uni-extrato-a1'),
  'todo lançamento (inclusive cancelado) aparece no extrato'
);

-- ── Auditoria e imutabilidade (como dono) ────────────────────────────────

reset role;

select results_eq(
  $$select user_id, dados_novos ->> 'papel' from logs_auditoria
    where entidade = 'pedido' and acao = 'desmarcar_recebimento'
      and entidade_id = '00000000-0000-0000-0000-0000000e7001'$$,
  $$values ('00000000-0000-0000-0000-0000000e9102'::uuid, 'operacional'::text)$$,
  'desmarcar pelo Operacional fica auditado'
);

select is(
  (select count(*)::int from logs_auditoria
   where acao = 'desmarcar_recebimento' and unidade_id = 'uni-extrato-a1'),
  2,
  'todo desmarcar fica auditado (Gestão e Operacional)'
);

select throws_ok(
  $$update estoque_movimentacoes set quantidade = 99 where unidade_id = 'uni-extrato-a1'$$,
  '42501', NULL,
  'nem o dono edita lançamento'
);

select throws_ok(
  $$delete from estoque_movimentacoes where unidade_id = 'uni-extrato-a1'$$,
  '42501', NULL,
  'nem o dono apaga lançamento'
);

select throws_ok(
  $$update estoque_movimentacoes set cancelado_em = null, cancelado_por = null, motivo_cancelamento = null
    where unidade_id = 'uni-extrato-a1' and cancelado_em is not null$$,
  '42501', NULL,
  'cancelamento não se desfaz'
);

select is(
  (select count(*)::int from (
     select pedido_item_id from estoque_movimentacoes
     where cancelado_em is null and pedido_item_id is not null
     group by pedido_item_id having count(*) > 1) d),
  0,
  'nunca há dois lançamentos ativos para o mesmo item de pedido'
);

-- ── Marco do extrato (P1 histórico completo) ────────────────────────────

select is(
  (select inicio_dia from estoque_extrato_inicio where unidade_id = 'uni-extrato-a1'),
  (now() at time zone 'America/Sao_Paulo')::date,
  'unidade criada já no banco começa o extrato no dia da criação'
);

update unidades set fonte_dados_estoque = 'planilha' where id = 'uni-extrato-a1';

select is(
  (select inicio_dia from estoque_extrato_inicio where unidade_id = 'uni-extrato-a1'),
  null::date,
  'unidade que sai do banco perde o marco'
);

select results_eq(
  $$select quantidade_posicao, saldo, situacao_saldo from estoque_saldos
    where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'$$,
  $$values (10::numeric, null::numeric, 'sem_historico_completo'::text)$$,
  'sem marco: a posição continua visível, o saldo fica sem número'
);

update unidades set fonte_dados_estoque = 'banco' where id = 'uni-extrato-a1';

select is(
  (select inicio_dia from estoque_extrato_inicio where unidade_id = 'uni-extrato-a1'),
  (now() at time zone 'America/Sao_Paulo')::date + 1,
  'unidade que volta ao banco recomeça no dia seguinte'
);

select results_eq(
  $$select saldo, situacao_saldo, inicio_extrato from estoque_saldos
    where unidade_id = 'uni-extrato-a1' and sku = 'HORLIM001'$$,
  $$values (null::numeric, 'sem_historico_completo'::text,
            (now() at time zone 'America/Sao_Paulo')::date + 1)$$,
  'contagem anterior ao marco: sem histórico completo, sem número'
);

select * from finish();
rollback;
