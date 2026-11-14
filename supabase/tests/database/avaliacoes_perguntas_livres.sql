-- Avaliações: perguntas da gestão e pergunta por tipo (20261114120000_avaliacoes_perguntas_livres.sql).
-- Prova: a gestão cria pergunta própria (estrelas, lista) e escolhe em que pesquisas aparece; a lista
-- gravada guarda tipo, opções e ordem; a gravação cobra a obrigatória só onde vale, aceita opção só
-- da lista, guarda em `extras` e estrela até 2 vira nota baixa; pergunta do modelo desligada num tipo
-- deixa de ser cobrada só nele; pergunta do modelo não vai para tipo em que não faz sentido; limite
-- de 10 próprias; a sessão lê `extras`.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000d9001', 'gestora-pl@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-pl', 'Perguntas Livres', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, avaliacoes_habilitado) values
  ('org-pl-loja', 'org-pl', 'Casa Livre', 'banco', true, true);
insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status, whatsapp) values
  ('00000000-0000-0000-0000-0000000d9101', '00000000-0000-0000-0000-0000000d9001', 'org-pl', null, 'gestao', 'ativo', '+5516999990041');

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
returns text language sql as $$ select slug from public.avaliacoes_pesquisas where unidade_id = 'org-pl-loja' $$;
create or replace function pg_temp.reg(p_origem text, p_aparelho text, p_respostas jsonb)
returns jsonb language sql as $$
  select public.avaliacoes_registrar(pg_temp.slug(), p_origem, p_respostas, null, false, 1, '', 20000,
    repeat('e', 64), rpad(p_aparelho, 64, '0'), now())
$$;
create or replace function pg_temp.resposta(p_aparelho text)
returns public.avaliacoes_respostas language sql as $$
  select * from public.avaliacoes_respostas where unidade_id = 'org-pl-loja' and hash_dispositivo = rpad(p_aparelho, 64, '0')
$$;

-- Lista base: o modelo, com "comida" desligada no app, mais duas perguntas próprias no meio.
create temp table pl as
select (
  select jsonb_agg(q order by o)
    from (
      select case when q ->> 'chave' = 'comida' then q || '{"origens": ["salao", "delivery"]}'::jsonb else q end as q, o * 10 as o
        from jsonb_array_elements(public.avaliacoes_perguntas_padrao()) with ordinality e(q, o)
      union all
      select '{"chave": "extra_preco1", "texto": "E o preço?", "ativa": true, "origens": ["salao", "app"], "tipo": "estrelas", "obrigatoria": true}'::jsonb, 15
      union all
      select '{"chave": "extra_burg01", "texto": "Qual foi o seu burger?", "ativa": true, "origens": ["app"], "tipo": "escolha", "obrigatoria": false, "opcoes": [" Smash ", "Duplo"]}'::jsonb, 16
    ) x
) as lista;
grant select on pl to authenticated;

select pg_temp.como('00000000-0000-0000-0000-0000000d9001');
select isnt(public.avaliacoes_criar_pesquisa('org-pl-loja'), null, 'gestão cria a pesquisa');
select lives_ok($$ select public.avaliacoes_salvar_perguntas('org-pl-loja', (select lista from pl)) $$, 'gestão grava a lista com perguntas próprias');
select is((select perguntas -> 2 ->> 'chave' from avaliacoes_pesquisa_versoes v join avaliacoes_pesquisas p on p.id = v.pesquisa_id and v.versao = p.versao_atual
            where p.unidade_id = 'org-pl-loja'), 'extra_preco1', 'a ordem enviada é a ordem gravada');
select is((select q -> 'opcoes' from avaliacoes_pesquisa_versoes v join avaliacoes_pesquisas p on p.id = v.pesquisa_id and v.versao = p.versao_atual,
                  jsonb_array_elements(v.perguntas) q
            where p.unidade_id = 'org-pl-loja' and q ->> 'chave' = 'extra_burg01'), '["Smash", "Duplo"]'::jsonb, 'opções gravadas sem espaço sobrando');
select throws_ok($$ select public.avaliacoes_salvar_perguntas('org-pl-loja',
    (select jsonb_agg(case when q ->> 'chave' = 'atendimento' then q || '{"origens": ["app"]}'::jsonb else q end) from pl, jsonb_array_elements(pl.lista) q)) $$,
  '22023', 'perguntas_invalidas', 'pergunta do modelo não vai para tipo em que não faz sentido');
select throws_ok($$ select public.avaliacoes_salvar_perguntas('org-pl-loja',
    (select jsonb_agg(case when q ->> 'chave' = 'extra_burg01' then q || '{"opcoes": ["Smash"]}'::jsonb else q end) from pl, jsonb_array_elements(pl.lista) q)) $$,
  '22023', 'opcoes_invalidas', 'lista com uma opção só é recusada');
select throws_ok($$ select public.avaliacoes_salvar_perguntas('org-pl-loja',
    (select lista || (select jsonb_agg(jsonb_build_object('chave', 'extra_x0000' || g, 'texto', 'Pergunta ' || g, 'ativa', true,
                                                          'origens', '["salao"]'::jsonb, 'tipo', 'texto', 'obrigatoria', false))
                        from generate_series(0, 8) g) from pl)) $$,
  '22023', 'livres_demais', 'até 10 perguntas próprias');

-- ── Gravação ───────────────────────────────────────────────────────────────
select pg_temp.servidor();
select is(pg_temp.reg('app', 'p1', '{"pedido_certo": true, "embalagem": 5, "nps": 10, "extra_burg01": "Smash"}') ->> 'campo', 'extra_preco1',
  'própria obrigatória cobrada onde vale');
select is(pg_temp.reg('app', 'p2', '{"pedido_certo": true, "embalagem": 5, "nps": 10, "extra_preco1": 4, "extra_burg01": "Frango"}') ->> 'campo', 'extra_burg01',
  'opção fora da lista é recusada');
select is(pg_temp.reg('app', 'p3', '{"pedido_certo": true, "embalagem": 5, "nps": 10, "extra_preco1": 2, "extra_burg01": "Smash"}') ->> 'ok', 'true',
  'app grava sem a comida (desligada só no app)');
select ok((select extras = '{"extra_preco1": 2, "extra_burg01": "Smash"}'::jsonb and comida is null and nota_baixa from pg_temp.resposta('p3')),
  'respostas próprias em extras; estrela 2 vira nota baixa');
select is(pg_temp.reg('delivery', 'p4', '{"pedido_certo": true, "embalagem": 5, "entrega": 5, "atendimento_pedido": 5, "nps": 10}') ->> 'campo', 'comida',
  'no delivery a comida continua obrigatória');
select is(pg_temp.reg('delivery', 'p5', '{"pedido_certo": true, "comida": 5, "embalagem": 5, "entrega": 5, "atendimento_pedido": 5, "nps": 10, "extra_preco1": 1}') ->> 'ok', 'true',
  'delivery grava e ignora a própria que não vale nele');
select ok((select extras is null and not nota_baixa from pg_temp.resposta('p5')), 'resposta de pergunta que não vale no tipo nem é guardada');

select * from finish();
rollback;
