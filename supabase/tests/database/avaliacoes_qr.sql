-- Avaliações por QR Code (20261112180000_avaliacoes_qr.sql).
-- Prova: anon não lê nem grava nada (nem a RPC: quem grava é o servidor, com os hashes); hashes de
-- IP e aparelho fora do alcance da sessão; só gestão da unidade (ou master com segundo fator) cria
-- e configura; gestão de outra organização e a operação não veem nada; exceção "ver" lê mas não
-- edita; contraste mínimo e link https; perguntas versionadas; antispam (armadilha, tempo
-- mínimo, limite por aparelho em 30 min e 5 por dia); validação das respostas; WhatsApp só com
-- consentimento (data, versão e texto); alerta de nota baixa só com destinatário válido, ciclo de
-- reservar e confirmar como o Garante; módulo desligado esconde e trava tudo.

begin;

create extension if not exists pgtap with schema extensions;

select plan(67);

-- ── Fixture ──────────────────────────────────────────────────────────────
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000a7001', 'gestora-av@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a7002', 'operador-av@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a7003', 'gestor-b-av@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a7004', 'master-av@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a7005', 'gestor-ver-av@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a7006', 'gestor-sem-wpp-av@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into perfis (id, nome) values
  ('00000000-0000-0000-0000-0000000a7001', 'Ana Gestora'),
  ('00000000-0000-0000-0000-0000000a7002', 'Caio Operador');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-av-a', 'Avaliações A', 'saas', true), ('org-av-b', 'Avaliações B', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, avaliacoes_habilitado) values
  ('org-av-a-loja', 'org-av-a', 'Dom Quixote Centro', 'banco', true, true),
  ('org-av-b-loja', 'org-av-b', 'Loja B', 'banco', true, true);
insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status, whatsapp) values
  ('00000000-0000-0000-0000-0000000a8001', '00000000-0000-0000-0000-0000000a7001', 'org-av-a', null, 'gestao', 'ativo', '+5516999990001'),
  ('00000000-0000-0000-0000-0000000a8002', '00000000-0000-0000-0000-0000000a7002', 'org-av-a', 'org-av-a-loja', 'operacional', 'ativo', '+5516999990002'),
  ('00000000-0000-0000-0000-0000000a8003', '00000000-0000-0000-0000-0000000a7003', 'org-av-b', null, 'gestao', 'ativo', '+5516999990003'),
  ('00000000-0000-0000-0000-0000000a8004', '00000000-0000-0000-0000-0000000a7004', 'org-av-b', null, 'master', 'ativo', null),
  ('00000000-0000-0000-0000-0000000a8005', '00000000-0000-0000-0000-0000000a7005', 'org-av-a', 'org-av-a-loja', 'gestao', 'ativo', null),
  ('00000000-0000-0000-0000-0000000a8006', '00000000-0000-0000-0000-0000000a7006', 'org-av-a', null, 'gestao', 'ativo', null);
-- Exceção em Equipe > Permissões: esta gestão só vê as Avaliações.
insert into permissoes_modulo (vinculo_id, modulo, nivel) values ('00000000-0000-0000-0000-0000000a8005', 'avaliacoes', 'ver');

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
-- Instante no fuso da operação: dias a partir de hoje + hora.
create or replace function pg_temp.agora(p_dias integer, p_hora time)
returns timestamptz language sql as $$
  select (((now() at time zone 'America/Sao_Paulo')::date + p_dias) + p_hora) at time zone 'America/Sao_Paulo'
$$;
-- Resposta completa e boa, para variar só o que importa em cada teste.
create or replace function pg_temp.boa()
returns jsonb language sql as $$
  select '{"atendimento": 5, "comida": 5, "tempo": 5, "ambiente": 5, "espera": "ate_15", "nps": 10, "conheceu": "instagram", "comentario": "Tudo ótimo"}'::jsonb
$$;
-- Chama a RPC como o servidor do Hub (service role).
create or replace function pg_temp.reg(p_slug text, p_aparelho text, p_respostas jsonb, p_agora timestamptz,
  p_origem text default 'salao', p_whatsapp text default null, p_consentimento boolean default false,
  p_armadilha text default '', p_decorrido integer default 20000)
