-- Compra do app com cadastro automático (15/10/2026) - fronteira no banco.
-- Prova: escopo novo do token; registro por pagamento ilegível para anon e authenticated;
-- reserva só pelo service role, uma tentativa por vez, retomada depois de falha ou de reserva
-- abandonada e revisão manual depois de 6 tentativas. Só fixtures de teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

-- ── Token do escopo 'provisionamento' ───────────────────────────────────
insert into public.fin_integracao_tokens (escopo, versao, hash)
values ('provisionamento', 1, encode(extensions.digest(convert_to(repeat('p', 40), 'UTF8'), 'sha256'), 'hex'));
select ok(public.fin_integracao_token_valido(repeat('p', 40), 'provisionamento'), 'token do escopo provisionamento vale');
select ok(not public.fin_integracao_token_valido(repeat('p', 40), 'garante'), 'e não vale em outro escopo');

-- ── Ninguém do app lê nem reserva ───────────────────────────────────────
select ok(not has_table_privilege('anon', 'public.zh_provisionamentos', 'select'), 'anon não lê');
select ok(not has_table_privilege('authenticated', 'public.zh_provisionamentos', 'select'), 'authenticated não lê');
select ok(not has_function_privilege('authenticated', 'public.zh_provisionamento_reservar(jsonb)', 'execute'), 'authenticated não reserva');
select ok(not has_function_privilege('anon', 'public.zh_provisionamento_reservar(jsonb)', 'execute'), 'anon não reserva');
select ok(has_function_privilege('service_role', 'public.zh_provisionamento_reservar(jsonb)', 'execute'), 'service role reserva');

-- ── Reserva ─────────────────────────────────────────────────────────────
create temp table pedido as select jsonb_build_object(
  'pagamento_id', '9001', 'email', ' Joana@Exemplo.com ', 'nome', 'Joana Teste', 'whatsapp', '+5531999991111',
  'restaurante', 'Burger da Joana', 'valor', 718.8, 'lead_site_id', 'lead-1') as p;

select is((public.zh_provisionamento_reservar((select p from pedido)))->>'acao', 'executar', 'primeira chamada executa');
select is((select email from public.zh_provisionamentos where pagamento_id = '9001'), 'joana@exemplo.com', 'e-mail gravado em minúsculo');
select is((public.zh_provisionamento_reservar((select p from pedido)))->>'acao', 'em_andamento', 'segunda chamada em seguida espera');

update public.zh_provisionamentos set reservado_em = now() - interval '11 minutes' where pagamento_id = '9001';
select is((public.zh_provisionamento_reservar((select p from pedido)))->>'acao', 'executar', 'reserva abandonada há mais de 10 min é retomada');
select is((select tentativas from public.zh_provisionamentos where pagamento_id = '9001'), 2, 'retomada conta a tentativa');

update public.zh_provisionamentos set status = 'falhou', motivo = 'não criou a conta' where pagamento_id = '9001';
select is(((public.zh_provisionamento_reservar((select p from pedido)))->'registro'->>'tentativas')::int, 3, 'falha volta a executar');

update public.zh_provisionamentos set status = 'concluido', envio = 'aceito' where pagamento_id = '9001';
select is((public.zh_provisionamento_reservar((select p from pedido)))->>'acao', 'terminado', 'concluído não executa de novo');
select is((select count(*)::int from public.zh_provisionamentos where pagamento_id = '9001'), 1, 'um registro por pagamento');

update public.zh_provisionamentos set status = 'falhou', tentativas = 6 where pagamento_id = '9001';
select is((public.zh_provisionamento_reservar((select p from pedido)))->'registro'->>'status', 'revisao_manual', 'depois de 6 tentativas vira revisão manual');

select throws_ok(
  $$ select public.zh_provisionamento_reservar('{"pagamento_id": "abc"}'::jsonb) $$,
  '22023', null, 'pagamento inválido é recusado');

select * from finish();
rollback;
