-- Avaliações: roleta de prêmios dos apps (20261113170000_avaliacoes_roleta.sql).
-- Prova: só a gestão com "editar" configura e dá baixa; ligar exige prêmio; a gravação só devolve o
-- id quando a roleta vale (app, ligada); girar dá um cupom por avaliação (repetir devolve o mesmo),
-- um por WhatsApp a cada 30 dias e só até 2 h depois; baixa uma vez só e nunca depois de vencido;
-- a página pública recebe os prêmios sem o peso; ninguém de fora gira.

begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000c9001', 'gestora-ro@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c9002', 'operador-ro@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-ro', 'Roleta', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, avaliacoes_habilitado) values
  ('org-ro-loja', 'org-ro', 'Casa Roleta', 'banco', true, true);
insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status, whatsapp) values
  ('00000000-0000-0000-0000-0000000c9101', '00000000-0000-0000-0000-0000000c9001', 'org-ro', null, 'gestao', 'ativo', '+5516999990031'),
  ('00000000-0000-0000-0000-0000000c9102', '00000000-0000-0000-0000-0000000c9002', 'org-ro', 'org-ro-loja', 'operacional', 'ativo', null);

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
  select public.avaliacoes_registrar((select slug from public.avaliacoes_pesquisas where unidade_id = 'org-ro-loja'), p_origem,
    '{"atendimento": 5, "comida": 5, "tempo": 5, "ambiente": 5, "pedido_certo": true, "embalagem": 5, "entrega": 5,
      "atendimento_pedido": 5, "nps": 10}'::jsonb,
    null, false, 1, '', 20000, repeat('c', 64), rpad(p_aparelho, 64, '0'), now())
$$;
create or replace function pg_temp.premios_dq()
returns jsonb language sql as $$
  select '[{"nome": "R$ 12 de desconto", "regra": "Em pedidos acima de R$ 60", "peso": 1},
           {"nome": "Frete grátis", "regra": null, "peso": 1},
           {"nome": "Batata grátis", "regra": null, "peso": 1}]'::jsonb
$$;

select pg_temp.como('00000000-0000-0000-0000-0000000c9001');
select isnt(public.avaliacoes_criar_pesquisa('org-ro-loja'), null, 'gestão cria a pesquisa');

select pg_temp.servidor();
select ok(not (pg_temp.reg('app', 'a1') ? 'respostaId'), 'roleta desligada: a gravação não devolve o id');

-- ── Configurar ─────────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000c9002');
select throws_ok($$ select public.avaliacoes_salvar_roleta('org-ro-loja', true, 30, pg_temp.premios_dq()) $$, '42501', 'sem_permissao',
  'operação não configura a roleta');
select pg_temp.como('00000000-0000-0000-0000-0000000c9001');
select throws_ok($$ select public.avaliacoes_salvar_roleta('org-ro-loja', true, 30, '[]'::jsonb) $$, '22023', 'roleta_sem_premio',
  'ligar exige prêmio');
select throws_ok($$ select public.avaliacoes_salvar_roleta('org-ro-loja', true, 0, pg_temp.premios_dq()) $$, '22023', 'validade_invalida',
  'validade de 1 a 180 dias');
select lives_ok($$ select public.avaliacoes_salvar_roleta('org-ro-loja', true, 30, pg_temp.premios_dq()) $$, 'gestão liga a roleta com 3 prêmios');
select is((select count(*)::int from avaliacoes_premios where unidade_id = 'org-ro-loja' and ativo), 3, 'três prêmios ligados');

select pg_temp.servidor();
select ok(jsonb_array_length(public.avaliacoes_pesquisa_publica((select slug from avaliacoes_pesquisas where unidade_id = 'org-ro-loja')) -> 'roleta') = 3
          and not ((public.avaliacoes_pesquisa_publica((select slug from avaliacoes_pesquisas where unidade_id = 'org-ro-loja')) -> 'roleta' -> 0) ? 'peso'),
  'a página pública recebe os prêmios, sem o peso');

