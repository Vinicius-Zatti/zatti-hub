-- Contagem por setor - as garantias que só o banco pode dar.
--
-- A aplicação valida tudo isto antes, com mensagem boa. O que se prova aqui é
-- o que sobra quando alguém chama a Data API direto, ou quando duas pessoas
-- mexem na mesma data:
--   1. produto de uma unidade não se vincula a setor de outra;
--   2. "Bar", "bar" e " Bar " são o mesmo setor;
--   3. o snapshot de escopo é congelado na abertura, com nome/grupo/unidade;
--   4. abrir a mesma data duas vezes não cria duas contagens nem dois snapshots;
--   5. setor só conclui com TODOS os itens do snapshot (zero digitado vale),
--      sem negativo, sem SKU de fora; avulso entra mas não conta;
--   6. reenvio substitui o setor inteiro, com versão esperada e histórico;
--   7. legado e setor nunca se misturam na mesma data;
--   8. escrita direta em contagem_itens de contagem por setor é recusada;
--   9. correção por id altera exatamente 1 linha e falha se a linha sumiu;
--  10. produto desativado depois da abertura continua na lista; setor
--      desativado com pendência ainda conclui;
--  11. designação é transacional: erro no meio não tira produto de setor.
--
-- Rodar com o Supabase local no ar: `npx supabase test db`.
-- Sem dado real - fixtures isoladas por um id de âncora de teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(51);

-- ── Fixture ──────────────────────────────────────────────────────────────

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-0000000c9001', 'setor.master@teste.local', 'x', now(),
        'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo)
values ('org-ancora-setor', 'Organização Âncora do Setor', 'saas', true);

insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo)
values
  ('uni-ancora-setor-a', 'org-ancora-setor', 'Unidade A', 'banco', true),
  ('uni-ancora-setor-b', 'org-ancora-setor', 'Unidade B', 'banco', true);

insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
values ('00000000-0000-0000-0000-0000000c9001', 'org-ancora-setor', null, 'master', 'ativo');

insert into produtos (unidade_id, sku, grupo, nome, unidade_base, preco_unitario, ativo)
values
  ('uni-ancora-setor-a', 'HORLTA001', 'HOR', 'limao tahiti', 'KG', 10, true),
  ('uni-ancora-setor-a', 'BALCER001', 'BAL', 'cerveja', 'UN', 4, true),
  ('uni-ancora-setor-a', 'MERARR001', 'MER', 'arroz branco', 'KG', 5, true),
  ('uni-ancora-setor-a', 'MERSEM001', 'MER', 'produto sem setor', 'KG', 1, true),
  ('uni-ancora-setor-b', 'HOROUT001', 'HOR', 'produto de outra unidade', 'KG', 1, true);

insert into setores (id, unidade_id, nome, ordem, ativo)
values
  ('00000000-0000-0000-0000-0000000c1001', 'uni-ancora-setor-a', 'Bar', 0, true),
  ('00000000-0000-0000-0000-0000000c1002', 'uni-ancora-setor-a', 'Cozinha', 1, true),
  ('00000000-0000-0000-0000-0000000c1003', 'uni-ancora-setor-b', 'Bar da outra', 0, true);

-- Limão nos dois setores, cerveja só no bar, arroz só na cozinha e um
-- produto de propósito sem setor nenhum.
insert into produto_setores (produto_id, setor_id, unidade_id)
select p.id, s.id, 'uni-ancora-setor-a'
from produtos p
join setores s on s.unidade_id = 'uni-ancora-setor-a'
where p.unidade_id = 'uni-ancora-setor-a'
  and (
    (p.sku = 'HORLTA001')
    or (p.sku = 'BALCER001' and s.nome = 'Bar')
    or (p.sku = 'MERARR001' and s.nome = 'Cozinha')
  );

-- ── 1. Unidade cruzada ───────────────────────────────────────────────────

