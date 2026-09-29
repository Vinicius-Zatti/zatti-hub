-- Conciliação Inteligente V1 - fatia piloto: RPCs de ingestão (A4 do Codex).
-- Toda escrita nas tabelas novas passa por aqui. Cada RPC:
--   1. confere o atestado HMAC do servidor sobre o texto exato do envelope
--      (operação, versão da chave, usuário, importação, tentativa, nonce);
--   2. autoriza explicitamente unidade, flag e papel (SECURITY DEFINER não
--      herda a proteção da RLS);
--   3. revalida transições, limites e categorias no banco.
-- Nenhuma RPC escreve em fin_lancamentos, fin_parcelas, fin_baixas ou
-- fin_fechamentos.
begin;

-- ── 1. Criar importação (identidade do arquivo) ───────────────────────────

create or replace function public.fin_conciliacao_criar_importacao(p_envelope text, p_atestado text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_env jsonb;
  v_unidade text;
  v_conta uuid;
  v_sha text;
  v_formato text;
  v_quarentena text;
  v_id uuid := gen_random_uuid();
  v_canonica record;
  v_ext text;
  v_caminho text;
begin
  v_env := public.fin_conciliacao_conferir_atestado(p_envelope, p_atestado, 'criar_importacao');
  v_unidade := v_env->>'unidade';
  v_conta := (v_env->>'conta')::uuid;
  v_sha := v_env->>'sha256';
  v_formato := v_env->>'formato';
  v_quarentena := nullif(v_env->>'quarentena_motivo', '');

  if not public.usuario_pode_usar_conciliacao(v_unidade, null) then
    raise exception 'Sem acesso a Conciliacao desta unidade' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.fin_contas_financeiras c
    where c.unidade_id = v_unidade and c.id = v_conta and c.ativo
  ) then
    raise exception 'Conta financeira invalida' using errcode = '23514';
  end if;

  if v_quarentena is not null then
    insert into public.fin_importacoes (
      id, unidade_id, conta_financeira_id, tipo_documento, formato, situacao, motivo_codigo,
      sha256, nome_original, tamanho_bytes, mime_detectado, criacao_nonce, criado_por
    ) values (
      v_id, v_unidade, v_conta, v_env->>'tipo_documento', v_formato, 'quarentena', v_quarentena,
      v_sha, v_env->>'nome', (v_env->>'tamanho')::integer, v_env->>'mime', (v_env->>'nonce')::uuid, auth.uid()
    );
    perform public.fin_conciliacao_auditar(v_unidade, 'conciliacao_quarentena', v_id,
      jsonb_build_object('motivo', v_quarentena, 'formato', v_formato, 'tamanho', (v_env->>'tamanho')::integer));
    return jsonb_build_object('id', v_id, 'situacao', 'quarentena', 'motivo', v_quarentena);
  end if;

  if v_sha is null or v_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'SHA-256 obrigatorio' using errcode = '23514';
  end if;

  -- Serializa a identidade do arquivo: dois envios iguais ao mesmo tempo
  -- nunca criam duas canônicas.
  perform pg_advisory_xact_lock(hashtextextended('fin_conc_sha:' || v_unidade || ':' || v_conta::text || ':' || v_sha, 0));

  update public.fin_importacoes
    set situacao = 'expirada', motivo_codigo = 'upload_expirado'
    where unidade_id = v_unidade and conta_financeira_id = v_conta and sha256 = v_sha
      and situacao = 'aguardando_arquivo' and expira_em <= now();

  select i.id, i.situacao into v_canonica
    from public.fin_importacoes i
    where i.unidade_id = v_unidade and i.conta_financeira_id = v_conta and i.sha256 = v_sha
      and i.situacao in ('aguardando_arquivo', 'processando', 'concluida', 'parcial')
    limit 1;

  if found then
    insert into public.fin_importacoes (
      id, unidade_id, conta_financeira_id, tipo_documento, formato, situacao, duplicada_de_id,
      sha256, nome_original, tamanho_bytes, mime_detectado, criacao_nonce, criado_por
    ) values (
      v_id, v_unidade, v_conta, v_env->>'tipo_documento', v_formato, 'duplicada', v_canonica.id,
      v_sha, v_env->>'nome', (v_env->>'tamanho')::integer, v_env->>'mime', (v_env->>'nonce')::uuid, auth.uid()
    );
    perform public.fin_conciliacao_auditar(v_unidade, 'conciliacao_importacao_duplicada', v_id,
      jsonb_build_object('canonica', v_canonica.id));
    return jsonb_build_object('id', v_id, 'situacao', 'duplicada', 'canonica', v_canonica.id,
      'canonica_situacao', v_canonica.situacao);
  end if;

  v_ext := case v_formato
    when 'ofx' then 'ofx' when 'csv' then 'csv' when 'pdf' then 'pdf'
    when 'imagem' then case v_env->>'mime' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'jpg' end
  end;
  if v_ext is null then
    raise exception 'Formato nao aceito' using errcode = '23514';
  end if;
  v_caminho := v_unidade || '/' || v_id::text || '/original.' || v_ext;

  insert into public.fin_importacoes (
    id, unidade_id, conta_financeira_id, tipo_documento, formato, situacao, sha256, caminho_arquivo,
    nome_original, tamanho_bytes, mime_detectado, criacao_nonce, criado_por
  ) values (
    v_id, v_unidade, v_conta, v_env->>'tipo_documento', v_formato, 'aguardando_arquivo', v_sha, v_caminho,
    v_env->>'nome', (v_env->>'tamanho')::integer, v_env->>'mime', (v_env->>'nonce')::uuid, auth.uid()
  );
  perform public.fin_conciliacao_auditar(v_unidade, 'conciliacao_importacao_criada', v_id,
    jsonb_build_object('formato', v_formato, 'tamanho', (v_env->>'tamanho')::integer));
  return jsonb_build_object('id', v_id, 'situacao', 'aguardando_arquivo', 'caminho', v_caminho);
