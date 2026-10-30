-- Insumo novo pela ficha técnica (decisão de Vinícius, 29/10/2026).
-- Prova: quem edita ficha (chef da operação, gerente chef, gestão que edita o Cardápio) cria
-- produto mesmo sem "editar" em Cadastros, só com os campos do cadastro rápido; não muda nem
-- apaga produto existente; a operação sem chef, a gestão que só vê o Cardápio e Cadastros e o
-- chef de unidade sem Fichas Técnicas seguem sem criar; gestão com Cadastros e master criam como
-- antes, com todos os campos. Desde 30/10/2026, pela ficha só grupo que entra em ficha (nunca LIM
-- nem OPE) e sem estoque mínimo nem estoque necessário da semana. Operador do Vini não executa as funções novas. Só fixtures de teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(36);

grant vini_operador to current_user;

-- ── Fixture ──────────────────────────────────────────────────────────────
-- c101 master | c102 gestão de todas | c103 gerente loja 1 chef, só vê Cadastros |
-- c104 operacional sem exceção | c105 operacional chef | c106 gestão loja 1 que só vê Cadastros |
-- c107 gestão loja 1 que só vê Cardápio e Cadastros | c108 operacional chef na loja sem fichas
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000c101', 'cp-master@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c102', 'cp-gestao@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c103', 'cp-gerente-chef@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c104', 'cp-oper@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c105', 'cp-chef@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c106', 'cp-gestao-ver-cad@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c107', 'cp-gestao-ver@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c108', 'cp-chef-sem-ficha@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo, equipe_habilitado) values
  ('org-cp', 'Cliente CP', 'saas', true, true),
  ('org-cp-outra', 'Cliente CP outra', 'saas', true, true);

insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, fichas_tecnicas_habilitado) values
  ('cp-loja1', 'org-cp', 'Loja 1 CP', 'banco', true, true),
  ('cp-loja2', 'org-cp', 'Loja 2 CP', 'banco', true, false),
  ('cp-loja3', 'org-cp', 'Loja 3 CP', 'banco', true, true),
  ('cp-outra', 'org-cp-outra', 'Outra CP', 'banco', true, true);

insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000c0a01', '00000000-0000-0000-0000-00000000c101', 'org-cp-outra', null, 'master', 'ativo'),
  ('00000000-0000-0000-0000-0000000c0a02', '00000000-0000-0000-0000-00000000c102', 'org-cp', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000c0a03', '00000000-0000-0000-0000-00000000c103', 'org-cp', 'cp-loja1', 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000c0a04', '00000000-0000-0000-0000-00000000c104', 'org-cp', 'cp-loja1', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000c0a05', '00000000-0000-0000-0000-00000000c105', 'org-cp', 'cp-loja1', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000c0a06', '00000000-0000-0000-0000-00000000c106', 'org-cp', 'cp-loja1', 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000c0a07', '00000000-0000-0000-0000-00000000c107', 'org-cp', 'cp-loja1', 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000c0a08', '00000000-0000-0000-0000-00000000c108', 'org-cp', 'cp-loja2', 'operacional', 'ativo');

insert into permissoes_modulo (vinculo_id, modulo, nivel) values
  ('00000000-0000-0000-0000-0000000c0a03', 'cardapio', 'chef'),
  ('00000000-0000-0000-0000-0000000c0a03', 'cadastros', 'ver'),
  ('00000000-0000-0000-0000-0000000c0a05', 'cardapio', 'chef'),
  ('00000000-0000-0000-0000-0000000c0a06', 'cadastros', 'ver'),
  ('00000000-0000-0000-0000-0000000c0a07', 'cardapio', 'ver'),
  ('00000000-0000-0000-0000-0000000c0a07', 'cadastros', 'ver'),
  ('00000000-0000-0000-0000-0000000c0a08', 'cardapio', 'chef');

insert into produtos (unidade_id, sku, grupo, nome, unidade_base, preco_unitario, ativo) values
  ('cp-loja1', 'HORTOM001', 'HOR', 'tomate', 'KG', 5, true);

create or replace function pg_temp.como(p_user text, p_aal text default 'aal1')
returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

create or replace function pg_temp.servidor()
returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', null, true);
$$;

-- ── Quem executa ─────────────────────────────────────────────────────────
select ok(not has_function_privilege('vini_operador', 'public.usuario_pode_criar_produto_pela_ficha(text)', 'EXECUTE')
  and not has_function_privilege('vini_operador', 'public.exigir_permissao_criar_produto()', 'EXECUTE'),
  'operador do Vini não executa as funções novas');
