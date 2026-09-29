-- Conciliação Inteligente V1 - fatia piloto "importar e revisar, sem gravar
-- no financeiro" (29-30/09/2026). Especificação em
-- `_execucao/zatti-hub/conciliacao-inteligente-v1*.md` no Cérebro do Gestor;
-- o veredito do Codex (sessão 01a0ed21) prevalece sobre o desenho.
--
-- O que esta migração faz:
--   * flags por unidade (desligadas) e helper de acesso da Conciliação;
--   * importações, ocorrências (linhas), movimentos canônicos, sugestões,
--     regras (só leitura nesta fatia) e registro de uso de IA;
--   * escrita exclusivamente por RPC com atestado HMAC do servidor (A4);
--   * bucket privado com quarentena; auditoria sem texto bancário.
-- O que ela NÃO faz: nenhuma escrita em fin_lancamentos, fin_parcelas,
-- fin_baixas ou fin_fechamentos. Movimento importado é evidência, nunca
-- fonte somável de dinheiro. Confirmação, aprendizado e estorno vêm na
-- próxima rodada, por migração aditiva.
--
-- Passos manuais antes de usar (produção, só com autorização):
--   insert into public.fin_conciliacao_segredos (chave, versao, valor)
--     values ('atestado_ingestao', 1, '<segredo hex 64>');   -- mesmo valor em CONCILIACAO_ATESTADO_SEGREDO
--   insert into public.fin_conciliacao_segredos (chave, versao, valor)
--     values ('relatorio_ia', 1, encode(extensions.digest('<token>', 'sha256'), 'hex'));
--   update public.unidades set conciliacao_habilitada = true where id = '<unidade>';
begin;

-- ── Flags e helper ─────────────────────────────────────────────────────────

alter table public.unidades
  add column if not exists conciliacao_habilitada boolean not null default false,
  add column if not exists conciliacao_ia_documentos boolean not null default false,
  add column if not exists conciliacao_ia_classificacao boolean not null default false;

