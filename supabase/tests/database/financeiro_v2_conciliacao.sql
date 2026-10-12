-- Financeiro V2 (11/10/2026), fatia F2: a Conciliação grava no financeiro.
-- Baixa exata, ajuste de juros e tarifa, documento novo já pago, transferência, ignorar, lote tudo ou
-- nada, idempotência, aprendizado e desfazer com estorno. Fixtures isoladas, sem dado real.

begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

update fin_acesso_exclusivo set ativo = true where id;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000c2001', 'gestao.c2@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c2002', 'oper.c2@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c2003', 'fora.c2@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-c2', 'Org C2', 'saas', true), ('org-c2-fora', 'Fora', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo, financeiro_gerencial_habilitado,
  financeiro_liberado_equipe, conciliacao_habilitada) values
  ('uni-c2', 'org-c2', 'C2', 'banco', true, true, true, true);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-0000000c2001', 'org-c2', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-0000000c2002', 'org-c2', 'uni-c2', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-0000000c2003', 'org-c2-fora', null, 'gestao', 'ativo');
delete from fin_conciliacao_segredos where chave = 'atestado_ingestao' and versao = 1;
insert into fin_conciliacao_segredos (chave, versao, valor) values
  ('atestado_ingestao', 1, 'segredo-de-teste-0123456789abcdef0123456789abcdef');

select public.semear_categorias_financeiras('uni-c2');
insert into fin_contas_financeiras (id, unidade_id, nome, tipo) values
  ('00000000-0000-0000-0000-0000000c2a01', 'uni-c2', 'Banco A', 'banco'),
  ('00000000-0000-0000-0000-0000000c2a02', 'uni-c2', 'Banco B', 'banco');

create temp table cat as select
  (select id from fin_categorias where unidade_id = 'uni-c2' and codigo_sistema = 'cmc_compras_mercadorias') as merc,
  (select id from fin_categorias where unidade_id = 'uni-c2' and codigo_sistema = 'cmc_compras_embalagens') as emb,
  (select id from fin_categorias where unidade_id = 'uni-c2' and codigo_sistema = 'ca_tarifas_bancarias') as tarifa,
  (select id from fin_categorias where unidade_id = 'uni-c2' and papel_dre = 'receita' order by ordem limit 1) as receita;
grant select on cat to authenticated;

-- Títulos em aberto: duas despesas de 2.000,00 e uma receita de 1.000,00.
insert into fin_lancamentos (id, unidade_id, tipo, categoria_id, descricao, data_competencia, criado_por) values
  ('00000000-0000-0000-0000-0000000c2b01', 'uni-c2', 'despesa', (select merc from cat), 'Bemdita Carnes', '2026-10-01', '00000000-0000-0000-0000-0000000c2001'),
  ('00000000-0000-0000-0000-0000000c2b02', 'uni-c2', 'despesa', (select merc from cat), 'Bemdita Carnes atrasada', '2026-10-01', '00000000-0000-0000-0000-0000000c2001'),
  ('00000000-0000-0000-0000-0000000c2b03', 'uni-c2', 'receita', (select receita from cat), 'Evento', '2026-10-01', '00000000-0000-0000-0000-0000000c2001');
insert into fin_parcelas (id, unidade_id, lancamento_id, numero, total_parcelas, valor, data_prevista) values
  ('00000000-0000-0000-0000-0000000c2c01', 'uni-c2', '00000000-0000-0000-0000-0000000c2b01', 1, 1, 2000, '2026-10-05'),
  ('00000000-0000-0000-0000-0000000c2c02', 'uni-c2', '00000000-0000-0000-0000-0000000c2b02', 1, 1, 2000, '2026-10-05'),
  ('00000000-0000-0000-0000-0000000c2c03', 'uni-c2', '00000000-0000-0000-0000-0000000c2b03', 1, 1, 1000, '2026-10-05');

