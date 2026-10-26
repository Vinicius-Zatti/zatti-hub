-- Permissões por módulo (Navegação V2, fase 6 - 25/10/2026).
-- Prova: só o servidor grava (nem o app nem o operador do Vini); master e dono gravam, gestor
-- de loja e operacional não; fora do piloto não muda nada; nunca o próprio, nunca acima do
-- papel, nunca módulo sem barreira no banco; auditoria. No banco: sem linha = igual a hoje;
-- "sem acesso" no Financeiro não lê nem grava lançamento pela Data API; "ver" lê mas não
-- grava (nem por policy nem por RPC); Vendas e Cardápio idem; ações sensíveis barradas.
-- Só fixtures de teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(66);

-- O usuário dos testes precisa poder assumir o papel do operador do Vini (só nesta transação).
grant vini_operador to current_user;

-- ── Fixture ──────────────────────────────────────────────────────────────
-- f001 master | f002 dono (gestão org inteira) | f003 gerente sem Financeiro |
-- f004 operacional | f005 gerente só vê (Financeiro, Vendas, Cardápio) |
-- f006 gerente sem "apagar lançamento" e sem "fechar mês" | f007 dono fora do piloto |
-- f008 operacional fora do piloto | f009 outro dono (org inteira, duas unidades) |
-- f010 dois vínculos na mesma organização (operacional na Burger + gestão de todas)
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000f001', 'pm-master@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f002', 'pm-dono@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f003', 'pm-sem-fin@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f004', 'pm-oper@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f005', 'pm-ver@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f006', 'pm-acoes@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f007', 'pm-dono-fora@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f008', 'pm-oper-fora@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f009', 'pm-dono2@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f010', 'pm-duplo@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo, equipe_habilitado) values
  ('org-pm', 'Cliente PM', 'saas', true, true),
  ('org-pm-fora', 'Cliente PM fora', 'saas', true, true);

-- `zatti-burger` é a unidade do piloto (organizacao_no_piloto_permissoes).
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo,
  financeiro_gerencial_habilitado, financeiro_liberado_equipe, conciliacao_habilitada,
  consolidado_vendas_habilitado, fichas_tecnicas_habilitado) values
  ('zatti-burger', 'org-pm', 'Burger PM', 'banco', true, true, true, true, true, true),
  ('pm-fora-1', 'org-pm-fora', 'Fora PM', 'banco', true, true, true, true, true, true),
  ('pm-loja2', 'org-pm', 'Loja 2 PM', 'banco', true, true, true, true, true, true);

insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-00000000f001', 'org-pm-fora', null, 'master', 'ativo'),
  ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-00000000f002', 'org-pm', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f0a03', '00000000-0000-0000-0000-00000000f003', 'org-pm', 'zatti-burger', 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f0a04', '00000000-0000-0000-0000-00000000f004', 'org-pm', 'zatti-burger', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000f0a05', '00000000-0000-0000-0000-00000000f005', 'org-pm', 'zatti-burger', 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f0a06', '00000000-0000-0000-0000-00000000f006', 'org-pm', 'zatti-burger', 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f0a07', '00000000-0000-0000-0000-00000000f007', 'org-pm-fora', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f0a08', '00000000-0000-0000-0000-00000000f008', 'org-pm-fora', 'pm-fora-1', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000f0a09', '00000000-0000-0000-0000-00000000f009', 'org-pm', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f0a10', '00000000-0000-0000-0000-00000000f010', 'org-pm', 'zatti-burger', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000f0a11', '00000000-0000-0000-0000-00000000f010', 'org-pm', null, 'gestao', 'ativo');

select public.semear_categorias_financeiras('zatti-burger');
insert into fin_contas_financeiras (id, unidade_id, nome, tipo)
  values ('00000000-0000-0000-0000-0000000f0c01', 'zatti-burger', 'Banco PM', 'banco');
insert into fin_lancamentos (id, unidade_id, tipo, categoria_id, descricao, data_competencia, criado_por)
select v.id, 'zatti-burger', 'despesa', c.id, 'Fornecedor PM', '2026-10-01', '00000000-0000-0000-0000-00000000f002'
from fin_categorias c,
     (values ('00000000-0000-0000-0000-0000000f0d01'::uuid), ('00000000-0000-0000-0000-0000000f0d02'::uuid)) v(id)