end;
$$;

-- ── 2. Iniciar (ou recuperar) o processamento ─────────────────────────────

create or replace function public.fin_conciliacao_iniciar_processamento(p_envelope text, p_atestado text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_env jsonb;
  v_imp record;
  v_nonce uuid := gen_random_uuid();
begin
  v_env := public.fin_conciliacao_conferir_atestado(p_envelope, p_atestado, 'iniciar_processamento');
  select * into v_imp from public.fin_importacoes where id = (v_env->>'importacao')::uuid for update;
  if not found or not public.usuario_pode_usar_conciliacao(v_imp.unidade_id, null) then
    raise exception 'Importacao invalida' using errcode = '42501';
  end if;
  if v_imp.sha256 is distinct from v_env->>'sha256' then
    raise exception 'Arquivo diferente do registrado' using errcode = '42501';
  end if;
  if not (
    (v_imp.situacao = 'aguardando_arquivo' and v_imp.expira_em > now())
    or (v_imp.situacao = 'processando' and v_imp.processamento_iniciado_em < now() - interval '10 minutes')
  ) then
    raise exception 'Importacao nao pode ser processada agora' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id = 'fin-conciliacao' and o.name = v_imp.caminho_arquivo
  ) then
    raise exception 'Arquivo ainda nao recebido' using errcode = 'P0001';
  end if;

  update public.fin_importacoes
    set situacao = 'processando', arquivo_guardado = true, tentativa = tentativa + 1,
        processamento_nonce = v_nonce, processamento_iniciado_em = now()
    where id = v_imp.id;
  perform public.fin_conciliacao_auditar(v_imp.unidade_id, 'conciliacao_processamento_iniciado', v_imp.id,
    jsonb_build_object('tentativa', v_imp.tentativa + 1));
  return jsonb_build_object('tentativa', v_imp.tentativa + 1, 'nonce', v_nonce);
end;
$$;

-- Trava a importação e confere tentativa e nonce da operação atestada.
create or replace function public.fin_conciliacao_travar_tentativa(p_env jsonb)
returns public.fin_importacoes
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_imp public.fin_importacoes;
begin
  select * into v_imp from public.fin_importacoes where id = (p_env->>'importacao')::uuid for update;
  if not found or not public.usuario_pode_usar_conciliacao(v_imp.unidade_id, null) then
    raise exception 'Importacao invalida' using errcode = '42501';
  end if;
  return v_imp;
end;
$$;
revoke all on function public.fin_conciliacao_travar_tentativa(jsonb) from public, anon, authenticated;

