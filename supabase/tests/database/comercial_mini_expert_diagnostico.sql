-- Comercial: pagamento do Mini Expert iFood e do Diagnóstico de Delivery, e rastreio de anúncio (26/11/2026).
--   1. pagamento de raio-x-delivery e diagnostico-delivery entra, com a etapa e a próxima ação de cada um;
--   2. livro, app e produto desconhecido seguem como antes (sem regressão), e compra nunca rebaixa;
--   3. rastreio: só campos conhecidos e no formato ficam no evento; lixo é descartado sem derrubar o evento;
--   4. zh_leads.rastreio guarda só UTMs e página do primeiro toque, e não é sobrescrito;
--   5. a negociação trata a sugestão nova do Diagnóstico como ação automática;
--   6. a função de limpeza não é chamável de fora.
--
-- Rodar com o Supabase local no ar: `npx supabase test db`.
-- Sem dado real - fixtures isoladas.

begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

insert into zh_leads_segredos (chave, versao, valor)
values ('vini_eventos', 1, encode(extensions.digest(convert_to(repeat('m', 64), 'UTF8'), 'sha256'), 'hex'))
on conflict do nothing;

set local role anon;

-- ── 1. Produtos novos ────────────────────────────────────────────────────
select lives_ok(
  $$ select zh_leads_registrar_evento(repeat('m', 64),
    '{"chave":"pag-me-1","tipo":"pagamento","em":"2026-11-26T15:00:00Z","lead":{"nome":"Bia","whatsapp":"31988887777","origem":"site","produto":"Mini Expert iFood"},"pagamento":{"produto":"raio-x-delivery","valor":47,"pagamento_id":"9001"},"rastreio":{"utm_source":"facebook","utm_medium":"paid","utm_campaign":"mini-expert-lancamento","utm_content":"video-1","fbclid":"IwAR0abc_-1","fbc":"fb.1.1764169200000.IwAR0abc_-1","fbp":"fb.1.1764169200000.1234567890","pagina_url":"https://zatticonsultoria.com.br/raio-x-delivery/","event_id_checkout":"checkout-abc.1","ip":"1.2.3.4","ua":"Mozilla"}}') $$,
  'pagamento do Mini Expert iFood entra');

select lives_ok(
  $$ select zh_leads_registrar_evento(repeat('m', 64),
    '{"chave":"pag-dg-1","tipo":"pagamento","em":"2026-11-26T16:00:00Z","lead":{"nome":"Caio","whatsapp":"31977776666"},"pagamento":{"produto":"diagnostico-delivery","valor":47.9,"pagamento_id":"9002"}}') $$,
  'pagamento do Diagnóstico de Delivery entra (sem rastreio)');

-- ── 2. Produtos antigos e ordem ──────────────────────────────────────────
select lives_ok(
  $$ select zh_leads_registrar_evento(repeat('m', 64),
    '{"chave":"pag-lv-1","tipo":"pagamento","em":"2026-11-20T10:00:00Z","lead":{"nome":"Duda","whatsapp":"31966665555"},"pagamento":{"produto":"livro","valor":37,"pagamento_id":"9003"}}') $$,
  'pagamento do livro continua entrando');
select lives_ok(
  $$ select zh_leads_registrar_evento(repeat('m', 64),
    '{"chave":"pag-me-2","tipo":"pagamento","em":"2026-11-26T10:00:00Z","lead":{"nome":"Duda","whatsapp":"31966665555"},"pagamento":{"produto":"raio-x-delivery","valor":47,"pagamento_id":"9004"}}') $$,
  'Mini Expert depois do livro entra');

select lives_ok(
  $$ select zh_leads_registrar_evento(repeat('m', 64),
    '{"chave":"pag-app-1","tipo":"pagamento","em":"2026-11-20T10:00:00Z","lead":{"nome":"Eva","whatsapp":"31955554444"},"pagamento":{"produto":"zatti-hub","valor":718.8,"pagamento_id":"9005"}}') $$,
  'pagamento do app continua entrando');
select lives_ok(
  $$ select zh_leads_registrar_evento(repeat('m', 64),
    '{"chave":"pag-dg-2","tipo":"pagamento","em":"2026-11-26T10:00:00Z","lead":{"nome":"Eva","whatsapp":"31955554444"},"pagamento":{"produto":"diagnostico-delivery","valor":47.9,"pagamento_id":"9006"}}') $$,
  'Diagnóstico depois do app entra');

select throws_ok(
  $$ select zh_leads_registrar_evento(repeat('m', 64), '{"chave":"pag-x","tipo":"pagamento","lead":{"whatsapp":"31944443333"},"pagamento":{"produto":"consultoria"}}') $$,
  '22023', null, 'produto desconhecido continua recusado');

-- ── 3. Rastreio no formulário: lixo não derruba ──────────────────────────
select lives_ok(
  $$ select zh_leads_registrar_evento(repeat('m', 64),
    '{"chave":"form-me-1","tipo":"formulario","em":"2026-11-26T14:00:00Z","lead":{"nome":"Gil","whatsapp":"31933332222","produto":"Mini Expert iFood"},"rastreio":{"utm_source":"instagram","utm_campaign":"<script>","fbc":"fb.1.123.x","pagina_url":"https://outro-site.com/raio-x-delivery/","event_id_lead":"lead-1","extra":"x"}}') $$,
  'formulário com rastreio meio inválido entra');
select lives_ok(
  $$ select zh_leads_registrar_evento(repeat('m', 64),
    '{"chave":"form-me-2","tipo":"formulario","em":"2026-11-26T14:05:00Z","lead":{"nome":"Gil","whatsapp":"31933332222"},"rastreio":"nao-e-objeto"}') $$,
  'rastreio que não é objeto é ignorado');