returns jsonb language sql as $$
  select public.avaliacoes_registrar(p_slug, p_origem, p_respostas, p_whatsapp, p_consentimento, 1, p_armadilha, p_decorrido,
                                     repeat('f', 64), rpad(p_aparelho, 64, '0'), p_agora)
$$;

-- ── Estrutura ────────────────────────────────────────────────────────────
select ok(not has_table_privilege('anon', 'public.avaliacoes_respostas', 'SELECT')
  and not has_table_privilege('anon', 'public.avaliacoes_respostas', 'INSERT')
  and not has_table_privilege('anon', 'public.avaliacoes_pesquisas', 'SELECT'), 'anon não lê nem grava as tabelas');
select ok(not has_function_privilege('anon', 'public.avaliacoes_registrar(text,text,jsonb,text,boolean,integer,text,integer,text,text,timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.avaliacoes_registrar(text,text,jsonb,text,boolean,integer,text,integer,text,text,timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.avaliacoes_pesquisa_publica(text)', 'EXECUTE'),
  'gravar e ler a pesquisa pública: só o servidor (que calcula os hashes)');
select ok(not has_table_privilege('authenticated', 'public.avaliacoes_respostas', 'INSERT')
  and not has_table_privilege('authenticated', 'public.avaliacoes_respostas', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.avaliacoes_pesquisas', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.avaliacoes_alertas', 'INSERT'), 'usuário só escreve pelas RPCs');
select ok(not has_column_privilege('authenticated', 'public.avaliacoes_respostas', 'hash_ip', 'SELECT')
  and not has_column_privilege('authenticated', 'public.avaliacoes_respostas', 'hash_dispositivo', 'SELECT')
  and has_column_privilege('authenticated', 'public.avaliacoes_respostas', 'nps', 'SELECT'), 'hashes fora do alcance da sessão');
select ok(not has_function_privilege('authenticated', 'public.avaliacoes_alertas_reservar(timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.avaliacoes_alertas_confirmar(uuid,text,timestamptz)', 'EXECUTE'),
  'ciclo do alerta é só do servidor');
select ok(not has_table_privilege('vini_operador', 'public.avaliacoes_respostas', 'UPDATE')
  and has_table_privilege('vini_operador', 'public.avaliacoes_respostas', 'SELECT'), 'operador do Vini só lê');
select ok(public.permissao_chave_liberada('avaliacoes'), 'chave avaliacoes liberada nas permissões');
select is(public.permissao_nivel_padrao('operacional', false, 'avaliacoes'), 'sem_acesso', 'operação sem acesso por padrão');
select is(round(public.avaliacoes_contraste('#000000', '#FFFFFF'), 2), 21.00, 'contraste preto no branco = 21');
select is(round(public.avaliacoes_contraste('#777777', '#FFFFFF'), 2), 4.48, 'contraste igual ao do app');

-- ── Criar a pesquisa ─────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000a7002');
select throws_ok($$ select public.avaliacoes_criar_pesquisa('org-av-a-loja') $$, '42501', 'sem_permissao', 'operação não cria');
select pg_temp.como('00000000-0000-0000-0000-0000000a7003');
select throws_ok($$ select public.avaliacoes_criar_pesquisa('org-av-a-loja') $$, '42501', 'sem_permissao', 'gestão de outra organização não cria');
select pg_temp.como('00000000-0000-0000-0000-0000000a7005');
select throws_ok($$ select public.avaliacoes_criar_pesquisa('org-av-a-loja') $$, '42501', 'sem_permissao', 'gestão com exceção "ver" não cria');
select pg_temp.como('00000000-0000-0000-0000-0000000a7001');
select isnt(public.avaliacoes_criar_pesquisa('org-av-a-loja'), null, 'gestão da organização cria');
select is((select slug from avaliacoes_pesquisas where unidade_id = 'org-av-a-loja'), 'dom-quixote-centro', 'endereço sai do nome, sem acento');
select is(public.avaliacoes_criar_pesquisa('org-av-a-loja'), (select id from avaliacoes_pesquisas where unidade_id = 'org-av-a-loja'),
  'criar de novo devolve a mesma');