-- ── 3. Quarentena depois da leitura estrutural ────────────────────────────

create or replace function public.fin_conciliacao_quarentenar(p_envelope text, p_atestado text)
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
begin
  v_env := public.fin_conciliacao_conferir_atestado(p_envelope, p_atestado, 'quarentenar');
  v_imp := public.fin_conciliacao_travar_tentativa(v_env);
  v_motivo := v_env->>'motivo';
  if v_imp.situacao <> 'processando'
     or v_imp.tentativa is distinct from (v_env->>'tentativa')::integer
     or v_imp.processamento_nonce is distinct from (v_env->>'nonce')::uuid then
    raise exception 'Tentativa expirada ou invalida' using errcode = 'P0001';
  end if;
  update public.fin_importacoes
    set situacao = 'quarentena', motivo_codigo = v_motivo, processamento_nonce = null, processado_em = now()
    where id = v_imp.id;
  perform public.fin_conciliacao_auditar(v_imp.unidade_id, 'conciliacao_quarentena', v_imp.id,
    jsonb_build_object('motivo', v_motivo, 'tentativa', v_imp.tentativa));
  return jsonb_build_object('situacao', 'quarentena', 'motivo', v_motivo);
end;
$$;

-- ── 4. Registrar o resultado da leitura (atômico) ─────────────────────────