select throws_ok(
  $$insert into produto_setores (produto_id, setor_id, unidade_id)
    select p.id, '00000000-0000-0000-0000-0000000c1003', 'uni-ancora-setor-a'
    from produtos p where p.unidade_id = 'uni-ancora-setor-a' and p.sku = 'HORLTA001'$$,
  '23503',
  NULL,
  'produto da unidade A não se vincula a setor da unidade B'
);

-- ── 2. Nome único ignorando caixa e espaço ───────────────────────────────

select throws_ok(
  $$insert into setores (unidade_id, nome, ordem, ativo)
    values ('uni-ancora-setor-a', '  bar ', 0, true)$$,
  '23505',
  NULL,
  '"  bar " colide com "Bar" na mesma unidade'
);

select lives_ok(
  $$insert into setores (unidade_id, nome, ordem, ativo)
    values ('uni-ancora-setor-b', 'Bar', 0, true)$$,
  'o mesmo nome em OUTRA unidade é permitido'
);

-- ── 3 e 4. Abertura: snapshot congelado e idempotente ────────────────────

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-0000000c9001","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $$select abrir_contagem_setor('uni-ancora-setor-a', date '2026-09-17', 'setembro 2026')$$,
  'abrir_contagem_setor roda pro usuário com acesso à unidade'
);

select is(
  (select count(*)::int from contagem_escopo e
   join contagens c on c.id = e.contagem_id
   where c.unidade_id = 'uni-ancora-setor-a'),
  4,
  'snapshot tem 4 linhas: limão nos 2 setores, cerveja no bar, arroz na cozinha'
);

select is(
  (select count(*)::int from contagem_escopo e
   join contagens c on c.id = e.contagem_id
   where c.unidade_id = 'uni-ancora-setor-a' and e.sku = 'MERSEM001'),
  0,
  'produto sem setor não entra no snapshot - e por isso não entra em contagem nenhuma'
);

select is(
  (select count(*)::int from contagem_setores cs
   join contagens c on c.id = cs.contagem_id
   where c.unidade_id = 'uni-ancora-setor-a' and cs.situacao = 'pendente' and cs.versao = 0),
  2,
  'os dois setores com produto nascem pendentes, na versão 0'
);

select results_eq(
  $$select c.modalidade, e.nome, e.grupo, e.unidade_base, (e.produto_id is not null)
    from contagem_escopo e join contagens c on c.id = e.contagem_id
    where c.unidade_id = 'uni-ancora-setor-a' and e.sku = 'BALCER001'$$,
  $$values ('setor'::text, 'cerveja'::text, 'BAL'::text, 'UN'::text, true)$$,
  'contagem nasce "setor" e o snapshot guarda nome, grupo, unidade e produto'
);

-- Designação direta pela Data API não existe mais: só pela função.
select throws_ok(
  $$insert into produto_setores (produto_id, setor_id, unidade_id)
    select p.id, '00000000-0000-0000-0000-0000000c1002', 'uni-ancora-setor-a'
    from produtos p where p.unidade_id = 'uni-ancora-setor-a' and p.sku = 'MERSEM001'$$,
  '42501',
  NULL,
  'insert direto em produto_setores é recusado'
);

-- Designação nova DEPOIS da abertura não pode mudar a contagem já aberta.
select lives_ok(
  $$select designar_setores_produtos('uni-ancora-setor-a',
    '[{"sku":"MERSEM001","setorIds":["00000000-0000-0000-0000-0000000c1002"]}]'::jsonb)$$,
  'designação pela função transacional'
);

select lives_ok(
  $$select abrir_contagem_setor('uni-ancora-setor-a', date '2026-09-17', 'setembro 2026')$$,
  'abrir a mesma data de novo não estoura'
);

select is(
  (select count(*)::int from contagens where unidade_id = 'uni-ancora-setor-a'),
  1,
  'abrir duas vezes gera UMA contagem'
);

select is(
  (select count(*)::int from contagem_escopo e
   join contagens c on c.id = e.contagem_id
   where c.unidade_id = 'uni-ancora-setor-a'),
  4,
  'o snapshot continua com 4 linhas: designar produto depois não mexe na contagem aberta'
);

