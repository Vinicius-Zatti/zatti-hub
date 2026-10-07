-- Conciliação V1, pedido de Vinícius em 07/10/2026:
--   1. Conferência da conta: o extrato traz banco/agência/conta no cabeçalho
--      (PagBank) e o banco compara com a conta financeira escolhida no envio.
--      Divergência fica marcada até Vinícius confirmar ("é desta conta mesmo")
--      ou descartar. A futura gravação no financeiro exige conta conferida ou
--      divergência confirmada.
--   2. Descartar importação: tira do Hub os movimentos que a importação criou
--      (ainda só evidência, nada conciliado) e mantém a importação na lista
--      como "descartada", com quem, quando e por quê. O mesmo arquivo pode ser
--      enviado de novo (descartada não bloqueia o SHA).
-- Toda escrita continua pelas RPCs atestadas. Nada toca fin_lancamentos,
-- fin_parcelas, fin_baixas ou fin_fechamentos.
begin;

-- ── Identificação bancária da conta financeira (opcional) ─────────────────

alter table public.fin_contas_financeiras
  add column if not exists banco_codigo text check (banco_codigo is null or banco_codigo ~ '^[0-9]{3}$'),
  add column if not exists agencia text check (agencia is null or agencia ~ '^[0-9]{1,6}$'),
  add column if not exists numero_conta text check (numero_conta is null or numero_conta ~ '^[0-9]{1,20}(-[0-9Xx])?$');

-- ── Importação: conferência da conta e descarte ───────────────────────────

alter table public.fin_importacoes
  add column if not exists conta_conferencia text check (conta_conferencia is null or conta_conferencia in (
    'confere', 'divergente', 'nao_verificavel'
  )),
  add column if not exists conta_conferencia_motivo text
    check (conta_conferencia_motivo is null or conta_conferencia_motivo ~ '^[a-z0-9_]{1,60}$'),
  add column if not exists conta_detectada jsonb check (conta_detectada is null or jsonb_typeof(conta_detectada) = 'object'),
  add column if not exists conta_sugerida_id uuid,
  add column if not exists conta_confirmada_por uuid references auth.users(id),
  add column if not exists conta_confirmada_em timestamptz,
  add column if not exists descartada_por uuid references auth.users(id),
  add column if not exists descartada_em timestamptz,
  add column if not exists descarte_motivo text
    check (descarte_motivo is null or descarte_motivo in ('conta_errada', 'arquivo_errado', 'outro'));

do $$
declare
  v_nome text;
begin
  alter table public.fin_importacoes drop constraint if exists fin_importacoes_situacao_check;
  alter table public.fin_importacoes add constraint fin_importacoes_situacao_check check (situacao in (
    'aguardando_arquivo', 'processando', 'concluida', 'parcial', 'falhou',
    'quarentena', 'duplicada', 'expirada', 'descartada'
  ));
  -- A regra "duplicada <=> duplicada_de_id" vira "duplicada exige origem;
  -- origem só em duplicada ou descartada" (descartar um repetido mantém o vínculo).
  for v_nome in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.fin_importacoes'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%''duplicada''%duplicada_de_id IS NOT NULL%'
      and c.conname <> 'fin_importacoes_situacao_check'
  loop
    execute format('alter table public.fin_importacoes drop constraint %I', v_nome);
  end loop;
  -- O limite de 4 MB vale para o que é lido; quarentena e descartada guardam
  -- só o histórico do envio.
  for v_nome in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.fin_importacoes'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%4194304%'
  loop
    execute format('alter table public.fin_importacoes drop constraint %I', v_nome);
  end loop;
  alter table public.fin_importacoes add constraint fin_importacoes_tamanho_lido check (
    situacao in ('quarentena', 'descartada') or tamanho_bytes <= 4194304
  );
  alter table public.fin_importacoes add constraint fin_importacoes_duplicada_origem check (
    (situacao <> 'duplicada' or duplicada_de_id is not null)
    and (duplicada_de_id is null or situacao in ('duplicada', 'descartada'))
  );
end $$;

alter table public.fin_importacoes drop constraint if exists fin_importacoes_descarte_completo;
alter table public.fin_importacoes add constraint fin_importacoes_descarte_completo check (
  (situacao = 'descartada') = (descartada_em is not null and descartada_por is not null and descarte_motivo is not null)
);
alter table public.fin_importacoes drop constraint if exists fin_importacoes_sugerida_fk;
alter table public.fin_importacoes add constraint fin_importacoes_sugerida_fk
  foreign key (unidade_id, conta_sugerida_id) references public.fin_contas_financeiras(unidade_id, id);