create or replace function public.fin_conciliacao_registrar_resultado(p_envelope text, p_atestado text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_env jsonb;
  v_imp public.fin_importacoes;
  v_digest text;
  v_linha jsonb;
  v_sug jsonb;
  v_pos integer;
  v_tipo text;
  v_data date;
  v_direcao text;
  v_valor numeric(14,2);
  v_desc_norm text;
  v_id_banco text;
  v_forte text;
  v_fraco text;
  v_existente record;
  v_candidato uuid;
  v_mov uuid;
  v_usados uuid[] := '{}';
  v_versao_identidade integer := 1;
  v_categoria record;
  v_erros jsonb := '[]'::jsonb;
  v_lidas integer := 0;
  v_novos integer := 0;
  v_mesmo integer := 0;
  v_dup integer := 0;
  v_conflito integer := 0;
  v_saldo integer := 0;
  v_erro integer := 0;
  v_sem_conf integer := 0;
  v_situacao text;
  v_motivo text;
  v_resultado jsonb;
begin
  v_env := public.fin_conciliacao_conferir_atestado(p_envelope, p_atestado, 'registrar_resultado');
  v_digest := encode(extensions.digest(convert_to(p_envelope, 'UTF8'), 'sha256'), 'hex');
  v_imp := public.fin_conciliacao_travar_tentativa(v_env);

  -- Repetição da mesma chamada depois de concluída devolve o mesmo resultado;
  -- qualquer outra coisa fora da tentativa corrente é recusada.
  if v_imp.situacao in ('concluida', 'parcial', 'falhou') and v_imp.resultado_digest = v_digest then
    return jsonb_build_object('situacao', v_imp.situacao, 'repetido', true,
      'movimentos_novos', v_imp.movimentos_novos, 'possiveis_duplicidades', v_imp.possiveis_duplicidades,
      'mesmo_identificador', v_imp.mesmo_identificador, 'conflitos_identificador', v_imp.conflitos_identificador,
      'linhas_com_erro', v_imp.linhas_com_erro, 'linhas_saldo', v_imp.linhas_saldo);
  end if;
  if v_imp.situacao <> 'processando'
     or v_imp.tentativa is distinct from (v_env->>'tentativa')::integer
     or v_imp.processamento_nonce is distinct from (v_env->>'nonce')::uuid then
    raise exception 'Tentativa expirada ou invalida' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_env->'linhas') is distinct from 'array' or jsonb_array_length(v_env->'linhas') > 5000 then
    raise exception 'Linhas invalidas' using errcode = '23514';
  end if;

  if nullif(v_env->>'erro_global', '') is not null then
    update public.fin_importacoes
      set situacao = 'falhou', motivo_codigo = v_env->>'erro_global', resultado_digest = v_digest,
          processamento_nonce = null, processado_em = now(), versao_parser = v_env->>'versao_parser',
          fonte_extracao = nullif(v_env->>'fonte_extracao', '')
      where id = v_imp.id;
    perform public.fin_conciliacao_auditar(v_imp.unidade_id, 'conciliacao_resultado_registrado', v_imp.id,
      jsonb_build_object('situacao', 'falhou', 'motivo', v_env->>'erro_global', 'tentativa', v_imp.tentativa));
    return jsonb_build_object('situacao', 'falhou', 'motivo', v_env->>'erro_global');
  end if;

  -- Uma ingestão por conta de cada vez (identidade e candidatos estáveis).
  perform pg_advisory_xact_lock(hashtextextended('fin_conc_conta:' || v_imp.conta_financeira_id::text, 0));

  for v_linha in
    select value from jsonb_array_elements(v_env->'linhas') order by (value->>'posicao')::integer
  loop
    v_lidas := v_lidas + 1;
    v_pos := (v_linha->>'posicao')::integer;
    v_tipo := v_linha->>'tipo';

    if v_tipo = 'saldo' then
      insert into public.fin_importacao_linhas (unidade_id, conta_financeira_id, importacao_id, posicao, resultado)
      values (v_imp.unidade_id, v_imp.conta_financeira_id, v_imp.id, v_pos, 'saldo');
      v_saldo := v_saldo + 1;
      continue;
    elsif v_tipo = 'erro' then
      insert into public.fin_importacao_linhas (unidade_id, conta_financeira_id, importacao_id, posicao, resultado, codigo_erro)
      values (v_imp.unidade_id, v_imp.conta_financeira_id, v_imp.id, v_pos, 'erro', v_linha->>'codigo_erro');
      v_erro := v_erro + 1;
      if jsonb_array_length(v_erros) < 500 then
        v_erros := v_erros || jsonb_build_object('posicao', v_pos, 'codigo', v_linha->>'codigo_erro');
      end if;
      continue;
    elsif v_tipo is distinct from 'movimento' then
      raise exception 'Tipo de linha invalido' using errcode = '23514';
    end if;

    v_data := (v_linha->>'data')::date;
    v_direcao := v_linha->>'direcao';
    if v_data < date '2000-01-01' or v_data > date '2100-12-31' then
      raise exception 'Data fora da faixa' using errcode = '23514';
    end if;
    if coalesce(v_linha->>'valor_centavos', '') !~ '^[1-9][0-9]{0,13}$' then
      raise exception 'Valor invalido' using errcode = '23514';
    end if;
    v_valor := ((v_linha->>'valor_centavos')::numeric / 100)::numeric(14,2);
    v_desc_norm := v_linha->>'descricao_normalizada';
    v_id_banco := nullif(v_linha->>'id_banco', '');
    v_forte := encode(extensions.digest(convert_to(concat_ws(chr(31), 'v1', v_imp.conta_financeira_id::text,
      v_data::text, v_direcao, v_valor::text, v_desc_norm), 'UTF8'), 'sha256'), 'hex');
    v_fraco := encode(extensions.digest(convert_to(concat_ws(chr(31), 'v1', v_imp.conta_financeira_id::text,
      v_data::text, v_direcao, v_valor::text), 'UTF8'), 'sha256'), 'hex');
    if not coalesce((v_linha->>'conferido')::boolean, false) then
      v_sem_conf := v_sem_conf + 1;
    end if;

    -- Identificador do banco confiável: mesma transação já conhecida.
    if v_id_banco is not null then
      select m.id, m.data, m.direcao, m.valor, m.estado into v_existente
        from public.fin_movimentos_importados m
        where m.unidade_id = v_imp.unidade_id and m.conta_financeira_id = v_imp.conta_financeira_id
          and m.id_banco = v_id_banco;
      if found then
        if v_existente.data = v_data and v_existente.direcao = v_direcao and v_existente.valor = v_valor then
          insert into public.fin_importacao_linhas (unidade_id, conta_financeira_id, importacao_id, posicao, resultado, movimento_id)
          values (v_imp.unidade_id, v_imp.conta_financeira_id, v_imp.id, v_pos, 'mesmo_identificador', v_existente.id);
          v_mesmo := v_mesmo + 1;
        else
          insert into public.fin_importacao_linhas (unidade_id, conta_financeira_id, importacao_id, posicao, resultado,
            movimento_id, dados_conflito)
          values (v_imp.unidade_id, v_imp.conta_financeira_id, v_imp.id, v_pos, 'conflito_identificador', v_existente.id,
            jsonb_build_object('data', v_data, 'direcao', v_direcao, 'valor', v_valor,
              'descricao_original', left(v_linha->>'descricao_original', 300)));
          if v_existente.estado = 'pendente' then
            update public.fin_movimentos_importados
              set estado = 'revisar', motivo_revisao = 'conflito_identificador'
              where id = v_existente.id;
          end if;
          v_conflito := v_conflito + 1;
        end if;
        continue;
      end if;
    end if;

    -- Sem identificador confiável (A1): nunca descarta. Semelhante vindo de
    -- outra importação vira movimento em revisão apontando o candidato.
    select m.id into v_candidato
      from public.fin_movimentos_importados m
      where m.unidade_id = v_imp.unidade_id and m.conta_financeira_id = v_imp.conta_financeira_id
        and m.importacao_origem_id <> v_imp.id
        and not (m.id = any (v_usados))
        and not (m.id_banco is not null and v_id_banco is not null)
        and (m.fingerprint_forte = v_forte or m.fingerprint_fraco = v_fraco)
      order by (m.fingerprint_forte = v_forte) desc, m.data, m.criado_em, m.id
      limit 1;

    insert into public.fin_movimentos_importados (
      unidade_id, conta_financeira_id, importacao_origem_id, data, direcao, valor,
      descricao_original, descricao_normalizada, favorecido_normalizado, id_banco,
      fingerprint_forte, fingerprint_fraco, versao_identidade, conteudo_digest, natureza,
      fonte_extracao, versao_parser, estado, motivo_revisao, duplicidade_candidata_id, criado_por
    ) values (
      v_imp.unidade_id, v_imp.conta_financeira_id, v_imp.id, v_data, v_direcao, v_valor,
      v_linha->>'descricao_original', v_desc_norm, nullif(v_linha->>'favorecido_normalizado', ''), v_id_banco,
      v_forte, v_fraco, v_versao_identidade,
      encode(extensions.digest(convert_to(concat_ws(chr(31), v_data::text, v_direcao, v_valor::text,
        v_linha->>'descricao_original', coalesce(v_id_banco, '')), 'UTF8'), 'sha256'), 'hex'),
      v_linha->>'natureza', v_env->>'fonte_extracao', v_env->>'versao_parser',
      case when v_candidato is null then 'pendente' else 'revisar' end,
      case when v_candidato is null then null else 'possivel_duplicidade' end,
      v_candidato, auth.uid()
    ) returning id into v_mov;

    if v_candidato is null then
      insert into public.fin_importacao_linhas (unidade_id, conta_financeira_id, importacao_id, posicao, resultado, movimento_id)
      values (v_imp.unidade_id, v_imp.conta_financeira_id, v_imp.id, v_pos, 'movimento_novo', v_mov);
      v_novos := v_novos + 1;
    else
      v_usados := v_usados || v_candidato;
      insert into public.fin_importacao_linhas (unidade_id, conta_financeira_id, importacao_id, posicao, resultado, movimento_id)
      values (v_imp.unidade_id, v_imp.conta_financeira_id, v_imp.id, v_pos, 'possivel_duplicidade', v_mov);
      v_dup := v_dup + 1;
    end if;

    -- Sugestão: a categoria é revalidada aqui, não confiada ao servidor.
    v_sug := v_linha->'sugestao';
    if v_sug is null or jsonb_typeof(v_sug) <> 'object' then
      raise exception 'Sugestao obrigatoria' using errcode = '23514';
    end if;
    if nullif(v_sug->>'categoria_id', '') is not null then
      if v_linha->>'natureza' not in ('entrada', 'saida') then
        raise exception 'Natureza sem categoria' using errcode = '23514';
      end if;
      select c.nivel, c.papel_dre, c.arquivado into v_categoria
        from public.fin_categorias c
        where c.unidade_id = v_imp.unidade_id and c.id = (v_sug->>'categoria_id')::uuid;
      if not found or v_categoria.nivel <> 'conta' or v_categoria.arquivado
         or public.papel_dre_somente_provisao(v_categoria.papel_dre)
         or (v_direcao = 'entrada' and v_categoria.papel_dre is distinct from 'receita')
         or (v_direcao = 'saida' and v_categoria.papel_dre = 'receita') then
        raise exception 'Categoria incompativel com o movimento' using errcode = '23514';
      end if;
    end if;
    insert into public.fin_classificacoes (
      unidade_id, movimento_id, categoria_sugerida_id, confianca, fonte, motivo_codigo, evidencias,
      regra_id, regra_versao, versao_motor, modelo_ia, versao_prompt
    ) values (
      v_imp.unidade_id, v_mov, nullif(v_sug->>'categoria_id', '')::uuid, v_sug->>'confianca', v_sug->>'fonte',
      v_sug->>'motivo_codigo', coalesce(v_sug->'evidencias', '{}'::jsonb),
      nullif(v_sug->>'regra_id', '')::uuid, nullif(v_sug->>'regra_versao', '')::integer,
      v_env->>'versao_motor', nullif(v_sug->>'modelo_ia', ''), nullif(v_sug->>'versao_prompt', '')
    );
  end loop;

  if v_novos + v_dup + v_mesmo + v_conflito = 0 and v_erro > 0 then
    v_situacao := 'falhou';
    v_motivo := 'nenhuma_linha_valida';
  elsif v_erro > 0 or v_conflito > 0 or v_env->>'conferencia_aritmetica' = 'divergente' then
    v_situacao := 'parcial';
    v_motivo := case
      when v_env->>'conferencia_aritmetica' = 'divergente' then 'saldo_divergente'
      when v_conflito > 0 then 'conflito_identificador'
      else 'linhas_com_erro' end;
  else
    v_situacao := 'concluida';
    v_motivo := null;
  end if;

  update public.fin_importacoes set
    situacao = v_situacao, motivo_codigo = v_motivo, resultado_digest = v_digest,
    processamento_nonce = null, processado_em = now(),
    versao_parser = v_env->>'versao_parser', fonte_extracao = v_env->>'fonte_extracao',
    conferencia_aritmetica = nullif(v_env->>'conferencia_aritmetica', ''),
    periodo_inicio = nullif(v_env->>'periodo_inicio', '')::date,
    periodo_fim = nullif(v_env->>'periodo_fim', '')::date,
    linhas_lidas = v_lidas, movimentos_novos = v_novos, mesmo_identificador = v_mesmo,
    possiveis_duplicidades = v_dup, conflitos_identificador = v_conflito, linhas_saldo = v_saldo,
    linhas_com_erro = v_erro, movimentos_sem_conferencia = v_sem_conf, erros = v_erros
  where id = v_imp.id;

  v_resultado := jsonb_build_object('situacao', v_situacao, 'motivo', v_motivo, 'linhas_lidas', v_lidas,
    'movimentos_novos', v_novos, 'possiveis_duplicidades', v_dup, 'mesmo_identificador', v_mesmo,
    'conflitos_identificador', v_conflito, 'linhas_saldo', v_saldo, 'linhas_com_erro', v_erro,
    'tentativa', v_imp.tentativa);
  perform public.fin_conciliacao_auditar(v_imp.unidade_id, 'conciliacao_resultado_registrado', v_imp.id, v_resultado);
  return v_resultado;