where c.unidade_id = 'zatti-burger' and c.codigo_sistema = 'cmc_compras_mercadorias';
select public.semear_categorias_financeiras('pm-loja2');
insert into fin_lancamentos (id, unidade_id, tipo, categoria_id, descricao, data_competencia, criado_por)
select '00000000-0000-0000-0000-0000000f0d03', 'pm-loja2', 'despesa', c.id, 'Fornecedor loja 2', '2026-10-01',
       '00000000-0000-0000-0000-00000000f002'
from fin_categorias c where c.unidade_id = 'pm-loja2' and c.codigo_sistema = 'cmc_compras_mercadorias';
insert into fin_parcelas (id, unidade_id, lancamento_id, numero, total_parcelas, valor, data_prevista) values
  ('00000000-0000-0000-0000-0000000f0d11', 'zatti-burger', '00000000-0000-0000-0000-0000000f0d01', 1, 1, 100, '2026-10-29');
insert into consolidados_vendas (unidade_id, data, credito, total_formas_pagamento, total_canais,
  total_marketplaces, faturamento_total, diferenca, status, criado_por) values
  ('zatti-burger', '2026-10-20', 10, 10, 10, 0, 10, 0, 'conferido', '00000000-0000-0000-0000-00000000f002');

create temp table cat_pm as
  select id from fin_categorias where unidade_id = 'zatti-burger' and codigo_sistema = 'cmc_compras_mercadorias';
grant select on cat_pm to authenticated;

create or replace function pg_temp.como(p_user text, p_aal text default 'aal1')
returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

create or replace function pg_temp.como_servidor()
returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', null, true);
$$;

create or replace function pg_temp.salvar(p_ator text, p_org text, p_vinculo text, p_niveis jsonb)
returns text language sql as $$
  select public.salvar_permissoes_modulo(p_ator::uuid, p_org, p_vinculo::uuid, p_niveis);
$$;

-- Roda um comando como o operador do Vini e devolve o SQLSTATE (ou 'sem_erro').
create or replace function pg_temp.erro_como_operador(p_sql text)
returns text language plpgsql as $f$
begin
  set local role vini_operador;
  begin
    execute p_sql;
  exception when others then
    reset role;
    return sqlstate;
  end;
  reset role;
  return 'sem_erro';
end;
$f$;

-- ── Quem executa ─────────────────────────────────────────────────────────
select ok(not has_function_privilege('authenticated', 'public.salvar_permissoes_modulo(uuid, text, uuid, jsonb)', 'EXECUTE'),
  'app logado não grava permissão direto');
select ok(not has_function_privilege('anon', 'public.salvar_permissoes_modulo(uuid, text, uuid, jsonb)', 'EXECUTE'),
  'anônimo não grava permissão');
select ok(not has_function_privilege('vini_operador', 'public.salvar_permissoes_modulo(uuid, text, uuid, jsonb)', 'EXECUTE'),
  'operador do Vini não grava permissão');
select ok(not has_table_privilege('authenticated', 'public.permissoes_modulo', 'INSERT'),
  'app logado não insere na tabela de permissões');
select ok(not has_table_privilege('vini_operador', 'public.permissoes_modulo', 'UPDATE'),
  'operador do Vini não altera a tabela de permissões');

select is(pg_temp.erro_como_operador(
  $$select public.salvar_permissoes_modulo('00000000-0000-0000-0000-00000000f001', 'org-pm',
      '00000000-0000-0000-0000-0000000f0a03', '{}'::jsonb)$$),
  '42501', 'operador do Vini recebe 42501 ao chamar a escrita');
select is(pg_temp.erro_como_operador($$select public.pode_modulo('financeiro', 'ver', 'zatti-burger')$$),
  '42501', 'operador do Vini recebe 42501 em pode_modulo');
select is(pg_temp.erro_como_operador($$select * from public.unidades_modulo_negadas('financeiro', 'ver')$$),
  '42501', 'operador do Vini recebe 42501 em unidades_modulo_negadas');
select is(pg_temp.erro_como_operador($$insert into public.permissoes_modulo (vinculo_id, modulo, nivel)
    values ('00000000-0000-0000-0000-0000000f0a03', 'financeiro', 'editar')$$),
  '42501', 'operador do Vini não insere permissão direto');

