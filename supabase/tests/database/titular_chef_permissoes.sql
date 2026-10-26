-- Titular, chef no Cardápio e a barreira do banco de Estoque, Garante e Cadastros (26/10/2026).
-- Prova: só o servidor e só o master marcam o titular; marcar, trocar e tirar; sem titular vale
-- a reserva (gestão da organização inteira); com titular, só ele e o master administram
-- permissões, e a conta dele só o master mexe (senha provisória e editar acesso). Chef grava
-- ficha e modo de preparo, preço só como rascunho, nunca o oficial nem a Margem Ideal; a
-- operação sem chef segue só vendo. Estoque, Garante e Cadastros: sem exceção, contagem e
-- checklist seguem iguais; "sem acesso" não lê nem grava; "ver" lê e não grava. Operador do
-- Vini não executa nenhuma função nova. Só fixtures de teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(97);

grant vini_operador to current_user;
grant select, insert, update, delete on garante_modelos, garante_itens, garante_publicacoes,
  garante_execucoes, garante_respostas to authenticated;

-- ── Fixture ──────────────────────────────────────────────────────────────
-- e001 master | e002 gestão de todas (D1) | e003 gestão de todas (D2) | e004 gerente da loja 1 |
-- e005 operacional sem exceção | e006 operacional chef | e007 operacional sem acesso (Estoque e
-- Garante) | e008 operacional só vê (Estoque e Garante)
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000e001', 'tc-master@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e002', 'tc-d1@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e003', 'tc-d2@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e004', 'tc-gerente@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e005', 'tc-oper@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e006', 'tc-chef@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e007', 'tc-sem@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e008', 'tc-ver@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e009', 'tc-sai@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo, equipe_habilitado) values
  ('org-tc', 'Cliente TC', 'saas', true, true),
  ('org-tc-outra', 'Cliente TC outra', 'saas', true, true);

insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, fichas_tecnicas_habilitado, garante_habilitado) values
  ('tc-loja1', 'org-tc', 'Loja 1 TC', 'banco', true, true, true),
  ('tc-loja2', 'org-tc', 'Loja 2 TC', 'banco', true, true, true),
  ('tc-outra', 'org-tc-outra', 'Outra TC', 'banco', true, true, true);

insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-00000000e001', 'org-tc-outra', null, 'master', 'ativo'),
  ('00000000-0000-0000-0000-0000000e0a02', '00000000-0000-0000-0000-00000000e002', 'org-tc', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000e0a03', '00000000-0000-0000-0000-00000000e003', 'org-tc', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000e0a04', '00000000-0000-0000-0000-00000000e004', 'org-tc', 'tc-loja1', 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000e0a05', '00000000-0000-0000-0000-00000000e005', 'org-tc', 'tc-loja1', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000e0a06', '00000000-0000-0000-0000-00000000e006', 'org-tc', 'tc-loja1', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000e0a07', '00000000-0000-0000-0000-00000000e007', 'org-tc', 'tc-loja1', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000e0a08', '00000000-0000-0000-0000-00000000e008', 'org-tc', 'tc-loja1', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000e0a09', '00000000-0000-0000-0000-00000000e009', 'org-tc', 'tc-loja1', 'operacional', 'ativo');

insert into categorias_ficha (id, unidade_id, camada, codigo, nome) values
  ('00000000-0000-0000-0000-0000000e0c01', 'tc-loja1', 'PRE', 'MOL', 'molhos');
insert into produtos (unidade_id, sku, grupo, nome, unidade_base, preco_unitario, ativo) values
  ('tc-loja1', 'HORTOM001', 'HOR', 'tomate', 'KG', 5, true);
insert into contagens (id, unidade_id, data, mes, criado_por, modalidade) values
  ('00000000-0000-0000-0000-0000000e0d01', 'tc-loja1', '2026-10-01', '2026-10', '00000000-0000-0000-0000-00000000e005', 'legada');
insert into contagem_itens (contagem_id, sku, quantidade) values
  ('00000000-0000-0000-0000-0000000e0d01', 'HORTOM001', 3);

insert into pedidos (id, unidade_id, fornecedor, data_contagem_base, criado_por) values
  ('00000000-0000-0000-0000-0000000e0b11', 'tc-loja1', 'Fornecedor TC', '2026-10-01', '00000000-0000-0000-0000-00000000e002');
insert into pedido_itens (pedido_id, sku, nome, unidade_base, quantidade_pedida) values
  ('00000000-0000-0000-0000-0000000e0b11', 'HORTOM001', 'tomate', 'KG', 2);
insert into fornecedores (unidade_id, codigo, nome_fantasia) values ('tc-loja1', 'FTC001', 'Fornecedor TC');

insert into garante_modelos (id, unidade_id, nome) values
  ('00000000-0000-0000-0000-0000000e0b01', 'tc-loja1', 'Abertura TC'),
  ('00000000-0000-0000-0000-0000000e0b02', 'tc-loja1', 'Fechamento TC');
insert into garante_itens (id, modelo_id, unidade_id, ordem, titulo, tipo, critico, permite_na, foto_obrigatoria) values
  ('00000000-0000-0000-0000-0000000e0e01', '00000000-0000-0000-0000-0000000e0b01', 'tc-loja1', 1, 'Ligar o fogão', 'check', false, true, false),
  ('00000000-0000-0000-0000-0000000e0e02', '00000000-0000-0000-0000-0000000e0b02', 'tc-loja1', 1, 'Desligar o gás', 'check', false, true, false);
insert into garante_publicacoes (id, modelo_id, unidade_id, responsavel_id, dias_semana, horario_limite, vigente_desde) values
  ('00000000-0000-0000-0000-0000000e0f01', '00000000-0000-0000-0000-0000000e0b01', 'tc-loja1',
   '00000000-0000-0000-0000-00000000e005', array[0,1,2,3,4,5,6]::smallint[], '10:00', current_date - 7),
  ('00000000-0000-0000-0000-0000000e0f02', '00000000-0000-0000-0000-0000000e0b02', 'tc-loja1',
   '00000000-0000-0000-0000-00000000e008', array[0,1,2,3,4,5,6]::smallint[], '10:00', current_date - 7);
insert into garante_regras_unidade (unidade_id, vigente_desde, antecedencia_min, atraso_max_min) values
  ('tc-loja1', current_date - 30, 600, 1440);

create temp table tc (nome text primary key, id uuid);
grant all on tc to authenticated;

create or replace function pg_temp.como(p_user text)
returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;

create or replace function pg_temp.servidor()
returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', null, true);
$$;

create or replace function pg_temp.salvar(p_ator text, p_vinculo text, p_niveis jsonb)
returns text language sql as $$
  select public.salvar_permissoes_modulo(p_ator::uuid, 'org-tc', p_vinculo::uuid, p_niveis);
$$;

create or replace function pg_temp.marcar(p_ator text, p_vinculo text)
returns text language sql as $$
  select public.marcar_titular_organizacao(p_ator::uuid, 'org-tc', p_vinculo::uuid);
$$;

-- ── Quem executa ─────────────────────────────────────────────────────────
select ok(not has_function_privilege('authenticated', 'public.marcar_titular_organizacao(uuid, text, uuid)', 'EXECUTE'),
  'app logado não marca titular direto');
select ok(not has_function_privilege('anon', 'public.marcar_titular_organizacao(uuid, text, uuid)', 'EXECUTE'),
  'anônimo não marca titular');
select ok(has_function_privilege('service_role', 'public.marcar_titular_organizacao(uuid, text, uuid)', 'EXECUTE'),
  'servidor marca titular');
select ok(not has_function_privilege('vini_operador', 'public.marcar_titular_organizacao(uuid, text, uuid)', 'EXECUTE'),
  'operador do Vini não marca titular');
select ok(not has_function_privilege('vini_operador', 'public.titular_valido_da_organizacao(text)', 'EXECUTE')
  and not has_function_privilege('vini_operador', 'public.vinculo_e_dono(uuid)', 'EXECUTE')
  and not has_function_privilege('vini_operador', 'public.conta_e_titular(uuid)', 'EXECUTE')
  and not has_function_privilege('vini_operador', 'public.titulares_das_minhas_organizacoes()', 'EXECUTE'),
  'operador do Vini não executa as funções do titular');
select ok(not has_function_privilege('vini_operador', 'public.usuario_e_chef_cardapio(text)', 'EXECUTE')
  and not has_function_privilege('vini_operador', 'public.usuario_pode_editar_fichas(text)', 'EXECUTE')
  and not has_function_privilege('vini_operador', 'public.usuario_pode_editar_ficha_id(uuid)', 'EXECUTE')
  and not has_function_privilege('vini_operador', 'public.proteger_preco_oficial_ficha()', 'EXECUTE')
  and not has_function_privilege('vini_operador', 'public.exigir_permissao_modulo_pela_mae()', 'EXECUTE')
  and not has_function_privilege('vini_operador', 'public.salvar_permissoes_modulo(uuid, text, uuid, jsonb)', 'EXECUTE'),
  'operador do Vini não executa as funções de chef, barreira e permissões');
select ok(not has_function_privilege('vini_operador', 'public.gerar_senha_provisoria_conta(uuid, uuid, text, text, text, timestamptz)', 'EXECUTE')
  and not has_function_privilege('vini_operador', 'public.editar_vinculo_acesso(uuid, uuid, text, text, text, text)', 'EXECUTE'),
  'operador do Vini segue sem senha provisória e sem editar acesso');
select ok(not has_function_privilege('vini_operador', 'public.revogar_vinculo_equipe(uuid, uuid, text)', 'EXECUTE')
  and not has_function_privilege('vini_operador', 'public.atualizar_whatsapp_vinculo(uuid, uuid, text, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.revogar_vinculo_equipe(uuid, uuid, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.atualizar_whatsapp_vinculo(uuid, uuid, text, text)', 'EXECUTE'),
  'tirar acesso e trocar WhatsApp: só o servidor executa');
select ok(not has_table_privilege('vini_operador', 'public.titulares_organizacao', 'INSERT')
  and not has_table_privilege('vini_operador', 'public.titulares_organizacao', 'UPDATE'),
  'operador do Vini só lê a tabela de titulares');
select pg_temp.como('00000000-0000-0000-0000-00000000e002');
select throws_ok($$select count(*) from public.titulares_organizacao$$, '42501', null,
  'app logado não lê a tabela de titulares direto');

-- ── Reserva: sem titular, gestão da organização inteira conta como dono ──
select pg_temp.servidor();
select ok(public.vinculo_e_dono('00000000-0000-0000-0000-0000000e0a02')
  and public.vinculo_e_dono('00000000-0000-0000-0000-0000000e0a03'),
  'sem titular: as duas gestões da organização inteira são dono (como hoje)');
select ok(not public.vinculo_e_dono('00000000-0000-0000-0000-0000000e0a04'), 'gerente de uma loja nunca é dono');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000e0a04', '{"financeiro":"ver"}'),
  'ok', 'sem titular: D1 administra a equipe');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000e0a03', '{"financeiro":"ver"}'),
  'alvo_dono', 'sem titular: D1 não mexe em D2 (como hoje)');