end;
$$;

-- ── 5 e 6. Uso de IA: registra antes da chamada, finaliza depois ──────────

create or replace function public.fin_conciliacao_ia_iniciar(p_envelope text, p_atestado text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_env jsonb;
  v_unidade text;
  v_importacao uuid;
begin
  v_env := public.fin_conciliacao_conferir_atestado(p_envelope, p_atestado, 'ia_iniciar');
  v_unidade := v_env->>'unidade';
  v_importacao := nullif(v_env->>'importacao', '')::uuid;
  if not public.usuario_pode_usar_conciliacao(v_unidade, null) then
    raise exception 'Sem acesso a Conciliacao desta unidade' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.unidades u where u.id = v_unidade and (
      (v_env->>'finalidade' = 'extracao_documento' and u.conciliacao_ia_documentos)
      or (v_env->>'finalidade' = 'classificacao' and u.conciliacao_ia_classificacao)
    )
  ) then
    raise exception 'IA desligada para esta unidade' using errcode = '42501';
  end if;
  insert into public.fin_ia_chamadas (unidade_id, importacao_id, chave_idempotencia, finalidade, modelo,
    tabela_precos_versao, criado_por)
  values (v_unidade, v_importacao, (v_env->>'chave')::uuid, v_env->>'finalidade', v_env->>'modelo',
    v_env->>'tabela_precos_versao', auth.uid())
  on conflict (chave_idempotencia) do nothing;