-- Compara números de conta ignorando pontuação e zeros à esquerda.
create or replace function public.fin_conciliacao_numero_normalizado(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(ltrim(regexp_replace(upper(coalesce(p, '')), '[^0-9X]', '', 'g'), '0'), '');
$$;
revoke all on function public.fin_conciliacao_numero_normalizado(text) from public, anon, authenticated;

-- ── 1. Conferir a conta (durante o processamento) ─────────────────────────

create or replace function public.fin_conciliacao_conferir_conta(p_envelope text, p_atestado text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_env jsonb;
  v_imp public.fin_importacoes;
  v_conta public.fin_contas_financeiras;
  v_det jsonb := null;
  v_banco text;
  v_agencia text;
  v_numero text;
  v_sugerida uuid;
  v_outra uuid;
  v_resultado text;
  v_motivo text;
begin
  v_env := public.fin_conciliacao_conferir_atestado(p_envelope, p_atestado, 'conferir_conta');
  v_imp := public.fin_conciliacao_travar_tentativa(v_env);
  if v_imp.situacao <> 'processando'
     or v_imp.tentativa is distinct from (v_env->>'tentativa')::integer
     or v_imp.processamento_nonce is distinct from (v_env->>'nonce')::uuid then
    raise exception 'Tentativa expirada ou invalida' using errcode = 'P0001';
  end if;
  select * into v_conta from public.fin_contas_financeiras
    where unidade_id = v_imp.unidade_id and id = v_imp.conta_financeira_id;

  -- Só guarda o que tem formato de identificação bancária (sem nome, sem CPF).
  if jsonb_typeof(v_env->'detectada') = 'object' then
    v_banco := case when v_env->'detectada'->>'banco' ~ '^[0-9]{3}$' then v_env->'detectada'->>'banco' end;
    v_agencia := case when v_env->'detectada'->>'agencia' ~ '^[0-9]{1,6}$' then v_env->'detectada'->>'agencia' end;
    v_numero := case when v_env->'detectada'->>'conta' ~ '^[0-9]{1,20}(-[0-9Xx])?$' then v_env->'detectada'->>'conta' end;
    if coalesce(v_banco, v_agencia, v_numero) is not null then
      v_det := jsonb_strip_nulls(jsonb_build_object('banco', v_banco, 'agencia', v_agencia, 'conta', v_numero));
    end if;
  end if;

  if v_numero is not null then
    select f.id into v_sugerida from public.fin_contas_financeiras f
      where f.unidade_id = v_imp.unidade_id and f.ativo
        and public.fin_conciliacao_numero_normalizado(f.numero_conta) = public.fin_conciliacao_numero_normalizado(v_numero)
        and (f.banco_codigo is null or v_banco is null or f.banco_codigo = v_banco)
        and (f.agencia is null or v_agencia is null or ltrim(f.agencia, '0') = ltrim(v_agencia, '0'))
      order by (f.id = v_imp.conta_financeira_id) desc, f.nome
      limit 1;
  end if;

  if v_numero is not null and v_conta.numero_conta is not null then
    if public.fin_conciliacao_numero_normalizado(v_conta.numero_conta) = public.fin_conciliacao_numero_normalizado(v_numero)
       and (v_conta.banco_codigo is null or v_banco is null or v_conta.banco_codigo = v_banco)
       and (v_conta.agencia is null or v_agencia is null or ltrim(v_conta.agencia, '0') = ltrim(v_agencia, '0')) then
      v_resultado := 'confere'; v_motivo := 'numero_confere';
    else
      v_resultado := 'divergente'; v_motivo := 'numero_diferente';
    end if;
  elsif v_sugerida is not null and v_sugerida <> v_imp.conta_financeira_id then
    v_resultado := 'divergente'; v_motivo := 'numero_de_outra_conta';
  elsif v_banco is not null and v_conta.banco_codigo is not null and v_banco <> v_conta.banco_codigo then
    v_resultado := 'divergente'; v_motivo := 'banco_diferente';
  elsif v_det is not null then
    v_resultado := 'nao_verificavel'; v_motivo := 'conta_sem_numero_cadastrado';
  else
    v_resultado := 'nao_verificavel'; v_motivo := 'documento_sem_conta';
  end if;

  -- Mesmo arquivo já enviado em outra conta da unidade: só é alerta quando o
  -- cabeçalho não confirmou esta conta.
  if v_resultado <> 'confere' then
    select i.conta_financeira_id into v_outra from public.fin_importacoes i
      where i.unidade_id = v_imp.unidade_id and i.sha256 = v_imp.sha256
        and i.conta_financeira_id <> v_imp.conta_financeira_id
        and i.situacao not in ('descartada', 'expirada', 'aguardando_arquivo')
      order by i.criado_em
      limit 1;
    if v_outra is not null and v_resultado <> 'divergente' then
      v_resultado := 'divergente'; v_motivo := 'arquivo_em_outra_conta';
    end if;
  end if;

  update public.fin_importacoes
    set conta_conferencia = v_resultado,
        conta_conferencia_motivo = v_motivo,
        conta_detectada = v_det,
        conta_sugerida_id = case when v_resultado = 'divergente'
                                 then coalesce(nullif(v_sugerida, v_imp.conta_financeira_id), v_outra) end,
        conta_confirmada_por = null,
        conta_confirmada_em = null
    where id = v_imp.id;
  perform public.fin_conciliacao_auditar(v_imp.unidade_id, 'conciliacao_conta_conferida', v_imp.id,
    jsonb_build_object('resultado', v_resultado, 'motivo', v_motivo));
  return jsonb_build_object('conferencia', v_resultado, 'motivo', v_motivo, 'detectada', v_det,
    'sugerida', case when v_resultado = 'divergente'
                     then coalesce(nullif(v_sugerida, v_imp.conta_financeira_id), v_outra) end);
end;
$$;

-- ── 2. Confirmar a conta escolhida apesar da divergência ──────────────────

create or replace function public.fin_conciliacao_confirmar_conta(p_envelope text, p_atestado text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_env jsonb;
  v_imp public.fin_importacoes;
begin
  v_env := public.fin_conciliacao_conferir_atestado(p_envelope, p_atestado, 'confirmar_conta');
  v_imp := public.fin_conciliacao_travar_tentativa(v_env);
  if v_imp.conta_conferencia is distinct from 'divergente' or v_imp.conta_confirmada_em is not null
     or v_imp.situacao not in ('concluida', 'parcial', 'falhou') then
    raise exception 'Importacao sem divergencia de conta para confirmar' using errcode = 'P0001';
  end if;
  update public.fin_importacoes
    set conta_confirmada_por = auth.uid(), conta_confirmada_em = now()
    where id = v_imp.id;
  perform public.fin_conciliacao_auditar(v_imp.unidade_id, 'conciliacao_conta_confirmada', v_imp.id,
    jsonb_build_object('motivo', v_imp.conta_conferencia_motivo));
  return jsonb_build_object('confirmada', true);
end;
$$;

-- ── 3. Descartar importação ───────────────────────────────────────────────

create or replace function public.fin_conciliacao_descartar_importacao(p_envelope text, p_atestado text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_env jsonb;
  v_imp public.fin_importacoes;
  v_motivo text;
  v_movs uuid[];
  v_removidos integer;
begin
  v_env := public.fin_conciliacao_conferir_atestado(p_envelope, p_atestado, 'descartar_importacao');
  v_imp := public.fin_conciliacao_travar_tentativa(v_env);
  v_motivo := v_env->>'motivo';
  if v_motivo is null or v_motivo not in ('conta_errada', 'arquivo_errado', 'outro') then
    raise exception 'Motivo de descarte invalido' using errcode = '23514';
  end if;
  if v_imp.situacao = 'descartada' then
    raise exception 'Importacao ja descartada' using errcode = 'P0001';
  end if;
  if v_imp.situacao = 'processando' and v_imp.processamento_iniciado_em >= now() - interval '10 minutes' then
    raise exception 'Importacao ainda sendo lida' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fin_conc_conta:' || v_imp.conta_financeira_id::text, 0));
  select coalesce(array_agg(m.id), '{}') into v_movs
    from public.fin_movimentos_importados m where m.importacao_origem_id = v_imp.id;

  if exists (select 1 from public.fin_movimentos_importados m
             where m.id = any(v_movs) and m.estado not in ('pendente', 'revisar')) then
    raise exception 'Importacao com movimento ja tratado' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fin_importacao_linhas l
             where l.movimento_id = any(v_movs) and l.importacao_id <> v_imp.id) then
    raise exception 'Outra importacao usa movimentos desta' using errcode = 'P0001';
  end if;

  -- Movimentos de outros arquivos que apontavam para estes como possível
  -- duplicidade perdem o par; se esse era o único motivo da revisão, voltam a pendente.
  update public.fin_movimentos_importados
    set duplicidade_candidata_id = null,
        estado = case when estado = 'revisar' and motivo_revisao = 'possivel_duplicidade' then 'pendente' else estado end,
        motivo_revisao = case when estado = 'revisar' and motivo_revisao = 'possivel_duplicidade' then null else motivo_revisao end
    where duplicidade_candidata_id = any(v_movs) and not (id = any(v_movs));

  delete from public.fin_classificacoes where movimento_id = any(v_movs);
  delete from public.fin_importacao_linhas where importacao_id = v_imp.id;
  delete from public.fin_movimentos_importados where id = any(v_movs);
  get diagnostics v_removidos = row_count;

  update public.fin_importacoes
    set situacao = 'descartada', descartada_por = auth.uid(), descartada_em = now(), descarte_motivo = v_motivo,
        processamento_nonce = null
    where id = v_imp.id;
  perform public.fin_conciliacao_auditar(v_imp.unidade_id, 'conciliacao_importacao_descartada', v_imp.id,
    jsonb_build_object('motivo', v_motivo, 'situacao_anterior', v_imp.situacao, 'movimentos_removidos', v_removidos));
  return jsonb_build_object('descartada', true, 'movimentos_removidos', v_removidos);
end;
$$;

revoke all on function public.fin_conciliacao_conferir_conta(text, text) from public, anon;
revoke all on function public.fin_conciliacao_confirmar_conta(text, text) from public, anon;
revoke all on function public.fin_conciliacao_descartar_importacao(text, text) from public, anon;
grant execute on function public.fin_conciliacao_conferir_conta(text, text) to authenticated;
grant execute on function public.fin_conciliacao_confirmar_conta(text, text) to authenticated;
grant execute on function public.fin_conciliacao_descartar_importacao(text, text) to authenticated;

commit;