create or replace function public.usuario_pode_usar_conciliacao(
  p_unidade_id text,
  p_papeis text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.usuario_pode_usar_financeiro_gerencial(p_unidade_id, p_papeis)
    and exists (
      select 1 from public.unidades u
      where u.id = p_unidade_id and u.conciliacao_habilitada = true
    );
$$;

revoke all on function public.usuario_pode_usar_conciliacao(text, text[]) from public, anon;
grant execute on function public.usuario_pode_usar_conciliacao(text, text[]) to authenticated;

-- ── Segredos (HMAC do atestado e hash do token do relatório) ──────────────
-- Sem policy e sem grant: só as funções SECURITY DEFINER abaixo leem. Mais de
-- uma versão por chave permite rotação (o envelope diz qual versão assinou).

create table if not exists public.fin_conciliacao_segredos (
  chave text not null check (chave in ('atestado_ingestao', 'relatorio_ia')),
  versao integer not null check (versao > 0),
  valor text not null check (char_length(valor) >= 32),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  primary key (chave, versao)
);
alter table public.fin_conciliacao_segredos enable row level security;
revoke all on public.fin_conciliacao_segredos from public, anon, authenticated;

-- Confere o atestado: HMAC-SHA256 do texto exato do envelope. Devolve o
-- envelope já interpretado; qualquer divergência levanta exceção 42501.
create or replace function public.fin_conciliacao_conferir_atestado(
  p_envelope text,
  p_atestado text,
  p_operacao text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_env jsonb;
  v_segredo text;
begin
  if auth.uid() is null then
    raise exception 'Sessao obrigatoria' using errcode = '42501';
  end if;
  if p_envelope is null or p_atestado is null or char_length(p_envelope) > 4000000 then
    raise exception 'Atestado invalido' using errcode = '42501';
  end if;
  begin
    v_env := p_envelope::jsonb;
  exception when others then
    raise exception 'Atestado invalido' using errcode = '42501';
  end;
  select s.valor into v_segredo
    from public.fin_conciliacao_segredos s
    where s.chave = 'atestado_ingestao'
      and s.versao = coalesce((v_env->>'kv')::integer, -1)
      and s.ativo;
  if v_segredo is null then
    raise exception 'Atestado invalido' using errcode = '42501';
  end if;
  if encode(extensions.hmac(convert_to(p_envelope, 'UTF8'), convert_to(v_segredo, 'UTF8'), 'sha256'), 'hex')
       is distinct from lower(p_atestado) then
    raise exception 'Atestado invalido' using errcode = '42501';
  end if;
  if v_env->>'op' is distinct from p_operacao
     or (v_env->>'usuario') is distinct from auth.uid()::text then
    raise exception 'Atestado invalido' using errcode = '42501';
  end if;
  return v_env;
end;
$$;
revoke all on function public.fin_conciliacao_conferir_atestado(text, text, text) from public, anon, authenticated;

-- ── Importações ────────────────────────────────────────────────────────────

create table if not exists public.fin_importacoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  conta_financeira_id uuid not null,
  tipo_documento text not null check (tipo_documento in ('extrato', 'comprovante')),
  formato text not null check (formato in ('ofx', 'csv', 'pdf', 'imagem', 'desconhecido')),
  situacao text not null check (situacao in (
    'aguardando_arquivo', 'processando', 'concluida', 'parcial', 'falhou',
    'quarentena', 'duplicada', 'expirada'
  )),
  motivo_codigo text check (motivo_codigo is null or motivo_codigo ~ '^[a-z0-9_]{1,60}$'),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  duplicada_de_id uuid,
  caminho_arquivo text,
  arquivo_guardado boolean not null default false,
  nome_original text not null check (char_length(nome_original) between 1 and 120),
  tamanho_bytes integer not null check (tamanho_bytes between 0 and 10485760),
  mime_detectado text,
  criacao_nonce uuid not null unique,
  versao_parser text,
  fonte_extracao text check (fonte_extracao is null or fonte_extracao in ('deterministica', 'ia')),
  conferencia_aritmetica text check (conferencia_aritmetica is null or conferencia_aritmetica in (
    'conferida', 'conferida_exceto_inicio', 'divergente', 'nao_verificavel'
  )),
  periodo_inicio date,
  periodo_fim date,
  tentativa integer not null default 0 check (tentativa >= 0),
  processamento_nonce uuid,
  processamento_iniciado_em timestamptz,
  resultado_digest text,
  linhas_lidas integer not null default 0,
  movimentos_novos integer not null default 0,
  mesmo_identificador integer not null default 0,
  possiveis_duplicidades integer not null default 0,
  conflitos_identificador integer not null default 0,
  linhas_saldo integer not null default 0,
  linhas_com_erro integer not null default 0,
  movimentos_sem_conferencia integer not null default 0,
  erros jsonb not null default '[]'::jsonb,
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '1 hour',
  processado_em timestamptz,
  original_removido_em timestamptz,
  unique (unidade_id, id),
  unique (unidade_id, conta_financeira_id, id),
  foreign key (unidade_id, conta_financeira_id) references public.fin_contas_financeiras(unidade_id, id),
  foreign key (unidade_id, duplicada_de_id) references public.fin_importacoes(unidade_id, id),
  check ((situacao = 'duplicada') = (duplicada_de_id is not null)),
  check (situacao = 'quarentena' or tamanho_bytes <= 4194304),
  check (situacao not in ('quarentena', 'falhou', 'expirada') or motivo_codigo is not null),
  check (jsonb_typeof(erros) = 'array'),
  check (periodo_inicio is null or periodo_fim is null or periodo_inicio <= periodo_fim)
);

-- Identidade do arquivo: uma importação canônica por (unidade, conta, SHA).
-- Falhou, quarentena, duplicada e expirada não bloqueiam novo envio.
create unique index if not exists fin_importacoes_sha_canonica
  on public.fin_importacoes (unidade_id, conta_financeira_id, sha256)
  where sha256 is not null and situacao in ('aguardando_arquivo', 'processando', 'concluida', 'parcial');
create index if not exists fin_importacoes_unidade_idx
  on public.fin_importacoes (unidade_id, criado_em desc, id);

-- ── Movimentos canônicos (evidência bancária, nunca soma de dinheiro) ─────

create table if not exists public.fin_movimentos_importados (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  conta_financeira_id uuid not null,
  importacao_origem_id uuid not null,
  data date not null,
  direcao text not null check (direcao in ('entrada', 'saida')),
  valor numeric(14,2) not null check (valor > 0),
  moeda text not null default 'BRL' check (moeda = 'BRL'),
  descricao_original text not null check (char_length(descricao_original) between 1 and 300),
  descricao_normalizada text not null check (char_length(descricao_normalizada) between 1 and 300),
  favorecido_normalizado text check (favorecido_normalizado is null or char_length(favorecido_normalizado) <= 200),
  id_banco text check (id_banco is null or char_length(id_banco) between 1 and 120),
  fingerprint_forte text not null,
  fingerprint_fraco text not null,
  versao_identidade integer not null,
  conteudo_digest text not null,
  natureza text not null check (natureza in (
    'entrada', 'saida', 'transferencia_propria', 'aplicacao_resgate', 'estorno',
    'repasse_cartao', 'repasse_plataforma', 'desconhecido'
  )),
  fonte_extracao text not null check (fonte_extracao in ('deterministica', 'ia')),
  versao_parser text not null,
  -- 'conciliado', 'ignorado', 'transferencia' e 'mesclado' ficam reservados
  -- para a próxima rodada (só a RPC de confirmação vai usá-los).
  estado text not null default 'pendente' check (estado in (
    'pendente', 'revisar', 'conciliado', 'ignorado', 'transferencia', 'mesclado'
  )),
  motivo_revisao text check (motivo_revisao is null or motivo_revisao ~ '^[a-z0-9_]{1,60}$'),
  duplicidade_candidata_id uuid,
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, id),
  unique (unidade_id, conta_financeira_id, id),
  foreign key (unidade_id, conta_financeira_id, importacao_origem_id)
    references public.fin_importacoes(unidade_id, conta_financeira_id, id),
  foreign key (unidade_id, conta_financeira_id, duplicidade_candidata_id)
    references public.fin_movimentos_importados(unidade_id, conta_financeira_id, id),
  check (natureza not in ('repasse_cartao', 'repasse_plataforma', 'entrada') or direcao = 'entrada'),
  check (natureza <> 'saida' or direcao = 'saida'),
  check ((estado = 'revisar') = (motivo_revisao is not null)),
  check (duplicidade_candidata_id is null or duplicidade_candidata_id <> id)
);