-- ── Marcar ───────────────────────────────────────────────────────────────
select is(pg_temp.marcar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000e0a02'),
  'sem_permissao', 'gestão não marca titular');
select is(pg_temp.marcar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000e0a05'),
  'vinculo_invalido', 'operacional não vira titular');
select is(public.marcar_titular_organizacao('00000000-0000-0000-0000-00000000e001', 'org-tc-outra',
  '00000000-0000-0000-0000-0000000e0a02'), 'vinculo_invalido', 'vínculo de outra organização não vira titular');
select is(pg_temp.marcar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000e0a02'),
  'ok', 'master marca D1 como titular');
select is(pg_temp.marcar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000e0a02'),
  'sem_mudanca', 'marcar de novo = sem mudança');
select is((select count(*)::int from logs_auditoria where acao = 'marcar_titular' and entidade_id = 'org-tc'
            and dados_novos ->> 'vinculoId' = '00000000-0000-0000-0000-0000000e0a02'), 1, 'auditoria da marcação');
select is(public.titular_valido_da_organizacao('org-tc'), '00000000-0000-0000-0000-0000000e0a02'::uuid, 'D1 é o titular');
select ok(not public.vinculo_e_dono('00000000-0000-0000-0000-0000000e0a03'), 'com titular, D2 deixa de ser dono');
select is(public.permissao_nivel_padrao('gestao', public.vinculo_e_dono('00000000-0000-0000-0000-0000000e0a03'), 'configuracoes'),
  'sem_acesso', 'D2 não vê Configurações por padrão');
