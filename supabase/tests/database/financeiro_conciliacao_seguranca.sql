-- Conciliação V1, fatia piloto - garantias que só o banco dá.
-- Rodar com o Supabase local no ar: `npx supabase db test`.
-- Fixtures isoladas, sem dado real. Concorrência entre duas conexões fica em
-- `scripts/testar-concorrencia-conciliacao.sh` (pgTAP roda numa sessão só).

begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ── Fixture ────────────────────────────────────────────────────────────────
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000c0a1', 'gestor.a@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c0b1', 'oper.b@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c0f1', 'master@teste.local', 'x', now(), 'authenticated', 'authenticated');

insert into organizacoes (id, nome, tipo_cliente, ativo) values
  ('org-conc-a', 'Org A', 'saas', true), ('org-conc-b', 'Org B', 'saas', true);
insert into unidades (id, organizacao_id, nome, fonte_dados_estoque, ativo,
  financeiro_gerencial_habilitado, conciliacao_habilitada) values
  ('uni-conc-a', 'org-conc-a', 'A', 'banco', true, true, true),
  ('uni-conc-b', 'org-conc-b', 'B', 'banco', true, true, true),
  ('uni-conc-c', 'org-conc-a', 'C sem flag', 'banco', true, true, false);
insert into vinculos (user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-00000000c0a1', 'org-conc-a', null, 'gestao', 'ativo'),
  ('00000000-0000-0000-0000-00000000c0b1', 'org-conc-b', 'uni-conc-b', 'operacional', 'ativo'),
  ('00000000-0000-0000-0000-00000000c0f1', 'org-conc-a', null, 'master', 'ativo');

select public.semear_categorias_financeiras('uni-conc-a');
insert into fin_contas_financeiras (id, unidade_id, nome, tipo) values
  ('00000000-0000-0000-0000-0000000ca001', 'uni-conc-a', 'Banco A1', 'banco'),
  ('00000000-0000-0000-0000-0000000ca002', 'uni-conc-a', 'Banco A2', 'banco'),
  ('00000000-0000-0000-0000-0000000cb001', 'uni-conc-b', 'Banco B1', 'banco'),
  ('00000000-0000-0000-0000-0000000cc001', 'uni-conc-c', 'Banco C1', 'banco');
insert into fin_conciliacao_segredos (chave, versao, valor) values
  ('atestado_ingestao', 1, 'segredo-de-teste-0123456789abcdef0123456789abcdef'),
  ('relatorio_ia', 1, encode(extensions.digest('token-do-relatorio-0123456789abcdef', 'sha256'), 'hex'));

-- Bemdita Carnes: despesa com parcela de R$ 2.000 em 29/09 (adendo).
insert into fin_lancamentos (id, unidade_id, tipo, categoria_id, descricao, data_competencia, criado_por)
select '00000000-0000-0000-0000-0000000cd001', 'uni-conc-a', 'despesa', c.id, 'Bemdita Carnes', '2026-09-01',
       '00000000-0000-0000-0000-00000000c0a1'
from fin_categorias c where c.unidade_id = 'uni-conc-a' and c.codigo_sistema = 'cmc_compras_mercadorias';
insert into fin_parcelas (id, unidade_id, lancamento_id, numero, total_parcelas, valor, data_prevista) values
  ('00000000-0000-0000-0000-0000000cd101', 'uni-conc-a', '00000000-0000-0000-0000-0000000cd001', 1, 1, 2000, '2026-09-29');

create function pg_temp.assinar(p text) returns text language sql as $$
  select encode(extensions.hmac(convert_to(p, 'UTF8'),
    convert_to('segredo-de-teste-0123456789abcdef0123456789abcdef', 'UTF8'), 'sha256'), 'hex')
$$;
create function pg_temp.como(p_user text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
create function pg_temp.env_criar(p_sha text, p_conta text default '00000000-0000-0000-0000-0000000ca001',
  p_unidade text default 'uni-conc-a', p_user text default '00000000-0000-0000-0000-00000000c0a1',
  p_nonce uuid default null) returns text
language sql as $$
  select jsonb_build_object('op', 'criar_importacao', 'kv', 1, 'usuario', p_user, 'unidade', p_unidade,
    'conta', p_conta, 'tipo_documento', 'extrato', 'formato', 'ofx', 'nome', 'extrato.ofx', 'tamanho', 100,
    'sha256', p_sha, 'mime', 'application/x-ofx', 'quarentena_motivo', null,
    'nonce', coalesce(p_nonce, md5(p_sha || p_conta || p_unidade || p_user)::uuid))::text
$$;
-- Monta uma linha de movimento do payload.
create function pg_temp.mov(p_pos int, p_data text, p_dir text, p_cent text, p_desc text,
  p_id text default null, p_cat uuid default null) returns jsonb language sql as $$
  select jsonb_build_object('posicao', p_pos, 'tipo', 'movimento', 'data', p_data, 'direcao', p_dir,
    'valor_centavos', p_cent, 'descricao_original', p_desc, 'descricao_normalizada', lower(p_desc),
    'favorecido_normalizado', null, 'id_banco', p_id, 'natureza', p_dir, 'conferido', false,
    'sugestao', jsonb_build_object('categoria_id', p_cat,
      'confianca', case when p_cat is null then 'nenhuma' else 'baixa' end,
      'fonte', case when p_cat is null then 'sem_evidencia' else 'descricao' end,
      'motivo_codigo', 'teste', 'evidencias', '{}'::jsonb))
$$;
create function pg_temp.env_resultado(p_imp uuid, p_tent int, p_nonce uuid, p_linhas jsonb,
  p_user text default '00000000-0000-0000-0000-00000000c0a1') returns text language sql as $$
  select jsonb_build_object('op', 'registrar_resultado', 'kv', 1, 'usuario', p_user, 'importacao', p_imp,
    'tentativa', p_tent, 'nonce', p_nonce, 'versao_parser', 'ofx-1', 'versao_motor', 'motor-1',
    'fonte_extracao', 'deterministica', 'conferencia_aritmetica', 'nao_verificavel',
    'periodo_inicio', null, 'periodo_fim', null, 'erro_global', null, 'linhas', p_linhas)::text
$$;
-- Cria importação, simula o upload no caminho exato e inicia o processamento.
create function pg_temp.preparar(p_sha text, p_conta text default '00000000-0000-0000-0000-0000000ca001')
returns jsonb language plpgsql as $$
declare v_env text; v_cri jsonb; v_ini jsonb; v_env2 text;
begin
  v_env := pg_temp.env_criar(p_sha, p_conta);
  v_cri := public.fin_conciliacao_criar_importacao(v_env, pg_temp.assinar(v_env));
  insert into storage.objects (bucket_id, name) values ('fin-conciliacao', v_cri->>'caminho');
  v_env2 := jsonb_build_object('op', 'iniciar_processamento', 'kv', 1,
    'usuario', '00000000-0000-0000-0000-00000000c0a1', 'importacao', v_cri->>'id', 'sha256', p_sha)::text;
  v_ini := public.fin_conciliacao_iniciar_processamento(v_env2, pg_temp.assinar(v_env2));
  return v_cri || v_ini;
end $$;
create table pg_temp.ctx (chave text primary key, valor jsonb);
grant all on pg_temp.ctx to authenticated;

create temp table fin_antes as
  select (select count(*) from fin_lancamentos) l, (select count(*) from fin_parcelas) p,
         (select count(*) from fin_baixas) b, (select count(*) from fin_fechamentos) f;

-- ── 1. Estrutura: RLS ligada e escrita direta revogada ────────────────────
select ok((select bool_and(relrowsecurity) from pg_class where relname in ('fin_importacoes', 'fin_importacao_linhas',
  'fin_movimentos_importados', 'fin_classificacoes', 'fin_regras_classificacao', 'fin_ia_chamadas', 'fin_conciliacao_segredos')),
  'RLS ligada em todas as tabelas novas');
select ok(not has_table_privilege('authenticated', 'public.fin_movimentos_importados', 'INSERT')
  and not has_table_privilege('authenticated', 'public.fin_movimentos_importados', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.fin_importacoes', 'INSERT')
  and not has_table_privilege('authenticated', 'public.fin_classificacoes', 'INSERT')
  and not has_table_privilege('authenticated', 'public.fin_ia_chamadas', 'INSERT'),
  'authenticated não escreve direto nas tabelas novas');
select ok(not has_table_privilege('authenticated', 'public.fin_conciliacao_segredos', 'SELECT')
  and not has_table_privilege('anon', 'public.fin_conciliacao_segredos', 'SELECT'), 'segredo não é legível pela API');
select ok(not has_function_privilege('authenticated', 'public.fin_conciliacao_conferir_atestado(text,text,text)', 'EXECUTE'),
  'conferência de atestado não é chamável pela API');
select ok(not has_function_privilege('anon', 'public.fin_conciliacao_criar_importacao(text,text)', 'EXECUTE'),
  'anon não cria importação');
select is((select count(*)::int from information_schema.columns where table_name = 'fin_movimentos_importados'
  and column_name in ('id', 'unidade_id', 'conta_financeira_id', 'importacao_origem_id', 'data', 'direcao', 'valor',
  'descricao_original', 'natureza', 'estado', 'motivo_revisao', 'duplicidade_candidata_id', 'fonte_extracao')), 13,
  'colunas usadas pelo app existem em fin_movimentos_importados');

-- ── 2. Atestado ────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-00000000c0a1');

select throws_ok($$insert into fin_movimentos_importados (unidade_id, conta_financeira_id, importacao_origem_id, data,
  direcao, valor, descricao_original, descricao_normalizada, fingerprint_forte, fingerprint_fraco, versao_identidade,
  conteudo_digest, natureza, fonte_extracao, versao_parser, criado_por) values ('uni-conc-a',
  '00000000-0000-0000-0000-0000000ca001', gen_random_uuid(), '2026-09-29', 'saida', 1, 'x', 'x', 'x', 'x', 1, 'x',
  'saida', 'deterministica', 'x', '00000000-0000-0000-0000-00000000c0a1')$$, '42501', null,
  'insert direto em movimento é recusado');
select throws_ok($$select public.fin_conciliacao_criar_importacao(pg_temp.env_criar(repeat('a', 64)), repeat('0', 64))$$,
  '42501', 'Atestado invalido', 'atestado falso é recusado');
select throws_ok($$select public.fin_conciliacao_criar_importacao(
    replace(pg_temp.env_criar(repeat('a', 64)), 'criar_importacao', 'ia_iniciar'),
    pg_temp.assinar(replace(pg_temp.env_criar(repeat('a', 64)), 'criar_importacao', 'ia_iniciar')))$$,
  '42501', 'Atestado invalido', 'atestado de outra operação é recusado');
select throws_ok($$select public.fin_conciliacao_criar_importacao(
    pg_temp.env_criar(repeat('a', 64), p_user => '00000000-0000-0000-0000-00000000c0b1'),
    pg_temp.assinar(pg_temp.env_criar(repeat('a', 64), p_user => '00000000-0000-0000-0000-00000000c0b1')))$$,
  '42501', 'Atestado invalido', 'atestado emitido para outro usuário é recusado');

-- ── 3. Identidade do arquivo ───────────────────────────────────────────────
insert into pg_temp.ctx values ('i1', pg_temp.preparar(repeat('1', 64)));
select is((select situacao from fin_importacoes where id = ((select valor from pg_temp.ctx where chave = 'i1')->>'id')::uuid),
  'processando', 'importação criada, arquivo recebido e processamento iniciado');
select is((public.fin_conciliacao_criar_importacao(
  pg_temp.env_criar(repeat('1', 64), p_nonce => '00000000-0000-0000-0000-00000000de01'),
  pg_temp.assinar(pg_temp.env_criar(repeat('1', 64), p_nonce => '00000000-0000-0000-0000-00000000de01'))))->>'situacao', 'duplicada',
  'mesmo arquivo na mesma conta vira duplicada apontando a canônica');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('fin-conciliacao', 'uni-conc-a/qualquer/original.pdf')$$,
  '42501', null, 'upload fora do caminho registrado é recusado');

-- Nonce reutilizado (replay do mesmo envelope de criação).
do $$ declare v text := pg_temp.env_criar(repeat('9', 64)); begin
  perform public.fin_conciliacao_criar_importacao(v, pg_temp.assinar(v));
  insert into pg_temp.ctx values ('replay', to_jsonb(v));
end $$;
select throws_ok($$select public.fin_conciliacao_criar_importacao((select valor #>> '{}' from pg_temp.ctx where chave = 'replay'),
  pg_temp.assinar((select valor #>> '{}' from pg_temp.ctx where chave = 'replay')))$$, '23505', null,
  'replay do mesmo envelope de criação é recusado');

-- ── 4. Registrar resultado ────────────────────────────────────────────────
select throws_ok($$select public.fin_conciliacao_registrar_resultado(
  pg_temp.env_resultado(((select valor from pg_temp.ctx where chave = 'i1')->>'id')::uuid, 1, '00000000-0000-0000-0000-00000000de02', '[]'),
  pg_temp.assinar(pg_temp.env_resultado(((select valor from pg_temp.ctx where chave = 'i1')->>'id')::uuid, 1, '00000000-0000-0000-0000-00000000de02', '[]')))$$,
  'P0001', 'Tentativa expirada ou invalida', 'nonce de outra tentativa é recusado');

insert into pg_temp.ctx
select 'env1', to_jsonb(pg_temp.env_resultado((c.valor->>'id')::uuid, (c.valor->>'tentativa')::int, (c.valor->>'nonce')::uuid,
  jsonb_build_array(
    pg_temp.mov(0, '2026-09-29', 'saida', '10000', 'Pix enviado - Fornecedor X'),
    pg_temp.mov(1, '2026-09-29', 'saida', '10000', 'Pix enviado - Fornecedor X'),
    pg_temp.mov(2, '2026-09-29', 'saida', '200000', 'Pagamento de conta - Bemdita Carnes'),
    jsonb_build_object('posicao', 3, 'tipo', 'saldo'),
    jsonb_build_object('posicao', 4, 'tipo', 'erro', 'codigo_erro', 'data_invalida'))))
from pg_temp.ctx c where c.chave = 'i1';
select is((public.fin_conciliacao_registrar_resultado((select valor #>> '{}' from pg_temp.ctx where chave = 'env1'),
  pg_temp.assinar((select valor #>> '{}' from pg_temp.ctx where chave = 'env1'))))->>'situacao', 'parcial',
  'erro de uma linha não descarta o arquivo: importação parcial');
select is((select count(*)::int from fin_movimentos_importados where importacao_origem_id =
  ((select valor from pg_temp.ctx where chave = 'i1')->>'id')::uuid), 3,
  'dois pagamentos legítimos idênticos no mesmo arquivo viram dois movimentos');
select is((public.fin_conciliacao_registrar_resultado((select valor #>> '{}' from pg_temp.ctx where chave = 'env1'),
  pg_temp.assinar((select valor #>> '{}' from pg_temp.ctx where chave = 'env1'))))->>'repetido', 'true',
  'repetir a mesma chamada devolve o resultado sem duplicar');
select is((select count(*)::int from fin_movimentos_importados where unidade_id = 'uni-conc-a'), 3,
  'repetição não criou movimento');
select is((select linhas_com_erro || '/' || linhas_saldo from fin_importacoes
  where id = ((select valor from pg_temp.ctx where chave = 'i1')->>'id')::uuid), '1/1',
  'importação mostra exatamente o que falhou e o que era saldo');

-- ── 5. Sobreposição sem descarte (A1) ─────────────────────────────────────
insert into pg_temp.ctx values ('i2', pg_temp.preparar(repeat('2', 64)));
insert into pg_temp.ctx
select 'env2', to_jsonb(pg_temp.env_resultado((c.valor->>'id')::uuid, (c.valor->>'tentativa')::int, (c.valor->>'nonce')::uuid,
  jsonb_build_array(
    pg_temp.mov(0, '2026-09-29', 'saida', '10000', 'Pix enviado - Fornecedor X'),
    pg_temp.mov(1, '2026-09-29', 'saida', '10000', 'Pix enviado - Fornecedor X'),
    pg_temp.mov(2, '2026-09-30', 'saida', '5000', 'Pix enviado - Novo'))))
from pg_temp.ctx c where c.chave = 'i2';
select is((public.fin_conciliacao_registrar_resultado((select valor #>> '{}' from pg_temp.ctx where chave = 'env2'),
  pg_temp.assinar((select valor #>> '{}' from pg_temp.ctx where chave = 'env2'))))->>'possiveis_duplicidades', '2',
  'extrato sobreposto sem identificador gera 2 possíveis duplicidades');
select is((select count(*)::int from fin_movimentos_importados where unidade_id = 'uni-conc-a'), 6,
  'nenhum movimento é descartado por contagem');
select is((select count(distinct duplicidade_candidata_id)::int from fin_movimentos_importados
  where importacao_origem_id = ((select valor from pg_temp.ctx where chave = 'i2')->>'id')::uuid
    and estado = 'revisar'), 2, 'cada possível duplicidade aponta um candidato diferente (k-ésimo)');

-- ── 6. Identificador do banco (FITID) ─────────────────────────────────────
insert into pg_temp.ctx values ('i3', pg_temp.preparar(repeat('3', 64)));
insert into pg_temp.ctx
select 'env3', to_jsonb(pg_temp.env_resultado((c.valor->>'id')::uuid, (c.valor->>'tentativa')::int, (c.valor->>'nonce')::uuid,
  jsonb_build_array(pg_temp.mov(0, '2026-09-10', 'entrada', '7000', 'Ted recebida', 'FIT-1'),
                    pg_temp.mov(1, '2026-09-10', 'entrada', '7000', 'Ted recebida', 'FIT-1'),
                    pg_temp.mov(2, '2026-09-10', 'entrada', '9900', 'Ted recebida', 'FIT-1'))))
from pg_temp.ctx c where c.chave = 'i3';
select is((public.fin_conciliacao_registrar_resultado((select valor #>> '{}' from pg_temp.ctx where chave = 'env3'),
  pg_temp.assinar((select valor #>> '{}' from pg_temp.ctx where chave = 'env3'))))->>'conflitos_identificador', '1',
  'mesmo FITID com valor diferente vira conflito');
select is((select estado || ':' || motivo_revisao from fin_movimentos_importados where id_banco = 'FIT-1'),
  'revisar:conflito_identificador', 'movimento do FITID em conflito vai para revisão');

-- ── 7. Entrada nunca recebe categoria de despesa ──────────────────────────
insert into pg_temp.ctx values ('i4', pg_temp.preparar(repeat('4', 64)));
select throws_ok(format($$select public.fin_conciliacao_registrar_resultado(%L, pg_temp.assinar(%L))$$,
  pg_temp.env_resultado((c.valor->>'id')::uuid, (c.valor->>'tentativa')::int, (c.valor->>'nonce')::uuid,
    jsonb_build_array(pg_temp.mov(0, '2026-09-29', 'entrada', '5000', 'Pix recebido', null,
      (select id from fin_categorias where unidade_id = 'uni-conc-a' and codigo_sistema = 'co_aluguel')))),
  pg_temp.env_resultado((c.valor->>'id')::uuid, (c.valor->>'tentativa')::int, (c.valor->>'nonce')::uuid,
    jsonb_build_array(pg_temp.mov(0, '2026-09-29', 'entrada', '5000', 'Pix recebido', null,
      (select id from fin_categorias where unidade_id = 'uni-conc-a' and codigo_sistema = 'co_aluguel'))))),
  '23514', 'Categoria incompativel com o movimento', 'entrada com conta de despesa é recusada pelo banco')
from pg_temp.ctx c where c.chave = 'i4';

-- ── 8. Candidatos de parcela (Bemdita) ────────────────────────────────────
select is((select parcela_id from public.fin_conciliacao_candidatos_parcela(
  (select id from fin_movimentos_importados where descricao_original = 'Pagamento de conta - Bemdita Carnes')) limit 1),
  '00000000-0000-0000-0000-0000000cd101'::uuid, 'Bemdita R$ 2.000 em 29/09 encontra a parcela existente');
select is((select count(*)::int from public.fin_conciliacao_candidatos_parcela(
  (select id from fin_movimentos_importados where id_banco = 'FIT-1'), 5, true)), 0,
  'entrada não recebe parcela de despesa como candidata');

-- ── 9. Isolamento e permissões ─────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-00000000c0b1');
select is((select count(*)::int from fin_movimentos_importados), 0, 'unidade B não vê movimentos da A');
select is((select count(*)::int from fin_importacoes), 0, 'unidade B não vê importações da A');
select throws_ok($$select * from public.fin_conciliacao_candidatos_parcela(
  (select id from fin_movimentos_importados limit 1))$$, '42501', null, 'B não consulta candidatos de A');
select throws_ok($$select public.fin_conciliacao_criar_importacao(
  pg_temp.env_criar(repeat('5', 64), '00000000-0000-0000-0000-0000000ca001', 'uni-conc-a', '00000000-0000-0000-0000-00000000c0b1'),
  pg_temp.assinar(pg_temp.env_criar(repeat('5', 64), '00000000-0000-0000-0000-0000000ca001', 'uni-conc-a', '00000000-0000-0000-0000-00000000c0b1')))$$,
  '42501', 'Sem acesso a Conciliacao desta unidade', 'B não importa na unidade A mesmo com atestado válido');

select pg_temp.como('00000000-0000-0000-0000-00000000c0a1');
select throws_ok($$select public.fin_conciliacao_criar_importacao(
  pg_temp.env_criar(repeat('6', 64), '00000000-0000-0000-0000-0000000cc001', 'uni-conc-c'),
  pg_temp.assinar(pg_temp.env_criar(repeat('6', 64), '00000000-0000-0000-0000-0000000cc001', 'uni-conc-c')))$$,
  '42501', 'Sem acesso a Conciliacao desta unidade', 'flag desligada recusa importação');

select pg_temp.como('00000000-0000-0000-0000-00000000c0f1', 'aal1');
select is((select count(*)::int from fin_movimentos_importados), 0, 'master sem segundo fator não vê nada');
select pg_temp.como('00000000-0000-0000-0000-00000000c0f1', 'aal2');
select ok((select count(*) from fin_movimentos_importados) >= 6, 'master com aal2 vê a unidade');

-- ── 10. Mais de 1.000 linhas numa importação ──────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-00000000c0a1');
insert into pg_temp.ctx values ('i5', pg_temp.preparar(repeat('7', 64), '00000000-0000-0000-0000-0000000ca002'));
insert into pg_temp.ctx
select 'env5', to_jsonb(pg_temp.env_resultado((c.valor->>'id')::uuid, (c.valor->>'tentativa')::int, (c.valor->>'nonce')::uuid,
  (select jsonb_agg(pg_temp.mov(g, '2026-08-01', 'entrada', (1000 + g)::text, 'Vendas disponivel credito ' || g))
   from generate_series(0, 1199) g)))
from pg_temp.ctx c where c.chave = 'i5';
select is((public.fin_conciliacao_registrar_resultado((select valor #>> '{}' from pg_temp.ctx where chave = 'env5'),
  pg_temp.assinar((select valor #>> '{}' from pg_temp.ctx where chave = 'env5'))))->>'movimentos_novos', '1200',
  '1.200 linhas numa importação, sem teto');

-- ── 11. IA e relatório semanal ─────────────────────────────────────────────
select throws_ok($$select public.fin_conciliacao_ia_iniciar(
  jsonb_build_object('op', 'ia_iniciar', 'kv', 1, 'usuario', '00000000-0000-0000-0000-00000000c0a1', 'unidade', 'uni-conc-a',
    'chave', '00000000-0000-0000-0000-0000000ce001', 'finalidade', 'extracao_documento', 'modelo', 'claude-haiku-4-5',
    'tabela_precos_versao', '2026-09-25')::text,
  pg_temp.assinar(jsonb_build_object('op', 'ia_iniciar', 'kv', 1, 'usuario', '00000000-0000-0000-0000-00000000c0a1', 'unidade', 'uni-conc-a',
    'chave', '00000000-0000-0000-0000-0000000ce001', 'finalidade', 'extracao_documento', 'modelo', 'claude-haiku-4-5',
    'tabela_precos_versao', '2026-09-25')::text))$$, '42501', 'IA desligada para esta unidade',
  'IA de documento só com a flag da unidade');
reset role;
select throws_ok($$select public.fin_conciliacao_resumo_semanal_ia('token-errado-0123456789abcdef0123456789')$$,
  '42501', 'Nao autorizado', 'relatório semanal exige o token');
select ok((public.fin_conciliacao_resumo_semanal_ia('token-do-relatorio-0123456789abcdef')) ? 'custo_total_usd',
  'relatório semanal devolve só o agregado');

-- ── 12. Auditoria sem texto bancário e zero efeito financeiro ─────────────
select is((select count(*)::int from logs_auditoria where unidade_id = 'uni-conc-a'
  and (coalesce(dados_novos::text, '') ilike '%Fornecedor X%' or coalesce(dados_novos::text, '') ilike '%Bemdita%')), 0,
  'auditoria da conciliação não copia descrição bancária');
select ok((select count(*) from logs_auditoria where unidade_id = 'uni-conc-a' and acao = 'conciliacao_resultado_registrado') >= 3,
  'cada resultado registrado é auditado');
select ok((select (select count(*) from fin_lancamentos) = l and (select count(*) from fin_parcelas) = p
  and (select count(*) from fin_baixas) = b and (select count(*) from fin_fechamentos) = f from fin_antes),
  'nenhuma escrita em lançamentos, parcelas, baixas ou fechamentos');

select * from finish();
rollback;