select ok(not has_function_privilege('anon', 'public.usuario_pode_criar_produto_pela_ficha(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.exigir_permissao_criar_produto()', 'EXECUTE'),
  'anônimo não consulta a regra e ninguém chama o gatilho direto');

-- ── Chef da operação ─────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-00000000c105');
select lives_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, preco_unitario,
    nome_compra, observacoes)
  values ('cp-loja1', 'MERPBA001', 'MER', 'pão brioche', 'UN', 1.5, 'pão brioche', 'do chef')$$,
  'chef cria insumo com os campos do cadastro rápido');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, estoque_minimo)
  values ('cp-loja1', 'MERPBA016', 'MER', 'pão de hambúrguer', 'UN', 10)$$, '42501',
  'Pela ficha técnica o insumo nasce sem estoque mínimo e sem estoque necessário da semana. Esses ficam em Cadastros.',
  'chef não cria com estoque mínimo');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, estoque_necessario_semana)
  values ('cp-loja1', 'MERPBA017', 'MER', 'pão de batata doce', 'UN', 20)$$, '42501', null,
  'chef não cria com estoque necessário da semana');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base)
  values ('cp-loja1', 'LIMDET001', 'LIM', 'detergente', 'UN')$$, '42501',
  'Pela ficha técnica só se cadastra insumo de grupo que entra em ficha. Limpeza e Operacional ficam em Cadastros.',
  'chef não cria produto de Limpeza');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base)
  values ('cp-loja1', 'OPEFIT001', ' ope ', 'fita', 'UN')$$, '42501', null,
  'chef não cria produto Operacional (nem com o grupo em minúsculas e espaço)');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base)
  values ('cp-loja1', 'XYZABC001', 'XYZ', 'grupo inventado', 'UN')$$, '42501', null,
  'chef não cria produto com grupo inventado');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, fornecedor_1)
  values ('cp-loja1', 'MERPBA002', 'MER', 'pão australiano', 'UN', 'FTC001')$$, '42501',
  'Pela ficha técnica o insumo nasce só com o cadastro rápido. Fornecedor, embalagem, revenda e pré-preparo ficam em Cadastros.',
  'chef não cria com fornecedor');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, revenda)
  values ('cp-loja1', 'BEBREF001', 'BEB', 'refrigerante', 'UN', true)$$, '42501', null,
  'chef não cria produto de revenda');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, ativo)
  values ('cp-loja1', 'MERPBA003', 'MER', 'pão de batata', 'UN', false)$$, '42501', null,
  'chef não cria produto inativo');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, unidade_embalagem_fornecedor, qtd_unidade_base_por_embalagem)
  values ('cp-loja1', 'MERPBA004', 'MER', 'pão de forma', 'UN', 'PCT', 10)$$, '42501', null,
  'chef não cria com embalagem do fornecedor');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, pre_preparo)
  values ('cp-loja1', 'PRE000009', 'PRE', 'molho do chef', 'KG', true)$$, '42501', null,
  'chef não marca pré-preparo na criação');
update produtos set nome = 'tomate do chef' where unidade_id = 'cp-loja1' and sku = 'HORTOM001';
delete from produtos where unidade_id = 'cp-loja1' and sku = 'HORTOM001';
select pg_temp.servidor();
select is((select nome from produtos where unidade_id = 'cp-loja1' and sku = 'HORTOM001'), 'tomate',
  'chef não muda nem apaga produto existente');
select is((select array[nome, coalesce(preco_unitario::text, 'nulo'), ativo::text, revenda::text]
             from produtos where unidade_id = 'cp-loja1' and sku = 'MERPBA001'),
  array['pão brioche', '1.5', 'true', 'false'], 'o insumo do chef ficou gravado');
select pg_temp.como('00000000-0000-0000-0000-00000000c105');
update produtos set nome = 'pão do chef' where unidade_id = 'cp-loja1' and sku = 'MERPBA001';
select pg_temp.servidor();
select is((select nome from produtos where unidade_id = 'cp-loja1' and sku = 'MERPBA001'), 'pão brioche',
  'chef não edita nem o insumo que ele mesmo criou');

-- ── Quem segue sem criar ─────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-00000000c104');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base)
  values ('cp-loja1', 'MERPBA005', 'MER', 'pão de queijo', 'UN')$$, '42501', null,
  'operação sem chef não cria produto');
select pg_temp.como('00000000-0000-0000-0000-00000000c107');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base)
  values ('cp-loja1', 'MERPBA006', 'MER', 'pão sírio', 'UN')$$, '42501',
  'Seu acesso a Cadastros é só para ver. Peça a quem administra a equipe para liberar a edição.',
  'gestão que só vê Cardápio e Cadastros não cria produto');