-- Extrato importado (conta A) com 8 movimentos.
insert into fin_importacoes (id, unidade_id, conta_financeira_id, tipo_documento, formato, situacao, nome_original,
  tamanho_bytes, criacao_nonce, criado_por) values
  ('00000000-0000-0000-0000-0000000c2d01', 'uni-c2', '00000000-0000-0000-0000-0000000c2a01', 'extrato', 'ofx', 'concluida',
   'extrato.ofx', 10, gen_random_uuid(), '00000000-0000-0000-0000-0000000c2001');
insert into fin_movimentos_importados (id, unidade_id, conta_financeira_id, importacao_origem_id, data, direcao, valor,
  descricao_original, descricao_normalizada, fingerprint_forte, fingerprint_fraco, versao_identidade, conteudo_digest,
  natureza, fonte_extracao, versao_parser, criado_por)
select ('00000000-0000-0000-0000-0000000c2e0' || n)::uuid, 'uni-c2', '00000000-0000-0000-0000-0000000c2a01',
  '00000000-0000-0000-0000-0000000c2d01', '2026-10-06', dir, val, des, lower(des), 'f' || n, 'w' || n, 1, 'd' || n,
  dir_nat, 'deterministica', 'ofx-1', '00000000-0000-0000-0000-0000000c2001'
from (values
  (1, 'saida', 2000.00, 'PIX ENVIADO BEMDITA CARNES', 'saida'),
  (2, 'saida', 2050.00, 'PIX ENVIADO BEMDITA CARNES', 'saida'),
  (3, 'entrada', 950.00, 'PIX RECEBIDO EVENTO', 'entrada'),
  (4, 'saida', 500.00, 'PIX ENVIADO ATACADAO', 'saida'),
  (5, 'saida', 1000.00, 'TED MESMA TITULARIDADE', 'saida'),
  (6, 'saida', 10.00, 'TARIFA AVULSA', 'saida'),
  (7, 'saida', 300.00, 'PIX ENVIADO ATACADAO', 'saida'),
  (8, 'saida', 77.00, 'PIX ENVIADO DIVERSOS', 'saida')
) as t(n, dir, val, des, dir_nat);

