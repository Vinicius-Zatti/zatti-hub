-- Extrato do estoque: chave por unidade (decisão 7 de Vinícius, 13/10/2026).
-- Prova: a chave nasce desligada (inclusive em unidade nova), ninguém liga pela
-- Data API (unidades não tem policy de escrita), e o recebimento continua gravando
-- a compra no extrato com a chave desligada (nada se perde até ligar).

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- ── Coluna ───────────────────────────────────────────────────────────────
select has_column('public', 'unidades', 'extrato_estoque_habilitado', 'unidades tem a chave do extrato');
select col_not_null('public', 'unidades', 'extrato_estoque_habilitado', 'a chave nunca fica nula');
select col_default_is('public', 'unidades', 'extrato_estoque_habilitado', 'false', 'padrão desligada');

-- ── Fixture ──────────────────────────────────────────────────────────────
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000c9101', 'chave.gestao@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-chave-a', 'Org Chave A', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo)
  values ('uni-chave-a1', 'org-chave-a', 'Chave A1', 'banco', true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
  values ('00000000-0000-0000-0000-0000000c9101', 'org-chave-a', null, 'gestao', 'ativo');
insert into produtos (unidade_id, sku, grupo, nome, unidade_base, preco_unitario, ativo)
  values ('uni-chave-a1', 'HORLIM001', 'HOR', 'limao', 'KG', 10, true);
insert into pedidos (id, unidade_id, fornecedor, data_contagem_base, criado_por, recebido)
  values ('00000000-0000-0000-0000-0000000c7001', 'uni-chave-a1', 'F1', '2026-10-13', '00000000-0000-0000-0000-0000000c9101', false);
insert into pedido_itens (pedido_id, sku, nome, unidade_base, quantidade_pedida, preco_antigo, preco_atualizado, preco_confirmado, vencedor_confirmado)
  values ('00000000-0000-0000-0000-0000000c7001', 'HORLIM001', 'limao', 'KG', 5, 10, 8, true, true);

select is((select extrato_estoque_habilitado from unidades where id = 'uni-chave-a1'), false,
  'unidade nova nasce com o extrato desligado');

-- ── Data API não liga a chave ────────────────────────────────────────────
-- Sem policy de escrita em unidades: o update ou afeta 0 linhas ou é recusado.
-- Nos dois casos a chave continua desligada.
create or replace function pg_temp.tentar_ligar() returns text language plpgsql as $$
begin
  update public.unidades set extrato_estoque_habilitado = true where id = 'uni-chave-a1';
  return 'ok';
exception when others then
  return sqlstate;
end $$;

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000c9101","role":"authenticated","aal":"aal1"}';

select ok(pg_temp.tentar_ligar() is not null, 'gestão tenta ligar pela Data API');

reset role;
select is((select extrato_estoque_habilitado from unidades where id = 'uni-chave-a1'), false,
  'gestão não liga a chave pela Data API');

-- ── Recebimento continua gravando com a chave desligada ──────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000c9101","role":"authenticated","aal":"aal1"}';

select lives_ok(
  $$select registrar_recebimento_pedido('00000000-0000-0000-0000-0000000c7001', true, null,
      '[{"sku":"HORLIM001","quantidade_recebida":5}]'::jsonb,
      (select versao_itens from pedidos where id = '00000000-0000-0000-0000-0000000c7001'))$$,
  'recebimento passa com a chave desligada');

select is(
  (select count(*)::int from estoque_movimentacoes
    where pedido_id = '00000000-0000-0000-0000-0000000c7001' and cancelado_em is null and tipo = 'compra'),
  1,
  'a compra entra no extrato em segundo plano mesmo com a chave desligada');

reset role;
select * from finish();
rollback;
