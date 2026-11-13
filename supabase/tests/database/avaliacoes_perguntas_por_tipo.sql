-- Avaliações: perguntas próprias de cada tipo (20261113150000_avaliacoes_perguntas_por_tipo.sql).
-- Prova: modelo novo nasce com quem atendeu desligada; cada tipo cobra só as próprias perguntas e
-- ignora as dos outros; pedido errado, estrela nova até 2 e entrega ruim viram nota baixa; quem
-- atendeu só aceita nome da lista ou "não lembro"; nomes e link de pedir direto só com permissão
-- de editar, sem repetir e com https; a página pública recebe os dois; cores sem contraste mínimo.

begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000b9001', 'gestora-pt@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b9002', 'operador-pt@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-pt', 'Perguntas Tipo', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, avaliacoes_habilitado) values
  ('org-pt-loja', 'org-pt', 'Casa Perguntas', 'banco', true, true);
insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status, whatsapp) values
  ('00000000-0000-0000-0000-0000000b9101', '00000000-0000-0000-0000-0000000b9001', 'org-pt', null, 'gestao', 'ativo', '+5516999990021'),
  ('00000000-0000-0000-0000-0000000b9102', '00000000-0000-0000-0000-0000000b9002', 'org-pt', 'org-pt-loja', 'operacional', 'ativo', null);

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
create or replace function pg_temp.slug()
returns text language sql as $$ select slug from public.avaliacoes_pesquisas where unidade_id = 'org-pt-loja' $$;
create or replace function pg_temp.reg(p_origem text, p_aparelho text, p_respostas jsonb)
returns jsonb language sql as $$
  select public.avaliacoes_registrar(pg_temp.slug(), p_origem, p_respostas, null, false, 1, '', 20000,
    repeat('f', 64), rpad(p_aparelho, 64, '0'), now())
$$;
create or replace function pg_temp.resposta(p_aparelho text)
returns public.avaliacoes_respostas language sql as $$
  select * from public.avaliacoes_respostas where unidade_id = 'org-pt-loja' and hash_dispositivo = rpad(p_aparelho, 64, '0')
$$;

select pg_temp.como('00000000-0000-0000-0000-0000000b9001');
select isnt(public.avaliacoes_criar_pesquisa('org-pt-loja'), null, 'gestão cria a pesquisa');
select is((select q ->> 'ativa' from avaliacoes_pesquisa_versoes v, jsonb_array_elements(v.perguntas) q
            where v.pesquisa_id = (select id from avaliacoes_pesquisas where unidade_id = 'org-pt-loja') and q ->> 'chave' = 'atendente'),
  'false', 'quem atendeu nasce desligada');

-- ── Cada tipo cobra as próprias perguntas ──────────────────────────────────
select pg_temp.servidor();
select is(pg_temp.reg('app', 'a1', '{"comida": 5, "embalagem": 5, "nps": 10}') ->> 'campo', 'pedido_certo',
  'app sem "pedido certo" não grava');
select is(pg_temp.reg('app', 'a2', '{"pedido_certo": false, "comida": 5, "embalagem": 5, "nps": 10, "atendimento": 1, "tempo": 1}') ->> 'ok', 'true',
  'app com pedido errado grava');
select ok((select nota_baixa and atendimento is null and tempo is null and pedido_certo = false from pg_temp.resposta('a2')),
  'pedido errado vira nota baixa; atendimento e tempo (do salão) são ignorados no app');
select is(pg_temp.reg('salao', 'a3', '{"atendimento": 5, "comida": 5, "ambiente": 5, "nps": 9}') ->> 'campo', 'tempo',
  'salão sem tempo até a mesa não grava');
select is(pg_temp.reg('salao', 'a4', '{"atendimento": 5, "comida": 5, "tempo": 4, "ambiente": 2, "nps": 9}') ->> 'ok', 'true',
  'salão completo grava');
select ok((select nota_baixa and ambiente = 2 and tempo = 4 from pg_temp.resposta('a4')), 'ambiente 2 vira nota baixa');
select is(pg_temp.reg('delivery', 'a5', '{"pedido_certo": true, "comida": 5, "embalagem": 5, "entrega": 5, "atendimento_pedido": 5, "nps": 10}') ->> 'ok', 'true',
  'delivery completo grava');
select ok((select not nota_baixa and entrega = 5 and atendimento_pedido = 5 from pg_temp.resposta('a5')), 'delivery bom não vira nota baixa');

-- ── Quem atendeu e pedir direto ────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000b9002');
select throws_ok($$ select public.avaliacoes_salvar_extras('org-pt-loja', array['Bruno'], null) $$, '42501', 'sem_permissao',
  'operação não edita quem atende');

select pg_temp.como('00000000-0000-0000-0000-0000000b9001');
select throws_ok($$ select public.avaliacoes_salvar_extras('org-pt-loja', array['Bruno'], 'http://wa.me/5516999990000') $$,
  '22023', 'link_pedido_invalido', 'link de pedir direto só https');
select lives_ok($$ select public.avaliacoes_salvar_extras('org-pt-loja', array[' Bruno ', 'bruno', '', 'Carla  Souza'], 'https://wa.me/5516999990000') $$,
  'gestão salva nomes e link');
select is((select atendentes from avaliacoes_pesquisas where unidade_id = 'org-pt-loja'), array['Bruno', 'Carla Souza']::text[],
  'nomes sem espaço sobrando e sem repetir');
select lives_ok($$ select public.avaliacoes_salvar_perguntas('org-pt-loja',
  (select jsonb_agg(case when q ->> 'chave' = 'atendente' then jsonb_set(q, '{ativa}', 'true') else q end)
     from jsonb_array_elements(public.avaliacoes_perguntas_padrao()) q)) $$, 'gestão liga "quem atendeu"');

select pg_temp.servidor();
select is(pg_temp.reg('salao', 'b1', '{"atendimento": 5, "comida": 5, "tempo": 5, "ambiente": 5, "nps": 10, "atendente": "Zé"}') ->> 'campo', 'atendente',
  'nome fora da lista não grava');
select is(pg_temp.reg('salao', 'b2', '{"atendimento": 5, "comida": 5, "tempo": 5, "ambiente": 5, "nps": 10, "atendente": "Carla Souza"}') ->> 'ok', 'true',
  'nome da lista grava');
select is((select atendente from pg_temp.resposta('b2')), 'Carla Souza', 'guarda quem atendeu');
select ok((public.avaliacoes_pesquisa_publica(pg_temp.slug()) ->> 'linkPedidoDireto') = 'https://wa.me/5516999990000'
          and (public.avaliacoes_pesquisa_publica(pg_temp.slug()) -> 'atendentes') ? 'Bruno',
  'a página pública recebe os nomes e o link');

-- ── Cores sem contraste mínimo ────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000b9001');
select lives_ok($$ select public.avaliacoes_salvar_marca('org-pt-loja', 'Casa Perguntas', '#FCBB23', '#FFF9EC', 'Valeu!', null, true) $$,
  'amarelo da marca sobre fundo creme salva');

select * from finish();
rollback;
