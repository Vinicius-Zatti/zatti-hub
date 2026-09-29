-- Fixture do teste ponta a ponta LOCAL da Conciliação (nunca rodar em
-- produção). Cria uma organização/unidade de teste com Financeiro e
-- Conciliação ligados, um usuário Gestão com senha local, uma conta
-- financeira, o plano de contas padrão e o segredo de atestado de teste.
-- Uso: docker exec -i supabase_db_zatti-hub-acessos psql -U postgres -d postgres < scripts/conciliacao/fixture-local.sql

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e2e01', 'authenticated', 'authenticated',
  'e2e.conciliacao@teste.local', extensions.crypt('senha-local-e2e', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-0000000e2e01', '00000000-0000-0000-0000-0000000e2e01', 'email',
  '{"sub":"00000000-0000-0000-0000-0000000e2e01","email":"e2e.conciliacao@teste.local"}', now(), now(), now())
on conflict do nothing;

insert into public.organizacoes (id, nome, tipo_cliente, ativo) values ('org-e2e-teste', 'Teste E2E', 'saas', true)
on conflict (id) do nothing;
insert into public.unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, financeiro_gerencial_habilitado,
  conciliacao_habilitada, conciliacao_ia_documentos, conciliacao_ia_classificacao)
values ('uni-e2e-teste', 'org-e2e-teste', 'Unidade E2E', 'banco', true, true, true, false, false)
on conflict (id) do nothing;
insert into public.vinculos (user_id, organizacao_id, unidade_id, role, status)
select '00000000-0000-0000-0000-0000000e2e01', 'org-e2e-teste', 'uni-e2e-teste', 'gestao', 'ativo'
where not exists (select 1 from public.vinculos where user_id = '00000000-0000-0000-0000-0000000e2e01');
select public.semear_categorias_financeiras('uni-e2e-teste');
insert into public.fin_contas_financeiras (id, unidade_id, nome, tipo)
values ('00000000-0000-0000-0000-0000000e2ec1', 'uni-e2e-teste', 'Conta E2E', 'banco')
on conflict (id) do nothing;
insert into public.fin_conciliacao_segredos (chave, versao, valor)
values ('atestado_ingestao', 1, 'segredo-local-e2e-0123456789abcdef0123456789abcdef')
on conflict (chave, versao) do nothing;
