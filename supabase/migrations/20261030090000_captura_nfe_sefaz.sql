-- Captura automática de NF-e pela SEFAZ, V1 (30/10/2026). Plano aprovado por Vinícius em 29/10:
-- _execucao/zatti-hub/captura-nfe-sefaz-v1-plano.md (Cérebro do Gestor).
--
-- - Certificado A1 por CNPJ (a unidade pode ter mais de um CNPJ, caso da The House). O .pfx e a
--   senha ficam num envelope cifrado (AES-256-GCM, chave embrulhada por RSA-OAEP). Só o robô (Vini,
--   no Railway) tem a chave privada; o Hub só cifra. Tabela sem grant para anon e authenticated.
-- - O robô lê a fila por NSU, manda só a Ciência da Operação (210210) e entrega o XML na Caixa de
--   Entrada com canal 'sefaz'. Quem confere e lança continua sendo uma pessoa.
-- - A chave de acesso (44 dígitos) vira trava contra nota em dobro na Caixa de Entrada: o robô
--   reaproveita a entrada que já existe; XML subido na mão com a mesma chave é recusado.
begin;

-- ── Certificados ──────────────────────────────────────────────────────────
create table if not exists public.fin_sefaz_certificados (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  titular text not null check (char_length(titular) between 1 and 160),
  valido_ate timestamptz not null,
  -- { chave, iv, tag, dados } em base64. Apagado (null) quando o certificado é removido.
  envelope jsonb check (envelope is null or (jsonb_typeof(envelope) = 'object'
    and envelope ?& array['chave', 'iv', 'tag', 'dados'])),
  ativo boolean not null default true,
  ult_nsu text not null default '0' check (ult_nsu ~ '^[0-9]{1,15}$'),
  max_nsu text check (max_nsu is null or max_nsu ~ '^[0-9]{1,15}$'),
  bloqueado_ate timestamptz,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (not ativo or envelope is not null)
);
-- Um CNPJ tem uma fila só na SEFAZ: um leitor por CNPJ, mesmo trocando o certificado.
create unique index if not exists fin_sefaz_certificados_cnpj on public.fin_sefaz_certificados (cnpj);
alter table public.fin_sefaz_certificados enable row level security;
revoke all on table public.fin_sefaz_certificados from public, anon, authenticated;

