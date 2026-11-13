-- Avaliações: três tipos de pesquisa (13/11/2026). Pedido de Vinícius: "uma pesquisa de consumo
-- no local, pesquisa de delivery direto, e outra de pesquisa pelas plataformas (ifood, 99 ou afim)
-- o cliente pode nao querer uma pra cada, mas eu gosto que tenha".
--   - origem nova 'app' (apps de entrega), além de 'salao' e 'delivery' (delivery próprio);
--   - avaliacoes_pesquisas.origens: quais tipos estão ligados. Nascem os três; a gestão desliga
--     o que não quiser (pelo menos um fica ligado). Tipo desligado responde "pausada".
-- Só acrescenta: pode rodar antes do merge sem quebrar o app no ar.

alter table public.avaliacoes_respostas drop constraint if exists avaliacoes_respostas_origem_check;
alter table public.avaliacoes_respostas add constraint avaliacoes_respostas_origem_check
  check (origem in ('salao', 'delivery', 'app'));

alter table public.avaliacoes_pesquisas
  add column if not exists origens text[] not null default array['salao', 'delivery', 'app']::text[];
alter table public.avaliacoes_pesquisas drop constraint if exists avaliacoes_pesquisas_origens_check;
alter table public.avaliacoes_pesquisas add constraint avaliacoes_pesquisas_origens_check
  check (cardinality(origens) between 1 and 3 and origens <@ array['salao', 'delivery', 'app']::text[]);

