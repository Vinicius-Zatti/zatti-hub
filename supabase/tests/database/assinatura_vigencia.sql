-- Vigência anual (15/10/2026) - fronteira no banco.
-- Prova: a renovação estende 12 meses a partir do maior entre hoje e o fim atual; o mesmo
-- pagamento não estende duas vezes; token desconhecido falha; contas antigas ficam sem vigência;
-- e o app (authenticated) não lê nem escreve avisos e renovações.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into public.organizacoes (id, nome, tipo_cliente, vigencia_fim, renovacao_token) values
  ('vig-futuro', 'Burger Futuro', 'saas', ((now() at time zone 'America/Sao_Paulo')::date + 20), 'tokenfuturo_aaaaaaaaaaaaaaaaaaaa'),
  ('vig-vencido', 'Burger Vencido', 'saas', ((now() at time zone 'America/Sao_Paulo')::date - 40), 'tokenvencido_aaaaaaaaaaaaaaaaaaa');
insert into public.organizacoes (id, nome, tipo_cliente) values ('vig-manual', 'Burger Manual', 'saas');

select is(
  (select vigencia_fim from public.organizacoes where id = 'vig-manual'),
  null,
  'conta criada à mão nasce sem vigência (nunca vence)'
);

select is(
  (public.zh_assinatura_renovar('tokenfuturo_aaaaaaaaaaaaaaaaaaaa', '111', 718.80)->>'fim_novo')::date,
  ((now() at time zone 'America/Sao_Paulo')::date + 20 + interval '12 months')::date,
  'renovação antes de vencer soma 12 meses ao fim atual'
);

select is(
  (public.zh_assinatura_renovar('tokenfuturo_aaaaaaaaaaaaaaaaaaaa', '111', 718.80)->>'repetido')::boolean,
  true,
  'o mesmo pagamento devolve o mesmo resultado'
);

select is(
  (select vigencia_fim from public.organizacoes where id = 'vig-futuro'),
  ((now() at time zone 'America/Sao_Paulo')::date + 20 + interval '12 months')::date,
  'repetir o pagamento não estende de novo'
);

select is(
  (public.zh_assinatura_renovar('tokenvencido_aaaaaaaaaaaaaaaaaaa', '222', 718.80)->>'fim_novo')::date,
  ((now() at time zone 'America/Sao_Paulo')::date + interval '12 months')::date,
  'renovação depois de vencer conta 12 meses a partir de hoje'
);

select throws_ok(
  $$ select public.zh_assinatura_renovar('tokendesconhecido_aaaaaaaaaaaaa', '333', 718.80) $$,
  'P0002',
  null,
  'token que não é de nenhuma conta falha'
);

set local role authenticated;
select throws_ok(
  $$ select * from public.zh_assinatura_avisos $$,
  '42501',
  null,
  'o app não lê os avisos enviados'
);
select throws_ok(
  $$ select public.zh_assinatura_renovar('tokenvencido_aaaaaaaaaaaaaaaaaaa', '444', 1) $$,
  '42501',
  null,
  'o app não renova sozinho'
);
reset role;

select * from finish();
rollback;
