-- Avaliações: três tipos de pesquisa (20261113090000_avaliacoes_tres_origens.sql).
-- Prova: pesquisa nasce com salão, delivery e apps ligados; 'app' grava; tipo desligado responde
-- "encerrada" e os outros seguem; ao menos um tipo fica ligado; só valores conhecidos; só quem
-- edita a pesquisa muda os tipos; a página pública recebe a lista.

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000a9001', 'gestora-to@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a9002', 'operador-to@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-to', 'Tres Origens', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, avaliacoes_habilitado) values
  ('org-to-loja', 'org-to', 'Casa Tres Origens', 'banco', true, true);
insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status, whatsapp) values
  ('00000000-0000-0000-0000-0000000a9101', '00000000-0000-0000-0000-0000000a9001', 'org-to', null, 'gestao', 'ativo', '+5516999990011'),
  ('00000000-0000-0000-0000-0000000a9102', '00000000-0000-0000-0000-0000000a9002', 'org-to', 'org-to-loja', 'operacional', 'ativo', null);

create or replace function pg_temp.como(p_user_id uuid)
returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
create or replace function pg_temp.servidor()
returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', null, true);
$$;
create or replace function pg_temp.reg(p_origem text, p_aparelho text)
returns jsonb language sql as $$
  select public.avaliacoes_registrar((select slug from public.avaliacoes_pesquisas where unidade_id = 'org-to-loja'), p_origem,
    '{"atendimento": 5, "comida": 5, "tempo": 5, "ambiente": 5, "pedido_certo": true, "embalagem": 5, "entrega": 5, "atendimento_pedido": 5, "espera": "ate_15", "nps": 10, "conheceu": "ifood", "comentario": "Chegou quente"}'::jsonb,
    null, false, 1, '', 20000, repeat('e', 64), rpad(p_aparelho, 64, '0'), now())
$$;

select pg_temp.como('00000000-0000-0000-0000-0000000a9001');
select isnt(public.avaliacoes_criar_pesquisa('org-to-loja'), null, 'gestão cria a pesquisa');
select is((select origens from avaliacoes_pesquisas where unidade_id = 'org-to-loja'), array['salao', 'delivery', 'app']::text[],
  'nasce com os três tipos ligados');

select pg_temp.servidor();
select is(pg_temp.reg('app', 'a1') ->> 'ok', 'true', 'avaliação de app de entrega grava');
select is(pg_temp.reg('ifood', 'a2') ->> 'codigo', 'nao_encontrada', 'origem desconhecida não grava');
select ok((public.avaliacoes_pesquisa_publica((select slug from avaliacoes_pesquisas where unidade_id = 'org-to-loja')) -> 'origens') ? 'app',
  'a página pública recebe os tipos ligados');

select pg_temp.como('00000000-0000-0000-0000-0000000a9002');
select throws_ok($$ select public.avaliacoes_definir_origens('org-to-loja', array['salao']) $$, '42501', 'sem_permissao',
  'operação não muda os tipos');

select pg_temp.como('00000000-0000-0000-0000-0000000a9001');
select throws_ok($$ select public.avaliacoes_definir_origens('org-to-loja', array[]::text[]) $$, '22023', 'origens_vazias',
  'pelo menos um tipo fica ligado');
select throws_ok($$ select public.avaliacoes_definir_origens('org-to-loja', array['salao', 'ifood']) $$, '22023', 'pedido_invalido',
  'só tipos conhecidos');
select lives_ok($$ select public.avaliacoes_definir_origens('org-to-loja', array['app', 'salao', 'salao']) $$, 'gestão desliga o delivery próprio');
select is((select origens from avaliacoes_pesquisas where unidade_id = 'org-to-loja'), array['salao', 'app']::text[],
  'grava sem repetir e na ordem fixa');

select pg_temp.servidor();
select is(pg_temp.reg('delivery', 'a3') ->> 'codigo', 'encerrada', 'tipo desligado responde pausada');

select * from finish();
rollback;
