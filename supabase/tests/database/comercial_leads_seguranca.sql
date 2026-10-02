-- Comercial (CRM de leads) - as garantias que só o banco pode dar.
--   1. só master em aal2 lê e escreve; gestão e anon não veem nada;
--   2. a entrada do Vini exige o token certo e não duplica evento repetido;
--   3. um lead por WhatsApp, nada sobrescrito: formulário repetido vira
--      "nova_tentativa" e o nome do lead fica o primeiro;
--   4. compra avança a etapa (livro -> app), nunca rebaixa, e sugere a
--      próxima ação de cada uma;
--   5. ações de Vinícius: perdido exige motivo; "virou cliente" só com
--      organização ativa; nada some (sem delete).
--
-- Rodar com o Supabase local no ar: `npx supabase test db`.
-- Sem dado real - fixtures isoladas.

begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-0000000d1001', 'comercial.master@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000d1002', 'comercial.gestao@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-com-cliente', 'Cliente Comercial Teste', 'saas', true),
  ('org-com-inativo', 'Cliente Inativo Teste', 'saas', false);

insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000d1001', 'org-com-cliente', null, 'master', 'ativo'),
  ('00000000-0000-0000-0000-0000000d1002', 'org-com-cliente', null, 'gestao', 'ativo');

-- Token da integração: só o SHA-256 fica no banco.
insert into zh_leads_segredos (chave, versao, valor)
values ('vini_eventos', 1, encode(extensions.digest(convert_to(repeat('t', 64), 'UTF8'), 'sha256'), 'hex'));

create or replace function pg_temp.entrar(p_user uuid, p_aal text)
returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

-- ── 2. Entrada do Vini (anon, como a rota da API) ─────────────────────────
set local role anon;

select throws_ok(
  $$ select zh_leads_registrar_evento(repeat('e', 64), '{"chave":"f1","tipo":"formulario","lead":{"nome":"Ana","whatsapp":"31999990000"}}') $$,
  '42501', null, 'token errado é recusado');

select is(
  (zh_leads_registrar_evento(repeat('t', 64),
    '{"chave":"f1","tipo":"formulario","em":"2026-10-02T13:15:00Z","lead":{"nome":"Ana","whatsapp":"5531999990000","produto":"Livro Restaurante no Controle","origem":"site","faturamento_atual":"Até R$50 mil"}}'
  )->>'novo_lead')::boolean, true, 'primeiro formulário cria o lead (com 55 normalizado)');

select is(
  (zh_leads_registrar_evento(repeat('t', 64),
    '{"chave":"f1","tipo":"formulario","lead":{"nome":"Ana","whatsapp":"31999990000"}}')->>'repetido')::boolean,
  true, 'mesma chave não grava de novo');

select is(
  (zh_leads_registrar_evento(repeat('t', 64),
    '{"chave":"rep-1","tipo":"formulario","em":"2026-10-02T13:24:00Z","lead":{"nome":"Outro Nome","whatsapp":"31999990000","produto":"Livro Restaurante no Controle","origem":"instagram"}}'
  )->>'novo_lead')::boolean, false, 'formulário repetido do mesmo WhatsApp não cria outro lead');

select throws_ok(
  $$ select zh_leads_registrar_evento(repeat('t', 64), '{"chave":"x1","tipo":"pagamento","lead":{"whatsapp":"31999990000"},"pagamento":{"produto":"consultoria"}}') $$,
  '22023', null, 'pagamento só de produto do site');

select throws_ok(
  $$ select zh_leads_registrar_evento(repeat('t', 64), '{"chave":"x2","tipo":"formulario","lead":{"nome":"Sem","whatsapp":"123"}}') $$,
  '22023', null, 'WhatsApp inválido é recusado');

select lives_ok(
  $$ select zh_leads_registrar_evento(repeat('t', 64),
    '{"chave":"pag-1","tipo":"pagamento","em":"2026-10-02T13:26:00Z","lead":{"nome":"Ana","whatsapp":"31999990000"},"pagamento":{"produto":"livro","valor":37,"pagamento_id":"180977060947"}}') $$,
  'pagamento aprovado do livro entra');

reset role;

-- ── 3 e 4. Estado do lead (lido como dono do banco) ────────────────────────
select is((select count(*)::int from zh_leads where whatsapp = '31999990000'), 1, 'um lead por WhatsApp');
select is((select nome from zh_leads where whatsapp = '31999990000'), 'Ana', 'nome do lead não é sobrescrito');
select is((select origem from zh_leads where whatsapp = '31999990000'), 'site', 'origem é a do primeiro contato');
select is((select tipo from zh_leads_eventos where chave_externa = 'rep-1'), 'nova_tentativa', 'repetido vira nova tentativa');
select is((select dados->>'nome' from zh_leads_eventos where chave_externa = 'rep-1'), 'Outro Nome', 'o evento guarda o que foi preenchido');
select is((select etapa from zh_leads where whatsapp = '31999990000'), 'comprou_livro', 'compra do livro leva a Comprou livro');
select matches((select proxima_acao from zh_leads where whatsapp = '31999990000'), 'Zatti Hub', 'quem comprou o livro: oferecer o app');

set local role anon;
select lives_ok(
  $$ select zh_leads_registrar_evento(repeat('t', 64),
    '{"chave":"pag-2","tipo":"pagamento","lead":{"nome":"Ana","whatsapp":"31999990000"},"pagamento":{"produto":"zatti-hub","valor":718.8,"pagamento_id":"2"}}') $$,
  'pagamento do app entra');
select lives_ok(
  $$ select zh_leads_registrar_evento(repeat('t', 64),
    '{"chave":"pag-3","tipo":"pagamento","lead":{"nome":"Ana","whatsapp":"31999990000"},"pagamento":{"produto":"livro","valor":37,"pagamento_id":"3"}}') $$,
  'segunda compra do livro entra');
reset role;

select is((select etapa from zh_leads where whatsapp = '31999990000'), 'comprou_app', 'compra do livro depois do app não rebaixa');
select is((select tipo from zh_leads_eventos where chave_externa = 'pag-3'), 'comprou_de_novo', 'segunda compra aparece como comprou de novo');

-- ── 1. Leitura: gestão não vê, master em aal2 vê ──────────────────────────
select pg_temp.entrar('00000000-0000-0000-0000-0000000d1002', 'aal2');
select is((select count(*)::int from zh_leads), 0, 'gestão não vê leads');

select pg_temp.entrar('00000000-0000-0000-0000-0000000d1001', 'aal2');
select is((select count(*)::int from zh_leads), 1, 'master em aal2 vê o lead');

-- ── 5. Ações de Vinícius ───────────────────────────────────────────────────
select throws_ok(
  $$ select zh_leads_atualizar((select id from zh_leads limit 1), 'perdido', '{"texto":""}') $$,
  '22023', null, 'perdido sem motivo é recusado');

select throws_ok(
  $$ select zh_leads_atualizar((select id from zh_leads limit 1), 'virou_cliente', '{"organizacao_id":"org-com-inativo"}') $$,
  '22023', null, 'virou cliente só com organização ativa');

select * from finish();
rollback;
