-- Comercial: conversa do SDR arquivada no CRM (17/11/2026).
--   1. exige o token certo da entrada do Vini;
--   2. grava a mensagem na linha do tempo do lead (por WhatsApp ou @), com
--      quem falou e o canal, sem mexer na etapa nem em outro campo do lead;
--   3. reenvio da mesma chave não duplica;
--   4. sem lead com aquele WhatsApp/@: devolve sem_lead e não cria lead;
--   5. formato errado é recusado.
--
-- Rodar com o Supabase local no ar: `npx supabase test db`.
-- Sem dado real - fixtures isoladas.

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into zh_leads_segredos (chave, versao, valor)
values ('vini_eventos', 1, encode(extensions.digest(convert_to(repeat('t', 64), 'UTF8'), 'sha256'), 'hex'));

insert into zh_leads (whatsapp, instagram, nome, origem, etapa)
values ('31988880000', 'loja.teste', 'Loja Teste', 'prospeccao_fria', 'abordado');

set local role anon;

select throws_ok(
  $$ select zh_leads_registrar_mensagem(repeat('e', 64),
    '{"chave":"msg-1","tipo":"mensagem","texto":"Oi","lead":{"whatsapp":"31988880000"},"mensagem":{"de":"sdr","canal":"whatsapp"}}') $$,
  '42501', null, 'token errado é recusado');

select is(
  zh_leads_registrar_mensagem(repeat('t', 64),
    '{"chave":"msg-1","tipo":"mensagem","em":"2026-11-17T22:00:00Z","texto":"Oi, tudo bem?","lead":{"whatsapp":"5531988880000"},"mensagem":{"de":"sdr","canal":"whatsapp"}}'
  )->>'duplicado', 'false', 'mensagem do SDR grava pelo WhatsApp (com 55 normalizado)');

select is(
  zh_leads_registrar_mensagem(repeat('t', 64),
    '{"chave":"msg-1","tipo":"mensagem","texto":"Oi, tudo bem?","lead":{"whatsapp":"31988880000"},"mensagem":{"de":"sdr","canal":"whatsapp"}}'
  )->>'duplicado', 'true', 'mesma chave não grava de novo');

select is(
  zh_leads_registrar_mensagem(repeat('t', 64),
    '{"chave":"msg-2","tipo":"mensagem","texto":"Tudo, e você?","lead":{"instagram":"@Loja.Teste"},"mensagem":{"de":"lead","canal":"instagram"}}'
  )->>'ok', 'true', 'resposta do lead grava pelo @');

select lives_ok(
  $$ select zh_leads_registrar_mensagem(repeat('t', 64),
    format('{"chave":"msg-3","tipo":"mensagem","texto":"%s","lead":{"whatsapp":"31988880000"},"mensagem":{"de":"vinicius","canal":"whatsapp"}}',
      repeat('a', 1500))::jsonb) $$,
  'texto longo entra (truncado)');

select is(
  zh_leads_registrar_mensagem(repeat('t', 64),
    '{"chave":"msg-4","tipo":"mensagem","texto":"Oi","lead":{"whatsapp":"31977770000"},"mensagem":{"de":"sdr","canal":"whatsapp"}}'
  ), '{"ok": false, "motivo": "sem_lead"}'::jsonb, 'sem lead: devolve sem_lead');

select throws_ok(
  $$ select zh_leads_registrar_mensagem(repeat('t', 64),
    '{"chave":"msg-5","tipo":"mensagem","texto":"Oi","lead":{"whatsapp":"31988880000"},"mensagem":{"de":"cliente","canal":"whatsapp"}}') $$,
  '22023', null, 'quem falou fora da lista é recusado');

select throws_ok(
  $$ select zh_leads_registrar_mensagem(repeat('t', 64),
    '{"chave":"msg-6","tipo":"mensagem","texto":"Oi","lead":{"whatsapp":"31988880000"},"mensagem":{"de":"sdr","canal":"email"}}') $$,
  '22023', null, 'canal fora da lista é recusado');

select throws_ok(
  $$ select zh_leads_registrar_mensagem(repeat('t', 64),
    '{"tipo":"mensagem","texto":"Oi","lead":{"whatsapp":"31988880000"},"mensagem":{"de":"sdr","canal":"whatsapp"}}') $$,
  '22023', null, 'mensagem sem chave é recusada');

reset role;

select is((select count(*)::int from zh_leads), 1, 'nenhum lead foi criado');
select is((select etapa from zh_leads where whatsapp = '31988880000'), 'abordado', 'etapa do lead não muda');
select is((select count(*)::int from zh_leads_eventos where chave_externa = 'msg-1'), 1, 'chave repetida gravou uma vez só');
select is((select dados from zh_leads_eventos where chave_externa = 'msg-2'),
  '{"de": "lead", "canal": "instagram"}'::jsonb, 'guarda quem falou e o canal');
select is((select autor from zh_leads_eventos where chave_externa = 'msg-3'), 'vinicius', 'mensagem de Vinícius fica com autor vinicius');
select is((select length(texto) from zh_leads_eventos where chave_externa = 'msg-3'), 1000, 'texto truncado em 1000');
select is((select tipo from zh_leads_eventos where chave_externa = 'msg-2'), 'mensagem', 'evento gravado como mensagem');

select * from finish();
rollback;