select is((select count(*)::int from avaliacoes_pesquisa_versoes), 1, 'nasce com a versão 1 das perguntas');
-- Master: com segundo fator cria na outra organização; sem, não.
select pg_temp.como('00000000-0000-0000-0000-0000000a7004', 'aal1');
select throws_ok($$ select public.avaliacoes_criar_pesquisa('org-av-b-loja') $$, '42501', 'sem_permissao', 'master sem segundo fator não cria');
select pg_temp.como('00000000-0000-0000-0000-0000000a7004', 'aal2');
select isnt(public.avaliacoes_criar_pesquisa('org-av-b-loja'), null, 'master com segundo fator cria');
select lives_ok($$ select public.avaliacoes_salvar_marca('org-av-b-loja', 'Loja B', '#C8102E', '#FFFFFF', 'Valeu!', null, true) $$,
  'master com segundo fator edita a marca');

-- ── Marca ────────────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000a7001');
-- Contraste mínimo saiu em 13/11/2026 (20261113150000): cor fora do formato continua barrada.
select throws_ok($$ select public.avaliacoes_salvar_marca('org-av-a-loja', 'Dom Quixote', '#F0F0F', '#FFFFFF', 'Obrigado!', null, true) $$,
  '22023', 'cor_invalida', 'cor fora do formato não salva');
select throws_ok($$ select public.avaliacoes_salvar_marca('org-av-a-loja', 'Dom Quixote', '#1F4E79', '#FFFFFF', 'Obrigado!', 'http://g.page/x', true) $$,
  '22023', 'link_google_invalido', 'link do Google só https');
select lives_ok($$ select public.avaliacoes_salvar_marca('org-av-a-loja', 'Dom Quixote', '#7A1F1F', '#FFF8EE', 'Obrigado!', 'https://g.page/r/x/review', true) $$,
  'gestão salva a marca');
select throws_ok($$ select public.avaliacoes_definir_logo('org-av-a-loja', 'org-av-b-loja/00000000-0000-4000-8000-000000000001.png') $$,
  '22023', 'logo_invalida', 'logo só no caminho da própria unidade');
select is(public.avaliacoes_definir_logo('org-av-a-loja', 'org-av-a-loja/00000000-0000-4000-8000-000000000001.png'), null::text,
  'grava a logo e devolve a anterior (nenhuma)');
select pg_temp.como('00000000-0000-0000-0000-0000000a7005');
select throws_ok($$ select public.avaliacoes_salvar_marca('org-av-a-loja', 'X', '#000000', '#FFFFFF', 'Obrigado!', null, true) $$,
  '42501', 'sem_permissao', 'exceção "ver" não edita');
select is((select nome_exibido from avaliacoes_pesquisas where unidade_id = 'org-av-a-loja'), 'Dom Quixote', 'exceção "ver" lê a pesquisa');

-- ── Página pública e registro ────────────────────────────────────────────
select pg_temp.servidor();
select is((public.avaliacoes_pesquisa_publica('dom-quixote-centro') ->> 'corPrincipal'), '#7A1F1F', 'página pública lê a marca');
select ok((public.avaliacoes_pesquisa_publica('dom-quixote-centro') ->> 'termoTexto') like 'Autorizo Dom Quixote a falar comigo%',
  'texto de consentimento com o nome da unidade');
select is(pg_temp.reg('dom-quixote-centro', 'a1', pg_temp.boa(), pg_temp.agora(0, '12:00')), '{"ok": true}'::jsonb, 'grava avaliação boa');
select is(pg_temp.reg('dom-quixote-centro', 'a1', pg_temp.boa(), pg_temp.agora(0, '12:10')) ->> 'codigo', 'limite',
  'mesmo aparelho em menos de 30 min: limite');
select is(pg_temp.reg('dom-quixote-centro', 'a2', pg_temp.boa(), pg_temp.agora(0, '12:10'), p_armadilha := 'http://spam') ->> 'descartada', 'true',
  'campo armadilha: finge sucesso');
select is(pg_temp.reg('dom-quixote-centro', 'a3', pg_temp.boa(), pg_temp.agora(0, '12:10'), p_decorrido := 1500) ->> 'descartada', 'true',
  'rápido demais: finge sucesso');
select is((select count(*)::int from avaliacoes_respostas), 1, 'descartadas não gravam');
select is(pg_temp.reg('dom-quixote-centro', 'a4', pg_temp.boa() - 'nps', pg_temp.agora(0, '12:20')),
  '{"ok": false, "campo": "nps", "codigo": "invalida"}'::jsonb, 'obrigatória faltando: invalida, com o campo');