-- ── 5. Completude do envio ───────────────────────────────────────────────

select throws_ok(
  $$select substituir_contagem_setor(
    (select id from contagens where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-17'),
    '00000000-0000-0000-0000-0000000c1001',
    '[{"sku":"HORLTA001","quantidade":2}]'::jsonb, 0)$$,
  'P0001',
  'Envio incompleto: faltam 1 item do setor Bar.',
  'bar sem a cerveja é recusado'
);

select throws_ok(
  $$select substituir_contagem_setor(
    (select id from contagens where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-17'),
    '00000000-0000-0000-0000-0000000c1001', '[]'::jsonb, 0)$$,
  'P0001',
  'Envio incompleto: faltam 2 itens do setor Bar.',
  'lista vazia não conclui setor'
);

select throws_ok(
  $$select substituir_contagem_setor(
    (select id from contagens where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-17'),
    '00000000-0000-0000-0000-0000000c1001',
    '[{"sku":"HORLTA001","quantidade":2},{"sku":"BALCER001","quantidade":null}]'::jsonb, 0)$$,
  'P0001',
  'Envio incompleto: faltam 1 item do setor Bar.',
  'quantidade nula é item faltando, não contado'
);

select throws_ok(
  $$select substituir_contagem_setor(
    (select id from contagens where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-17'),
    '00000000-0000-0000-0000-0000000c1001',
    '[{"sku":"HORLTA001","quantidade":-1},{"sku":"BALCER001","quantidade":1}]'::jsonb, 0)$$,
  'P0001',
  'Quantidade negativa não é aceita.',
  'quantidade negativa é recusada'
);

select throws_ok(
  $$select substituir_contagem_setor(
    (select id from contagens where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-17'),
    '00000000-0000-0000-0000-0000000c1001',
    '[{"sku":"HORLTA001","quantidade":2},{"sku":"BALCER001","quantidade":1},
      {"sku":"MERARR001","quantidade":1}]'::jsonb, 0)$$,
  'P0001',
  'Item fora da lista deste setor: MERARR001',
  'SKU de outro setor não entra pelo bar'
);

select throws_ok(
  $$select substituir_contagem_setor(
    (select id from contagens where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-17'),
    '00000000-0000-0000-0000-0000000c1001',
    '[{"sku":"HORLTA001","quantidade":2},{"sku":"BALCER001","quantidade":1}]'::jsonb, 7)$$,
  'P0001',
  'Outra pessoa enviou este setor agora. Recarregue.',
  'versão esperada errada é recusada'
);

select throws_ok(
  $$select substituir_contagem_setor(
    (select id from contagens where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-17'),
    '00000000-0000-0000-0000-0000000c1002',
    '[{"sku":"PENDENTE-gelo-1","quantidade":3,"avulso":true,"nome":"gelo","unidade_base":"KG"}]'::jsonb, 0)$$,
  'P0001',
  'Envio incompleto: faltam 2 itens do setor Cozinha.',
  'avulso sozinho não completa o setor'
);

-- Bar completo, com um avulso e total malicioso vindo do navegador.
select is(
  substituir_contagem_setor(
    (select id from contagens where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-17'),
    '00000000-0000-0000-0000-0000000c1001',
    '[{"sku":"HORLTA001","quantidade":2,"total":999,"preco_unitario":999},
      {"sku":"BALCER001","quantidade":10},
      {"sku":"PENDENTE-gelo-1","quantidade":3,"avulso":true,"nome":"gelo","unidade_base":"KG"}]'::jsonb,
    0),
  '{"gravados": 3, "versao": 1}'::jsonb,
  'bar completo grava 3 linhas e vai pra versão 1'
);

select results_eq(
  $$select ci.sku, ci.avulso, ci.preco_unitario, ci.total, ci.alerta
    from contagem_itens ci join contagens c on c.id = ci.contagem_id
    where c.unidade_id = 'uni-ancora-setor-a'
      and ci.setor_id = '00000000-0000-0000-0000-0000000c1001'
    order by ci.sku$$,
  $$values ('BALCER001'::text, false, 4::numeric, 40.00::numeric, ''::text),
           ('HORLTA001', false, 10, 20.00, ''),
           ('PENDENTE-gelo-1', true, null, null, 'Sem cadastro, falta criar produto')$$,
  'preço e total vêm do cadastro no banco; avulso marcado e sem valor'
);

select is(
  substituir_contagem_setor(
    (select id from contagens where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-17'),
    '00000000-0000-0000-0000-0000000c1002',
    '[{"sku":"HORLTA001","quantidade":4},{"sku":"MERARR001","quantidade":5}]'::jsonb, 0),
  '{"gravados": 2, "versao": 1}'::jsonb,
  'cozinha completa'
);

select is(
  (select count(*)::int from contagem_setores cs join contagens c on c.id = cs.contagem_id
   where c.unidade_id = 'uni-ancora-setor-a' and cs.situacao = 'concluido'),
  2,
  'os dois setores concluídos'
);

-- ── 6. Reenvio: versão e histórico ───────────────────────────────────────

select throws_ok(
  $$select substituir_contagem_setor(
    (select id from contagens where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-17'),
    '00000000-0000-0000-0000-0000000c1001',
    '[{"sku":"HORLTA001","quantidade":3},{"sku":"BALCER001","quantidade":0}]'::jsonb, 0)$$,
  'P0001',
  'Outra pessoa enviou este setor agora. Recarregue.',
  'reenvio com a versão de antes do primeiro envio é recusado'
);

select lives_ok(
  $$select substituir_contagem_setor(
    (select id from contagens where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-17'),
    '00000000-0000-0000-0000-0000000c1001',
    '[{"sku":"HORLTA001","quantidade":3},{"sku":"BALCER001","quantidade":0}]'::jsonb, 1)$$,
  'reenvio do bar com a versão certa; zero digitado vale'
);

select results_eq(
  $$select ci.sku, ci.quantidade::numeric, s.nome
    from contagem_itens ci
    join setores s on s.id = ci.setor_id
    join contagens c on c.id = ci.contagem_id
    where c.unidade_id = 'uni-ancora-setor-a'
    order by s.nome, ci.sku$$,
  $$values ('BALCER001', 0::numeric, 'Bar'), ('HORLTA001', 3::numeric, 'Bar'),
           ('HORLTA001', 4::numeric, 'Cozinha'), ('MERARR001', 5::numeric, 'Cozinha')$$,
  'reenvio do bar trocou o bar inteiro (avulso some) e preservou a cozinha'
);

select results_eq(
  $$select e.versao, jsonb_array_length(e.itens_anteriores), jsonb_array_length(e.itens_novos)
    from contagem_envios e
    where e.setor_id = '00000000-0000-0000-0000-0000000c1001'
    order by e.versao$$,
  $$values (1, 0, 3), (2, 3, 2)$$,
  'cada envio do bar fica no histórico, com o que havia antes e o que entrou'
);

select throws_ok(
  $$insert into contagem_envios (contagem_id, setor_id, versao)
    select id, '00000000-0000-0000-0000-0000000c1001', 99 from contagens
    where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-17'$$,
  '42501',
  NULL,
  'histórico não aceita escrita direta'
);

-- ── 7. Mesmo SKU não se repete dentro do setor ───────────────────────────

reset role;

select throws_ok(
  $$insert into contagem_itens (contagem_id, setor_id, sku, quantidade)
    select c.id, '00000000-0000-0000-0000-0000000c1001', 'HORLTA001', 9
    from contagens c where c.unidade_id = 'uni-ancora-setor-a' and c.data = '2026-09-17'$$,
  '23505',
  NULL,
  'o mesmo SKU não entra duas vezes pelo mesmo setor na mesma contagem'
);

set local role authenticated;

-- ── 8. Escrita direta e mistura legado x setor ───────────────────────────

select throws_ok(
  $$insert into contagem_itens (contagem_id, sku, quantidade)
    select c.id, 'MERSEM001', 9
    from contagens c where c.unidade_id = 'uni-ancora-setor-a' and c.data = '2026-09-17'$$,
  '42501',
  NULL,
  'linha legada (sem setor) não entra em data por setor'
);

select throws_ok(
  $$insert into contagem_itens (contagem_id, setor_id, sku, quantidade)
    select c.id, '00000000-0000-0000-0000-0000000c1002', 'MERSEM001', 9
    from contagens c where c.unidade_id = 'uni-ancora-setor-a' and c.data = '2026-09-17'$$,
  '42501',
  NULL,
  'insert direto com setor também é recusado'
);

select lives_ok(
  $$update contagem_itens set quantidade = 99, total = 0
    where contagem_id = (select id from contagens
                         where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-17')$$,
  'update direto não estoura, mas não alcança nenhuma linha'
);

select is(
  (select sum(ci.quantidade)::numeric from contagem_itens ci join contagens c on c.id = ci.contagem_id
   where c.unidade_id = 'uni-ancora-setor-a' and c.data = '2026-09-17'),
  12::numeric,
  'quantidades intactas depois do update direto'
);

-- Fluxo legado continua funcionando pela Data API...
select lives_ok(
  $$insert into contagens (unidade_id, data, mes, criado_por)
    values ('uni-ancora-setor-a', '2026-09-10', 'setembro 2026',
            '00000000-0000-0000-0000-0000000c9001')$$,
  'cabeçalho legado criado direto'
);

select lives_ok(
  $$insert into contagem_itens (contagem_id, sku, quantidade)
    select id, 'HORLTA001', 1 from contagens
    where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-10'$$,
  'item legado entra na data legada'
);

select throws_ok(
  $$insert into contagens (unidade_id, data, mes, criado_por, modalidade, snapshot_criado_em)
    values ('uni-ancora-setor-a', '2026-09-11', 'setembro 2026',
            '00000000-0000-0000-0000-0000000c9001', 'setor', now())$$,
  '42501',
  NULL,
  'cabeçalho "setor" não nasce por escrita direta'
);

-- ...mas nunca vira contagem por setor.
select throws_ok(
  $$select abrir_contagem_setor('uni-ancora-setor-a', date '2026-09-10', 'setembro 2026')$$,
  'P0001',
  'Esta data já tem uma contagem no modo antigo (sem setor). Para contar por setor, escolha outra data.',
  'abrir por setor uma data legada com itens é recusado'
);

select throws_ok(
  $$select substituir_contagem_setor(
    (select id from contagens where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-10'),
    '00000000-0000-0000-0000-0000000c1001',
    '[{"sku":"HORLTA001","quantidade":3},{"sku":"BALCER001","quantidade":0}]'::jsonb, 0)$$,
  'P0001',
  'Esta data foi contada no modo antigo (sem setor) e não aceita envio por setor.',
  'envio por setor em data legada é recusado'
);

-- ── 9. Correção por id ───────────────────────────────────────────────────

select is(
  corrigir_item_contagem(
    (select ci.id from contagem_itens ci join contagens c on c.id = ci.contagem_id
     where c.unidade_id = 'uni-ancora-setor-a' and c.data = '2026-09-17'
       and ci.setor_id = '00000000-0000-0000-0000-0000000c1001' and ci.sku = 'HORLTA001'),
    6, 2),
  '{"versao": 3}'::jsonb,
  'correção do limão do bar sobe a versão do bar'
);

select results_eq(
  $$select s.nome, ci.quantidade::numeric, ci.total::numeric
    from contagem_itens ci join setores s on s.id = ci.setor_id
    join contagens c on c.id = ci.contagem_id
    where c.unidade_id = 'uni-ancora-setor-a' and ci.sku = 'HORLTA001'
    order by s.nome$$,
  $$values ('Bar'::text, 6::numeric, 60.00::numeric), ('Cozinha', 4::numeric, 40.00::numeric)$$,
  'só a linha do bar mudou, com o total recalculado no banco'
);

select throws_ok(
  $$select corrigir_item_contagem(
    (select ci.id from contagem_itens ci join contagens c on c.id = ci.contagem_id
     where c.unidade_id = 'uni-ancora-setor-a' and c.data = '2026-09-17'
       and ci.setor_id = '00000000-0000-0000-0000-0000000c1001' and ci.sku = 'HORLTA001'),
    7, 2)$$,
  'P0001',
  'Outra pessoa enviou este setor agora. Recarregue.',
  'correção com versão velha é recusada'
);

-- A linha some num reenvio: corrigir pelo id antigo tem que falhar.
create temporary table id_antigo as
select ci.id from contagem_itens ci join contagens c on c.id = ci.contagem_id
where c.unidade_id = 'uni-ancora-setor-a' and c.data = '2026-09-17'
  and ci.setor_id = '00000000-0000-0000-0000-0000000c1001' and ci.sku = 'BALCER001';

select lives_ok(
  $$select substituir_contagem_setor(
    (select id from contagens where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-17'),
    '00000000-0000-0000-0000-0000000c1001',
    '[{"sku":"HORLTA001","quantidade":6},{"sku":"BALCER001","quantidade":1}]'::jsonb, 3)$$,
  'reenvio do bar recria as linhas'
);

select throws_ok(
  $$select corrigir_item_contagem((select id from id_antigo), 5, 4)$$,
  'P0001',
  'Não achei esse item para corrigir. Ele pode ter sido substituído por um envio mais novo. Recarregue.',
  'correção de linha que sumiu falha, nunca confirma sucesso vazio'
);

-- ── 10. Produto e setor desativados depois da abertura ───────────────────

select lives_ok(
  $$update produtos set ativo = false
    where unidade_id = 'uni-ancora-setor-a' and sku = 'BALCER001'$$,
  'cerveja desativada no cadastro'
);

select throws_ok(
  $$select substituir_contagem_setor(
    (select id from contagens where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-17'),
    '00000000-0000-0000-0000-0000000c1001',
    '[{"sku":"HORLTA001","quantidade":6}]'::jsonb, 4)$$,
  'P0001',
  'Envio incompleto: faltam 1 item do setor Bar.',
  'produto desativado depois da abertura continua na lista da data'
);

select lives_ok(
  $$select abrir_contagem_setor('uni-ancora-setor-a', date '2026-09-24', 'setembro 2026')$$,
  'nova data aberta'
);

select lives_ok(
  $$update setores set ativo = false where id = '00000000-0000-0000-0000-0000000c1002'$$,
  'cozinha desativada com a data de 24/09 pendente'
);

select lives_ok(
  $$select substituir_contagem_setor(
    (select id from contagens where unidade_id = 'uni-ancora-setor-a' and data = '2026-09-24'),
    '00000000-0000-0000-0000-0000000c1002',
    '[{"sku":"HORLTA001","quantidade":1},{"sku":"MERARR001","quantidade":1},
      {"sku":"MERSEM001","quantidade":1}]'::jsonb, 0)$$,
  'setor desativado ainda conclui a data que já estava aberta'
);

-- ── 11. Designação transacional ──────────────────────────────────────────

select throws_ok(
  $$select designar_setores_produtos('uni-ancora-setor-a',
    '[{"sku":"HORLTA001","setorIds":["00000000-0000-0000-0000-0000000c1001"]},
      {"sku":"NAOEXISTE","setorIds":["00000000-0000-0000-0000-0000000c1001"]}]'::jsonb)$$,
  'P0001',
  'Produto não encontrado nesta unidade: NAOEXISTE',
  'designação com um produto inválido é recusada inteira'
);

select is(
  (select count(*)::int from produto_setores ps join produtos p on p.id = ps.produto_id
   where p.unidade_id = 'uni-ancora-setor-a' and p.sku = 'HORLTA001'),
  2,
  'erro no meio não deixou o limão sem setor'
);

select * from finish();
rollback;