select pg_temp.como('00000000-0000-0000-0000-00000000f002');
select throws_ok(
  $$select public.salvar_permissoes_modulo('00000000-0000-0000-0000-00000000f002', 'org-pm',
      '00000000-0000-0000-0000-0000000f0a03', '{}'::jsonb)$$,
  '42501', null, 'dono logado pela Data API recebe 42501 (só o servidor grava)');

-- ── Padrão sem linha = igual a hoje ──────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-00000000f003');
select is((select count(*)::int from fin_lancamentos), 2, 'sem exceção, gerente lê os lançamentos como hoje');
select ok(public.pode_modulo('financeiro', 'editar', 'zatti-burger'), 'sem exceção, pode_modulo libera');
select pg_temp.como('00000000-0000-0000-0000-00000000f004');
select is((select count(*)::int from fin_lancamentos), 2, 'sem exceção, operacional lê como hoje');
select is((select count(*)::int from consolidados_vendas), 1, 'sem exceção, operacional lê Vendas como hoje');

-- ── Gravação (servidor) ──────────────────────────────────────────────────
select pg_temp.como_servidor();
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f003', 'org-pm', '00000000-0000-0000-0000-0000000f0a04',
  '{"financeiro":"ver"}'), 'sem_permissao', 'gerente de loja não administra permissões');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f004', 'org-pm', '00000000-0000-0000-0000-0000000f0a03',
  '{"financeiro":"ver"}'), 'sem_permissao', 'operacional não administra permissões');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f007', 'org-pm', '00000000-0000-0000-0000-0000000f0a03',
  '{"financeiro":"ver"}'), 'sem_permissao', 'dono de outro cliente não mexe aqui');
-- Liberado para todos em 26/10/2026 (20261026060000): não existe mais cliente fora do piloto.
select ok(public.organizacao_no_piloto_permissoes('org-pm-fora'), 'liberado: qualquer cliente administra permissões');
select ok(public.organizacao_no_piloto_permissoes('org-pm'), 'liberado: o antigo piloto segue liberado');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f002', 'org-pm', '00000000-0000-0000-0000-0000000f0a02',
  '{"financeiro":"ver"}'), 'proprio_vinculo', 'dono não mexe no próprio acesso');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f002', 'org-pm', '00000000-0000-0000-0000-0000000f0a01',
  '{"financeiro":"ver"}'), 'nao_encontrado', 'vínculo master não é da equipe');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f002', 'org-pm', '00000000-0000-0000-0000-0000000f0a04',
  '{"cardapio":"editar"}'), 'acima_do_papel', 'exceção não dá ao operacional mais do que o papel');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f002', 'org-pm', '00000000-0000-0000-0000-0000000f0a03',
  '{"configuracoes":"editar"}'), 'acima_do_papel', 'Configurações editar segue só master');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f002', 'org-pm', '00000000-0000-0000-0000-0000000f0a03',
  '{"estoque":"ver"}'), 'modulo_indisponivel', 'Estoque ainda sem barreira no banco: não muda');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f002', 'org-pm', '00000000-0000-0000-0000-0000000f0a03',
  '{"marketing":"ver"}'), 'pedido_invalido', 'chave desconhecida recusada');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f002', 'org-pm', '00000000-0000-0000-0000-0000000f0a03',
  '{"financeiro.fechar_mes":"ver"}'), 'pedido_invalido', 'ação sensível é só liberada ou não');

select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f002', 'org-pm', '00000000-0000-0000-0000-0000000f0a03',
  '{"financeiro":"sem_acesso","configuracoes":"ver","estoque":"editar"}'), 'ok',
  'dono tira o Financeiro do gerente e dá Configurações (padrão do Estoque não vira linha)');
select is((select jsonb_object_agg(modulo, nivel) from permissoes_modulo
            where vinculo_id = '00000000-0000-0000-0000-0000000f0a03'),
  '{"financeiro":"sem_acesso","configuracoes":"ver"}'::jsonb, 'tabela guarda só as exceções');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f002', 'org-pm', '00000000-0000-0000-0000-0000000f0a03',
  '{"financeiro":"sem_acesso","configuracoes":"ver"}'), 'sem_mudanca', 'mesmo estado = sem mudança');