create unique index if not exists fin_movimentos_id_banco_unico
  on public.fin_movimentos_importados (unidade_id, conta_financeira_id, id_banco)
  where id_banco is not null;
create index if not exists fin_movimentos_forte_idx
  on public.fin_movimentos_importados (unidade_id, conta_financeira_id, fingerprint_forte);
create index if not exists fin_movimentos_fraco_idx
  on public.fin_movimentos_importados (unidade_id, conta_financeira_id, fingerprint_fraco);
create index if not exists fin_movimentos_fila_idx
  on public.fin_movimentos_importados (unidade_id, estado, data, id);
create index if not exists fin_movimentos_importacao_idx
  on public.fin_movimentos_importados (importacao_origem_id);

-- Proveniência imutável: só estado, motivo e candidato podem mudar, e só
-- pela RPC (não há grant de update para ninguém).
create or replace function public.proteger_movimento_importado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.unidade_id is distinct from old.unidade_id
     or new.conta_financeira_id is distinct from old.conta_financeira_id
     or new.importacao_origem_id is distinct from old.importacao_origem_id
     or new.data is distinct from old.data
     or new.direcao is distinct from old.direcao
     or new.valor is distinct from old.valor
     or new.descricao_original is distinct from old.descricao_original
     or new.descricao_normalizada is distinct from old.descricao_normalizada
     or new.id_banco is distinct from old.id_banco
     or new.fingerprint_forte is distinct from old.fingerprint_forte
     or new.fingerprint_fraco is distinct from old.fingerprint_fraco
     or new.versao_identidade is distinct from old.versao_identidade
     or new.conteudo_digest is distinct from old.conteudo_digest
     or new.fonte_extracao is distinct from old.fonte_extracao
     or new.versao_parser is distinct from old.versao_parser
     or new.criado_por is distinct from old.criado_por
     or new.criado_em is distinct from old.criado_em then
    raise exception 'Evidencia importada e imutavel' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists proteger_movimento_importado on public.fin_movimentos_importados;