-- Liga e desliga os tipos de pesquisa. Mesma regra de quem edita a marca.
create or replace function public.avaliacoes_definir_origens(p_unidade_id text, p_origens text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes record;
  v_novas text[];
begin
  if not public.usuario_pode_usar_avaliacoes(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select coalesce(array_agg(o order by array_position(array['salao', 'delivery', 'app']::text[], o)), '{}')
    into v_novas
    from (select distinct unnest(coalesce(p_origens, '{}'::text[])) as o) x;
  if cardinality(v_novas) = 0 then
    raise exception 'origens_vazias' using errcode = '22023';
  end if;
  if not (v_novas <@ array['salao', 'delivery', 'app']::text[]) then
    raise exception 'pedido_invalido' using errcode = '22023';
  end if;
  select * into v_antes from public.avaliacoes_pesquisas where unidade_id = p_unidade_id for update;
  if not found then
    raise exception 'pesquisa_inexistente' using errcode = '22023';
  end if;
  update public.avaliacoes_pesquisas set origens = v_novas, atualizado_em = now() where id = v_antes.id;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (p_unidade_id, auth.uid(), 'avaliacoes_definir_origens', 'avaliacoes_pesquisa', v_antes.id::text,
          jsonb_build_object('origens', to_jsonb(v_antes.origens)), jsonb_build_object('origens', to_jsonb(v_novas)));
end;
$$;
revoke all on function public.avaliacoes_definir_origens(text, text[]) from public, anon;
grant execute on function public.avaliacoes_definir_origens(text, text[]) to authenticated;

-- A página pública passa a saber quais tipos estão ligados.
create or replace function public.avaliacoes_pesquisa_publica(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'slug', p.slug, 'nome', p.nome_exibido, 'corPrincipal', p.cor_principal, 'corFundo', p.cor_fundo,
           'logoPath', p.logo_path, 'agradecimento', p.texto_agradecimento, 'linkGoogle', p.link_google,
           'ativa', p.ativa, 'origens', to_jsonb(p.origens), 'versao', p.versao_atual, 'perguntas', v.perguntas,
           'termoVersao', t.versao, 'termoTexto', replace(t.modelo, '{restaurante}', p.nome_exibido))
    from public.avaliacoes_pesquisas p
    join public.unidades u on u.id = p.unidade_id and u.ativo and u.avaliacoes_habilitado
    join public.organizacoes o on o.id = u.organizacao_id and o.ativo
    join public.avaliacoes_pesquisa_versoes v on v.pesquisa_id = p.id and v.versao = p.versao_atual
    cross join lateral (select * from public.avaliacoes_termos order by versao desc limit 1) t
   where p.slug = p_slug;
$$;
revoke all on function public.avaliacoes_pesquisa_publica(text) from public, anon, authenticated;
grant execute on function public.avaliacoes_pesquisa_publica(text) to service_role;

-- Gravação aceita 'app' e recusa tipo desligado.
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
  v_atendimento smallint;
  v_comida smallint;
  v_nps smallint;
  v_espera text;
  v_conheceu text;
  v_conheceu_outro text;
  v_comentario text;
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

  select p.id, p.unidade_id, p.ativa, p.versao_atual, p.nome_exibido, p.alerta_vinculo_id, p.origens into v_p
    from public.avaliacoes_pesquisas p
    join public.unidades u on u.id = p.unidade_id and u.ativo and u.avaliacoes_habilitado
    join public.organizacoes o on o.id = u.organizacao_id and o.ativo
   where p.slug = p_slug;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'nao_encontrada');
  end if;
  if not v_p.ativa then
    return jsonb_build_object('ok', false, 'codigo', 'encerrada');
  end if;
  -- Tipo de pesquisa desligado pela gestão: o QR dele mostra pausa (13/11/2026).
  if not (p_origem = any(v_p.origens)) then
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
     -- Revisão de 12/11: o aparelho é informado pelo navegador e dá para trocar a cada envio. O
     -- hash do IP (IPv6 já reduzido ao /64 no servidor) também tem teto por dia, e a pesquisa
     -- inteira tem teto de 300 por 24 h, para um script não encher o painel nem os alertas.
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

  -- Notas de 1 a 5 (obrigatórias quando ativas).
  if public.avaliacoes_pergunta_ativa(v_perguntas, 'atendimento') then
    v_val := p_respostas -> 'atendimento';
    if v_val is null or jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}') !~ '^[1-5]$' then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'atendimento');
    end if;
    v_atendimento := (v_val #>> '{}')::smallint;
  end if;
  if public.avaliacoes_pergunta_ativa(v_perguntas, 'comida') then
    v_val := p_respostas -> 'comida';
    if v_val is null or jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}') !~ '^[1-5]$' then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'comida');
    end if;
    v_comida := (v_val #>> '{}')::smallint;
  end if;
  if public.avaliacoes_pergunta_ativa(v_perguntas, 'espera') then
    v_val := p_respostas -> 'espera';
    if v_val is null or jsonb_typeof(v_val) <> 'string'
       or (v_val #>> '{}') not in ('ate_15', 'de_15_a_30', 'de_30_a_45', 'mais_de_45') then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'espera');
    end if;
    v_espera := v_val #>> '{}';
  end if;
  if public.avaliacoes_pergunta_ativa(v_perguntas, 'nps') then
    v_val := p_respostas -> 'nps';
    if v_val is null or jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}') !~ '^([0-9]|10)$' then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'nps');
    end if;
    v_nps := (v_val #>> '{}')::smallint;
  end if;
  -- Opcionais.
  if public.avaliacoes_pergunta_ativa(v_perguntas, 'conheceu') then
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
  if public.avaliacoes_pergunta_ativa(v_perguntas, 'comentario') then
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

  v_baixa := coalesce(v_atendimento <= 2, false) or coalesce(v_comida <= 2, false) or coalesce(v_nps <= 6, false);

  insert into public.avaliacoes_respostas (
    pesquisa_id, unidade_id, versao, origem, atendimento, comida, espera, nps, conheceu, conheceu_outro, comentario,
    nota_baixa, whatsapp, consentimento_em, consentimento_versao, consentimento_texto, hash_ip, hash_dispositivo, criado_em
  ) values (
    v_p.id, v_p.unidade_id, v_p.versao_atual, p_origem, v_atendimento, v_comida, v_espera, v_nps, v_conheceu,
    case when v_conheceu = 'outro' then v_conheceu_outro end, v_comentario, v_baixa,
    v_whatsapp,
    case when v_whatsapp is not null then p_agora end,
    case when v_whatsapp is not null then p_termo_versao end,
    case when v_whatsapp is not null then v_termo_texto end,
    p_hash_ip, p_hash_dispositivo, p_agora
  ) returning id into v_id;

  if v_baixa and v_p.alerta_vinculo_id is not null then
    insert into public.avaliacoes_alertas (unidade_id, resposta_id, gerado_em) values (v_p.unidade_id, v_id, p_agora);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.avaliacoes_registrar(text, text, jsonb, text, boolean, integer, text, integer, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.avaliacoes_registrar(text, text, jsonb, text, boolean, integer, text, integer, text, text, timestamptz)
  to service_role;