select is((select count(*)::int from logs_auditoria
            where acao = 'editar_permissoes_modulo' and entidade_id = '00000000-0000-0000-0000-0000000f0a03'
              and dados_antigos = '{"excecoes":{}}'::jsonb
              and dados_novos -> 'excecoes' = '{"financeiro":"sem_acesso","configuracoes":"ver"}'::jsonb),
  1, 'auditoria com antes e depois');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f001', 'org-pm', '00000000-0000-0000-0000-0000000f0a05',
  '{"financeiro":"ver","vendas":"ver","cardapio":"ver","configuracoes":"ver"}'), 'ok', 'master deixa um gerente só vendo');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f002', 'org-pm', '00000000-0000-0000-0000-0000000f0a06',
  '{"financeiro.apagar_lancamento":"sem_acesso","financeiro.fechar_mes":"sem_acesso"}'), 'ok',
  'dono tira duas ações sensíveis');

-- ── "Sem acesso" no Financeiro (Data API) ────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-00000000f003');
select is((select count(*)::int from fin_lancamentos), 0, 'sem acesso: não lê lançamentos');
select is((select count(*)::int from fin_parcelas), 0, 'sem acesso: não lê parcelas');
select ok(not public.usuario_pode_usar_financeiro_gerencial('zatti-burger', null), 'sem acesso: helper do Financeiro nega');
select throws_ok($$insert into fin_lancamentos (unidade_id, tipo, categoria_id, descricao, data_competencia, criado_por)
  select 'zatti-burger', 'despesa', c.id, 'x', '2026-10-02', auth.uid() from cat_pm c$$, '42501', null,
  'sem acesso: não grava lançamento');
select is((select count(*)::int from consolidados_vendas), 1, 'sem acesso no Financeiro não tira Vendas');

-- ── "Ver" ────────────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-00000000f005');
select is((select count(*)::int from fin_lancamentos), 2, 'ver: lê lançamentos');
select throws_ok($$update fin_lancamentos set descricao = 'x' where id = '00000000-0000-0000-0000-0000000f0d02'$$,
  '42501', 'Seu acesso ao Financeiro é só para ver. Peça a quem administra a equipe para liberar a edição.',
  'ver: não altera lançamento');
select throws_ok($$insert into fin_contas_financeiras (unidade_id, nome, tipo) values ('zatti-burger', 'Nova', 'banco')$$,
  '42501', null, 'ver: não cria conta financeira');
select throws_ok($$delete from fin_lancamentos where id = '00000000-0000-0000-0000-0000000f0d02'$$,
  '42501', null, 'ver: não apaga lançamento');
select throws_ok($$select public.fin_meta_unidade_salvar('zatti-burger', '2026-10-01', 1000, 0.3, null, null)$$,
  '42501', null, 'ver: não grava por RPC (meta do mês)');
select ok(not public.usuario_pode_usar_conciliacao('zatti-burger', null), 'ver: Conciliação fica fechada');
select is((select count(*)::int from consolidados_vendas), 1, 'ver: lê Vendas');
select throws_ok($$update consolidados_vendas set credito = 20 where unidade_id = 'zatti-burger'$$,
  '42501', null, 'ver: não altera Vendas');
select throws_ok($$insert into categorias_ficha (unidade_id, camada, codigo, nome) values ('zatti-burger', 'PRE', 'PMT', 'teste')$$,
  '42501', null, 'ver: não cria categoria do Cardápio');

-- ── Ações sensíveis ──────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-00000000f006');
select lives_ok($$update fin_lancamentos set descricao = 'editado' where id = '00000000-0000-0000-0000-0000000f0d02'$$,
  'sem "apagar": continua editando lançamento');
select throws_ok($$delete from fin_lancamentos where id = '00000000-0000-0000-0000-0000000f0d02'$$,
  '42501', 'Apagar lançamento não está liberado para você. Peça a quem administra a equipe.',
  'sem "apagar": não apaga lançamento');
select throws_ok($$insert into fin_fechamentos (unidade_id, competencia, fechado, atualizado_por) values ('zatti-burger', '2026-09-01', true, auth.uid())$$,
  '42501', null, 'sem "fechar mês": não fecha o mês');