create trigger proteger_movimento_importado
  before update on public.fin_movimentos_importados
  for each row execute function public.proteger_movimento_importado();

-- ── Ocorrências: cada linha lida de cada arquivo ──────────────────────────

create table if not exists public.fin_importacao_linhas (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  conta_financeira_id uuid not null,
  importacao_id uuid not null,
  posicao integer not null check (posicao >= 0),
  resultado text not null check (resultado in (
    'movimento_novo', 'mesmo_identificador', 'possivel_duplicidade',
    'conflito_identificador', 'saldo', 'erro'
  )),
  movimento_id uuid,
  codigo_erro text check (codigo_erro is null or codigo_erro ~ '^[a-z0-9_]{1,60}$'),
  -- Só em conflito de identificador: o que o arquivo trouxe, para revisão.
  dados_conflito jsonb,
  criado_em timestamptz not null default now(),
  unique (importacao_id, posicao),
  foreign key (unidade_id, conta_financeira_id, importacao_id)
    references public.fin_importacoes(unidade_id, conta_financeira_id, id),
  foreign key (unidade_id, conta_financeira_id, movimento_id)
    references public.fin_movimentos_importados(unidade_id, conta_financeira_id, id),
  check ((resultado in ('saldo', 'erro')) = (movimento_id is null)),
  check ((resultado = 'erro') = (codigo_erro is not null)),
  check ((resultado = 'conflito_identificador') = (dados_conflito is not null))
);
create index if not exists fin_importacao_linhas_movimento_idx
  on public.fin_importacao_linhas (movimento_id);

-- ── Regras de classificação (estrutura + leitura; escrita na próxima rodada)

create table if not exists public.fin_regras_classificacao (
  id uuid primary key default gen_random_uuid(),
  organizacao_id text not null references public.organizacoes(id),
  unidade_id text references public.unidades(id),
  escopo text not null check (escopo in ('unidade', 'organizacao')),
  padrao_normalizado text not null check (char_length(padrao_normalizado) between 3 and 200),
  versao_normalizacao integer not null,
  direcao text not null check (direcao in ('entrada', 'saida')),
  categoria_id uuid,
  codigo_sistema_alvo text,
  situacao text not null default 'ativa' check (situacao in ('ativa', 'suspensa', 'conflitante')),
  confirmacoes integer not null default 0 check (confirmacoes >= 0),
  origem text not null check (origem in ('manual', 'carga_dq')),
  versao integer not null default 1 check (versao > 0),
  motivo_alteracao text,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primeira_confirmacao_em timestamptz,
  ultima_confirmacao_em timestamptz,
  unique (unidade_id, id),
  foreign key (unidade_id, categoria_id) references public.fin_categorias(unidade_id, id),
  check ((escopo = 'unidade') = (unidade_id is not null and categoria_id is not null and codigo_sistema_alvo is null)),
  check ((escopo = 'organizacao') = (unidade_id is null and categoria_id is null and codigo_sistema_alvo is not null))
);
create unique index if not exists fin_regras_local_ativa
  on public.fin_regras_classificacao (unidade_id, padrao_normalizado, direcao)
  where escopo = 'unidade' and situacao = 'ativa';
create unique index if not exists fin_regras_organizacao_ativa
  on public.fin_regras_classificacao (organizacao_id, padrao_normalizado, direcao)
  where escopo = 'organizacao' and situacao = 'ativa';

create or replace function public.proteger_regra_classificacao()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.unidade_id is not null and not exists (
    select 1 from public.unidades u where u.id = new.unidade_id and u.organizacao_id = new.organizacao_id
  ) then
    raise exception 'Unidade fora da organizacao da regra' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists proteger_regra_classificacao on public.fin_regras_classificacao;
create trigger proteger_regra_classificacao
  before insert or update on public.fin_regras_classificacao
  for each row execute function public.proteger_regra_classificacao();

create table if not exists public.fin_regras_classificacao_versoes (
  id uuid primary key default gen_random_uuid(),
  regra_id uuid not null references public.fin_regras_classificacao(id),
  versao integer not null,
  situacao text not null,
  categoria_id uuid,
  codigo_sistema_alvo text,
  motivo text,
  alterado_por uuid references auth.users(id),
  alterado_em timestamptz not null default now(),
  unique (regra_id, versao)
);