-- ── Notas vistas na fila (resumo, Ciência, XML salvo) ─────────────────────
create table if not exists public.fin_sefaz_notas (
  id uuid primary key default gen_random_uuid(),
  certificado_id uuid not null references public.fin_sefaz_certificados(id),
  chave text not null check (chave ~ '^[0-9]{44}$'),
  situacao text not null check (situacao in ('resumo', 'ciencia', 'xml_salvo', 'sem_ciencia', 'cancelada', 'erro')),
  situacao_nfe text check (situacao_nfe is null or situacao_nfe ~ '^[0-9]$'),
  emitente_cnpj text check (emitente_cnpj is null or emitente_cnpj ~ '^[0-9]{11,14}$'),
  emitente_nome text check (emitente_nome is null or char_length(emitente_nome) <= 160),
  emissao date,
  valor_centavos bigint check (valor_centavos is null or valor_centavos >= 0),
  ciencia_em timestamptz,
  tentativas integer not null default 0 check (tentativas >= 0),
  ultimo_cstat text check (ultimo_cstat is null or ultimo_cstat ~ '^[0-9]{3}$'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (certificado_id, chave)
);
create index if not exists fin_sefaz_notas_pendentes on public.fin_sefaz_notas (certificado_id)
  where situacao in ('resumo', 'ciencia');
alter table public.fin_sefaz_notas enable row level security;
revoke all on table public.fin_sefaz_notas from public, anon, authenticated;

-- ── Registro de cada rodada ───────────────────────────────────────────────
create table if not exists public.fin_sefaz_rodadas (
  id uuid primary key default gen_random_uuid(),
  certificado_id uuid not null references public.fin_sefaz_certificados(id),
  iniciado_em timestamptz not null,
  terminado_em timestamptz not null default now(),
  situacao text not null check (situacao in ('ok', 'erro')),
  erro_codigo text check (erro_codigo is null or erro_codigo ~ '^[a-z0-9_]{1,60}$'),
  notas_novas integer not null default 0 check (notas_novas >= 0),
  resumos integer not null default 0 check (resumos >= 0),
  ciencias integer not null default 0 check (ciencias >= 0),
  ciencias_recusadas integer not null default 0 check (ciencias_recusadas >= 0),
  chamadas integer not null default 0 check (chamadas >= 0),
  fila_zerou boolean not null default false
);
create index if not exists fin_sefaz_rodadas_cert on public.fin_sefaz_rodadas (certificado_id, iniciado_em desc);
alter table public.fin_sefaz_rodadas enable row level security;
revoke all on table public.fin_sefaz_rodadas from public, anon, authenticated;

-- ── Caixa de Entrada: canal 'sefaz' e chave de acesso ─────────────────────
do $$
declare v record;
begin
  for v in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.fin_caixa_entrada'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%canal%'
  loop
    execute format('alter table public.fin_caixa_entrada drop constraint %I', v.conname);
  end loop;
end $$;
alter table public.fin_caixa_entrada
  add constraint fin_caixa_entrada_canal_check check (canal in ('upload', 'whatsapp', 'drive', 'sefaz'));
alter table public.fin_caixa_entrada
  add column if not exists chave_acesso text check (chave_acesso is null or chave_acesso ~ '^[0-9]{44}$');
create unique index if not exists fin_caixa_entrada_chave_unica
  on public.fin_caixa_entrada (unidade_id, chave_acesso) where chave_acesso is not null and situacao <> 'descartado';

-- Escopo de token do robô.
do $$
declare v record;
begin
  for v in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.fin_integracao_tokens'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%escopo%'
  loop
    execute format('alter table public.fin_integracao_tokens drop constraint %I', v.conname);
  end loop;
end $$;
alter table public.fin_integracao_tokens
  add constraint fin_integracao_tokens_escopo_check
  check (escopo in ('caixa_entrada', 'alertas', 'garante', 'provisionamento', 'sefaz'));

-- Registro com chave de acesso. A versão de 8 parâmetros continua (chama esta com chave nula),
-- para o app antigo seguir funcionando entre a migração e o deploy.
create or replace function public.fin_caixa_entrada_registrar(
  p_unidade text, p_canal text, p_remetente text, p_nome text, p_mime text, p_tamanho int, p_sha256 text,
  p_criado_por uuid, p_chave text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_existente public.fin_caixa_entrada;
  v_id uuid := gen_random_uuid();
  v_ext text;
  v_chave text := nullif(p_chave, '');
begin
  if v_chave is not null and v_chave !~ '^[0-9]{44}$' then
    raise exception 'Chave de acesso invalida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fin_cx_ent:' || p_unidade || ':' || p_sha256, 0));
  if v_chave is not null then
    perform pg_advisory_xact_lock(hashtextextended('fin_cx_chave:' || p_unidade || ':' || v_chave, 0));
  end if;
  select * into v_existente from public.fin_caixa_entrada
    where unidade_id = p_unidade and sha256 = p_sha256 and situacao <> 'descartado';
  if not found and v_chave is not null then
    select * into v_existente from public.fin_caixa_entrada
      where unidade_id = p_unidade and chave_acesso = v_chave and situacao <> 'descartado';
    if found and p_canal <> 'sefaz' then
      raise exception 'Nota ja esta na Caixa de Entrada' using errcode = 'P0001';
    end if;
  end if;
  if found then
    return jsonb_build_object('id', v_existente.id, 'novo', false, 'caminho', v_existente.caminho_arquivo,
      'arquivo_gravado', v_existente.arquivo_gravado, 'situacao', v_existente.situacao);
  end if;
  -- Teto por unidade em 24 h: 80 pelos canais de pessoas (custo de IA e abuso); a SEFAZ tem o
  -- seu, maior, porque a primeira rodada traz até 90 dias de notas de uma vez.
  if p_canal = 'sefaz' then
    if (select count(*) from public.fin_caixa_entrada
         where unidade_id = p_unidade and canal = 'sefaz' and recebido_em > now() - interval '24 hours') >= 2000 then
      raise exception 'Limite diario da Caixa de Entrada atingido' using errcode = 'P0001';
    end if;
  elsif (select count(*) from public.fin_caixa_entrada
          where unidade_id = p_unidade and canal <> 'sefaz' and recebido_em > now() - interval '24 hours') >= 80 then
    raise exception 'Limite diario da Caixa de Entrada atingido' using errcode = 'P0001';
  end if;
  v_ext := case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
    when 'image/webp' then 'webp' else 'xml' end;
  insert into public.fin_caixa_entrada (id, unidade_id, canal, remetente, nome_arquivo, mime, tamanho_bytes, sha256,
    caminho_arquivo, criado_por, chave_acesso)
  values (v_id, p_unidade, p_canal, left(p_remetente, 120), left(p_nome, 160), p_mime, p_tamanho, p_sha256,
    p_unidade || '/' || v_id || '/original.' || v_ext, p_criado_por, v_chave);
  return jsonb_build_object('id', v_id, 'novo', true, 'caminho', p_unidade || '/' || v_id || '/original.' || v_ext,
    'arquivo_gravado', false, 'situacao', 'recebido');
