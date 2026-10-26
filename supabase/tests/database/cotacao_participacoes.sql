-- Participação do fornecedor por cotação (parecer do Codex de 24/10/2026, ponto 3).
--   1. item que entra no pedido registra a participação (pelo gatilho, como Gestão);
--   2. o vencedor apagar o item do concorrente não apaga a participação;
--   3. com ela, o desfazer recria o item no avulso que a tela não conhece mais;
--   4. leitura só da própria unidade; ninguém grava na tabela direto.
-- Sem dado real - fixtures isoladas.

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-0000000f8001', 'gestao.participacao@teste.local', 'x', now(),
        'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo)
values ('org-part', 'Organização da participação', 'saas', true),
       ('org-part-outra', 'Outra organização', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo)
values ('uni-part', 'org-part', 'Unidade da participação', 'banco', true),
       ('uni-part-outra', 'org-part-outra', 'Outra unidade', 'banco', true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
values ('00000000-0000-0000-0000-0000000f8001', 'org-part', null, 'gestao', 'ativo');

-- Pedido de outra unidade, gravado fora da sessão: participação existe, mas é invisível.
insert into pedidos (id, unidade_id, fornecedor, data_contagem_base, criado_por)
values ('00000000-0000-0000-0000-0000000f8101', 'uni-part-outra', 'JM', '24/10/2026',
        '00000000-0000-0000-0000-0000000f8001');
insert into pedido_itens (pedido_id, sku, nome, unidade_base, quantidade_pedida)
values ('00000000-0000-0000-0000-0000000f8101', 'PROCDB001', 'costela', 'KG', 1);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000f8001","role":"authenticated","aal":"aal2"}';

-- JM (no Cadastro) e Bahia (avulso do "+ Adicionar item", fora das 4 vagas) cotam a costela.
insert into pedidos (id, unidade_id, fornecedor, data_contagem_base, criado_por)
values ('00000000-0000-0000-0000-0000000f8201', 'uni-part', 'JM', '24/10/2026', '00000000-0000-0000-0000-0000000f8001'),
       ('00000000-0000-0000-0000-0000000f8202', 'uni-part', 'Bahia', '24/10/2026', '00000000-0000-0000-0000-0000000f8001');
insert into pedido_itens (pedido_id, sku, nome, unidade_base, quantidade_pedida, preco_antigo)
values ('00000000-0000-0000-0000-0000000f8201', 'PROCDB001', 'costela', 'KG', 12, 23.5),
       ('00000000-0000-0000-0000-0000000f8202', 'PROCDB001', 'costela', 'KG', 12, 23.5);

select results_eq(
  $$select fornecedor from cotacao_participacoes where unidade_id = 'uni-part' order by fornecedor$$,
  $$values ('Bahia'::text), ('JM'::text)$$,
  'item que entra no pedido registra a participação do fornecedor');

-- Segundo item igual no mesmo pedido (SKU repetido existe em produção) não quebra.
select lives_ok(
  $$insert into pedido_itens (pedido_id, sku, nome, unidade_base, quantidade_pedida)
    values ('00000000-0000-0000-0000-0000000f8202', 'PROCDB001', 'costela', 'KG', 12)$$,
  'SKU repetido no pedido não duplica nem recusa a participação');
delete from pedido_itens
where id = (select id from pedido_itens where pedido_id = '00000000-0000-0000-0000-0000000f8202' order by id desc limit 1);

-- Confirmar JM como vencedor: o item sai do pedido da Bahia (como `confirmarVencedor`).
update pedido_itens set vencedor_confirmado = true
where pedido_id = '00000000-0000-0000-0000-0000000f8201' and sku = 'PROCDB001';
delete from pedido_itens where pedido_id = '00000000-0000-0000-0000-0000000f8202' and sku = 'PROCDB001';

select is(
  (select count(*)::int from pedido_itens where pedido_id = '00000000-0000-0000-0000-0000000f8202'),
  0, 'o concorrente que perdeu fica sem o item');
select ok(
  exists (select 1 from cotacao_participacoes
          where unidade_id = 'uni-part' and fornecedor = 'Bahia' and sku = 'PROCDB001'),
  'a participação da Bahia continua depois do vencedor');

-- O desfazer recebe a lista que o app monta com a participação (a tela recarregada só mandaria []).
select lives_ok(
  $$select desfazer_vencedor_pedido('uni-part', '24/10/2026', 'JM',
      array(select fornecedor from cotacao_participacoes
            where unidade_id = 'uni-part' and data_contagem_base = '24/10/2026'
              and sku = 'PROCDB001' and fornecedor <> 'JM'),
      'PROCDB001', 'costela', '', 'KG', 12, 23.5)$$,
  'desfazer com os participantes roda');
select results_eq(
  $$select quantidade_pedida, preco_confirmado from pedido_itens
    where pedido_id = '00000000-0000-0000-0000-0000000f8202' and sku = 'PROCDB001'$$,
  $$values (12::numeric, false)$$,
  'o avulso volta com o item, quantidade igual e preço a confirmar');
select is(
  (select vencedor_confirmado from pedido_itens
   where pedido_id = '00000000-0000-0000-0000-0000000f8201' and sku = 'PROCDB001'),
  false, 'o vencedor fica desmarcado');

select is(
  (select count(*)::int from cotacao_participacoes where unidade_id = 'uni-part-outra'),
  0, 'participação de outra unidade é invisível (RLS)');

select throws_ok(
  $$insert into cotacao_participacoes (unidade_id, data_contagem_base, fornecedor, sku)
    values ('uni-part', '24/10/2026', 'Ceasa', 'PROCDB001')$$,
  '42501', NULL,
  'o app não grava participação direto');
select throws_ok(
  $$delete from cotacao_participacoes where unidade_id = 'uni-part'$$,
  '42501', NULL,
  'nem apaga participação');

select * from finish();
rollback;