-- ── Sugestões (separadas da decisão) ──────────────────────────────────────

create table if not exists public.fin_classificacoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  movimento_id uuid not null,
  categoria_sugerida_id uuid,
  confianca text not null check (confianca in ('alta', 'media', 'baixa', 'nenhuma')),
  fonte text not null check (fonte in (
    'regra_unidade', 'fornecedor', 'historico', 'regra_organizacao', 'descricao', 'ia', 'sem_evidencia', 'natureza'
  )),
  motivo_codigo text not null check (motivo_codigo ~ '^[a-z0-9_]{1,60}$'),
  evidencias jsonb not null default '{}'::jsonb,
  regra_id uuid references public.fin_regras_classificacao(id),
  regra_versao integer,
  versao_motor text not null,
  modelo_ia text,
  versao_prompt text,
  situacao text not null default 'vigente' check (situacao in ('vigente', 'substituida')),
  -- Decisão humana: colunas prontas para a próxima rodada, travadas nulas
  -- nesta fatia pelo check abaixo (a próxima migração remove o check).
  decisao text,
  categoria_final_id uuid,
  modo_aprendizado text,
  decidido_por uuid references auth.users(id),
  decidido_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (unidade_id, id),
  foreign key (unidade_id, movimento_id) references public.fin_movimentos_importados(unidade_id, id),
  foreign key (unidade_id, categoria_sugerida_id) references public.fin_categorias(unidade_id, id),
  foreign key (unidade_id, categoria_final_id) references public.fin_categorias(unidade_id, id),
  check (not (fonte = 'ia' and confianca = 'alta')),
  check ((categoria_sugerida_id is null) = (confianca = 'nenhuma')),
  check (fonte <> 'ia' or modelo_ia is not null),
  check (jsonb_typeof(evidencias) = 'object'),
  constraint fin_classificacoes_sem_decisao_na_fatia_piloto check (
    decisao is null and categoria_final_id is null and modo_aprendizado is null
    and decidido_por is null and decidido_em is null
  )
);
create unique index if not exists fin_classificacoes_vigente_unica
  on public.fin_classificacoes (movimento_id) where situacao = 'vigente';

-- ── Uso de IA (custo por chamada) ─────────────────────────────────────────

create table if not exists public.fin_ia_chamadas (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  importacao_id uuid,
  chave_idempotencia uuid not null unique,
  finalidade text not null check (finalidade in ('extracao_documento', 'classificacao')),
  modelo text not null check (char_length(modelo) between 1 and 80),
  tabela_precos_versao text not null,
  situacao text not null default 'iniciada' check (situacao in ('iniciada', 'concluida', 'erro', 'consumo_desconhecido')),
  resultado_codigo text check (resultado_codigo is null or resultado_codigo ~ '^[a-z0-9_]{1,60}$'),
  tokens_entrada integer check (tokens_entrada is null or tokens_entrada >= 0),
  tokens_saida integer check (tokens_saida is null or tokens_saida >= 0),
  tokens_cache_leitura integer check (tokens_cache_leitura is null or tokens_cache_leitura >= 0),
  tokens_cache_escrita integer check (tokens_cache_escrita is null or tokens_cache_escrita >= 0),
  custo_estimado_usd numeric(12,6) check (custo_estimado_usd is null or custo_estimado_usd >= 0),
  criado_por uuid not null references auth.users(id),
  iniciada_em timestamptz not null default now(),
  finalizada_em timestamptz,
  foreign key (unidade_id, importacao_id) references public.fin_importacoes(unidade_id, id),
  check ((situacao = 'concluida') = (custo_estimado_usd is not null and tokens_entrada is not null and tokens_saida is not null))
);
create index if not exists fin_ia_chamadas_periodo_idx on public.fin_ia_chamadas (iniciada_em, id);
create index if not exists fin_ia_chamadas_unidade_idx on public.fin_ia_chamadas (unidade_id, iniciada_em);

-- ── RLS: só leitura; escrita direta revogada ──────────────────────────────