end;
$$;
revoke all on function public.fin_caixa_entrada_registrar(text, text, text, text, text, int, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fin_caixa_entrada_registrar(text, text, text, text, text, int, text, uuid, text) to service_role;

create or replace function public.fin_caixa_entrada_registrar(
  p_unidade text, p_canal text, p_remetente text, p_nome text, p_mime text, p_tamanho int, p_sha256 text,
  p_criado_por uuid
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select public.fin_caixa_entrada_registrar(p_unidade, p_canal, p_remetente, p_nome, p_mime, p_tamanho, p_sha256,
    p_criado_por, null::text);
$$;

-- ── O que o robô deve rodar hoje ──────────────────────────────────────────
-- Certificado ativo, fora do bloqueio, sem rodada boa hoje (Brasília) e com menos de 3 tentativas
-- hoje. Quem recebe o certificado o reserva na hora por 61 min (bloqueado_ate): uma segunda chamada,
-- de outro contêiner ou da repetição de 30 min, não o recebe, e a SEFAZ nunca vê duas consultas do
-- mesmo NSU em menos de 1 hora (regra do 137; achado da revisão de 30/10). Vão junto as notas
-- esperando Ciência ou XML, até 1.000 por certificado.
create or replace function public.fin_sefaz_pendencias()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ids uuid[];
begin
  with livres as (
    select c.id
      from public.fin_sefaz_certificados c
     where c.ativo and c.envelope is not null
       and (c.bloqueado_ate is null or c.bloqueado_ate < now())
       and not exists (select 1 from public.fin_sefaz_rodadas r
                        where r.certificado_id = c.id and r.situacao = 'ok'
                          and (r.iniciado_em at time zone 'America/Sao_Paulo')::date = v_hoje)
       and (select count(*) from public.fin_sefaz_rodadas r
             where r.certificado_id = c.id and (r.iniciado_em at time zone 'America/Sao_Paulo')::date = v_hoje) < 3
     for update of c skip locked
  ), reservados as (
    update public.fin_sefaz_certificados c
       set bloqueado_ate = now() + interval '61 minutes', atualizado_em = now()
      from livres where c.id = livres.id
    returning c.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from reservados;

  return jsonb_build_object(
    'certificados', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'unidadeId', c.unidade_id, 'unidadeNome', u.nome, 'cnpj', c.cnpj, 'uf', c.uf,
        'ultNsu', c.ult_nsu, 'validoAte', c.valido_ate, 'envelope', c.envelope,
        'tentativasHoje', (select count(*) from public.fin_sefaz_rodadas r
                            where r.certificado_id = c.id and (r.iniciado_em at time zone 'America/Sao_Paulo')::date = v_hoje)))
      from public.fin_sefaz_certificados c join public.unidades u on u.id = c.unidade_id
     where c.id = any(v_ids)), '[]'::jsonb),
    'pendentes', coalesce((select jsonb_agg(jsonb_build_object(
        'certificadoId', n.certificado_id, 'chave', n.chave, 'situacao', n.situacao, 'cienciaEm', n.ciencia_em))
      from (select n.*, row_number() over (partition by n.certificado_id order by n.criado_em) as ordem
              from public.fin_sefaz_notas n
             where n.certificado_id = any(v_ids) and n.situacao in ('resumo', 'ciencia')) n
     where n.ordem <= 1000), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.fin_sefaz_pendencias() from public, anon, authenticated;
grant execute on function public.fin_sefaz_pendencias() to service_role;

-- ── Progresso da rodada (cada lote, cada Ciência, o fim) ──────────────────
create or replace function public.fin_sefaz_progresso(p_certificado uuid, p_dados jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cert public.fin_sefaz_certificados;
  v_item jsonb;
  v_fim jsonb := p_dados -> 'fim';
begin
  select * into v_cert from public.fin_sefaz_certificados where id = p_certificado for update;
  if not found then raise exception 'Certificado nao encontrado' using errcode = 'P0002'; end if;

  -- Resumos novos. Nota já com Ciência ou XML não volta a resumo.
  for v_item in select * from jsonb_array_elements(coalesce(p_dados -> 'resumos', '[]'::jsonb)) loop
    insert into public.fin_sefaz_notas (certificado_id, chave, situacao, situacao_nfe, emitente_cnpj, emitente_nome,
      emissao, valor_centavos)
    values (p_certificado, v_item ->> 'chave',
      case when v_item ->> 'situacaoNfe' = '1' then 'resumo' else 'sem_ciencia' end,
      nullif(v_item ->> 'situacaoNfe', ''),
      case when v_item ->> 'emitenteCnpj' ~ '^[0-9]{11,14}$' then v_item ->> 'emitenteCnpj' end,
      left(v_item ->> 'emitenteNome', 160),
      case when v_item ->> 'emissao' ~ '^\d{4}-\d{2}-\d{2}$' then (v_item ->> 'emissao')::date end,
      greatest(coalesce((v_item ->> 'valorCentavos')::bigint, 0), 0))
    on conflict (certificado_id, chave) do update
      set situacao_nfe = excluded.situacao_nfe, emitente_cnpj = excluded.emitente_cnpj,
          emitente_nome = excluded.emitente_nome, emissao = excluded.emissao,
          valor_centavos = excluded.valor_centavos, atualizado_em = now(),
          situacao = case when public.fin_sefaz_notas.situacao in ('resumo', 'sem_ciencia') then excluded.situacao
                          else public.fin_sefaz_notas.situacao end;
  end loop;

  -- XML entregue na Caixa de Entrada.
  for v_item in select * from jsonb_array_elements(coalesce(p_dados -> 'xmlSalvos', '[]'::jsonb)) loop
    insert into public.fin_sefaz_notas (certificado_id, chave, situacao)
    values (p_certificado, v_item #>> '{}', 'xml_salvo')
    on conflict (certificado_id, chave) do update set situacao = 'xml_salvo', atualizado_em = now();
  end loop;

  -- XML que o Hub recusou de vez (4xx): a nota vira erro e a fila segue.
  for v_item in select * from jsonb_array_elements(coalesce(p_dados -> 'xmlRecusados', '[]'::jsonb)) loop
    insert into public.fin_sefaz_notas (certificado_id, chave, situacao)
    values (p_certificado, v_item #>> '{}', 'erro')
    on conflict (certificado_id, chave) do update set situacao = 'erro', atualizado_em = now()
      where public.fin_sefaz_notas.situacao <> 'xml_salvo';
  end loop;

  -- Cancelamento (110111) visto na fila: registra e anota a entrada ainda não lançada (só o aviso;
  -- a situação da entrada não muda, quem descarta é a pessoa).
  for v_item in select * from jsonb_array_elements(coalesce(p_dados -> 'canceladas', '[]'::jsonb)) loop
    insert into public.fin_sefaz_notas (certificado_id, chave, situacao)
    values (p_certificado, v_item #>> '{}', 'cancelada')
    on conflict (certificado_id, chave) do update set situacao = 'cancelada', atualizado_em = now();
    update public.fin_caixa_entrada
       set extracao = jsonb_set(extracao, '{observacao}', to_jsonb('Nota cancelada pelo fornecedor na SEFAZ. Não lançar.'::text)),
           atualizado_em = now()
     where unidade_id = v_cert.unidade_id and chave_acesso = v_item #>> '{}'
       and situacao in ('recebido', 'lido', 'falhou') and extracao is not null;
  end loop;

  -- Ciências: registrada vira 'ciencia'; recusada conta tentativa e para em 5.
  for v_item in select * from jsonb_array_elements(coalesce(p_dados -> 'ciencias', '[]'::jsonb)) loop
    update public.fin_sefaz_notas
       set situacao = case when (v_item ->> 'ok')::boolean then 'ciencia'
                           when tentativas + 1 >= 5 then 'erro' else situacao end,
           ciencia_em = case when (v_item ->> 'ok')::boolean then now() else ciencia_em end,
           tentativas = case when (v_item ->> 'ok')::boolean then tentativas else tentativas + 1 end,
           ultimo_cstat = case when v_item ->> 'cStat' ~ '^[0-9]{3}$' then v_item ->> 'cStat' else ultimo_cstat end,
           atualizado_em = now()
     where certificado_id = p_certificado and chave = v_item ->> 'chave' and situacao = 'resumo';
  end loop;

  -- Pedido pela chave que não trouxe o XML. 632 (fora do prazo), 640 (não é destinatário) e
  -- 653 (cancelada) não adiantam repetir; o resto para em 10 tentativas.
  for v_item in select * from jsonb_array_elements(coalesce(p_dados -> 'tentativas', '[]'::jsonb)) loop
    update public.fin_sefaz_notas
       set tentativas = tentativas + 1,
           ultimo_cstat = case when v_item ->> 'cStat' ~ '^[0-9]{3}$' then v_item ->> 'cStat' else ultimo_cstat end,
           situacao = case when v_item ->> 'cStat' in ('632', '640', '653') or tentativas + 1 >= 10 then 'erro' else situacao end,
           atualizado_em = now()
     where certificado_id = p_certificado and chave = v_item ->> 'chave' and situacao = 'ciencia';
  end loop;

  -- NSU só anda para frente.
  if p_dados ->> 'ultNsu' ~ '^[0-9]{1,15}$' and (p_dados ->> 'ultNsu')::bigint > v_cert.ult_nsu::bigint then
    update public.fin_sefaz_certificados
       set ult_nsu = ((p_dados ->> 'ultNsu')::bigint)::text, atualizado_em = now(),
           max_nsu = case when p_dados ->> 'maxNsu' ~ '^[0-9]{1,15}$' then ((p_dados ->> 'maxNsu')::bigint)::text else max_nsu end
     where id = p_certificado;
  end if;

  if p_dados ? 'bloqueadoAte' then
    update public.fin_sefaz_certificados
       set bloqueado_ate = least((p_dados ->> 'bloqueadoAte')::timestamptz, now() + interval '2 hours'), atualizado_em = now()
     where id = p_certificado;
  end if;

  if v_fim is not null then
    insert into public.fin_sefaz_rodadas (certificado_id, iniciado_em, situacao, erro_codigo, notas_novas, resumos,
      ciencias, ciencias_recusadas, chamadas, fila_zerou)
    values (p_certificado, coalesce((v_fim ->> 'iniciadoEm')::timestamptz, now()),
      case when v_fim ->> 'situacao' = 'ok' then 'ok' else 'erro' end,
      case when v_fim ->> 'erroCodigo' ~ '^[a-z0-9_]{1,60}$' then v_fim ->> 'erroCodigo'
           when v_fim ->> 'erroCodigo' is not null then 'erro_robo' end,
      greatest(coalesce((v_fim ->> 'notasNovas')::int, 0), 0), greatest(coalesce((v_fim ->> 'resumos')::int, 0), 0),
      greatest(coalesce((v_fim ->> 'ciencias')::int, 0), 0), greatest(coalesce((v_fim ->> 'cienciasRecusadas')::int, 0), 0),
      greatest(coalesce((v_fim ->> 'chamadas')::int, 0), 0), coalesce((v_fim ->> 'filaZerou')::boolean, false));
  end if;
end;
$$;
revoke all on function public.fin_sefaz_progresso(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fin_sefaz_progresso(uuid, jsonb) to service_role;

grant select, insert, update on table public.fin_sefaz_certificados, public.fin_sefaz_notas,
  public.fin_sefaz_rodadas to service_role;

commit;