select is(pg_temp.reg('dom-quixote-centro', 'a4', pg_temp.boa() || '{"atendimento": 6}', pg_temp.agora(0, '12:20')) ->> 'campo', 'atendimento',
  'nota fora de 1 a 5: invalida');
select is(pg_temp.reg('nao-existe', 'a4', pg_temp.boa(), pg_temp.agora(0, '12:20')) ->> 'codigo', 'nao_encontrada', 'endereço inexistente');
-- WhatsApp: sem consentimento não guarda; com consentimento guarda com data, versão e texto.
select is(pg_temp.reg('dom-quixote-centro', 'a5', pg_temp.boa(), pg_temp.agora(0, '12:30'), p_whatsapp := '(16) 98888-0001'), '{"ok": true}'::jsonb,
  'WhatsApp sem consentimento: grava a avaliação');
select is((select whatsapp from avaliacoes_respostas where hash_dispositivo = rpad('a5', 64, '0')), null, 'e não guarda o número');
select is(pg_temp.reg('dom-quixote-centro', 'a6', pg_temp.boa(), pg_temp.agora(0, '12:30'), p_whatsapp := '123', p_consentimento := true) ->> 'codigo',
  'whatsapp_invalido', 'número inválido com consentimento: recusa');
select is(pg_temp.reg('dom-quixote-centro', 'a6', pg_temp.boa(), pg_temp.agora(0, '12:30'), p_whatsapp := '(16) 98888-0002', p_consentimento := true),
  '{"ok": true}'::jsonb, 'com consentimento grava');
select results_eq($$ select whatsapp, consentimento_versao, consentimento_texto like 'Autorizo Dom Quixote%', consentimento_em is not null
                     from avaliacoes_respostas where hash_dispositivo = rpad('a6', 64, '0') $$,
  $$ values ('5516988880002'::text, 1, true, true) $$, 'número com 55, versão, cópia do texto e data');
-- Limite de 5 por dia no mesmo aparelho (respeitando os 30 min).
select pg_temp.reg('dom-quixote-centro', 'a7', pg_temp.boa(), pg_temp.agora(0, h)) from unnest(array['08:00', '09:00', '10:00', '11:00', '12:00']::time[]) h;
select is(pg_temp.reg('dom-quixote-centro', 'a7', pg_temp.boa(), pg_temp.agora(0, '13:00')) ->> 'codigo', 'limite', 'sexta do dia no mesmo aparelho: limite');

-- ── Leitura por papel ────────────────────────────────────────────────────
set local role anon;
select throws_ok($$ select count(*) from public.avaliacoes_respostas $$, '42501', null, 'anon não lê respostas');
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000a7001');
select is((select count(*)::int from avaliacoes_respostas), 8, 'gestão da unidade lê todas');
select pg_temp.como('00000000-0000-0000-0000-0000000a7002');
select is((select count(*)::int from avaliacoes_respostas), 0, 'operação não lê');
select pg_temp.como('00000000-0000-0000-0000-0000000a7003');
select is((select count(*)::int from avaliacoes_respostas where unidade_id = 'org-av-a-loja'), 0, 'gestão de outra organização não lê');
select is((select count(*)::int from avaliacoes_pesquisas where unidade_id = 'org-av-a-loja'), 0, 'nem a pesquisa');

-- ── Perguntas versionadas ────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000a7001');
select throws_ok($$ select public.avaliacoes_salvar_perguntas('org-av-a-loja',
  '[{"chave":"atendimento","texto":"Atendimento?","ativa":false},{"chave":"comida","texto":"Comida?","ativa":false},
    {"chave":"espera","texto":"Espera?","ativa":false},{"chave":"nps","texto":"Indicaria?","ativa":false},
    {"chave":"conheceu","texto":"Conheceu?","ativa":false},{"chave":"comentario","texto":"Algo mais?","ativa":false}]'::jsonb) $$,
  '22023', 'nenhuma_ativa', 'ao menos uma ligada');