alter table public.fin_importacoes enable row level security;
alter table public.fin_importacao_linhas enable row level security;
alter table public.fin_movimentos_importados enable row level security;
alter table public.fin_regras_classificacao enable row level security;
alter table public.fin_regras_classificacao_versoes enable row level security;
alter table public.fin_classificacoes enable row level security;
alter table public.fin_ia_chamadas enable row level security;

revoke all on public.fin_importacoes, public.fin_importacao_linhas, public.fin_movimentos_importados,
  public.fin_regras_classificacao, public.fin_regras_classificacao_versoes, public.fin_classificacoes,
  public.fin_ia_chamadas
  from public, anon, authenticated;
grant select on public.fin_importacoes, public.fin_importacao_linhas, public.fin_movimentos_importados,
  public.fin_regras_classificacao, public.fin_regras_classificacao_versoes, public.fin_classificacoes,
  public.fin_ia_chamadas
  to authenticated;

create policy "fin_importacoes_select" on public.fin_importacoes
  for select to authenticated using (public.usuario_pode_usar_conciliacao(unidade_id, null));
create policy "fin_importacao_linhas_select" on public.fin_importacao_linhas
  for select to authenticated using (public.usuario_pode_usar_conciliacao(unidade_id, null));
create policy "fin_movimentos_importados_select" on public.fin_movimentos_importados
  for select to authenticated using (public.usuario_pode_usar_conciliacao(unidade_id, null));
create policy "fin_classificacoes_select" on public.fin_classificacoes
  for select to authenticated using (public.usuario_pode_usar_conciliacao(unidade_id, null));
create policy "fin_regras_classificacao_select" on public.fin_regras_classificacao
  for select to authenticated using (
    (escopo = 'unidade' and public.usuario_pode_usar_conciliacao(unidade_id, null))
    or (escopo = 'organizacao' and exists (
      select 1 from public.unidades u
      where u.organizacao_id = fin_regras_classificacao.organizacao_id
        and public.usuario_pode_usar_conciliacao(u.id, null)
    ))
  );
create policy "fin_regras_classificacao_versoes_select" on public.fin_regras_classificacao_versoes
  for select to authenticated using (
    exists (select 1 from public.fin_regras_classificacao r where r.id = regra_id)
  );
-- Custo de IA: Gestão/master da unidade.
create policy "fin_ia_chamadas_select" on public.fin_ia_chamadas
  for select to authenticated using (public.usuario_pode_usar_conciliacao(unidade_id, array['gestao']));

-- ── Auditoria (ids, situação, códigos e totais; nunca descrição) ─────────
-- Chamada dentro das RPCs, na mesma transação: se falhar, a operação falha.

create or replace function public.fin_conciliacao_auditar(
  p_unidade_id text,
  p_acao text,
  p_entidade_id uuid,
  p_dados jsonb
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (p_unidade_id, auth.uid(), p_acao, 'fin_importacoes', p_entidade_id::text, null, p_dados);
$$;
revoke all on function public.fin_conciliacao_auditar(text, text, uuid, jsonb) from public, anon, authenticated;

-- ── Storage privado ────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fin-conciliacao', 'fin-conciliacao', false, 4194304,
  array['application/pdf', 'text/csv', 'application/x-ofx', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fin_conciliacao_insert" on storage.objects;
drop policy if exists "fin_conciliacao_select" on storage.objects;
-- Insert só no caminho exato registrado pela RPC, de importação do próprio
-- usuário, ainda aguardando o arquivo e dentro do prazo. Sem update/delete.
create policy "fin_conciliacao_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fin-conciliacao'
    and exists (
      select 1 from public.fin_importacoes i
      where i.caminho_arquivo = name
        and i.criado_por = auth.uid()
        and i.situacao = 'aguardando_arquivo'
        and i.expira_em > now()
        and public.usuario_pode_usar_conciliacao(i.unidade_id, null)
    )
  );
-- Download só de arquivo aceito (lista explícita de estados).
create policy "fin_conciliacao_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fin-conciliacao'
    and exists (
      select 1 from public.fin_importacoes i
      where i.caminho_arquivo = name
        and i.arquivo_guardado
        and i.situacao in ('processando', 'concluida', 'parcial')
        and public.usuario_pode_usar_conciliacao(i.unidade_id, null)
    )
  );

commit;