select pg_temp.como('00000000-0000-0000-0000-00000000e002');
select is((select vinculo_id from public.titulares_das_minhas_organizacoes() where organizacao_id = 'org-tc'),
  '00000000-0000-0000-0000-0000000e0a02'::uuid, 'o app lê o titular da própria organização');
select pg_temp.como('00000000-0000-0000-0000-00000000e005');
select is((select count(*)::int from public.titulares_das_minhas_organizacoes() where organizacao_id = 'org-tc-outra'),
  0, 'ninguém lê titular de organização em que não está');

-- ── Com titular: só ele e o master administram ───────────────────────────
select pg_temp.servidor();
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-0000000e0a04', '{"financeiro":"ver"}'),
  'sem_permissao', 'gestão que não é titular não administra permissões');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000e0a03', '{"configuracoes":"ver"}'),
  'ok', 'titular dá Configurações a outra gestão');
select is((select nivel from permissoes_modulo where vinculo_id = '00000000-0000-0000-0000-0000000e0a03' and modulo = 'configuracoes'),
  'ver', 'Configurações de quem não é titular vira exceção');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000e0a02', '{"financeiro":"ver"}'),
  'ok', 'master mexe nas permissões do titular');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000e0a02', '{}'),
  'ok', 'master devolve o titular ao padrão');

-- ── Trocar ───────────────────────────────────────────────────────────────
select is(pg_temp.marcar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000e0a03'),
  'ok', 'master troca o titular para D2');
select ok(public.vinculo_e_dono('00000000-0000-0000-0000-0000000e0a03')
  and not public.vinculo_e_dono('00000000-0000-0000-0000-0000000e0a02'), 'depois da troca, só D2 é dono');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000e0a04', '{"financeiro":"ver"}'),
  'sem_permissao', 'o titular antigo deixa de administrar');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-0000000e0a03', '{"financeiro":"ver"}'),
  'proprio_vinculo', 'titular não mexe nas próprias permissões');

-- ── Conta do titular: só o master ────────────────────────────────────────
select is(public.gerar_senha_provisoria_conta('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000e0a03',
  'equipe', 'org-tc', repeat('a', 64), now() + interval '1 day'), 'alvo_titular',
  'gestão não gera senha provisória para o titular');
select is(public.editar_vinculo_acesso('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000e0a03',
  'equipe', 'org-tc', 'gestao', 'tc-loja1'), 'alvo_titular', 'gestão não edita o acesso do titular');
select is(public.editar_vinculo_acesso('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-0000000e0a04',
  'equipe', 'org-tc', 'gestao', null), 'ok', 'o titular edita o acesso de outra pessoa');
select is(public.gerar_senha_provisoria_conta('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000e0a03',
  'master', null, repeat('b', 64), now() + interval '1 day'), 'ok', 'master gera senha provisória para o titular');
select is(public.revogar_vinculo_equipe('00000000-0000-0000-0000-00000000e002'::uuid, '00000000-0000-0000-0000-0000000e0a03'::uuid,
  'equipe'), 'alvo_titular', 'gestão não tira o acesso do titular');
select is(public.atualizar_whatsapp_vinculo('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000e0a03',
  'equipe', '+5531999990001'), 'alvo_titular', 'gestão não troca o WhatsApp do titular');
select is(public.atualizar_whatsapp_vinculo('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000e0a03',
  'master', '+5531999990002'), 'ok', 'master troca o WhatsApp do titular');
select is(public.revogar_vinculo_equipe('00000000-0000-0000-0000-00000000e003'::uuid, '00000000-0000-0000-0000-0000000e0a09'::uuid,
  'equipe'), 'ok', 'o titular tira o acesso de outra pessoa (quem chama hoje segue funcionando)');

-- ── Tirar o titular volta à reserva ──────────────────────────────────────
select is(pg_temp.marcar('00000000-0000-0000-0000-00000000e001', null), 'ok', 'master tira o titular');
select ok(public.titular_valido_da_organizacao('org-tc') is null
  and public.vinculo_e_dono('00000000-0000-0000-0000-0000000e0a02'), 'sem titular, a reserva volta a valer');