end;
$$;

create or replace function public.fin_conciliacao_ia_finalizar(p_envelope text, p_atestado text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_env jsonb;
  v_chamada record;
  v_situacao text;
  v_custo numeric;
begin
  v_env := public.fin_conciliacao_conferir_atestado(p_envelope, p_atestado, 'ia_finalizar');
  select * into v_chamada from public.fin_ia_chamadas
    where chave_idempotencia = (v_env->>'chave')::uuid for update;
  if not found or v_chamada.criado_por <> auth.uid()
     or not public.usuario_pode_usar_conciliacao(v_chamada.unidade_id, null) then
    raise exception 'Chamada de IA invalida' using errcode = '42501';
  end if;
  if v_chamada.situacao <> 'iniciada' then
    return; -- repetição: a primeira finalização vale
  end if;
  v_situacao := v_env->>'situacao';
  v_custo := nullif(v_env->>'custo_usd', '')::numeric;
  if v_situacao not in ('concluida', 'erro', 'consumo_desconhecido') or (v_custo is not null and (v_custo < 0 or v_custo > 100)) then
    raise exception 'Finalizacao invalida' using errcode = '23514';
  end if;
  update public.fin_ia_chamadas set
    situacao = v_situacao,
    resultado_codigo = nullif(v_env->>'resultado_codigo', ''),
    tokens_entrada = nullif(v_env->>'tokens_entrada', '')::integer,
    tokens_saida = nullif(v_env->>'tokens_saida', '')::integer,
    tokens_cache_leitura = nullif(v_env->>'tokens_cache_leitura', '')::integer,
    tokens_cache_escrita = nullif(v_env->>'tokens_cache_escrita', '')::integer,
    custo_estimado_usd = v_custo,
    finalizada_em = now()
  where id = v_chamada.id;
end;
$$;

-- ── 7. Candidatos de parcela (leitura filtrada e paginada no banco) ───────
-- Só leitura: nenhuma baixa é criada nesta fatia. Ordem de relevância
-- decidida aqui, antes de paginar (D8).

create or replace function public.fin_conciliacao_candidatos_parcela(
  p_movimento uuid,
  p_janela_dias integer default 5,
  p_fora_da_janela boolean default false,
  p_offset integer default 0,
  p_limite integer default 20
)
returns table (
  grupo text,
  parcela_id uuid,
  lancamento_id uuid,
  descricao text,
  categoria_nome text,
  data_prevista date,
  valor numeric,
  saldo_aberto numeric,
  status text,
  numero integer,
  total_parcelas integer,
  conta_financeira_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mov record;
begin
  select m.unidade_id, m.data, m.direcao, m.valor into v_mov
    from public.fin_movimentos_importados m where m.id = p_movimento;
  if not found or not public.usuario_pode_usar_conciliacao(v_mov.unidade_id, null) then
    raise exception 'Movimento invalido' using errcode = '42501';
  end if;
  if p_janela_dias not between 0 and 60 or p_offset < 0 or p_limite not between 1 and 100 then
    raise exception 'Parametros invalidos' using errcode = '22023';
  end if;

  return query
  with base as (
    select p.id as parcela_id, l.id as lancamento_id, l.descricao, c.nome as categoria_nome,
           p.data_prevista, p.valor, p.valor - public.saldo_baixado_parcela(p.id) as saldo_aberto,
           p.status, p.numero, p.total_parcelas, p.conta_financeira_id
    from public.fin_parcelas p
    join public.fin_lancamentos l on l.unidade_id = p.unidade_id and l.id = p.lancamento_id
    join public.fin_categorias c on c.unidade_id = l.unidade_id and c.id = l.categoria_id
    where p.unidade_id = v_mov.unidade_id
      and p.status <> 'cancelado'
      and l.tipo = case when v_mov.direcao = 'entrada' then 'receita' else 'despesa' end
      and (p_fora_da_janela or p.data_prevista between v_mov.data - p_janela_dias and v_mov.data + p_janela_dias)
  )
  select case when b.status = 'quitado' then 'quitada' else 'aberta' end, b.parcela_id, b.lancamento_id,
         b.descricao, b.categoria_nome, b.data_prevista, b.valor, b.saldo_aberto, b.status, b.numero,
         b.total_parcelas, b.conta_financeira_id
  from base b
  where b.status <> 'quitado' or b.valor = v_mov.valor
  order by (b.status = 'quitado'), (b.saldo_aberto = v_mov.valor) desc,
           abs(b.data_prevista - v_mov.data), abs(b.saldo_aberto - v_mov.valor), b.parcela_id
  offset p_offset limit p_limite + 1;
end;
$$;

-- ── 8. Resumo semanal de custo de IA (para o Vini, só agregado) ───────────
-- Credencial própria: token cujo SHA-256 fica em fin_conciliacao_segredos.
-- Devolve só totais da semana (segunda a domingo, America/Sao_Paulo).

create or replace function public.fin_conciliacao_resumo_semanal_ia(p_token text, p_semana_inicio date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date;
  v_resultado jsonb;
begin
  if p_token is null or char_length(p_token) < 32 or not exists (
    select 1 from public.fin_conciliacao_segredos s
    where s.chave = 'relatorio_ia' and s.ativo
      and s.valor = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
  ) then
    raise exception 'Nao autorizado' using errcode = '42501';
  end if;
  v_inicio := coalesce(p_semana_inicio, v_hoje - (extract(isodow from v_hoje)::integer - 1) - 7);
  if extract(isodow from v_inicio) <> 1 then
    raise exception 'Semana deve comecar na segunda' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'semana_inicio', v_inicio,
    'semana_fim', v_inicio + 6,
    'custo_total_usd', coalesce(sum(c.custo_estimado_usd), 0),
    'chamadas', count(*),
    'chamadas_sem_custo_conhecido', count(*) filter (where c.situacao in ('iniciada', 'consumo_desconhecido')),
    'tokens_entrada', coalesce(sum(c.tokens_entrada), 0),
    'tokens_saida', coalesce(sum(c.tokens_saida), 0)
  ) into v_resultado
  from public.fin_ia_chamadas c
  where (c.iniciada_em at time zone 'America/Sao_Paulo')::date between v_inicio and v_inicio + 6;
  return v_resultado;
end;
$$;

-- ── Grants mínimos ─────────────────────────────────────────────────────────

revoke all on function public.fin_conciliacao_criar_importacao(text, text) from public, anon;
revoke all on function public.fin_conciliacao_iniciar_processamento(text, text) from public, anon;
revoke all on function public.fin_conciliacao_quarentenar(text, text) from public, anon;
revoke all on function public.fin_conciliacao_registrar_resultado(text, text) from public, anon;
revoke all on function public.fin_conciliacao_ia_iniciar(text, text) from public, anon;
revoke all on function public.fin_conciliacao_ia_finalizar(text, text) from public, anon;
revoke all on function public.fin_conciliacao_candidatos_parcela(uuid, integer, boolean, integer, integer) from public, anon;
revoke all on function public.fin_conciliacao_resumo_semanal_ia(text, date) from public;
revoke all on function public.proteger_movimento_importado() from public, anon, authenticated;
revoke all on function public.proteger_regra_classificacao() from public, anon, authenticated;

grant execute on function public.fin_conciliacao_criar_importacao(text, text) to authenticated;
grant execute on function public.fin_conciliacao_iniciar_processamento(text, text) to authenticated;
grant execute on function public.fin_conciliacao_quarentenar(text, text) to authenticated;
grant execute on function public.fin_conciliacao_registrar_resultado(text, text) to authenticated;
grant execute on function public.fin_conciliacao_ia_iniciar(text, text) to authenticated;
grant execute on function public.fin_conciliacao_ia_finalizar(text, text) to authenticated;
grant execute on function public.fin_conciliacao_candidatos_parcela(uuid, integer, boolean, integer, integer) to authenticated;
grant execute on function public.fin_conciliacao_resumo_semanal_ia(text, date) to anon, authenticated;

commit;