select is(public.avaliacoes_salvar_perguntas('org-av-a-loja',
  '[{"chave":"atendimento","texto":"Como foi o atendimento?","ativa":true},{"chave":"comida","texto":"Como estava a comida?","ativa":false},
    {"chave":"espera","texto":"Quanto tempo esperou?","ativa":true},{"chave":"nps","texto":"Indicaria?","ativa":true},
    {"chave":"conheceu","texto":"Como conheceu?","ativa":true},{"chave":"comentario","texto":"Algo mais?","ativa":true}]'::jsonb),
  2, 'mudou: versão 2');
select pg_temp.servidor();
select is(pg_temp.reg('dom-quixote-centro', 'b1', pg_temp.boa() - 'comida', pg_temp.agora(0, '14:00')), '{"ok": true}'::jsonb,
  'pergunta desligada não é cobrada');
select results_eq($$ select versao, comida from avaliacoes_respostas where hash_dispositivo = rpad('b1', 64, '0') $$,
  $$ values (2, null::smallint) $$, 'resposta ligada à versão 2, sem a comida');

-- ── Alerta de nota baixa ─────────────────────────────────────────────────
select is(pg_temp.reg('dom-quixote-centro', 'b2', pg_temp.boa() || '{"nps": 3}', pg_temp.agora(0, '14:05')), '{"ok": true}'::jsonb,
  'nota baixa sem destinatário grava');
select is((select count(*)::int from avaliacoes_alertas), 0, 'mas não vira alerta (ninguém marcado)');
select pg_temp.como('00000000-0000-0000-0000-0000000a7001');
select throws_ok($$ select public.avaliacoes_definir_destinatario('org-av-a-loja', '00000000-0000-0000-0000-0000000a8003') $$,
  '22023', 'vinculo_nao_elegivel', 'pessoa de outra organização não recebe');
select throws_ok($$ select public.avaliacoes_definir_destinatario('org-av-a-loja', '00000000-0000-0000-0000-0000000a8006') $$,
  '22023', 'vinculo_sem_whatsapp', 'sem WhatsApp não recebe');
select is(public.avaliacoes_definir_destinatario('org-av-a-loja', '00000000-0000-0000-0000-0000000a8002'),
  '00000000-0000-0000-0000-0000000a8002'::uuid, 'operação da unidade com WhatsApp pode receber');
select pg_temp.servidor();
select is(pg_temp.reg('dom-quixote-centro', 'b3', pg_temp.boa() || '{"atendimento": 2, "comentario": "Demorou e veio frio"}',
  pg_temp.agora(0, '14:10')), '{"ok": true}'::jsonb, 'nota baixa com destinatário');
select is((select estado from avaliacoes_alertas), 'pendente', 'vira alerta pendente');
select is((select count(*)::int from public.avaliacoes_alertas_reservar(pg_temp.agora(1, '03:00'))), 0, 'de madrugada nada sai');
select results_eq($$ select unidade_id, telefone, destinatario_nome, alertas -> 0 ->> 'comentario'
                     from public.avaliacoes_alertas_reservar(pg_temp.agora(0, '14:20')) $$,
  $$ values ('org-av-a-loja'::text, '+5516999990002'::text, 'Caio Operador'::text, 'Demorou e veio frio'::text) $$,
  'reserva com o WhatsApp de quem recebe e o comentário');
select is((select estado from avaliacoes_alertas), 'reservado', 'fica reservado');
select is(public.avaliacoes_alertas_confirmar((select tentativa_id from avaliacoes_alertas), 'enviado', pg_temp.agora(0, '14:21')), 1,
  'Vini confirma o envio');
select is(public.avaliacoes_alertas_confirmar((select tentativa_id from avaliacoes_alertas), 'enviado', pg_temp.agora(0, '14:22')), 0,
  'confirmar de novo é inócuo');

-- ── Módulo desligado ─────────────────────────────────────────────────────
update unidades set avaliacoes_habilitado = false where id = 'org-av-a-loja';
select is(public.avaliacoes_pesquisa_publica('dom-quixote-centro'), null, 'desligado: página pública some');
select is(pg_temp.reg('dom-quixote-centro', 'c1', pg_temp.boa(), pg_temp.agora(0, '15:00')) ->> 'codigo', 'nao_encontrada', 'desligado: não grava');
select pg_temp.como('00000000-0000-0000-0000-0000000a7001');
select is((select count(*)::int from avaliacoes_respostas), 0, 'desligado: gestão não lê');

select pg_temp.servidor();
select * from finish();
rollback;
