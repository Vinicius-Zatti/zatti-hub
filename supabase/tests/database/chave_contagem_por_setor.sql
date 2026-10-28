-- Chave "Contagem por setor" por unidade (28/10/2026).
-- Prova: nasce desligada; desligada, o banco não abre data por setor mesmo com setor cadastrado;
-- gestão (dono) e master trocam, operacional, gestão "sem acesso" em Configurações e gestão de
-- outra organização não; não desliga com contagem por setor em andamento (nem master, nem
-- escrita direta); ligar não trava por data aberta de antes; planilha não liga; a situação
-- mostrada na tela conta produto sem setor ativo. Só fixtures de teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

-- ── Fixture ──────────────────────────────────────────────────────────────
-- d001 master | d002 dono (gestão org inteira) | d003 operacional |
-- d004 gestão com Configurações "sem acesso" | d005 gestão de outra organização
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000cd001', 'chave-master@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000cd002', 'chave-dono@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000cd003', 'chave-oper@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000cd004', 'chave-sem-conf@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000cd005', 'chave-outra@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-chave-setor', 'Cliente Chave Setor', 'saas', true),
  ('org-chave-outra', 'Outro Cliente Chave', 'saas', true);

insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, spreadsheet_id, ativo) values
  ('uni-chave-a', 'org-chave-setor', 'Chave A', 'banco', null, true),
  ('uni-chave-p', 'org-chave-setor', 'Chave Planilha', 'planilha', 'planilha-de-teste', true),
  ('uni-chave-b', 'org-chave-outra', 'Chave B', 'banco', null, true);

insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000cda01', '00000000-0000-0000-0000-0000000cd001', 'org-chave-outra', null, 'master', 'ativo'),
  ('00000000-0000-0000-0000-0000000cda02', '00000000-0000-0000-0000-0000000cd002', 'org-chave-setor', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000cda03', '00000000-0000-0000-0000-0000000cd003', 'org-chave-setor', 'uni-chave-a', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000cda04', '00000000-0000-0000-0000-0000000cd004', 'org-chave-setor', 'uni-chave-a', 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000cda05', '00000000-0000-0000-0000-0000000cd005', 'org-chave-outra', null, 'gestao', 'ativo');

insert into permissoes_modulo (vinculo_id, modulo, nivel) values
  ('00000000-0000-0000-0000-0000000cda04', 'configuracoes', 'sem_acesso');

insert into produtos (unidade_id, sku, grupo, nome, unidade_base, preco_unitario, ativo) values
  ('uni-chave-a', 'BALCHV001', 'BAL', 'cerveja chave', 'UN', 4, true),
  ('uni-chave-a', 'MERCHV001', 'MER', 'arroz sem setor', 'KG', 5, true),
  ('uni-chave-a', 'MERCHV002', 'MER', 'feijao no setor desativado', 'KG', 6, true),
  ('uni-chave-a', 'MERCHV003', 'MER', 'produto inativo', 'KG', 1, false);

insert into setores (id, unidade_id, nome, ordem, ativo) values
  ('00000000-0000-0000-0000-0000000cdb01', 'uni-chave-a', 'Bar', 0, true),
  ('00000000-0000-0000-0000-0000000cdb02', 'uni-chave-a', 'Depósito antigo', 1, false);

insert into produto_setores (produto_id, setor_id, unidade_id)
select p.id, s.id, 'uni-chave-a'
from produtos p
join setores s on s.unidade_id = 'uni-chave-a'
where p.unidade_id = 'uni-chave-a'
  and ((p.sku = 'BALCHV001' and s.nome = 'Bar') or (p.sku = 'MERCHV002' and s.nome = 'Depósito antigo'));

-- ── Nasce desligada; desligada, não abre por setor ───────────────────────

select is(
  (select contagem_por_setor_habilitada from unidades where id = 'uni-chave-a'),
  false,
  'unidade nova nasce com a contagem por setor desligada'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000cd002","role":"authenticated","aal":"aal1"}';

select throws_ok(
  $$select abrir_contagem_setor('uni-chave-a', date '2026-10-20', 'outubro 2026')$$,
  'P0001',
  'A contagem por setor está desligada nesta unidade. Para ligar, vá em Configurações > Módulos.',
  'desligada: setor cadastrado não basta para abrir a data por setor'
);

select is(
  situacao_contagem_por_setor('uni-chave-a'),
  '{"produtosSemSetor": 2, "setoresAtivos": 1, "emAndamento": []}'::jsonb,
  'situação: produto sem setor ativo conta (inclusive o de setor desativado), inativo não'
);

-- ── Quem troca ───────────────────────────────────────────────────────────

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000cd003","role":"authenticated","aal":"aal1"}';
select throws_ok(
  $$select definir_contagem_por_setor('uni-chave-a', true)$$,
  '42501', NULL, 'operacional não troca'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000cd004","role":"authenticated","aal":"aal1"}';
select throws_ok(
  $$select definir_contagem_por_setor('uni-chave-a', true)$$,
  '42501', NULL, 'gestão com Configurações "sem acesso" não troca'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000cd005","role":"authenticated","aal":"aal1"}';
select throws_ok(
  $$select definir_contagem_por_setor('uni-chave-a', true)$$,
  '42501', NULL, 'gestão de outra organização não troca'
);
select throws_ok(
  $$select situacao_contagem_por_setor('uni-chave-a')$$,
  '42501', NULL, 'gestão de outra organização não lê a situação'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000cd002","role":"authenticated","aal":"aal1"}';
select is(definir_contagem_por_setor('uni-chave-a', true), true, 'dono (gestão) liga');
select is(definir_contagem_por_setor('uni-chave-a', true), false, 'ligar de novo não muda nada');

-- ── Ligada: abre por setor; em andamento, não desliga ────────────────────

select lives_ok(
  $$select abrir_contagem_setor('uni-chave-a', date '2026-10-20', 'outubro 2026')$$,
  'ligada: abre a data por setor'
);

select is(
  situacao_contagem_por_setor('uni-chave-a') -> 'emAndamento',
  '["20/10/2026"]'::jsonb,
  'data aberta com setor por enviar aparece em andamento'
);

select throws_ok(
  $$select definir_contagem_por_setor('uni-chave-a', false)$$,
  'P0001',
  'Há contagem por setor em andamento (20/10/2026). Envie todos os setores dessa data antes de trocar o modo da contagem.',
  'gestão não desliga com contagem em andamento'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000cd001","role":"authenticated","aal":"aal2"}';
select throws_ok(
  $$select definir_contagem_por_setor('uni-chave-a', false)$$,
  'P0001', NULL, 'master também não desliga com contagem em andamento'
);

reset role;
select throws_ok(
  $$update unidades set contagem_por_setor_habilitada = false where id = 'uni-chave-a'$$,
  'P0001', NULL, 'escrita direta (service role, SQL Editor) também é barrada'
);

-- Todos os setores enviados: a data deixa de estar em andamento.
update contagem_setores cs set situacao = 'concluido'
from contagens c
where c.id = cs.contagem_id and c.unidade_id = 'uni-chave-a' and c.data = '2026-10-20';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000cd001","role":"authenticated","aal":"aal2"}';
select is(definir_contagem_por_setor('uni-chave-a', false), true, 'master desliga depois de tudo enviado');

reset role;
select is(
  (select contagem_por_setor_habilitada from unidades where id = 'uni-chave-a'),
  false,
  'a chave ficou desligada'
);
select is(
  (select count(*)::int from setores where unidade_id = 'uni-chave-a'),
  2,
  'desligar não apaga setor nenhum'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000cd002","role":"authenticated","aal":"aal1"}';
select throws_ok(
  $$select abrir_contagem_setor('uni-chave-a', date '2026-10-21', 'outubro 2026')$$,
  'P0001', NULL, 'desligada de novo: não abre outra data por setor'
);
select lives_ok(
  $$insert into contagens (unidade_id, data, mes, criado_por, modalidade)
    values ('uni-chave-a', '2026-10-21', 'outubro 2026', '00000000-0000-0000-0000-0000000cd002', 'legada')$$,
  'desligada: a contagem sem setor segue normal'
);

-- ── Ligar não trava por data aberta de antes da chave ───────────────────

reset role;
update contagem_setores cs set situacao = 'pendente'
from contagens c
where c.id = cs.contagem_id and c.unidade_id = 'uni-chave-a' and c.data = '2026-10-20';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000cd002","role":"authenticated","aal":"aal1"}';
select is(
  definir_contagem_por_setor('uni-chave-a', true),
  true,
  'data por setor aberta de antes não prende: ligar continua possível (para terminá-la)'
);

-- ── Planilha não liga ────────────────────────────────────────────────────

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000cd001","role":"authenticated","aal":"aal2"}';
select throws_ok(
  $$select definir_contagem_por_setor('uni-chave-p', true)$$,
  'P0001',
  'A contagem por setor só existe com o estoque no Zatti Hub (esta unidade usa a planilha).',
  'unidade na planilha não liga'
);

reset role;
select is(
  (select contagem_por_setor_habilitada from unidades where id = 'uni-chave-p'),
  false,
  'a unidade na planilha segue desligada'
);

select * from finish();
rollback;
