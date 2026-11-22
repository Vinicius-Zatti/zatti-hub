-- Freelancers (20261122130000_freelancers.sql).
-- Prova: anon não lê nem grava; check-in e títulos só pelo servidor; hashes fora da sessão; gestão
-- e master conferem, operação só com exceção liberada pelo dono, gestão de outra organização e
-- exceção "ver" não editam; módulo desligado trava; check-in sem cadastro entra como "novo" e
-- vira "ativo" na conferência; um por pessoa por dia; antispam e aparelho repetido; a diária
-- conferida vira despesa na conta Freelancers (competência e vencimento = dia), pago pelo caixa
-- nasce quitado; Financeiro desligado, mês fechado e conta de caixa ambígua seguram o título com
-- o motivo; desfazer apaga o título sem pagamento e recusa o já pago.

begin;

create extension if not exists pgtap with schema extensions;

select plan(85);

-- ── Fixture ──────────────────────────────────────────────────────────────
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000f1001', 'gestora-fr@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f1002', 'operador-fr@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f1003', 'gerente-op-fr@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f1004', 'gestor-b-fr@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f1005', 'gestor-ver-fr@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f1006', 'master-fr@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-fr-a', 'Freelas A', 'saas', true), ('org-fr-b', 'Freelas B', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, freelancers_habilitado, financeiro_gerencial_habilitado) values
  ('org-fr-a-loja', 'org-fr-a', 'Lucaskinhas Pinhal', 'banco', true, true, false),
  ('org-fr-b-loja', 'org-fr-b', 'Loja B', 'banco', true, true, false);
insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000f2001', '00000000-0000-0000-0000-0000000f1001', 'org-fr-a', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f2002', '00000000-0000-0000-0000-0000000f1002', 'org-fr-a', 'org-fr-a-loja', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000f2003', '00000000-0000-0000-0000-0000000f1003', 'org-fr-a', 'org-fr-a-loja', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000f2004', '00000000-0000-0000-0000-0000000f1004', 'org-fr-b', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f2005', '00000000-0000-0000-0000-0000000f1005', 'org-fr-a', 'org-fr-a-loja', 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000f2006', '00000000-0000-0000-0000-0000000f1006', 'org-fr-b', null, 'master', 'ativo');
-- Exceções em Equipe > Permissões: o gerente operacional confere; esta gestão só vê.
insert into permissoes_modulo (vinculo_id, modulo, nivel) values
  ('00000000-0000-0000-0000-0000000f2003', 'freelancers', 'editar'),
  ('00000000-0000-0000-0000-0000000f2005', 'freelancers', 'ver');

create or replace function pg_temp.como(p_user_id uuid, p_aal text default 'aal1')
returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
create or replace function pg_temp.servidor()
returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', null, true);
$$;
-- Check-in como o servidor do Hub. Aparelho e IP viram hashes de 64 caracteres.
create or replace function pg_temp.ck(p_slug text, p_whatsapp text, p_nome text, p_aparelho text default 'a',
  p_ip text default 'b', p_armadilha text default '', p_decorrido integer default 8000, p_agora timestamptz default now())
returns jsonb language sql as $$
  select public.freela_registrar_checkin(p_slug, p_whatsapp, p_nome, 'Garçom', p_armadilha, p_decorrido,
                                         rpad(p_ip, 64, '0'), rpad(p_aparelho, 64, '0'), p_agora)
$$;
create or replace function pg_temp.checkin_de(p_whatsapp text)
returns uuid language sql as $$
  select c.id from freela_checkins c join freelancers f on f.id = c.freelancer_id
   where f.whatsapp = p_whatsapp and c.dia = public.freela_hoje()
$$;

-- ── Estrutura ────────────────────────────────────────────────────────────
select ok(not has_table_privilege('anon', 'public.freela_checkins', 'SELECT')
  and not has_table_privilege('anon', 'public.freelancers', 'SELECT')
  and not has_table_privilege('anon', 'public.freela_configuracoes', 'SELECT'), 'anon não lê as tabelas');
