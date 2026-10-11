-- Financeiro V2 (11/10/2026), fatia F3: cartão de crédito com faturas. Fixtures isoladas.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000f3001', 'gestao.cartao@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-cartao', 'Org Cartão', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, financeiro_gerencial_habilitado, financeiro_liberado_equipe) values
  ('uni-cartao', 'org-cartao', 'Cartão', 'banco', true, true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000f3001', 'org-cartao', null, 'gestao', 'ativo');
select public.semear_categorias_financeiras('uni-cartao');
insert into fin_contas_financeiras (id, unidade_id, nome, tipo, dia_fechamento, dia_vencimento) values
  ('00000000-0000-0000-0000-0000000f3a01', 'uni-cartao', 'Banco', 'banco', null, null),
  ('00000000-0000-0000-0000-0000000f3a02', 'uni-cartao', 'Cartão A (fecha 10, vence 20)', 'cartao_credito', 10, 20),
  ('00000000-0000-0000-0000-0000000f3a03', 'uni-cartao', 'Cartão B (fecha 25, vence 5)', 'cartao_credito', 25, 5),
  ('00000000-0000-0000-0000-0000000f3a04', 'uni-cartao', 'Cartão C (fecha 31, vence 10)', 'cartao_credito', 31, 10);

create temp table cat as select (select id from fin_categorias where unidade_id = 'uni-cartao' and codigo_sistema = 'cmc_compras_mercadorias') as merc;
grant select on cat to authenticated;

create function pg_temp.como(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
-- Compra no cartão em N parcelas; devolve o lançamento.
create function pg_temp.compra(p_cartao text, p_data date, p_parcelas numeric[]) returns uuid language plpgsql as $$
declare v_l uuid; v_i int;
begin
  insert into fin_lancamentos (unidade_id, tipo, categoria_id, descricao, data_competencia, conta_financeira_id, criado_por)
  values ('uni-cartao', 'despesa', (select merc from cat), 'Compra', p_data, p_cartao::uuid, '00000000-0000-0000-0000-0000000f3001')
  returning id into v_l;
  for v_i in 1 .. array_length(p_parcelas, 1) loop
    insert into fin_parcelas (unidade_id, lancamento_id, numero, total_parcelas, valor, data_prevista, conta_financeira_id)
    values ('uni-cartao', v_l, v_i, array_length(p_parcelas, 1), p_parcelas[v_i], p_data, p_cartao::uuid);
  end loop;
  return v_l;
end; $$;
create function pg_temp.vencs(p_l uuid) returns text language sql as $$
  select string_agg(data_prevista::text, ',' order by numero) from fin_parcelas where lancamento_id = p_l $$;

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000f3001');

select is(pg_temp.vencs(pg_temp.compra('00000000-0000-0000-0000-0000000f3a02', '2026-10-05', array[100])), '2026-10-20',
  'compra antes do fechamento cai na fatura do mês');
select is(pg_temp.vencs(pg_temp.compra('00000000-0000-0000-0000-0000000f3a02', '2026-10-10', array[100])), '2026-10-20',
  'compra no dia do fechamento ainda entra na fatura do mês');
select is(pg_temp.vencs(pg_temp.compra('00000000-0000-0000-0000-0000000f3a02', '2026-10-11', array[100])), '2026-11-20',
  'compra depois do fechamento vai para a fatura seguinte');
select is(pg_temp.vencs(pg_temp.compra('00000000-0000-0000-0000-0000000f3a03', '2026-10-26', array[100])), '2026-12-05',
  'vencimento antes do fechamento vence no mês seguinte ao fechamento');
select is(pg_temp.vencs(pg_temp.compra('00000000-0000-0000-0000-0000000f3a02', '2026-11-25', array[100, 100, 100])), '2026-12-20,2027-01-20,2027-02-20',
  'parcelada no cartão cai em faturas seguidas, virando o ano');
select is(pg_temp.vencs(pg_temp.compra('00000000-0000-0000-0000-0000000f3a04', '2027-02-15', array[100])), '2027-03-10',
  'fechamento no dia 31 vira 28 em fevereiro');
create temp table c7 as select pg_temp.compra('00000000-0000-0000-0000-0000000f3a02', '2026-10-07', array[50]) as id;
select is((select data_competencia::text || ' ' || (select data_prevista::text from fin_parcelas where lancamento_id = c7.id) from fin_lancamentos, c7 where fin_lancamentos.id = c7.id),
  '2026-10-07 2026-10-20', 'competência é a data da compra e o vencimento é o da fatura');

select throws_ok($$ with l as (
    insert into fin_lancamentos (unidade_id, tipo, categoria_id, descricao, data_competencia, conta_financeira_id, criado_por)
    select 'uni-cartao', 'receita', c.id, 'Venda', '2026-10-05', '00000000-0000-0000-0000-0000000f3a02', '00000000-0000-0000-0000-0000000f3001'
      from fin_categorias c where c.unidade_id = 'uni-cartao' and c.papel_dre = 'receita' limit 1 returning id)
  insert into fin_parcelas (unidade_id, lancamento_id, numero, total_parcelas, valor, data_prevista, conta_financeira_id)
  select 'uni-cartao', l.id, 1, 1, 10, '2026-10-05', '00000000-0000-0000-0000-0000000f3a02' from l $$,
  '23514', null, 'cartão de crédito não recebe receita');

-- Nota rateada no cartão: linha que só tem valor no 2º vencimento cai na 2ª fatura (achado do Codex).
create temp table drat as select public.fin_documento_criar(jsonb_build_object('unidade', 'uni-cartao', 'chave', 'doc-cartao-01',
  'tipo', 'despesa', 'descricao', 'Nota no cartão', 'data_competencia', '2026-10-05',
  'conta_financeira_id', '00000000-0000-0000-0000-0000000f3a03', 'vencimentos', jsonb_build_array('2026-11-05', '2026-12-05'),
  'linhas', jsonb_build_array(
    jsonb_build_object('categoria_id', (select merc from cat), 'valor', 2000, 'celulas', jsonb_build_array(1000, 1000)),
    jsonb_build_object('categoria_id', (select merc from cat), 'valor', 500, 'celulas', jsonb_build_array(0, 500))))) as id;
select is((select pa.data_prevista::text from fin_parcelas pa join fin_lancamentos l on l.id = pa.lancamento_id
  where l.documento_id = (select id from drat) and pa.valor = 5), '2026-12-05', 'célula zero não puxa a parcela para a fatura errada');

-- Pagamento de fatura (outubro do Cartão A: 100 + 100 + 50 = 250,00).
create temp table fat as select id from fin_faturas_cartao where conta_cartao_id = '00000000-0000-0000-0000-0000000f3a02' and referencia = '2026-10-01';
select throws_ok($$ select public.fin_fatura_pagar(jsonb_build_object('unidade', 'uni-cartao', 'fatura_id', (select id from fat),
  'conta_financeira_id', '00000000-0000-0000-0000-0000000f3a02', 'data', '2026-10-20', 'valor', 100, 'chave', 'pag-fatura-0')) $$,
  '23514', null, 'fatura não se paga com o próprio cartão');
select lives_ok($$ select public.fin_fatura_pagar(jsonb_build_object('unidade', 'uni-cartao', 'fatura_id', (select id from fat),
  'conta_financeira_id', '00000000-0000-0000-0000-0000000f3a01', 'data', '2026-10-20', 'valor', 12000, 'chave', 'pag-fatura-1')) $$,
  'paga parte da fatura pela conta do banco');
select is((select string_agg(pa.status, ',' order by l.data_competencia) from fin_parcelas pa join fin_lancamentos l on l.id = pa.lancamento_id
  where pa.fatura_id = (select id from fat)), 'quitado,parcial,aberto', 'pagamento parcial quita do item mais antigo');
select is((select count(*)::int from fin_baixas b join fin_parcelas pa on pa.id = b.parcela_id
  where pa.fatura_id = (select id from fat) and b.conta_financeira_id = '00000000-0000-0000-0000-0000000f3a01'), 2,
  'baixas saem da conta do banco');
select is(public.fin_fatura_pagar(jsonb_build_object('unidade', 'uni-cartao', 'fatura_id', (select id from fat),
  'conta_financeira_id', '00000000-0000-0000-0000-0000000f3a01', 'data', '2026-10-20', 'valor', 12000, 'chave', 'pag-fatura-1')),
  (select id from fin_fatura_pagamentos where chave = 'pag-fatura-1'), 'reenvio do mesmo pagamento não paga duas vezes');
select throws_ok($$ select public.fin_fatura_pagar(jsonb_build_object('unidade', 'uni-cartao', 'fatura_id', (select id from fat),
  'conta_financeira_id', '00000000-0000-0000-0000-0000000f3a01', 'data', '2026-10-20', 'valor', 100, 'chave', 'pag-fatura-1')) $$,
  '23505', null, 'mesma chave com outro valor é recusada');
select throws_ok($$ insert into fin_fatura_pagamentos (unidade_id, fatura_id, conta_financeira_id, valor, data, chave, criado_por)
  values ('uni-cartao', (select id from fat), '00000000-0000-0000-0000-0000000f3a01', 1, '2026-10-20', 'pag-forjado-1', '00000000-0000-0000-0000-0000000f3001') $$,
  '42501', null, 'pagamento não se registra por insert direto');
select throws_ok($$ select public.fin_fatura_pagar(jsonb_build_object('unidade', 'uni-cartao', 'fatura_id', (select id from fat),
  'conta_financeira_id', '00000000-0000-0000-0000-0000000f3a01', 'data', '2026-10-21', 'valor', 13001, 'chave', 'pag-fatura-2')) $$,
  '23514', null, 'pagamento acima do saldo da fatura é recusado');

select throws_ok($$ insert into fin_baixas (unidade_id, parcela_id, tipo, conta_financeira_id, valor, data, criado_por)
  select 'uni-cartao', pa.id, 'baixa', '00000000-0000-0000-0000-0000000f3a02', 1, '2026-10-20', '00000000-0000-0000-0000-0000000f3001'
    from fin_parcelas pa where pa.fatura_id = (select id from fat) and pa.status <> 'quitado' limit 1 $$,
  '23514', null, 'baixa nunca sai da conta do cartão');
select * from finish();
rollback;
