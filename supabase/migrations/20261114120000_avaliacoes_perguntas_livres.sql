-- Avaliações: perguntas da gestão e pergunta por tipo de pesquisa (14/11/2026). Vinícius, sobre a
-- tela Configurar: "cada pergunta tem que vir de um jeito mais fácil de editar, acrescentar uma
-- pergunta se eu quiser". O que muda:
--   - cada pergunta do modelo pode valer só em parte dos tipos em que faz sentido (`origens`);
--   - a ordem da lista é a ordem da página;
--   - a gestão cria até 10 perguntas próprias (`extra_xxxxxx`): estrelas, sim ou não, lista de
--     opções ou texto, com as pesquisas em que aparecem e se são obrigatórias;
--   - as respostas delas ficam em `avaliacoes_respostas.extras` (estrela até 2 também vira nota baixa).
-- Espelho de `validarPerguntas` e `perguntaVale` em src/lib/avaliacoes/perguntas.ts.

-- ══ 1. Coluna das respostas livres ═══════════════════════════════════════
alter table public.avaliacoes_respostas add column if not exists extras jsonb;
alter table public.avaliacoes_respostas drop constraint if exists avaliacoes_respostas_extras_check;
alter table public.avaliacoes_respostas add constraint avaliacoes_respostas_extras_check
  check (extras is null or (jsonb_typeof(extras) = 'object' and pg_column_size(extras) <= 16000));
grant select (extras) on public.avaliacoes_respostas to authenticated;