-- O gerente da loja 1 virou gestão de todas no teste acima: volta para a loja 1.
update vinculos set unidade_id = 'tc-loja1' where id = '00000000-0000-0000-0000-0000000e0a04';

-- ── Chef: gravação das permissões ────────────────────────────────────────
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000e0a06', '{"cardapio":"chef"}'),
  'ok', 'operacional pode virar chef no Cardápio');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000e0a06', '{"cardapio":"editar"}'),
  'acima_do_papel', 'operacional não passa de chef');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000e0a06', '{"vendas":"chef"}'),
  'pedido_invalido', 'chef só existe no Cardápio');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000e0a04',
  '{"cardapio":"chef","cadastros":"ver"}'), 'ok', 'gerente vira chef no Cardápio e só vê Cadastros');
select pg_temp.como('00000000-0000-0000-0000-00000000e004');
select throws_ok($$insert into produto_conversoes (unidade_id, produto_sku, unidade_uso, quantidade_unidade_base)
  values ('tc-loja1', 'HORTOM001', 'G', 1000)$$, '42501',
  'Seu acesso ao Cardápio não inclui conversões de unidade. Peça a quem administra a equipe.',
  'gerente rebaixado a chef não grava conversão de unidade');
select pg_temp.servidor();
select throws_ok($$insert into permissoes_modulo (vinculo_id, modulo, nivel)
  values ('00000000-0000-0000-0000-0000000e0a05', 'vendas', 'chef')$$, '23514', null,
  'a tabela recusa chef fora do Cardápio');

-- ── Chef: grava ficha e modo de preparo, preço só como rascunho ──────────
select pg_temp.como('00000000-0000-0000-0000-00000000e006');
insert into tc
select 'ficha', (public.salvar_ficha_tecnica('tc-loja1', null, '00000000-0000-0000-0000-0000000e0c01', 'PRE',
  'molho da casa', 1, 'KG', null, 10, null, '', '', 'rascunho', '[]'::jsonb,
  '[{"ordem":0,"descricao":"Misturar tudo"}]'::jsonb) ->> 'id')::uuid;
select isnt((select id from tc where nome = 'ficha'), null, 'chef cria ficha com modo de preparo');
select lives_ok($$update fichas_tecnicas set tempo_preparo_minutos = 15, atualizado_por = auth.uid()
  where id = (select id from tc where nome = 'ficha')$$, 'chef edita a ficha');
select throws_ok($$update fichas_tecnicas set preco_venda = 10, atualizado_por = auth.uid()
  where id = (select id from tc where nome = 'ficha')$$, '42501',
  'Preço de venda oficial é da gestão. Grave o seu como rascunho.', 'chef não grava preço oficial');
select throws_ok($$update fichas_tecnicas set preco_venda_ifood = 10, atualizado_por = auth.uid()
  where id = (select id from tc where nome = 'ficha')$$, '42501', null, 'chef não grava preço de canal');
select lives_ok($$update fichas_tecnicas set preco_venda_rascunho = 12, atualizado_por = auth.uid()
  where id = (select id from tc where nome = 'ficha')$$, 'chef grava o preço como rascunho');
select throws_ok($$select public.salvar_ficha_tecnica('tc-loja1', null, '00000000-0000-0000-0000-0000000e0c01', 'PRE',
  'molho caro', 1, 'KG', 10, 10, null, '', '', 'rascunho', '[]'::jsonb, '[]'::jsonb)$$, '42501', null,
  'chef não cria ficha já com preço oficial');
select throws_ok($$insert into configuracao_financeira (unidade_id) values ('tc-loja1')$$, '42501', null,
  'chef não grava a Margem Ideal');
select throws_ok($$insert into categorias_ficha (unidade_id, camada, codigo, nome) values ('tc-loja1', 'PRE', 'TCX', 'nova')$$,
  '42501', null, 'chef não cria categoria');
delete from fichas_tecnicas where id = (select id from tc where nome = 'ficha');
select pg_temp.servidor();
select is((select count(*)::int from fichas_tecnicas where id = (select id from tc where nome = 'ficha')), 1,
  'chef não apaga ficha');