create function pg_temp.como(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
create function pg_temp.env(p_op text, p_user text, p_corpo jsonb) returns text language sql as $$
  select (p_corpo || jsonb_build_object('op', p_op, 'kv', 1, 'usuario', p_user, 'unidade', 'uni-c2'))::text;
$$;
create function pg_temp.ass(p_env text) returns text language sql as $$
  select encode(extensions.hmac(convert_to(p_env, 'UTF8'), convert_to('segredo-de-teste-0123456789abcdef0123456789abcdef', 'UTF8'), 'sha256'), 'hex');
$$;
create function pg_temp.decidir(p_user text, p_chave text, p_itens jsonb) returns jsonb language plpgsql as $$
declare v_env text := pg_temp.env('decidir', p_user, jsonb_build_object('chave', p_chave, 'itens', p_itens));
begin return public.fin_conciliacao_decidir(v_env, pg_temp.ass(v_env)); end; $$;
create function pg_temp.desfazer(p_user text, p_decisao uuid) returns jsonb language plpgsql as $$
declare v_env text := pg_temp.env('desfazer', p_user, jsonb_build_object('decisao_id', p_decisao, 'motivo', 'teste de desfazer'));
begin return public.fin_conciliacao_desfazer(v_env, pg_temp.ass(v_env)); end; $$;
create function pg_temp.req(p_chave text) returns jsonb language sql security definer as $$
  select resultado from public.fin_conciliacao_requisicoes where chave = p_chave $$;
create function pg_temp.mov(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000c2e0' || n)::uuid $$;
create function pg_temp.estado(n int) returns text language sql security definer as $$
  select estado from public.fin_movimentos_importados where id = pg_temp.mov(n) $$;

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000c2002');

-- 1. Baixa exata pelo Operacional.
select lives_ok($$ select pg_temp.decidir('00000000-0000-0000-0000-0000000c2002', 'req-000001', jsonb_build_array(
  jsonb_build_object('movimento_id', pg_temp.mov(1), 'acao', 'baixar_parcelas',
    'parcelas', jsonb_build_array(jsonb_build_object('parcela_id', '00000000-0000-0000-0000-0000000c2c01', 'valor', 200000))))) $$,
  'Operacional concilia baixa exata');
select is(pg_temp.estado(1), 'conciliado', 'movimento fica conciliado');
select is((select status from fin_parcelas where id = '00000000-0000-0000-0000-0000000c2c01'), 'quitado', 'parcela quitada');
select is((select conta_financeira_id::text || ' ' || data::text from fin_baixas where parcela_id = '00000000-0000-0000-0000-0000000c2c01'),
  '00000000-0000-0000-0000-0000000c2a01 2026-10-06', 'baixa na conta e na data do extrato');
select throws_ok($$ select pg_temp.decidir('00000000-0000-0000-0000-0000000c2002', 'req-000002', jsonb_build_array(
  jsonb_build_object('movimento_id', pg_temp.mov(1), 'acao', 'ignorar', 'motivo', 'duplicado'))) $$,
  'P0001', null, 'movimento já tratado não decide de novo');

-- 2. Pago com juros: sem ajuste falha; com ajuste cria despesa de juros já paga.
select throws_ok($$ select pg_temp.decidir('00000000-0000-0000-0000-0000000c2002', 'req-000003', jsonb_build_array(
  jsonb_build_object('movimento_id', pg_temp.mov(2), 'acao', 'baixar_parcelas',
    'parcelas', jsonb_build_array(jsonb_build_object('parcela_id', '00000000-0000-0000-0000-0000000c2c02', 'valor', 200000))))) $$,
  '23514', null, 'diferença sem ajuste é recusada');
create temp table dec2 as select (pg_temp.decidir('00000000-0000-0000-0000-0000000c2002', 'req-000004', jsonb_build_array(
  jsonb_build_object('movimento_id', pg_temp.mov(2), 'acao', 'baixar_parcelas',
    'parcelas', jsonb_build_array(jsonb_build_object('parcela_id', '00000000-0000-0000-0000-0000000c2c02', 'valor', 200000)),
    'ajuste', jsonb_build_object('categoria_id', (select tarifa from cat), 'valor', 5000))))->'decisoes'->>0)::uuid as id;
select is((select sum(b.valor) from fin_baixas b where b.data = '2026-10-06' and b.conta_financeira_id = '00000000-0000-0000-0000-0000000c2a01'
  and exists (select 1 from fin_conciliacao_decisao_vinculos v where v.baixa_id = b.id and v.decisao_id = (select id from dec2))),
  2050.00::numeric, 'baixa da parcela mais ajuste somam o pagamento');

-- 3. Recebido a menos (tarifa): baixa a receita inteira e lança a tarifa.
select lives_ok($$ select pg_temp.decidir('00000000-0000-0000-0000-0000000c2002', 'req-000005', jsonb_build_array(
  jsonb_build_object('movimento_id', pg_temp.mov(3), 'acao', 'baixar_parcelas',
    'parcelas', jsonb_build_array(jsonb_build_object('parcela_id', '00000000-0000-0000-0000-0000000c2c03', 'valor', 100000)),
    'ajuste', jsonb_build_object('categoria_id', (select tarifa from cat), 'valor', 5000)))) $$,
  'recebimento com tarifa concilia');
select is((select status from fin_parcelas where id = '00000000-0000-0000-0000-0000000c2c03'), 'quitado', 'receita quitada pelo valor cheio');
select ok(exists (select 1 from fin_lancamentos where tipo = 'despesa' and categoria_id = (select tarifa from cat)
  and descricao like 'Ajuste de conciliação%' and unidade_id = 'uni-c2'), 'tarifa vira despesa de ajuste');

-- 4. Nota nova já paga, com aprendizado.
select lives_ok($$ select pg_temp.decidir('00000000-0000-0000-0000-0000000c2002', 'req-000006', jsonb_build_array(
  jsonb_build_object('movimento_id', pg_temp.mov(4), 'acao', 'criar_documento', 'aprender', true,
    'categoria_aprendida', (select merc from cat), 'padrao', 'atacadao', 'versao_normalizacao', 1,
    'documento', jsonb_build_object('chave', 'doc-conc-000004', 'digest', repeat('a', 64), 'tipo', 'despesa',
      'descricao', 'Atacadão', 'data_competencia', '2026-10-06',
      'linhas', jsonb_build_array(jsonb_build_object('categoria_id', (select merc from cat), 'valor', 50000, 'celulas', jsonb_build_array(50000))))))) $$,
  'cria documento já pago a partir do extrato');
select is((select count(*)::int from fin_regras_classificacao where unidade_id = 'uni-c2' and padrao_normalizado = 'atacadao'
  and situacao = 'ativa' and origem = 'aprendizado'), 1, 'confirmar e aprender cria a regra da unidade');
select is((select status from fin_parcelas pa join fin_lancamentos l on l.id = pa.lancamento_id join fin_documentos d on d.id = l.documento_id
  where d.chave_idempotencia = 'doc-conc-000004'), 'quitado', 'parcela do documento já nasce paga');

-- Mesmo padrão com outro Plano de Contas: regra vira conflitante.
select lives_ok($$ select pg_temp.decidir('00000000-0000-0000-0000-0000000c2002', 'req-000007', jsonb_build_array(
  jsonb_build_object('movimento_id', pg_temp.mov(7), 'acao', 'criar_documento', 'aprender', true,
    'categoria_aprendida', (select emb from cat), 'padrao', 'atacadao', 'versao_normalizacao', 1,
    'documento', jsonb_build_object('chave', 'doc-conc-000007', 'digest', repeat('b', 64), 'tipo', 'despesa',
      'descricao', 'Atacadão embalagem', 'data_competencia', '2026-10-06',
      'linhas', jsonb_build_array(jsonb_build_object('categoria_id', (select emb from cat), 'valor', 30000, 'celulas', jsonb_build_array(30000))))))) $$,
  'segunda confirmação com outro Plano de Contas');
select is((select situacao from fin_regras_classificacao where unidade_id = 'uni-c2' and padrao_normalizado = 'atacadao'),
  'conflitante', 'regra com categorias diferentes para de sugerir');

-- 5. Transferência entre contas próprias, fora da DRE.
select lives_ok($$ select pg_temp.decidir('00000000-0000-0000-0000-0000000c2002', 'req-000008', jsonb_build_array(
  jsonb_build_object('movimento_id', pg_temp.mov(5), 'acao', 'transferencia', 'conta_contraparte_id', '00000000-0000-0000-0000-0000000c2a02'))) $$,
  'transferência entre contas próprias');
select is((select conta_origem_id::text || '>' || conta_destino_id::text from fin_transferencias where movimento_origem_id = pg_temp.mov(5)),
  '00000000-0000-0000-0000-0000000c2a01>00000000-0000-0000-0000-0000000c2a02', 'saída da conta A para a conta B');
select is(pg_temp.estado(5), 'transferencia', 'movimento marcado como transferência');

-- 6. Ignorar exige motivo; lote é tudo ou nada.
select throws_ok($$ select pg_temp.decidir('00000000-0000-0000-0000-0000000c2002', 'req-000009', jsonb_build_array(
  jsonb_build_object('movimento_id', pg_temp.mov(6), 'acao', 'ignorar', 'motivo', 'Tarifa estornada no mesmo dia'),
  jsonb_build_object('movimento_id', pg_temp.mov(8), 'acao', 'ignorar'))) $$,
  '23514', null, 'item sem motivo derruba o lote');
select is(pg_temp.estado(6), 'pendente', 'lote recusado não aplica nenhum item');
select lives_ok($$ select pg_temp.decidir('00000000-0000-0000-0000-0000000c2002', 'req-000010', jsonb_build_array(
  jsonb_build_object('movimento_id', pg_temp.mov(6), 'acao', 'ignorar', 'motivo', 'Tarifa estornada no mesmo dia'))) $$,
  'ignorar com motivo');

-- 7. Idempotência da requisição.
select is(pg_temp.decidir('00000000-0000-0000-0000-0000000c2002', 'req-000010', jsonb_build_array(
  jsonb_build_object('movimento_id', pg_temp.mov(6), 'acao', 'ignorar', 'motivo', 'Tarifa estornada no mesmo dia'))),
  pg_temp.req('req-000010'), 'reenvio igual devolve o mesmo resultado');
select throws_ok($$ select pg_temp.decidir('00000000-0000-0000-0000-0000000c2002', 'req-000010', jsonb_build_array(
  jsonb_build_object('movimento_id', pg_temp.mov(8), 'acao', 'ignorar', 'motivo', 'outro conteudo'))) $$,
  '23505', null, 'mesma chave com outro conteúdo é recusada');

-- 8. Atestado de outro usuário não vale.
select throws_ok($$ select pg_temp.decidir('00000000-0000-0000-0000-0000000c2001', 'req-000011', jsonb_build_array(
  jsonb_build_object('movimento_id', pg_temp.mov(8), 'acao', 'ignorar', 'motivo', 'x y z'))) $$,
  '42501', null, 'envelope assinado para outro usuário é recusado');

-- 9. Desfazer: Operacional não pode; Gestão estorna e volta tudo.
select throws_ok($$ select pg_temp.desfazer('00000000-0000-0000-0000-0000000c2002', (select id from dec2)) $$,
  '42501', null, 'Operacional não desfaz');
select pg_temp.como('00000000-0000-0000-0000-0000000c2001');
select lives_ok($$ select pg_temp.desfazer('00000000-0000-0000-0000-0000000c2001', (select id from dec2)) $$, 'Gestão desfaz');
select is(pg_temp.estado(2), 'pendente', 'movimento volta a pendente');
select is((select status from fin_parcelas where id = '00000000-0000-0000-0000-0000000c2c02'), 'aberto', 'parcela volta a aberto pelo estorno');
select ok(not exists (select 1 from fin_parcelas pa join fin_conciliacao_decisao_vinculos v on v.lancamento_id = pa.lancamento_id
  where v.decisao_id = (select id from dec2) and v.papel = 'ajuste' and pa.status <> 'cancelado'), 'parcela do ajuste é cancelada');
select is((select count(*)::int from fin_baixas b join fin_conciliacao_decisao_vinculos v on v.baixa_id = b.estorno_de_baixa_id
  where v.decisao_id = (select id from dec2)), 2, 'cada baixa da decisão ganha um estorno');
select is((select situacao from fin_conciliacao_decisoes where id = (select id from dec2)), 'desfeita', 'decisão fica no histórico como desfeita');

-- 9b. Desfazer nota criada pela conciliação cancela a despesa (achado da revisão).
create temp table dec4 as select id from fin_conciliacao_decisoes where movimento_id = pg_temp.mov(4);
select lives_ok($$ select pg_temp.desfazer('00000000-0000-0000-0000-0000000c2001', (select id from dec4)) $$, 'Gestão desfaz a nota criada');
select is((select string_agg(distinct pa.status, ',') from fin_parcelas pa join fin_lancamentos l on l.id = pa.lancamento_id
  join fin_documentos d on d.id = l.documento_id where d.chave_idempotencia like 'doc-conc-000004%'), 'cancelado',
  'parcelas da nota desfeita ficam canceladas (saem da DRE e do contas a pagar)');

-- 10. Outra organização não enxerga as decisões.
select pg_temp.como('00000000-0000-0000-0000-0000000c2003');
select is((select count(*)::int from fin_conciliacao_decisoes), 0, 'outra organização não lê decisões');

select * from finish();
rollback;