-- ══ 2. Validação da lista ════════════════════════════════════════════════
-- Fixas: cada chave conhecida uma vez, `origens` opcional dentro das do catálogo. Livres: chave
-- extra_ + 6 letras/números, tipo, opções (lista: 2 a 8, até 40 letras, sem repetir), obrigatória
-- e ao menos uma pesquisa. Texto de 3 a 200, até 10 livres e ao menos uma ligada.
create or replace function public.avaliacoes_validar_perguntas(p_perguntas jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_chave text;
  v_chaves text[] := '{}';
  v_ativas integer := 0;
  v_livres integer := 0;
  v_texto text;
  v_origem jsonb;
  v_opcoes text[];
  v_opcao jsonb;
begin
  if p_perguntas is null or jsonb_typeof(p_perguntas) <> 'array' or jsonb_array_length(p_perguntas) not between 1 and 30 then
    return 'perguntas_invalidas';
  end if;
  for v_item in select * from jsonb_array_elements(p_perguntas) loop
    if jsonb_typeof(v_item) <> 'object' then
      return 'perguntas_invalidas';
    end if;
    v_chave := coalesce(v_item ->> 'chave', '');
    if v_chave = any (v_chaves)
       or jsonb_typeof(v_item -> 'ativa') is distinct from 'boolean'
       or jsonb_typeof(v_item -> 'texto') is distinct from 'string' then
      return 'perguntas_invalidas';
    end if;
    v_chaves := v_chaves || v_chave;
    v_texto := btrim(v_item ->> 'texto');
    if char_length(v_texto) < 3 or char_length(v_texto) > 200 then
      return 'texto_pergunta';
    end if;

    -- Em que pesquisas vale: lista sem repetir de salao/delivery/app.
    if v_item ? 'origens' then
      if jsonb_typeof(v_item -> 'origens') <> 'array' or jsonb_array_length(v_item -> 'origens') > 3
         or (select count(distinct x) from jsonb_array_elements_text(v_item -> 'origens') x) <> jsonb_array_length(v_item -> 'origens') then
        return 'perguntas_invalidas';
      end if;
      for v_origem in select * from jsonb_array_elements(v_item -> 'origens') loop
        if jsonb_typeof(v_origem) <> 'string' or (v_origem #>> '{}') not in ('salao', 'delivery', 'app') then
          return 'perguntas_invalidas';
        end if;
      end loop;
    end if;

    if v_chave ~ '^extra_[a-z0-9]{6}$' then
      v_livres := v_livres + 1;
      if coalesce(v_item ->> 'tipo', '') not in ('estrelas', 'simnao', 'escolha', 'texto')
         or jsonb_typeof(v_item -> 'obrigatoria') is distinct from 'boolean'
         or not (v_item ? 'origens') or jsonb_array_length(v_item -> 'origens') = 0 then
        return 'pergunta_livre_invalida';
      end if;
      if v_item ->> 'tipo' = 'escolha' then
        if jsonb_typeof(v_item -> 'opcoes') is distinct from 'array' or jsonb_array_length(v_item -> 'opcoes') not between 2 and 8 then
          return 'opcoes_invalidas';
        end if;
        v_opcoes := '{}';
        for v_opcao in select * from jsonb_array_elements(v_item -> 'opcoes') loop
          if jsonb_typeof(v_opcao) <> 'string' or char_length(btrim(v_opcao #>> '{}')) not between 1 and 40
             or lower(btrim(v_opcao #>> '{}')) = any (v_opcoes) then
            return 'opcoes_invalidas';
          end if;
          v_opcoes := v_opcoes || lower(btrim(v_opcao #>> '{}'));
        end loop;
      elsif v_item ? 'opcoes' then
        return 'pergunta_livre_invalida';
      end if;
    elsif v_chave in ('atendimento', 'comida', 'tempo', 'ambiente', 'atendente', 'pedido_certo', 'embalagem', 'entrega',
                      'atendimento_pedido', 'nps', 'comentario', 'conheceu', 'espera') then
      if v_item ? 'tipo' or v_item ? 'opcoes' or v_item ? 'obrigatoria' then
        return 'perguntas_invalidas';
      end if;
      if v_item ? 'origens' and exists (
           select 1 from jsonb_array_elements_text(v_item -> 'origens') x
            where not public.avaliacoes_pergunta_no_tipo(v_chave, x)) then
        return 'perguntas_invalidas';
      end if;
    else
      return 'perguntas_invalidas';
    end if;

    if (v_item ->> 'ativa')::boolean then
      v_ativas := v_ativas + 1;
    end if;
  end loop;
  if v_livres > 10 then
    return 'livres_demais';
  end if;
  if v_ativas = 0 then
    return 'nenhuma_ativa';
  end if;
  return null;
end;
$$;
revoke all on function public.avaliacoes_validar_perguntas(jsonb) from public, anon, authenticated;

-- A pergunta vale nesta pesquisa: ligada, do tipo (catálogo) e, com `origens`, na lista.
create or replace function public.avaliacoes_pergunta_vale(p_perguntas jsonb, p_chave text, p_origem text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((
    select (q ->> 'ativa')::boolean
       and (case when q ? 'origens' then (q -> 'origens') ? p_origem else p_chave !~ '^extra_' end)
       and (p_chave ~ '^extra_' or public.avaliacoes_pergunta_no_tipo(p_chave, p_origem))
      from jsonb_array_elements(p_perguntas) q
     where q ->> 'chave' = p_chave
     limit 1), false);
$$;
revoke all on function public.avaliacoes_pergunta_vale(jsonb, text, text) from public, anon, authenticated;

-- ══ 3. Gravar a lista (mantém origens, tipo, opções e obrigatória) ═══════
create or replace function public.avaliacoes_salvar_perguntas(p_unidade_id text, p_perguntas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_atual jsonb;
  v_erro text;
  v_normal jsonb;
begin
  if not public.usuario_pode_usar_avaliacoes(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_erro := public.avaliacoes_validar_perguntas(p_perguntas);
  if v_erro is not null then
    raise exception '%', v_erro using errcode = '22023';
  end if;
  select jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'chave', q ->> 'chave',
             'texto', btrim(q ->> 'texto'),
             'ativa', (q ->> 'ativa')::boolean,
             'origens', q -> 'origens',
             'tipo', q ->> 'tipo',
             'obrigatoria', q -> 'obrigatoria',
             'opcoes', case when q ? 'opcoes' then (select jsonb_agg(btrim(x)) from jsonb_array_elements_text(q -> 'opcoes') x) end))
           order by o)
    into v_normal
    from jsonb_array_elements(p_perguntas) with ordinality as e(q, o);

  select id, versao_atual into v_p from public.avaliacoes_pesquisas where unidade_id = p_unidade_id for update;
  if not found then
    raise exception 'pesquisa_inexistente' using errcode = '22023';
  end if;
  select perguntas into v_atual from public.avaliacoes_pesquisa_versoes where pesquisa_id = v_p.id and versao = v_p.versao_atual;
  if v_atual = v_normal then
    return v_p.versao_atual;
  end if;
  insert into public.avaliacoes_pesquisa_versoes (pesquisa_id, versao, perguntas, criado_por)
  values (v_p.id, v_p.versao_atual + 1, v_normal, auth.uid());
  update public.avaliacoes_pesquisas set versao_atual = v_p.versao_atual + 1, atualizado_em = now() where id = v_p.id;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (p_unidade_id, auth.uid(), 'avaliacoes_salvar_perguntas', 'avaliacoes_pesquisa', v_p.id::text,
          jsonb_build_object('versao', v_p.versao_atual), jsonb_build_object('versao', v_p.versao_atual + 1, 'perguntas', v_normal));
  return v_p.versao_atual + 1;
end;
$$;
revoke all on function public.avaliacoes_salvar_perguntas(text, jsonb) from public, anon;
grant execute on function public.avaliacoes_salvar_perguntas(text, jsonb) to authenticated;

-- ══ 4. Gravação da avaliação: perguntas por tipo e respostas livres ══════
create or replace function public.avaliacoes_registrar(
  p_slug text,
  p_origem text,
  p_respostas jsonb,
  p_whatsapp text,
  p_consentimento boolean,
  p_termo_versao integer,
  p_armadilha text,
  p_decorrido_ms integer,
  p_hash_ip text,
  p_hash_dispositivo text,
  p_agora timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_perguntas jsonb;
  v_estrelas jsonb := '{}'::jsonb;
  v_extras jsonb := '{}'::jsonb;
  v_livre jsonb;
  v_chave text;
  v_nps smallint;
  v_espera text;
  v_pedido_certo boolean;
  v_atendente text;
  v_conheceu text;
  v_conheceu_outro text;
  v_comentario text;
  v_texto text;
  v_val jsonb;
  v_digitos text;
  v_whatsapp text;
  v_termo_texto text;
  v_baixa boolean;
  v_id uuid;
begin
  if p_armadilha is not null and btrim(p_armadilha) <> '' then
    return jsonb_build_object('ok', true, 'descartada', true);
  end if;
  if p_decorrido_ms is null or p_decorrido_ms < 4000 then
    return jsonb_build_object('ok', true, 'descartada', true);
  end if;
  if coalesce(p_hash_ip, '') !~ '^[0-9a-f]{64}$' or coalesce(p_hash_dispositivo, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'hash_invalido' using errcode = '22023';
  end if;
  if p_origem is null or p_origem not in ('salao', 'delivery', 'app') then
    return jsonb_build_object('ok', false, 'codigo', 'nao_encontrada');
  end if;

  select p.id, p.unidade_id, p.ativa, p.versao_atual, p.nome_exibido, p.alerta_vinculo_id, p.origens, p.atendentes into v_p
    from public.avaliacoes_pesquisas p
    join public.unidades u on u.id = p.unidade_id and u.ativo and u.avaliacoes_habilitado
    join public.organizacoes o on o.id = u.organizacao_id and o.ativo
   where p.slug = p_slug;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'nao_encontrada');
  end if;
  if not v_p.ativa or not (p_origem = any(v_p.origens)) then
    return jsonb_build_object('ok', false, 'codigo', 'encerrada');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('avaliacoes_registrar:' || v_p.id::text || ':' || p_hash_dispositivo, 0));
  if exists (select 1 from public.avaliacoes_respostas r
              where r.pesquisa_id = v_p.id and r.hash_dispositivo = p_hash_dispositivo
                and r.criado_em > p_agora - interval '30 minutes')
     or (select count(*) from public.avaliacoes_respostas r
          where r.pesquisa_id = v_p.id and r.hash_dispositivo = p_hash_dispositivo
            and r.criado_em > p_agora - interval '24 hours') >= 5
     or (select count(*) from public.avaliacoes_respostas r
          where r.pesquisa_id = v_p.id and r.hash_ip = p_hash_ip
            and r.criado_em > p_agora - interval '1 hour') >= 40
     or (select count(*) from public.avaliacoes_respostas r
          where r.pesquisa_id = v_p.id and r.hash_ip = p_hash_ip
            and r.criado_em > p_agora - interval '24 hours') >= 100
     or (select count(*) from public.avaliacoes_respostas r
          where r.pesquisa_id = v_p.id
            and r.criado_em > p_agora - interval '24 hours') >= 300 then
    return jsonb_build_object('ok', false, 'codigo', 'limite');
  end if;

  select perguntas into v_perguntas from public.avaliacoes_pesquisa_versoes where pesquisa_id = v_p.id and versao = v_p.versao_atual;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then
    return jsonb_build_object('ok', false, 'codigo', 'invalida');
  end if;

  -- Estrelas de 1 a 5 (obrigatórias quando valem nesta pesquisa).
  foreach v_chave in array array['atendimento', 'comida', 'tempo', 'ambiente', 'embalagem', 'entrega', 'atendimento_pedido'] loop
    if public.avaliacoes_pergunta_vale(v_perguntas, v_chave, p_origem) then
      v_val := p_respostas -> v_chave;
      if v_val is null or jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}') !~ '^[1-5]$' then
        return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', v_chave);
      end if;
      v_estrelas := v_estrelas || jsonb_build_object(v_chave, (v_val #>> '{}')::smallint);
    end if;
  end loop;
  if public.avaliacoes_pergunta_vale(v_perguntas, 'pedido_certo', p_origem) then
    v_val := p_respostas -> 'pedido_certo';
    if v_val is null or jsonb_typeof(v_val) <> 'boolean' then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'pedido_certo');
    end if;
    v_pedido_certo := (v_val #>> '{}')::boolean;
  end if;
  if public.avaliacoes_pergunta_vale(v_perguntas, 'espera', p_origem) then
    v_val := p_respostas -> 'espera';
    if v_val is null or jsonb_typeof(v_val) <> 'string'
       or (v_val #>> '{}') not in ('ate_15', 'de_15_a_30', 'de_30_a_45', 'mais_de_45') then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'espera');
    end if;
    v_espera := v_val #>> '{}';
  end if;
  if public.avaliacoes_pergunta_vale(v_perguntas, 'nps', p_origem) then
    v_val := p_respostas -> 'nps';
    if v_val is null or jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}') !~ '^([0-9]|10)$' then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'nps');
    end if;
    v_nps := (v_val #>> '{}')::smallint;
  end if;
  -- Opcionais.
  if public.avaliacoes_pergunta_vale(v_perguntas, 'atendente', p_origem) and cardinality(v_p.atendentes) > 0 then
    v_val := p_respostas -> 'atendente';
    if v_val is not null and jsonb_typeof(v_val) <> 'null' then
      if jsonb_typeof(v_val) <> 'string' or not ((v_val #>> '{}') = 'nao_lembro' or (v_val #>> '{}') = any(v_p.atendentes)) then
        return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'atendente');
      end if;
      v_atendente := v_val #>> '{}';
    end if;
  end if;
  if public.avaliacoes_pergunta_vale(v_perguntas, 'conheceu', p_origem) then
    v_val := p_respostas -> 'conheceu';
    if v_val is not null and jsonb_typeof(v_val) <> 'null' then
      if jsonb_typeof(v_val) <> 'string'
         or (v_val #>> '{}') not in ('instagram', 'google', 'ifood', 'indicacao', 'passando', 'ja_cliente', 'outro') then
        return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'conheceu');
      end if;
      v_conheceu := v_val #>> '{}';
      if v_conheceu = 'outro' and jsonb_typeof(p_respostas -> 'conheceu_outro') = 'string' then
        v_conheceu_outro := nullif(btrim(regexp_replace(p_respostas ->> 'conheceu_outro', '[\x01-\x1F\x7F]', ' ', 'g')), '');
        if char_length(v_conheceu_outro) > 80 then
          return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'conheceu');
        end if;
      end if;
    end if;
  end if;
  if public.avaliacoes_pergunta_vale(v_perguntas, 'comentario', p_origem) then
    v_val := p_respostas -> 'comentario';
    if v_val is not null and jsonb_typeof(v_val) = 'string' then
      v_comentario := nullif(btrim(regexp_replace(v_val #>> '{}', '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
      if char_length(v_comentario) > 1000 then
        return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'comentario');
      end if;
    elsif v_val is not null and jsonb_typeof(v_val) <> 'null' then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'comentario');
    end if;
  end if;

  -- Perguntas da gestão (14/11/2026).
  for v_livre in select q from jsonb_array_elements(v_perguntas) q where q ->> 'chave' ~ '^extra_[a-z0-9]{6}$' loop
    v_chave := v_livre ->> 'chave';
    if not public.avaliacoes_pergunta_vale(v_perguntas, v_chave, p_origem) then
      continue;
    end if;
    v_val := p_respostas -> v_chave;
    if v_val is null or jsonb_typeof(v_val) = 'null' or (jsonb_typeof(v_val) = 'string' and btrim(v_val #>> '{}') = '') then
      if coalesce((v_livre ->> 'obrigatoria')::boolean, false) then
        return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', v_chave);
      end if;
      continue;
    end if;
    case v_livre ->> 'tipo'
      when 'estrelas' then
        if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}') !~ '^[1-5]$' then
          return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', v_chave);
        end if;
        v_extras := v_extras || jsonb_build_object(v_chave, (v_val #>> '{}')::smallint);
      when 'simnao' then
        if jsonb_typeof(v_val) <> 'boolean' then
          return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', v_chave);
        end if;
        v_extras := v_extras || jsonb_build_object(v_chave, v_val);
      when 'escolha' then
        if jsonb_typeof(v_val) <> 'string' or not ((v_livre -> 'opcoes') ? (v_val #>> '{}')) then
          return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', v_chave);
        end if;
        v_extras := v_extras || jsonb_build_object(v_chave, v_val);
      else
        if jsonb_typeof(v_val) <> 'string' then
          return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', v_chave);
        end if;
        v_texto := nullif(btrim(regexp_replace(v_val #>> '{}', '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
        if char_length(v_texto) > 1000 then
          return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', v_chave);
        end if;
        if v_texto is not null then
          v_extras := v_extras || jsonb_build_object(v_chave, v_texto);
        end if;
    end case;
  end loop;

  -- WhatsApp: só com o consentimento marcado e o número preenchido. Guarda 55 + DDD + número.
  if coalesce(p_consentimento, false) and nullif(btrim(coalesce(p_whatsapp, '')), '') is not null then
    v_digitos := regexp_replace(p_whatsapp, '\D', '', 'g');
    if v_digitos ~ '^[1-9][0-9]{9,10}$' then
      v_digitos := '55' || v_digitos;
    end if;
    if v_digitos !~ '^55[1-9][0-9]{9,10}$' then
      return jsonb_build_object('ok', false, 'codigo', 'whatsapp_invalido');
    end if;
    v_termo_texto := public.avaliacoes_texto_termo(p_termo_versao, v_p.nome_exibido);
    if v_termo_texto is null then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'consentimento');
    end if;
    v_whatsapp := v_digitos;
  end if;

  v_baixa := exists (select 1 from jsonb_each_text(v_estrelas) e where e.value::smallint <= 2)
             or exists (select 1 from jsonb_each(v_extras) e where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::smallint <= 2)
             or coalesce(v_nps <= 6, false) or coalesce(v_pedido_certo = false, false);

  insert into public.avaliacoes_respostas (
    pesquisa_id, unidade_id, versao, origem, atendimento, comida, tempo, ambiente, embalagem, entrega, atendimento_pedido,
    pedido_certo, atendente, espera, nps, conheceu, conheceu_outro, comentario, extras,
    nota_baixa, whatsapp, consentimento_em, consentimento_versao, consentimento_texto, hash_ip, hash_dispositivo, criado_em
  ) values (
    v_p.id, v_p.unidade_id, v_p.versao_atual, p_origem,
    (v_estrelas ->> 'atendimento')::smallint, (v_estrelas ->> 'comida')::smallint, (v_estrelas ->> 'tempo')::smallint,
    (v_estrelas ->> 'ambiente')::smallint, (v_estrelas ->> 'embalagem')::smallint, (v_estrelas ->> 'entrega')::smallint,
    (v_estrelas ->> 'atendimento_pedido')::smallint,
    v_pedido_certo, v_atendente, v_espera, v_nps, v_conheceu,
    case when v_conheceu = 'outro' then v_conheceu_outro end, v_comentario,
    case when v_extras = '{}'::jsonb then null else v_extras end,
    v_baixa,
    v_whatsapp,
    case when v_whatsapp is not null then p_agora end,
    case when v_whatsapp is not null then p_termo_versao end,
    case when v_whatsapp is not null then v_termo_texto end,
    p_hash_ip, p_hash_dispositivo, p_agora
  ) returning id into v_id;

  if v_baixa and v_p.alerta_vinculo_id is not null then
    insert into public.avaliacoes_alertas (unidade_id, resposta_id, gerado_em) values (v_p.unidade_id, v_id, p_agora);
  end if;
  -- Roleta (13/11/2026): o id volta só quando a avaliação de app pode girar.
  if p_origem = 'app' and public.avaliacoes_roleta_valendo(v_p.unidade_id) then
    return jsonb_build_object('ok', true, 'respostaId', v_id);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.avaliacoes_registrar(text, text, jsonb, text, boolean, integer, text, integer, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.avaliacoes_registrar(text, text, jsonb, text, boolean, integer, text, integer, text, text, timestamptz)
  to service_role;