select is((select preco_venda_rascunho_por from fichas_tecnicas where id = (select id from tc where nome = 'ficha')),
  '00000000-0000-0000-0000-00000000e006'::uuid, 'o banco carimba quem pôs o rascunho');
select is((select preco_venda from fichas_tecnicas where id = (select id from tc where nome = 'ficha')), null,
  'preço oficial continua vazio');

select pg_temp.como('00000000-0000-0000-0000-00000000e005');
select is((select count(*)::int from fichas_tecnicas where unidade_id = 'tc-loja1'), 1, 'operação sem chef vê a ficha');
select throws_ok($$select public.salvar_ficha_tecnica('tc-loja1', null, '00000000-0000-0000-0000-0000000e0c01', 'PRE',
  'molho do oper', 1, 'KG', null, 10, null, '', '', 'rascunho', '[]'::jsonb, '[]'::jsonb)$$, '42501', null,
  'operação sem chef não cria ficha');
update fichas_tecnicas set nome = 'por tras' where id = (select id from tc where nome = 'ficha');

select pg_temp.como('00000000-0000-0000-0000-00000000e004');
select lives_ok($$update fichas_tecnicas set nome = 'molho especial', atualizado_por = auth.uid()
  where id = (select id from tc where nome = 'ficha')$$, 'gerente chef edita a ficha');
select throws_ok($$update fichas_tecnicas set preco_venda = 12, atualizado_por = auth.uid()
  where id = (select id from tc where nome = 'ficha')$$, '42501', null, 'gerente chef também não grava preço oficial');

select pg_temp.como('00000000-0000-0000-0000-00000000e002');
select lives_ok($$update fichas_tecnicas set preco_venda = preco_venda_rascunho, preco_venda_rascunho = null,
  atualizado_por = auth.uid() where id = (select id from tc where nome = 'ficha')$$, 'gestão aceita o rascunho');
select pg_temp.servidor();
select is((select array[preco_venda::text, coalesce(preco_venda_rascunho::text, 'nulo'), coalesce(preco_venda_rascunho_por::text, 'nulo'), nome]
             from fichas_tecnicas where id = (select id from tc where nome = 'ficha')),
  array['12.00', 'nulo', 'nulo', 'molho especial'], 'rascunho virou o preço oficial e a operação não gravou por trás');

-- ── Estoque, Garante e Cadastros: sem exceção, igual a hoje ──────────────
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000e0a07',
  '{"estoque":"sem_acesso","garante":"sem_acesso"}'), 'ok', 'Estoque e Garante agora mudam (sem acesso)');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000e0a08',
  '{"estoque":"ver","garante":"ver"}'), 'ok', 'Estoque e Garante agora mudam (ver)');

select pg_temp.como('00000000-0000-0000-0000-00000000e005');
select lives_ok($$insert into contagens (id, unidade_id, data, mes, criado_por, modalidade)
  values ('00000000-0000-0000-0000-0000000e0d02', 'tc-loja1', '2026-10-02', '2026-10', auth.uid(), 'legada')$$,
  'sem exceção, a operação abre a contagem como hoje');
select lives_ok($$insert into contagem_itens (contagem_id, sku, quantidade)
  values ('00000000-0000-0000-0000-0000000e0d02', 'HORTOM001', 4)$$, 'sem exceção, a operação conta como hoje');
insert into tc values ('exec', public.garante_iniciar('00000000-0000-0000-0000-0000000e0f01', public.garante_hoje()));
select isnt((select id from tc where nome = 'exec'), null, 'sem exceção, a operação inicia o checklist como hoje');
select is(public.garante_responder((select id from tc where nome = 'exec'), '00000000-0000-0000-0000-0000000e0e01',
  p_valor_bool => true), true, 'sem exceção, a operação responde o checklist como hoje');

-- ── Sem acesso ───────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-00000000e007');
select is((select count(*)::int from contagens), 0, 'Estoque sem acesso: não lê contagens');
select is((select count(*)::int from contagem_itens), 0, 'Estoque sem acesso: não lê itens da contagem');
select throws_ok($$insert into contagens (unidade_id, data, mes, criado_por, modalidade)
  values ('tc-loja1', '2026-10-03', '2026-10', auth.uid(), 'legada')$$, '42501', null,
  'Estoque sem acesso: não abre contagem');