select lives_ok(
  $$ select zh_leads_registrar_evento(repeat('m', 64),
    '{"chave":"pag-me-3","tipo":"pagamento","em":"2026-11-26T14:10:00Z","lead":{"nome":"Gil","whatsapp":"31933332222"},"pagamento":{"produto":"raio-x-delivery","valor":47,"pagamento_id":"9007"},"rastreio":{"utm_source":"google","utm_campaign":"outra"}}') $$,
  'pagamento do mesmo lead com outra UTM entra');

reset role;

-- ── Estado (lido como dono do banco) ─────────────────────────────────────
select is((select etapa from zh_leads where whatsapp = '31988887777'), 'comprou_raio_x', 'Mini Expert leva a comprou_raio_x');
select is((select proxima_acao from zh_leads where whatsapp = '31988887777'), 'Oferecer o Zatti Hub (12x de R$59,90)',
  'quem comprou o Mini Expert: oferecer o app');
select is((select proxima_acao_em from zh_leads where whatsapp = '31988887777'), date '2026-12-03', 'oferta do app no 7º dia');
select is((select produto || ' ' || valor from zh_leads_eventos where chave_externa = 'pag-me-1'), 'raio-x-delivery 47.00',
  'evento guarda produto e valor');

select is((select etapa from zh_leads where whatsapp = '31977776666'), 'comprou_diagnostico', 'Diagnóstico leva a comprou_diagnostico');
select is((select proxima_acao || ' em ' || proxima_acao_em from zh_leads where whatsapp = '31977776666'),
  'Conferir se a loja liberou o acesso no Portal do Parceiro do iFood em 2026-11-26', 'Diagnóstico: conferir o acesso no mesmo dia');
select is((select valor from zh_leads_eventos where chave_externa = 'pag-dg-1'), 47.90::numeric(12, 2), 'valor de R$ 47,90 inteiro');
select is((select dados from zh_leads_eventos where chave_externa = 'pag-dg-1'), '{}'::jsonb, 'sem rastreio, dados do pagamento ficam vazios');

select is((select etapa from zh_leads where whatsapp = '31966665555'), 'comprou_raio_x', 'Mini Expert depois do livro avança');
select is((select etapa from zh_leads where whatsapp = '31955554444'), 'comprou_app', 'Diagnóstico depois do app não rebaixa');
select is((select tipo from zh_leads_eventos where chave_externa = 'pag-dg-2'), 'comprou_de_novo', 'segunda compra é comprou de novo');

select is((select dados->'rastreio' from zh_leads_eventos where chave_externa = 'pag-me-1'),
  '{"utm_source":"facebook","utm_medium":"paid","utm_campaign":"mini-expert-lancamento","utm_content":"video-1","fbclid":"IwAR0abc_-1","fbc":"fb.1.1764169200000.IwAR0abc_-1","fbp":"fb.1.1764169200000.1234567890","pagina_url":"https://zatticonsultoria.com.br/raio-x-delivery/","event_id_checkout":"checkout-abc.1"}'::jsonb,
  'rastreio válido fica inteiro no evento, sem IP nem navegador');
select is((select rastreio - 'em' from zh_leads where whatsapp = '31988887777'),
  '{"utm_source":"facebook","utm_medium":"paid","utm_campaign":"mini-expert-lancamento","utm_content":"video-1","pagina_url":"https://zatticonsultoria.com.br/raio-x-delivery/"}'::jsonb,
  'lead guarda só UTMs e página (sem clique nem cookie)');
select ok((select rastreio ? 'em' from zh_leads where whatsapp = '31988887777'), 'lead guarda quando veio do anúncio');

select is((select dados->'rastreio' from zh_leads_eventos where chave_externa = 'form-me-1'),
  '{"utm_source":"instagram","event_id_lead":"lead-1"}'::jsonb, 'campo fora do formato, de outro site ou desconhecido é descartado');
select is((select dados->>'nome' from zh_leads_eventos where chave_externa = 'form-me-1'), 'Gil', 'formulário continua guardando o preenchido');
select is((select rastreio->>'utm_source' from zh_leads where whatsapp = '31933332222'), 'instagram',
  'origem do anúncio é a do primeiro toque, não é sobrescrita');
select is((select rastreio from zh_leads where whatsapp = '31977776666'), null::jsonb, 'sem rastreio, lead fica sem anúncio');

-- ── 5. Negociação reconhece a sugestão nova do Diagnóstico ───────────────
set local role anon;
select is(zh_leads_registrar_negociacao(repeat('m', 64), jsonb_build_object(
    'chave', 'neg-dg-1', 'tipo', 'negociacao', 'lead', jsonb_build_object('whatsapp', '31977776666'),
    'reuniao_em', (now() at time zone 'America/Sao_Paulo')::date,
    'proxima_acao', 'Registrar o combinado da reunião de diagnóstico'))->>'mudou', 'true',
  'card do Diagnóstico vai para a reunião');
reset role;
select is((select proxima_acao from zh_leads where whatsapp = '31977776666'), 'Registrar o combinado da reunião de diagnóstico',
  'a sugestão do Diagnóstico é automática e é trocada');

-- ── 6. Limpeza do rastreio não é chamável de fora ────────────────────────
select ok(not has_function_privilege('anon', 'public.zh_leads_limpar_rastreio(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.zh_leads_limpar_rastreio(jsonb)', 'execute'),
  'anon e authenticated não chamam a limpeza do rastreio');

select * from finish();
rollback;