-- ── Girar ──────────────────────────────────────────────────────────────────
create temp table ro as select (pg_temp.reg('app', 'b1') ->> 'respostaId')::uuid as id1;
select isnt((select id1 from ro), null, 'roleta ligada: avaliação de app devolve o id');
select ok(not (pg_temp.reg('salao', 'b2') ? 'respostaId'), 'salão não gira');
select is(public.avaliacoes_girar_roleta((select id1 from ro), '123') ->> 'codigo', 'whatsapp_invalido', 'WhatsApp inválido não gira');
alter table ro add column cupom text;
update ro set cupom = public.avaliacoes_girar_roleta(id1, '(16) 98888-0031') ->> 'cupom';
select matches((select cupom from ro), '^[A-HJ-NP-Z2-9]{6}$', 'girar dá um cupom de 6 letras');
select ok((select premio_nome in ('R$ 12 de desconto', 'Frete grátis', 'Batata grátis') and whatsapp = '5516988880031'
             and valido_ate::date = (now() + interval '30 days')::date
             from avaliacoes_cupons where codigo = (select cupom from ro)),
  'cupom guarda o prêmio, o WhatsApp e vale 30 dias');
select is(public.avaliacoes_girar_roleta((select id1 from ro), '(16) 98888-0031') ->> 'cupom', (select cupom from ro),
  'girar de novo a mesma avaliação devolve o mesmo cupom');
select is(public.avaliacoes_girar_roleta((pg_temp.reg('app', 'b3') ->> 'respostaId')::uuid, '16988880031') ->> 'codigo', 'ja_ganhou',
  'mesmo WhatsApp não ganha outro em 30 dias');
select is(public.avaliacoes_girar_roleta((pg_temp.reg('app', 'b4') ->> 'respostaId')::uuid, '16977770031', now() + interval '3 hours') ->> 'codigo',
  'expirada', 'só gira até 2 h depois da avaliação');
select ok(not has_function_privilege('anon', 'public.avaliacoes_girar_roleta(uuid,text,timestamptz)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.avaliacoes_girar_roleta(uuid,text,timestamptz)', 'EXECUTE'),
  'só o servidor gira');

-- ── Baixa ──────────────────────────────────────────────────────────────────
grant select on ro to authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000c9002');
select throws_ok($$ select public.avaliacoes_baixar_cupom('org-ro-loja', (select cupom from ro)) $$, '42501', 'sem_permissao',
  'operação não dá baixa');
select pg_temp.como('00000000-0000-0000-0000-0000000c9001');
select is(public.avaliacoes_baixar_cupom('org-ro-loja', 'zzz222') ->> 'codigo', 'nao_encontrado', 'código inexistente');
select is(public.avaliacoes_baixar_cupom('org-ro-loja', (select cupom from ro), now() + interval '31 days') ->> 'codigo', 'vencido',
  'cupom vencido não dá baixa');
select is(public.avaliacoes_baixar_cupom('org-ro-loja', lower((select cupom from ro))) ->> 'ok', 'true', 'gestão dá baixa (minúscula vale)');
select is(public.avaliacoes_baixar_cupom('org-ro-loja', (select cupom from ro)) ->> 'codigo', 'ja_usado', 'segunda baixa é recusada');

-- ── Tirar prêmio da lista desliga, não apaga ───────────────────────────────
select lives_ok($$ select public.avaliacoes_salvar_roleta('org-ro-loja', true, 30,
  '[{"nome": "Batata grátis", "regra": null, "peso": 2}]'::jsonb) $$, 'gestão deixa só um prêmio');
select is((select count(*)::int from avaliacoes_premios where unidade_id = 'org-ro-loja' and not ativo), 3,
  'os três antigos ficam desligados (o cupom antigo continua apontando para o seu)');

select * from finish();
rollback;
