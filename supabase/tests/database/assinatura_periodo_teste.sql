-- Período de teste grátis (27/10/2026) - fronteira no banco.
-- Prova: conta nasce fora do teste; pagar a assinatura com a conta em teste conta 12 meses a
-- partir do dia do pagamento (não soma sobre o fim do teste) e zera a marca de teste; funciona
-- sem compra pelo checkout (sem linha em zh_provisionamentos); conta paga segue somando ao fim
-- atual; e o app (authenticated) não marca a própria conta como em teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into public.organizacoes (id, nome, tipo_cliente, vigencia_fim, renovacao_token, periodo_teste) values
  ('teste-ativo', 'Burger Teste', 'saas', ((now() at time zone 'America/Sao_Paulo')::date + 7), 'tokenteste_aaaaaaaaaaaaaaaaaaaaaa', true),
  ('teste-pago', 'Burger Pago', 'saas', ((now() at time zone 'America/Sao_Paulo')::date + 7), 'tokenpago_aaaaaaaaaaaaaaaaaaaaaaa', false);
insert into public.organizacoes (id, nome, tipo_cliente) values ('teste-manual', 'Burger Manual', 'saas');

select is(
  (select periodo_teste from public.organizacoes where id = 'teste-manual'),
  false,
  'conta nasce fora do período de teste'
);

select is(
  (select count(*)::int from public.zh_provisionamentos where organizacao_id = 'teste-ativo'),
  0,
  'a conta em teste nunca comprou pelo checkout'
);

select is(
  (public.zh_assinatura_renovar('tokenteste_aaaaaaaaaaaaaaaaaaaaaa', '555', 718.80)->>'fim_novo')::date,
  ((now() at time zone 'America/Sao_Paulo')::date + interval '12 months')::date,
  'pagar no teste conta 12 meses a partir do dia do pagamento'
);

select is(
  (select periodo_teste from public.organizacoes where id = 'teste-ativo'),
  false,
  'pagar zera a marca de teste'
);

select is(
  (public.zh_assinatura_renovar('tokenteste_aaaaaaaaaaaaaaaaaaaaaa', '555', 718.80)->>'fim_novo')::date,
  ((now() at time zone 'America/Sao_Paulo')::date + interval '12 months')::date,
  'repetir o pagamento devolve o mesmo fim'
);

select is(
  (public.zh_assinatura_renovar('tokenpago_aaaaaaaaaaaaaaaaaaaaaaa', '666', 718.80)->>'fim_novo')::date,
  ((now() at time zone 'America/Sao_Paulo')::date + 7 + interval '12 months')::date,
  'conta paga segue somando 12 meses ao fim atual'
);

set local role authenticated;
do $$
begin
  update public.organizacoes set periodo_teste = true where id = 'teste-pago';
exception when insufficient_privilege then null;
end $$;
reset role;
select is(
  (select periodo_teste from public.organizacoes where id = 'teste-pago'),
  false,
  'o app não muda a marca de teste'
);

select * from finish();
rollback;