-- ── Dono e master seguem como hoje ───────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-00000000f002');
select lives_ok($$update fin_lancamentos set descricao = 'dono' where id = '00000000-0000-0000-0000-0000000f0d02'$$,
  'dono sem exceção edita lançamento');
select pg_temp.como_servidor();
select is((select descricao from fin_lancamentos where id = '00000000-0000-0000-0000-0000000f0d02'), 'dono',
  'só a edição permitida gravou (sem acesso e ver não mudaram nada)');

-- ── Desfazer: estado completo sem exceção limpa a tabela ─────────────────
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f002', 'org-pm', '00000000-0000-0000-0000-0000000f0a03', '{}'),
  'ok', 'voltar ao padrão');
select is((select count(*)::int from permissoes_modulo where vinculo_id = '00000000-0000-0000-0000-0000000f0a03'),
  0, 'voltar ao padrão apaga as linhas');
select pg_temp.como('00000000-0000-0000-0000-00000000f003');
select is((select count(*)::int from fin_lancamentos), 2, 'de volta ao padrão, lê de novo');

-- ── Dono não mexe em outro dono; exceção de quem cobre duas unidades ─────
select pg_temp.como('00000000-0000-0000-0000-00000000f009');
select is((select count(*)::int from fin_lancamentos), 3, 'outro dono sem exceção lê as duas unidades');
select pg_temp.como_servidor();
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f002', 'org-pm', '00000000-0000-0000-0000-0000000f0a09',
  '{"financeiro":"sem_acesso"}'), 'alvo_dono', 'dono não restringe outro dono');
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f001', 'org-pm', '00000000-0000-0000-0000-0000000f0a09',
  '{"financeiro":"sem_acesso"}'), 'ok', 'master restringe um dono');
select pg_temp.como('00000000-0000-0000-0000-00000000f009');
select is((select count(*)::int from fin_lancamentos), 0, 'exceção no vínculo da organização inteira vale nas duas unidades');
select ok(not public.pode_modulo('financeiro', 'ver', 'pm-loja2'), 'pode_modulo nega a segunda unidade também');

-- ── Dois vínculos: a restrição vence ─────────────────────────────────────
select pg_temp.como_servidor();
select is(pg_temp.salvar('00000000-0000-0000-0000-00000000f001', 'org-pm', '00000000-0000-0000-0000-0000000f0a10',
  '{"financeiro":"sem_acesso"}'), 'ok', 'master tira o Financeiro do vínculo operacional');
select pg_temp.como('00000000-0000-0000-0000-00000000f010');
select is((select count(*)::int from fin_lancamentos where unidade_id = 'zatti-burger'), 0,
  'o outro vínculo (gestão, sem exceção) não devolve o Financeiro da Burger');
select is((select count(*)::int from fin_lancamentos where unidade_id = 'pm-loja2'), 1,
  'na unidade que só o vínculo sem exceção cobre, segue como hoje');
update fin_lancamentos set descricao = 'por tras' where id = '00000000-0000-0000-0000-0000000f0d01';
select pg_temp.como_servidor();
select isnt((select descricao from fin_lancamentos where id = '00000000-0000-0000-0000-0000000f0d01'), 'por tras',
  'nem grava por trás na unidade negada');

-- ── service_role não é barrado pela exceção de ninguém ───────────────────
select set_config('role', 'service_role', true);
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select lives_ok($$update fin_lancamentos set descricao = 'servidor' where id = '00000000-0000-0000-0000-0000000f0d01'$$,
  'service_role grava na unidade em que há exceção');
select pg_temp.como_servidor();
select is((select descricao from fin_lancamentos where id = '00000000-0000-0000-0000-0000000f0d01'), 'servidor',
  'gravação do servidor ficou');

-- ── Troca de função limpa o que passou do teto ───────────────────────────
update vinculos set role = 'operacional' where id = '00000000-0000-0000-0000-0000000f0a05';
select is((select jsonb_object_agg(modulo, nivel) from permissoes_modulo
            where vinculo_id = '00000000-0000-0000-0000-0000000f0a05'),
  '{"financeiro":"ver","vendas":"ver"}'::jsonb,
  'virou operacional: sai Configurações (acima do teto) e Cardápio (agora é o padrão); restrições ficam');

select * from finish();
rollback;
