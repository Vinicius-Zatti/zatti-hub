-- Fixture do teste ponta a ponta LOCAL do Checklist Garante e da Equipe (nunca rodar em
-- produção). Unidade com Garante ligado, um operador responsável com senha local, um
-- modelo com 3 itens (um crítico com foto) publicado todo dia até 23:59.
-- Uso: docker exec -i supabase_db_zatti-hub-acessos psql -U postgres -d postgres < scripts/garante/fixture-local.sql

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e2ea1', 'authenticated', 'authenticated',
  'e2e.garante@teste.local', extensions.crypt('senha-local-e2e', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-0000000e2ea1', '00000000-0000-0000-0000-0000000e2ea1', 'email',
  '{"sub":"00000000-0000-0000-0000-0000000e2ea1","email":"e2e.garante@teste.local"}', now(), now(), now())
on conflict do nothing;

insert into public.organizacoes (id, nome, tipo_cliente, ativo, equipe_habilitado) values ('org-e2e-garante', 'Garante E2E', 'saas', true, true)
on conflict (id) do nothing;
insert into public.unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, garante_habilitado)
values ('uni-e2e-garante', 'org-e2e-garante', 'Unidade Garante E2E', 'banco', true, true)
on conflict (id) do nothing;
insert into public.vinculos (user_id, organizacao_id, unidade_id, role, status)
select '00000000-0000-0000-0000-0000000e2ea1', 'org-e2e-garante', 'uni-e2e-garante', 'operacional', 'ativo'
where not exists (select 1 from public.vinculos where user_id = '00000000-0000-0000-0000-0000000e2ea1');

insert into public.garante_modelos (id, unidade_id, nome) values ('00000000-0000-0000-0000-0000000e2eb1', 'uni-e2e-garante', 'Abertura E2E')
on conflict (id) do nothing;
insert into public.garante_itens (id, modelo_id, unidade_id, ordem, titulo, tipo, critico, permite_na, foto_obrigatoria, meta_min, meta_max) values
  ('00000000-0000-0000-0000-0000000e2ec1', '00000000-0000-0000-0000-0000000e2eb1', 'uni-e2e-garante', 10, 'Ligar e testar o fogão', 'check', false, true, false, null, null),
  ('00000000-0000-0000-0000-0000000e2ec2', '00000000-0000-0000-0000-0000000e2eb1', 'uni-e2e-garante', 20, 'Temperatura dos refrigerados (°C)', 'numero', true, false, true, 0, 5),
  ('00000000-0000-0000-0000-0000000e2ec3', '00000000-0000-0000-0000-0000000e2eb1', 'uni-e2e-garante', 30, 'Limpeza do salão', 'estrelas', false, true, false, 4, null)
on conflict (id) do nothing;
insert into public.garante_publicacoes (id, modelo_id, unidade_id, responsavel_id, dias_semana, horario_limite, vigente_desde)
values ('00000000-0000-0000-0000-0000000e2ed1', '00000000-0000-0000-0000-0000000e2eb1', 'uni-e2e-garante',
  '00000000-0000-0000-0000-0000000e2ea1', array[0,1,2,3,4,5,6]::smallint[], '23:59', current_date - 1)
on conflict (id) do nothing;

-- Gestão da mesma organização (telas de modelos, quadro e equipe).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e2ea2', 'authenticated', 'authenticated',
  'e2e.garante.gestao@teste.local', extensions.crypt('senha-local-e2e', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-0000000e2ea2', '00000000-0000-0000-0000-0000000e2ea2', 'email',
  '{"sub":"00000000-0000-0000-0000-0000000e2ea2","email":"e2e.garante.gestao@teste.local"}', now(), now(), now())
on conflict do nothing;
insert into public.perfis (id, nome) values ('00000000-0000-0000-0000-0000000e2ea2', 'Gestora Teste'), ('00000000-0000-0000-0000-0000000e2ea1', 'Operador Teste')
on conflict (id) do nothing;
insert into public.vinculos (user_id, organizacao_id, unidade_id, role, status)
select '00000000-0000-0000-0000-0000000e2ea2', 'org-e2e-garante', null, 'gestao', 'ativo'
where not exists (select 1 from public.vinculos where user_id = '00000000-0000-0000-0000-0000000e2ea2');