select is((select count(*)::int from garante_modelos), 0, 'Garante sem acesso: não lê modelos');
select ok(not public.usuario_pode_usar_garante('tc-loja1'), 'Garante sem acesso: helper nega (e as RPCs junto)');
select is((select count(*)::int from pedidos), 0, 'Estoque sem acesso: não lê pedidos');
select is((select count(*)::int from pedido_itens), 0, 'Estoque sem acesso: não lê itens do pedido');
select is((select count(*)::int from produtos where unidade_id = 'tc-loja1'), 1, 'Estoque sem acesso não tira o cadastro de produtos');

-- ── Ver ──────────────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-00000000e008');
select is((select count(*)::int from contagens), 2, 'Estoque ver: lê as contagens');
select throws_ok($$insert into contagem_itens (contagem_id, sku, quantidade)
  values ('00000000-0000-0000-0000-0000000e0d01', 'HORTOM001', 1)$$, '42501',
  'Seu acesso ao Estoque é só para ver. Peça a quem administra a equipe para liberar a edição.',
  'Estoque ver: não conta');
select throws_ok($$update contagem_itens set quantidade = 9 where contagem_id = '00000000-0000-0000-0000-0000000e0d01'$$,
  '42501', null, 'Estoque ver: não corrige a contagem');
select is((select count(*)::int from garante_modelos), 2, 'Garante ver: lê os modelos');
select is((select count(*)::int from pedido_itens), 1, 'Estoque ver: lê os itens do pedido');
select throws_ok($$select public.garante_iniciar('00000000-0000-0000-0000-0000000e0f02', public.garante_hoje())$$,
  '42501', null, 'Garante ver: não cumpre o checklist (nem sendo o responsável)');

-- ── Cadastros ────────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-00000000e004');
select is((select count(*)::int from produtos where unidade_id = 'tc-loja1'), 1, 'Cadastros ver: lê produtos');
select throws_ok($$insert into setores (unidade_id, nome, ordem, ativo) values ('tc-loja1', 'Cozinha TC', 0, true)$$,
  '42501', 'Seu acesso a Cadastros é só para ver. Peça a quem administra a equipe para liberar a edição.',
  'Cadastros ver: não cria setor');
select throws_ok($$update produtos set nome = 'tomate italiano' where unidade_id = 'tc-loja1' and sku = 'HORTOM001'$$,
  '42501', null, 'Cadastros ver: não muda o cadastro do produto');
select lives_ok($$update produtos set preco_unitario = 6 where unidade_id = 'tc-loja1' and sku = 'HORTOM001'$$,
  'Cadastros ver: preço do produto (cotação e recebimento) segue com o Estoque');
select pg_temp.como('00000000-0000-0000-0000-00000000e002');
select lives_ok($$update produtos set nome = 'tomate italiano' where unidade_id = 'tc-loja1' and sku = 'HORTOM001'$$,
  'sem exceção, a gestão muda o cadastro como hoje');
select lives_ok($$insert into garante_modelos (unidade_id, nome) values ('tc-loja1', 'Limpeza TC')$$,
  'sem exceção, a gestão cria modelo do Garante como hoje');
select lives_ok($$insert into pedidos (unidade_id, fornecedor, data_contagem_base, criado_por)
  values ('tc-loja1', 'Outro TC', '2026-10-02', auth.uid())$$, 'sem exceção, a gestão cria pedido como hoje');
select lives_ok($$update fornecedores set nome_fantasia = 'Fornecedor TC novo' where unidade_id = 'tc-loja1' and codigo = 'FTC001'$$,
  'sem exceção, a gestão muda o fornecedor como hoje');
select pg_temp.servidor();
select is((select count(*)::int from fornecedores where codigo = 'FTC001' and nome_fantasia = 'Fornecedor TC novo'), 1,
  'a mudança do fornecedor ficou');
select is((select nome || ' ' || preco_unitario::text from produtos where unidade_id = 'tc-loja1' and sku = 'HORTOM001'),
  'tomate italiano 6', 'só as gravações permitidas ficaram');

select * from finish();
rollback;