select ok(not has_table_privilege('authenticated', 'public.freela_checkins', 'INSERT')
  and not has_table_privilege('authenticated', 'public.freela_checkins', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.freelancers', 'INSERT')
  and not has_table_privilege('authenticated', 'public.freela_configuracoes', 'UPDATE'), 'usuário só escreve pelas RPCs');
select ok(not has_column_privilege('authenticated', 'public.freela_checkins', 'hash_ip', 'SELECT')
  and not has_column_privilege('authenticated', 'public.freela_checkins', 'hash_dispositivo', 'SELECT')
  and has_column_privilege('authenticated', 'public.freela_checkins', 'aparelho_repetido', 'SELECT'), 'hashes fora do alcance da sessão');
select ok(not has_function_privilege('anon', 'public.freela_registrar_checkin(text,text,text,text,text,integer,text,text,timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.freela_registrar_checkin(text,text,text,text,text,integer,text,text,timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.freela_pagina_publica(text)', 'EXECUTE'),
  'check-in e página pública: só o servidor (que calcula os hashes)');
select ok(has_function_privilege('service_role', 'public.freela_registrar_checkin(text,text,text,text,text,integer,text,text,timestamptz)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.freela_sincronizar_titulos(text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.freela_pagina_publica(text)', 'EXECUTE'), 'o servidor (service role) executa as três');
select ok(not has_function_privilege('authenticated', 'public.freela_sincronizar_titulos(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.freela_sincronizar_titulos(text)', 'EXECUTE'), 'títulos no Financeiro: só o servidor');
select ok(not has_table_privilege('vini_operador', 'public.freela_checkins', 'UPDATE')
  and has_table_privilege('vini_operador', 'public.freela_checkins', 'SELECT'), 'operador do Vini só lê');
select ok(public.permissao_chave_liberada('freelancers'), 'chave freelancers liberada');
select is(public.permissao_nivel_padrao('operacional', false, 'freelancers'), 'sem_acesso', 'operação sem acesso por padrão');
select is(public.permissao_nivel_maximo('operacional', false, 'freelancers'), 'editar', 'teto da operação: editar (o dono libera o gerente)');
select is(public.permissao_nivel_padrao('gestao', false, 'freelancers'), 'editar', 'gestão edita por padrão');

-- ── Configuração ─────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000f1002');
select throws_ok($$ select public.freela_criar_configuracao('org-fr-a-loja') $$, '42501', 'sem_permissao', 'operação sem exceção não configura');
select pg_temp.como('00000000-0000-0000-0000-0000000f1004');
select throws_ok($$ select public.freela_criar_configuracao('org-fr-a-loja') $$, '42501', 'sem_permissao', 'gestão de outra organização não configura');
select pg_temp.como('00000000-0000-0000-0000-0000000f1005');
select throws_ok($$ select public.freela_criar_configuracao('org-fr-a-loja') $$, '42501', 'sem_permissao', 'gestão com exceção "ver" não configura');
select pg_temp.como('00000000-0000-0000-0000-0000000f1006');
select throws_ok($$ select public.freela_criar_configuracao('org-fr-a-loja') $$, '42501', 'sem_permissao', 'master sem segundo fator não configura');
select pg_temp.como('00000000-0000-0000-0000-0000000f1001');
select is(public.freela_criar_configuracao('org-fr-a-loja'), 'lucaskinhas-pinhal', 'gestão cria; endereço sai do nome');
select is(public.freela_criar_configuracao('org-fr-a-loja'), 'lucaskinhas-pinhal', 'criar de novo devolve o mesmo');
select is(public.freela_salvar_configuracao('org-fr-a-loja', 150, null, true), 'ok', 'diária padrão salva');
select is(public.freela_salvar_configuracao('org-fr-a-loja', 0, null, true), 'diaria_invalida', 'diária zero recusada');
select pg_temp.como('00000000-0000-0000-0000-0000000f1006', 'aal2');
select is(public.freela_criar_configuracao('org-fr-b-loja'), 'loja-b', 'master com segundo fator configura');

-- ── Cadastro ─────────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000f1001');
select ok((public.freela_salvar_freelancer('org-fr-a-loja', null, 'João Cozinha', '5516999990001', 'Cozinha', 180, 'ativo') ->> 'ok')::boolean,
  'gestão cadastra freelancer');
select is(public.freela_salvar_freelancer('org-fr-a-loja', null, 'Outro', '5516999990001', null, null, 'ativo') ->> 'codigo',
  'whatsapp_repetido', 'mesmo WhatsApp na unidade é recusado');
select is(public.freela_salvar_freelancer('org-fr-a-loja', null, 'X', '5516999990009', null, null, 'ativo') ->> 'codigo',
  'nome_invalido', 'nome curto recusado');
select is(public.freela_salvar_freelancer('org-fr-a-loja', null, 'Maria', '16999990009', null, null, 'ativo') ->> 'codigo',
  'whatsapp_invalido', 'WhatsApp fora do formato recusado (o app normaliza antes)');

-- ── Check-in pelo QR ─────────────────────────────────────────────────────
select pg_temp.servidor();
select ok((pg_temp.ck('lucaskinhas-pinhal', '5516999990001', 'João') ->> 'ok')::boolean, 'cadastrado faz check-in');
select ok((pg_temp.ck('lucaskinhas-pinhal', '5516999990001', 'João') ->> 'jaFeito')::boolean, 'segundo check-in no dia devolve o primeiro');
select is((select count(*)::int from freela_checkins), 1, 'um check-in por pessoa por dia');
select ok((pg_temp.ck('lucaskinhas-pinhal', '5516999990002', 'Pedro Novo') ->> 'ok')::boolean, 'quem não tem cadastro faz check-in');
select is((select situacao from freelancers where whatsapp = '5516999990002'), 'novo', 'e entra como novo');
select ok((select aparelho_repetido from freela_checkins where id = pg_temp.checkin_de('5516999990001'))
  and (select aparelho_repetido from freela_checkins where id = pg_temp.checkin_de('5516999990002')),
  'mesmo aparelho com duas pessoas no dia marca as duas');
select ok((pg_temp.ck('lucaskinhas-pinhal', '5516999990003', 'Ana', 'c') ->> 'ok')::boolean, 'outra pessoa, outro celular, mesma rede');
select ok(not (select aparelho_repetido from freela_checkins where id = pg_temp.checkin_de('5516999990003')),
  'aparelho próprio na mesma rede não marca');
select ok((pg_temp.ck('lucaskinhas-pinhal', '5516999990004', 'Robô', 'd', 'b', 'preenchido') ->> 'descartado')::boolean
  and not exists (select 1 from freelancers where whatsapp = '5516999990004'), 'armadilha preenchida é descartada');
select ok((pg_temp.ck('lucaskinhas-pinhal', '5516999990004', 'Robô', 'd', 'b', '', 300) ->> 'descartado')::boolean
  and not exists (select 1 from freelancers where whatsapp = '5516999990004'), 'envio rápido demais é descartado');
select is(pg_temp.ck('lucaskinhas-pinhal', '559999', 'Fulano') ->> 'codigo', 'whatsapp_invalido', 'WhatsApp inválido recusado');
select is(pg_temp.ck('nao-existe', '5516999990005', 'Fulano') ->> 'codigo', 'nao_encontrado', 'endereço inexistente');
select is(pg_temp.ck('lucaskinhas-pinhal', '5516999990005', 'F') ->> 'codigo', 'nome_invalido', 'sem cadastro precisa do nome');
select ok((pg_temp.ck('lucaskinhas-pinhal', '5516999990011', 'Um', 'e') ->> 'ok')::boolean, 'aparelho e: 1ª pessoa');
select ok((pg_temp.ck('lucaskinhas-pinhal', '5516999990012', 'Dois', 'e') ->> 'ok')::boolean, 'aparelho e: 2ª pessoa');
select ok((pg_temp.ck('lucaskinhas-pinhal', '5516999990013', 'Três', 'e') ->> 'ok')::boolean, 'aparelho e: 3ª pessoa');
select ok((pg_temp.ck('lucaskinhas-pinhal', '5516999990014', 'Quatro', 'e') ->> 'ok')::boolean, 'aparelho e: 4ª pessoa');
select ok((pg_temp.ck('lucaskinhas-pinhal', '5516999990015', 'Cinco', 'e') ->> 'ok')::boolean, 'até 5 pessoas por aparelho no dia');
select ok(not ((pg_temp.ck('lucaskinhas-pinhal', '5516999990011', 'Um', 'e')) ? 'hora'), 'repetido no dia não revela a hora da primeira entrada');
select is(pg_temp.ck('lucaskinhas-pinhal', '5516999990016', 'Seis', 'e') ->> 'codigo', 'limite', 'a sexta pessoa no mesmo aparelho para no limite');
update unidades set freelancers_habilitado = false where id = 'org-fr-a-loja';
select is(pg_temp.ck('lucaskinhas-pinhal', '5516999990017', 'Sete', 'f') ->> 'codigo', 'fechado', 'módulo desligado não grava');
select is(public.freela_pagina_publica('lucaskinhas-pinhal') ->> 'ativa', 'false', 'página pública avisa que está fechado');
update unidades set freelancers_habilitado = true where id = 'org-fr-a-loja';

-- ── Leitura por perfil ───────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000f1001');
select ok((select count(*) from freela_checkins) >= 3, 'gestão vê os check-ins da unidade');
select pg_temp.como('00000000-0000-0000-0000-0000000f1002');
select is((select count(*)::int from freela_checkins), 0, 'operação sem exceção não vê');
select pg_temp.como('00000000-0000-0000-0000-0000000f1004');
select is((select count(*)::int from freela_checkins), 0, 'gestão de outra organização não vê');
select pg_temp.como('00000000-0000-0000-0000-0000000f1005');
select ok((select count(*) from freela_checkins) >= 3, 'exceção "ver" lê');
select throws_ok(format('select public.freela_conferir(%L, 150, false)', pg_temp.checkin_de('5516999990001')),
  '42501', 'sem_permissao', 'exceção "ver" não confere');

-- ── Conferência ──────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000f1002');
select throws_ok(format('select public.freela_conferir(%L, 150, false)', pg_temp.checkin_de('5516999990001')),
  '42501', 'sem_permissao', 'operação sem exceção não confere');
select pg_temp.como('00000000-0000-0000-0000-0000000f1003');
select is(public.freela_conferir(pg_temp.checkin_de('5516999990002'), 150, false), 'ok', 'gerente operacional liberado pelo dono confere');
select is((select situacao from freelancers where whatsapp = '5516999990002'), 'ativo', 'conferir aprova quem entrou como novo');
select is(public.freela_conferir(pg_temp.checkin_de('5516999990002'), 150, false), 'ja_conferido', 'não confere duas vezes');
select is(public.freela_conferir(pg_temp.checkin_de('5516999990003'), 0, false), 'valor_invalido', 'valor zero recusado');
select is(public.freela_recusar(pg_temp.checkin_de('5516999990011'), ''), 'motivo_invalido', 'recusar pede o motivo');
select is(public.freela_recusar(pg_temp.checkin_de('5516999990011'), 'Não veio trabalhar'), 'ok', 'recusa com motivo');

-- Financeiro desligado: conferida, sem título, com o motivo.
select pg_temp.servidor();
select is(public.freela_sincronizar_titulos('org-fr-a-loja') ->> 'pendentes', '1', 'Financeiro desligado segura o título');
select is((select titulo_aviso from freela_checkins where id = pg_temp.checkin_de('5516999990002')), 'financeiro_desligado', 'com o motivo');

-- Liga o Financeiro: plano de contas, duas contas de caixa (sem escolha = ambíguo).
update unidades set financeiro_gerencial_habilitado = true where id = 'org-fr-a-loja';
select public.semear_categorias_financeiras('org-fr-a-loja');
insert into fin_contas_financeiras (id, unidade_id, nome, tipo) values
  ('00000000-0000-0000-0000-0000000f3001', 'org-fr-a-loja', 'Caixa da loja', 'caixa'),
  ('00000000-0000-0000-0000-0000000f3002', 'org-fr-a-loja', 'Caixa do delivery', 'caixa');
select is((public.freela_sincronizar_titulos('org-fr-a-loja') ->> 'criados'), '1', 'Financeiro ligado: a diária conferida vira título');
select ok(exists (
  select 1 from freela_checkins c
    join fin_lancamentos l on l.id = c.lancamento_id
    join fin_categorias cat on cat.id = l.categoria_id
    join fin_parcelas p on p.lancamento_id = l.id
   where c.id = pg_temp.checkin_de('5516999990002')
     and l.tipo = 'despesa' and l.origem = 'freelancer' and cat.codigo_sistema = 'cmo_freelancers'
     and l.data_competencia = public.freela_hoje() and p.data_prevista = public.freela_hoje()
     and p.valor = 150 and p.status = 'aberto'), 'despesa na conta Freelancers, competência e vencimento no dia, em aberto');
select is(public.freela_sincronizar_titulos('org-fr-a-loja') ->> 'criados', '0', 'sincronizar de novo não duplica');

-- Pago pelo caixa com duas contas de caixa e nenhuma escolhida: recusa e pede a conta.
select pg_temp.como('00000000-0000-0000-0000-0000000f1001');
select is(public.freela_conferir(pg_temp.checkin_de('5516999990001'), 180, true), 'sem_conta_caixa', 'caixa ambíguo pede a conta');
select is(public.freela_salvar_configuracao('org-fr-a-loja', 150, '00000000-0000-0000-0000-0000000f3001', true), 'ok', 'gestão escolhe a conta do caixa');
select is(public.freela_conferir(pg_temp.checkin_de('5516999990001'), 180, true), 'ok', 'confere pago pelo caixa');
select pg_temp.servidor();
select public.freela_sincronizar_titulos('org-fr-a-loja');
select ok(exists (
  select 1 from freela_checkins c
    join fin_parcelas p on p.lancamento_id = c.lancamento_id
    join fin_baixas b on b.parcela_id = p.id
   where c.id = pg_temp.checkin_de('5516999990001')
     and p.status = 'quitado' and b.valor = 180 and b.conta_financeira_id = '00000000-0000-0000-0000-0000000f3001'
     and b.data = public.freela_hoje()), 'pago pelo caixa: o título nasce quitado, baixa no caixa escolhido');

-- Desfazer.
select pg_temp.como('00000000-0000-0000-0000-0000000f1001');
select is(public.freela_desfazer(pg_temp.checkin_de('5516999990001')), 'ja_pago', 'já pago não desfaz (estorno no Financeiro)');
select is(public.freela_desfazer(pg_temp.checkin_de('5516999990002')), 'ok', 'sem pagamento desfaz');
select is((select estado from freela_checkins where id = pg_temp.checkin_de('5516999990002')), 'pendente', 'e volta para pendente');
select is(public.freela_conferir(pg_temp.checkin_de('5516999990002'), 150, false), 'aguarde',
  'enquanto o título desfeito não sai, não confere de novo (nunca dois títulos)');
select is(public.freela_recusar(pg_temp.checkin_de('5516999990002'), 'Teste'), 'aguarde', 'nem recusa');
select pg_temp.servidor();
select is(public.freela_sincronizar_titulos('org-fr-a-loja') ->> 'apagados', '1', 'o servidor apaga o título da conferência desfeita');
select is((select count(*)::int from fin_lancamentos where unidade_id = 'org-fr-a-loja' and origem = 'freelancer'), 1, 'sobra só o título pago');
select ok(exists (select 1 from logs_auditoria where acao = 'freela_apagar_titulo' and unidade_id = 'org-fr-a-loja'), 'apagar o título deixa auditoria');

-- Pago no meio do caminho: desfez, alguém pagou antes do servidor apagar.
select pg_temp.como('00000000-0000-0000-0000-0000000f1001');
select is(public.freela_conferir(pg_temp.checkin_de('5516999990012'), 160, false), 'ok', 'confere outra diária, em aberto');
select pg_temp.servidor();
select public.freela_sincronizar_titulos('org-fr-a-loja');
select pg_temp.como('00000000-0000-0000-0000-0000000f1001');
select is(public.freela_desfazer(pg_temp.checkin_de('5516999990012')), 'ok', 'desfaz enquanto ainda sem pagamento');
select pg_temp.servidor();
insert into fin_baixas (unidade_id, parcela_id, tipo, conta_financeira_id, valor, data, criado_por)
select 'org-fr-a-loja', p.id, 'baixa', '00000000-0000-0000-0000-0000000f3002', 160, public.freela_hoje(), '00000000-0000-0000-0000-0000000f1001'
  from fin_parcelas p where p.lancamento_id = (select titulo_a_remover from freela_checkins where id = pg_temp.checkin_de('5516999990012'));
select is(public.freela_sincronizar_titulos('org-fr-a-loja') ->> 'apagados', '0', 'título pago não é apagado');
select ok((select estado = 'conferido' and lancamento_id is not null and titulo_aviso = 'titulo_ja_pago' and valor = 160
             from freela_checkins where id = pg_temp.checkin_de('5516999990012')),
  'a diária volta a conferida, ligada ao título pago, com o motivo');

-- Mês fechado: confere uma diária em aberto antes de fechar.
select pg_temp.como('00000000-0000-0000-0000-0000000f1001');
select is(public.freela_conferir(pg_temp.checkin_de('5516999990013'), 150, false), 'ok', 'diária em aberto antes do fechamento');
select pg_temp.servidor();
select public.freela_sincronizar_titulos('org-fr-a-loja');
insert into fin_fechamentos (unidade_id, competencia, fechado, atualizado_por)
values ('org-fr-a-loja', date_trunc('month', public.freela_hoje())::date, true, '00000000-0000-0000-0000-0000000f1001');
select pg_temp.como('00000000-0000-0000-0000-0000000f1001');
select is(public.freela_conferir(pg_temp.checkin_de('5516999990003'), 150, false), 'mes_fechado', 'mês fechado no Financeiro não confere');
select is(public.freela_desfazer(pg_temp.checkin_de('5516999990013')), 'mes_fechado', 'nem desfaz: o título de mês fechado fica');

-- Lançar à mão.
select is(public.freela_adicionar_manual('org-fr-a-loja', (select id from freelancers where whatsapp = '5516999990001'),
  public.freela_hoje() + 1), 'dia_invalido', 'à mão: nunca no futuro');
select is(public.freela_adicionar_manual('org-fr-a-loja', (select id from freelancers where whatsapp = '5516999990001'),
  public.freela_hoje() - 1), 'ok', 'à mão: dia anterior entra pendente');
select is(public.freela_adicionar_manual('org-fr-a-loja', (select id from freelancers where whatsapp = '5516999990001'),
  public.freela_hoje()), 'ja_existe', 'à mão: não repete o dia');

select * from finish();
rollback;
