-- Comercial: o Vini move o card para a reunião de diagnóstico depois da reunião (SDR-142, 18/11/2026).
--   1. exige o token certo da entrada do Vini;
--   2. card antes da reunião vai para reuniao_diagnostico com a próxima ação (casa sem o nono dígito);
--   3. reenvio da mesma chave não grava de novo;
--   4. card já na reunião com ação escrita, fechado ou perdido não muda;
--   5. card na reunião sem ação só ganha a ação;
--   6. sem lead: devolve sem_lead e não cria; formato e datas erradas são recusados.
--
-- Rodar com o Supabase local no ar: `npx supabase test db`.
-- Sem dado real - fixtures isoladas.

begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

insert into zh_leads_segredos (chave, versao, valor)
values ('vini_eventos', 1, encode(extensions.digest(convert_to(repeat('t', 64), 'UTF8'), 'sha256'), 'hex'));

insert into zh_leads (whatsapp, nome, origem, etapa, proxima_acao) values
  ('24977776666', 'Lead Formulario', 'site', 'preencheu_formulario', 'Ver se concluiu o pagamento; se não, chamar no WhatsApp hoje'),
  ('24977775555', 'Lead Na Reuniao', 'site', 'reuniao_diagnostico', 'Retorno da proposta até sexta'),
  ('24977774444', 'Lead Fechado', 'site', 'consultoria_fechada', ''),
  ('24977773333', 'Lead Perdido', 'site', 'perdido', ''),
  ('24977772222', 'Lead Sem Acao', 'site', 'reuniao_diagnostico', '');

create temp table ev (n text, j jsonb) on commit drop;
grant all on ev to anon;
insert into ev values
  ('ok', jsonb_build_object('chave', 'neg-1', 'tipo', 'negociacao', 'lead', jsonb_build_object('whatsapp', '552477776666'),
     'reuniao_em', (now() at time zone 'America/Sao_Paulo')::date - 1,
     'proxima_acao', 'Registrar o combinado da reunião de diagnóstico',
     'proxima_acao_em', (now() at time zone 'America/Sao_Paulo')::date)),
  ('futuro', jsonb_build_object('chave', 'neg-9', 'tipo', 'negociacao', 'lead', jsonb_build_object('whatsapp', '2477776666'),
     'reuniao_em', (now() at time zone 'America/Sao_Paulo')::date + 1, 'proxima_acao', 'x'));

set local role anon;

select throws_ok(
  $$ select zh_leads_registrar_negociacao(repeat('e', 64), (select j from ev where n = 'ok')) $$,
  '42501', null, 'token errado é recusado');

select is(zh_leads_registrar_negociacao(repeat('t', 64), (select j from ev where n = 'ok'))->>'mudou', 'true',
  'card do formulário vai para a reunião (WhatsApp sem o nono dígito casa)');

select is(zh_leads_registrar_negociacao(repeat('t', 64), (select j from ev where n = 'ok'))->>'repetido', 'true',
  'mesma chave não grava de novo');

select is(zh_leads_registrar_negociacao(repeat('t', 64),
  (select j || '{"chave":"neg-2","lead":{"whatsapp":"24977775555"},"proxima_acao":"Outra"}'::jsonb from ev where n = 'ok'))->>'mudou',
  'false', 'card na reunião com ação escrita não muda');

select is(zh_leads_registrar_negociacao(repeat('t', 64),
  (select j || '{"chave":"neg-3","lead":{"whatsapp":"24977774444"}}'::jsonb from ev where n = 'ok'))->>'etapa',
  'consultoria_fechada', 'consultoria fechada não volta');

select is(zh_leads_registrar_negociacao(repeat('t', 64),
  (select j || '{"chave":"neg-4","lead":{"whatsapp":"24977773333"}}'::jsonb from ev where n = 'ok'))->>'mudou',
  'false', 'perdido fica com Vinícius');

select is(zh_leads_registrar_negociacao(repeat('t', 64),
  (select j || '{"chave":"neg-5","lead":{"whatsapp":"24977772222"}}'::jsonb from ev where n = 'ok'))->>'mudou',
  'true', 'card na reunião sem ação ganha a ação');

select is(zh_leads_registrar_negociacao(repeat('t', 64),
  (select j || '{"chave":"neg-6","lead":{"whatsapp":"31911112222"}}'::jsonb from ev where n = 'ok')),
  '{"ok": false, "motivo": "sem_lead"}'::jsonb, 'sem lead: devolve sem_lead');

select throws_ok(
  $$ select zh_leads_registrar_negociacao(repeat('t', 64), (select j from ev where n = 'futuro')) $$,
  '22023', null, 'reunião no futuro é recusada');

select throws_ok(
  $$ select zh_leads_registrar_negociacao(repeat('t', 64), (select j || '{"chave":"neg-7","proxima_acao":""}'::jsonb from ev where n = 'ok')) $$,
  '22023', null, 'sem próxima ação é recusado');

select throws_ok(
  $$ select zh_leads_registrar_negociacao(repeat('t', 64), (select j || '{"chave":"neg-8","tipo":"etapa"}'::jsonb from ev where n = 'ok')) $$,
  '22023', null, 'tipo errado é recusado');

reset role;

select is((select count(*)::int from zh_leads), 5, 'nenhum lead foi criado');
select is((select etapa from zh_leads where whatsapp = '24977776666'), 'reuniao_diagnostico', 'card movido');
select is((select proxima_acao from zh_leads where whatsapp = '24977776666'),
  'Registrar o combinado da reunião de diagnóstico', 'próxima ação automática do formulário foi trocada');
select is((select proxima_acao from zh_leads where whatsapp = '24977775555'), 'Retorno da proposta até sexta',
  'ação escrita no card não é sobrescrita');
select is((select etapa from zh_leads where whatsapp = '24977773333'), 'perdido', 'perdido não muda');
select is((select proxima_acao from zh_leads where whatsapp = '24977772222'),
  'Registrar o combinado da reunião de diagnóstico', 'ação preenchida no card que estava vazio');
select is((select count(*)::int from zh_leads_eventos where chave_externa = 'neg-1'), 1, 'chave repetida gravou uma vez só');
select is((select tipo || ':' || de_etapa || '>' || para_etapa || ':' || autor from zh_leads_eventos where chave_externa = 'neg-1'),
  'etapa:preencheu_formulario>reuniao_diagnostico:sdr', 'linha do tempo registra o avanço pelo SDR');

select * from finish();
rollback;