select pg_temp.como('00000000-0000-0000-0000-00000000c108');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base)
  values ('cp-loja2', 'MERPBA007', 'MER', 'pão francês', 'UN')$$, '42501', null,
  'chef de unidade sem Fichas Técnicas não cria produto');
select pg_temp.como('00000000-0000-0000-0000-00000000c105');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base)
  values ('cp-loja3', 'MERPBA008', 'MER', 'pão de milho', 'UN')$$, '42501', null,
  'chef não cria produto em outra unidade da organização (com Fichas ligada)');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base)
  values ('cp-outra', 'MERPBA013', 'MER', 'pão de outra', 'UN')$$, '42501', null,
  'chef não cria produto em outra organização');
select lives_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, criado_em)
  values ('cp-loja1', 'MERPBA014', 'MER', 'pão velho', 'UN', '2020-01-01')$$,
  'chef cria informando data de criação antiga');
select pg_temp.servidor();
select ok((select criado_em > now() - interval '1 minute' from produtos where unidade_id = 'cp-loja1' and sku = 'MERPBA014'),
  'o banco carimba a data de criação do insumo do chef');

-- ── Gerente chef e gestão que só vê Cadastros: pela ficha, com as travas ─
select pg_temp.como('00000000-0000-0000-0000-00000000c103');
select lives_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base)
  values ('cp-loja1', 'MERPBA009', 'MER', 'pão integral', 'UN')$$, 'gerente chef cria insumo');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, fornecedor_1)
  values ('cp-loja1', 'MERPBA010', 'MER', 'pão preto', 'UN', 'FTC001')$$, '42501', null,
  'gerente chef não cria com fornecedor');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, estoque_minimo)
  values ('cp-loja1', 'MERPBA018', 'MER', 'pão de centeio', 'UN', 5)$$, '42501', null,
  'gerente chef não cria com estoque mínimo');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base)
  values ('cp-loja1', 'OPEFIT002', 'OPE', 'fita adesiva', 'UN')$$, '42501', null,
  'gerente chef não cria produto Operacional');
select throws_ok($$update produtos set nome = 'tomate do gerente' where unidade_id = 'cp-loja1' and sku = 'HORTOM001'$$,
  '42501', null, 'gerente chef segue sem mudar o cadastro do produto');
select throws_ok($$delete from produtos where unidade_id = 'cp-loja1' and sku = 'HORTOM001'$$,
  '42501', null, 'gerente chef segue sem apagar produto');
select pg_temp.como('00000000-0000-0000-0000-00000000c106');
select lives_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base)
  values ('cp-loja1', 'MERPBA011', 'MER', 'pão de leite', 'UN')$$,
  'gestão que só vê Cadastros e edita o Cardápio cria insumo pela regra da ficha');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, revenda)
  values ('cp-loja1', 'BEBREF002', 'BEB', 'suco', 'UN', true)$$, '42501', null,
  'gestão que só vê Cadastros não cria revenda');

-- ── Gestão com Cadastros e master: como antes, com todos os campos ───────
select pg_temp.como('00000000-0000-0000-0000-00000000c102');
select lives_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, fornecedor_1, revenda)
  values ('cp-loja1', 'BEBREF003', 'BEB', 'água', 'UN', 'FTC001', true)$$,
  'gestão com Cadastros cria com fornecedor e revenda como antes');
select lives_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, estoque_minimo, estoque_necessario_semana)
  values ('cp-loja1', 'LIMDET002', 'LIM', 'sabão', 'UN', 2, 6)$$,
  'gestão com Cadastros cria Limpeza com estoque mínimo e da semana como antes');
select pg_temp.como('00000000-0000-0000-0000-00000000c101', 'aal2');
select lives_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base, fornecedor_1, estoque_minimo)
  values ('cp-loja1', 'MERPBA012', 'MER', 'pão de alho', 'UN', 'FTC001', 3)$$,
  'master cria com fornecedor e estoque mínimo como antes');
select lives_ok($$delete from produtos where unidade_id = 'cp-loja1' and sku = 'MERPBA012'$$,
  'master apaga como antes');
select pg_temp.como('00000000-0000-0000-0000-00000000c101', 'aal1');
select throws_ok($$insert into produtos (unidade_id, sku, grupo, nome, unidade_base)
  values ('cp-loja1', 'MERPBA015', 'MER', 'pão sem 2fa', 'UN')$$, '42501', null,
  'master sem segundo fator não cria');

select * from finish();
rollback;
