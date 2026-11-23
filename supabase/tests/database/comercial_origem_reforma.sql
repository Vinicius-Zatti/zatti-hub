-- Comercial: origem "Raio-X da Reforma" (18/11/2026).
--   1. a entrada do Vini grava 'reforma' como veio;
--   2. origem desconhecida continua virando 'outra';
--   3. lead que já existe mantém a origem dele (site e outra não viram reforma).
--
-- Rodar com o Supabase local no ar: `npx supabase test db`.
-- Sem dado real - fixtures isoladas.

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into zh_leads_segredos (chave, versao, valor)
values ('vini_eventos', 1, encode(extensions.digest(convert_to(repeat('r', 64), 'UTF8'), 'sha256'), 'hex'))
on conflict do nothing;

set local role anon;

select is(
  (zh_leads_registrar_evento(repeat('r', 64),
    '{"chave":"rf-1","tipo":"formulario","lead":{"nome":"Ana","whatsapp":"31977776666","origem":"reforma"}}'
  )->>'novo_lead')::boolean, true, 'lead do Raio-X da Reforma entra pelo Vini');

select zh_leads_registrar_evento(repeat('r', 64),
  '{"chave":"rf-2","tipo":"formulario","lead":{"nome":"Caio","whatsapp":"31966665555","origem":"panfleto"}}');
select zh_leads_registrar_evento(repeat('r', 64),
  '{"chave":"rf-3","tipo":"formulario","lead":{"nome":"Caio","whatsapp":"31966665555","origem":"reforma"}}');
select zh_leads_registrar_evento(repeat('r', 64),
  '{"chave":"rf-4","tipo":"formulario","lead":{"nome":"Duda","whatsapp":"31955554444","origem":"site"}}');
select zh_leads_registrar_evento(repeat('r', 64),
  '{"chave":"rf-5","tipo":"formulario","lead":{"nome":"Duda","whatsapp":"31955554444","origem":"reforma"}}');
select zh_leads_registrar_evento(repeat('r', 64),
  '{"chave":"rf-6","tipo":"formulario","lead":{"nome":"Eva","whatsapp":"31944443333","origem":"calculadora"}}');

reset role;

select is((select origem from zh_leads where whatsapp = '31977776666'), 'reforma', 'origem reforma é gravada como veio');
select is((select origem from zh_leads where whatsapp = '31944443333'), 'outra', 'origem desconhecida continua outra');
select is((select origem from zh_leads where whatsapp = '31955554444'), 'site', 'lead existente (site) não troca para reforma');
select is((select origem from zh_leads where whatsapp = '31966665555'), 'outra', 'lead existente (outra) não troca para reforma');

select * from finish();
rollback;
