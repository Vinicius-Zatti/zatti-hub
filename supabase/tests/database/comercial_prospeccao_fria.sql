-- Comercial: origem "Prospecção fria" (16/11/2026).
--   1. a entrada do Vini grava 'prospeccao_fria' e continua mandando origem
--      desconhecida para 'outra';
--   2. lead que já existe como 'outra' vira 'prospeccao_fria' com evento da
--      prospecção, mas nenhuma outra origem é trocada;
--   3. o cadastro na tela aceita a origem nova (master).
--
-- Rodar com o Supabase local no ar: `npx supabase test db`.
-- Sem dado real - fixtures isoladas.

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-0000000d2001', 'prospeccao.master@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-prosp-fria', 'Cliente Prospecção Teste', 'saas', true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
values ('00000000-0000-0000-0000-0000000d2001', 'org-prosp-fria', null, 'master', 'ativo');

insert into zh_leads_segredos (chave, versao, valor)
values ('vini_eventos', 1, encode(extensions.digest(convert_to(repeat('p', 64), 'UTF8'), 'sha256'), 'hex'))
on conflict do nothing;

set local role anon;

select is(
  (zh_leads_registrar_evento(repeat('p', 64),
    '{"chave":"pf-1","tipo":"etapa","para_etapa":"abordado","lead":{"nome":"@lojafria","instagram":"lojafria","origem":"prospeccao_fria"}}'
  )->>'novo_lead')::boolean, true, 'loja da prospecção fria entra pelo Vini');

select is(
  (zh_leads_registrar_evento(repeat('p', 64),
    '{"chave":"pf-2","tipo":"etapa","para_etapa":"abordado","lead":{"nome":"@lojaestranha","instagram":"lojaestranha","origem":"panfleto"}}'
  )->>'novo_lead')::boolean, true, 'origem desconhecida também entra');

select zh_leads_registrar_evento(repeat('p', 64),
  '{"chave":"pf-3","tipo":"etapa","para_etapa":"respondeu","lead":{"nome":"@lojaestranha","instagram":"lojaestranha","origem":"prospeccao_fria"}}');
select zh_leads_registrar_evento(repeat('p', 64),
  '{"chave":"pf-4","tipo":"formulario","lead":{"nome":"Bia","whatsapp":"31988887777","origem":"site"}}');
select zh_leads_registrar_evento(repeat('p', 64),
  '{"chave":"pf-5","tipo":"etapa","para_etapa":"abordado","lead":{"nome":"Bia","whatsapp":"31988887777","origem":"prospeccao_fria"}}');

reset role;

select is((select origem from zh_leads where instagram = 'lojafria'), 'prospeccao_fria', 'origem nova é gravada como veio');
select is((select origem from zh_leads where instagram = 'lojaestranha'), 'prospeccao_fria',
  'lead em outra passa a prospecção fria quando chega evento da prospecção');
select is((select origem from zh_leads where whatsapp = '31988887777'), 'site', 'origem real (site) nunca é trocada');

select throws_ok(
  $$ update zh_leads set origem = 'panfleto' where instagram = 'lojafria' $$,
  '23514', null, 'o banco só aceita as origens conhecidas');

create or replace function pg_temp.entrar(p_user uuid)
returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
select pg_temp.entrar('00000000-0000-0000-0000-0000000d2001');
select zh_leads_criar('{"nome":"Loja manual","instagram":"lojamanual","origem":"prospeccao_fria"}');
reset role;
select is((select origem from zh_leads where instagram = 'lojamanual'), 'prospeccao_fria', 'cadastro na tela aceita a origem nova');

select * from finish();
rollback;
