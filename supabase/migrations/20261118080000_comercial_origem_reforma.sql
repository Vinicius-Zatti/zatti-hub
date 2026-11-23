-- Comercial: origem nova "Raio-X da Reforma" (pedido de 18/11/2026).
--   - os leads da calculadora Raio-X da Reforma do site chegam pelo Vini com
--     lead.origem = 'reforma' e viravam 'outra' porque o CRM não aceitava a
--     origem; agora entram como 'reforma' (rótulo "Raio-X da Reforma" em
--     src/lib/comercial/funil.ts);
--   - a entrada do Vini (zh_leads_registrar_evento) e o cadastro na tela
--     (zh_leads_inserir_lead) aceitam a origem nova; origem desconhecida
--     continua virando 'outra';
--   - lead que já existe mantém a origem dele (a única troca continua sendo
--     'outra' -> 'prospeccao_fria', da 20261116230000).
-- Funções recriadas a partir da 20261116230000 (a mais recente que as define),
-- com só a lista de origens alterada. Nada é apagado.
begin;

-- ── Origem nova (troca o check da migração 20261116230000) ─────────────────
alter table public.zh_leads drop constraint if exists zh_leads_origem_check;
alter table public.zh_leads add constraint zh_leads_origem_check check (origem in
  ('instagram', 'whatsapp', 'ligacao', 'site', 'indicacao', 'teste', 'prospeccao_fria', 'reforma', 'outra'));

-- ── Cadastro de um lead (tela e importação): aceita a origem nova ──────────
-- Sem grant: só as funções do Comercial chamam. Não sobrescreve lead existente
-- (mesmo WhatsApp ou mesmo @): devolve {lead_id, existente: true}.
create or replace function public.zh_leads_inserir_lead(p_lead jsonb, p_autor text, p_texto text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_whats text := nullif(public.zh_leads_normalizar_whatsapp(p_lead->>'whatsapp'), '');
  v_insta text := public.zh_leads_normalizar_instagram(p_lead->>'instagram');
  v_etapa text := coalesce(nullif(p_lead->>'etapa', ''), 'comecar_a_seguir');
  v_origem text := lower(coalesce(nullif(p_lead->>'origem', ''), 'instagram'));
  v_delivery text := lower(coalesce(p_lead->>'vende_delivery', ''));
  v_id uuid;
begin
  if v_whats is not null and v_whats !~ '^[0-9]{10,11}$' then
    raise exception 'WhatsApp invalido' using errcode = '22023';
  end if;
  if v_insta is not null and v_insta !~ '^[a-z0-9._]{1,30}$' then
    raise exception 'Instagram invalido' using errcode = '22023';
  end if;
  if v_whats is null and v_insta is null then
    raise exception 'Informe WhatsApp ou Instagram' using errcode = '22023';
  end if;
  if public.zh_leads_ordem_etapa(v_etapa) is null or v_etapa = 'perdido' then
    raise exception 'Etapa invalida' using errcode = '22023';
  end if;
  if v_origem not in ('instagram', 'whatsapp', 'ligacao', 'site', 'indicacao', 'teste', 'prospeccao_fria', 'reforma', 'outra') then
    v_origem := 'outra';
  end if;
  if v_delivery not in ('', 'ifood', 'proprio', 'nao') then
    raise exception 'Delivery invalido' using errcode = '22023';
  end if;

  select l.id into v_id from public.zh_leads l
  where (v_whats is not null and l.whatsapp = v_whats) or (v_insta is not null and l.instagram = v_insta)
  limit 1;
  if v_id is not null then
    return jsonb_build_object('lead_id', v_id, 'existente', true);
  end if;

  insert into public.zh_leads (
    whatsapp, instagram, nome, negocio, origem, etapa, cidade_bairro, seguidores, ultimo_post_em,
    nota_google, avaliacoes_google, vende_delivery
  ) values (
    v_whats,
    v_insta,
    coalesce(nullif(left(trim(p_lead->>'nome'), 80), ''), '@' || v_insta, 'Sem nome'),
    left(trim(coalesce(p_lead->>'negocio', '')), 80),
    v_origem,
    v_etapa,
    left(trim(coalesce(p_lead->>'cidade_bairro', '')), 120),
    nullif(p_lead->>'seguidores', '')::integer,
    nullif(p_lead->>'ultimo_post_em', '')::date,
    nullif(p_lead->>'nota_google', '')::numeric(2, 1),
    nullif(p_lead->>'avaliacoes_google', '')::integer,
    v_delivery
  )
  returning id into v_id;

  insert into public.zh_leads_eventos (lead_id, tipo, para_etapa, texto, autor)
  values (v_id, 'criado', v_etapa, left(coalesce(p_texto, ''), 1000), p_autor);

  return jsonb_build_object('lead_id', v_id, 'existente', false);
end;
$$;

-- ── Entrada do Vini: aceita a origem nova ─────────────────────────────────
-- p_evento: {chave, tipo: formulario|pagamento|etapa, em?, lead: {whatsapp?, instagram?, origem?, ...},
--            pagamento?: {produto: livro|zatti-hub, valor, pagamento_id}, para_etapa?, texto?}
create or replace function public.zh_leads_registrar_evento(p_token text, p_evento jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chave text := nullif(trim(p_evento->>'chave'), '');
  v_tipo text := p_evento->>'tipo';
  v_em timestamptz := coalesce((p_evento->>'em')::timestamptz, now());
  v_lead jsonb := coalesce(p_evento->'lead', '{}'::jsonb);
  v_whats text;
  v_insta text;
  v_origem text;
  v_existente public.zh_leads%rowtype;
  v_lead_id uuid;
  v_novo boolean := false;
  v_alvo text;
  v_tipo_evento text;
  v_produto text := '';
  v_valor numeric(12, 2);
  v_pagamento_id text;
  v_acao text;
  v_acao_em date;
  v_evento_id uuid;
begin
  if p_token is null or char_length(p_token) < 32 or not exists (
    select 1 from public.zh_leads_segredos s
    where s.chave = 'vini_eventos' and s.ativo
      and s.valor = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
  ) then
    raise exception 'Nao autorizado' using errcode = '42501';
  end if;

  if v_chave is null or length(v_chave) > 120 then
    raise exception 'Evento sem chave' using errcode = '22023';
  end if;
  if v_tipo not in ('formulario', 'pagamento', 'etapa') then
    raise exception 'Tipo de evento invalido' using errcode = '22023';
  end if;

  -- Reenvio do mesmo evento: devolve o que já existe, sem gravar de novo.
  select e.id, e.lead_id into v_evento_id, v_lead_id
  from public.zh_leads_eventos e where e.chave_externa = v_chave;
  if v_evento_id is not null then
    return jsonb_build_object('ok', true, 'repetido', true, 'lead_id', v_lead_id, 'evento_id', v_evento_id);
  end if;

  v_whats := nullif(public.zh_leads_normalizar_whatsapp(v_lead->>'whatsapp'), '');
  v_insta := public.zh_leads_normalizar_instagram(v_lead->>'instagram');
  if v_whats is not null and v_whats !~ '^[0-9]{10,11}$' then
    raise exception 'WhatsApp invalido' using errcode = '22023';
  end if;
  if v_insta is not null and v_insta !~ '^[a-z0-9._]{1,30}$' then
    raise exception 'Instagram invalido' using errcode = '22023';
  end if;
  if v_whats is null and v_insta is null then
    raise exception 'WhatsApp invalido' using errcode = '22023';
  end if;
  v_origem := lower(coalesce(nullif(v_lead->>'origem', ''), 'site'));
  if v_origem not in ('instagram', 'whatsapp', 'ligacao', 'site', 'indicacao', 'teste', 'prospeccao_fria', 'reforma') then
    v_origem := 'outra';
  end if;

  -- Etapa que o evento pede.
  if v_tipo = 'formulario' then
    v_alvo := 'preencheu_formulario';
    v_produto := left(coalesce(v_lead->>'produto', ''), 80);
  elsif v_tipo = 'pagamento' then
    v_produto := coalesce(p_evento->'pagamento'->>'produto', '');
    if v_produto not in ('livro', 'zatti-hub') then
      raise exception 'Produto de pagamento invalido' using errcode = '22023';
    end if;
    v_alvo := case v_produto when 'livro' then 'comprou_livro' else 'comprou_app' end;
    v_valor := (p_evento->'pagamento'->>'valor')::numeric(12, 2);
    v_pagamento_id := nullif(p_evento->'pagamento'->>'pagamento_id', '');
  else
    v_alvo := p_evento->>'para_etapa';
    if v_alvo is null or v_alvo not in ('comecar_a_seguir', 'mandar_primeira_mensagem', 'abordado', 'respondeu', 'link_enviado') then
      raise exception 'Etapa invalida para o Vini' using errcode = '22023';
    end if;
  end if;

  -- Primeiro pelo WhatsApp; se não achar, pelo Instagram.
  if v_whats is not null then
    select * into v_existente from public.zh_leads l where l.whatsapp = v_whats for update;
  end if;
  if v_existente.id is null and v_insta is not null then
    select * into v_existente from public.zh_leads l where l.instagram = v_insta for update;
  end if;

  if v_existente.id is null then
    v_novo := true;
    insert into public.zh_leads (
      whatsapp, instagram, nome, negocio, origem, produto_interesse, etapa,
      faturamento_atual, faturamento_desejado, dificuldade, criado_em, etapa_desde, ultimo_evento_em
    ) values (
      v_whats,
      v_insta,
      coalesce(nullif(left(trim(v_lead->>'nome'), 80), ''), 'Sem nome'),
      left(coalesce(v_lead->>'negocio', ''), 80),
      v_origem,
      left(coalesce(v_lead->>'produto', v_produto), 80),
      v_alvo,
      left(coalesce(v_lead->>'faturamento_atual', v_lead->>'faturamento', ''), 40),
      left(coalesce(v_lead->>'faturamento_desejado', ''), 40),
      left(coalesce(v_lead->>'dificuldade', ''), 500),
      v_em, v_em, v_em
    )
    returning * into v_existente;
    v_tipo_evento := case v_tipo when 'formulario' then 'formulario' when 'pagamento' then 'pagamento' else 'etapa' end;
  else
    -- Nada é sobrescrito: só completa campo vazio e avança etapa se for para frente.
    -- Exceção (16/11): 'outra' é a origem de reserva; a prospecção fria a substitui.
    update public.zh_leads l set
      origem = case when l.origem = 'outra' and v_origem = 'prospeccao_fria' then v_origem else l.origem end,
      whatsapp = coalesce(l.whatsapp, v_whats),
      instagram = case when l.instagram is null and v_insta is not null and not exists (
          select 1 from public.zh_leads o where o.instagram = v_insta and o.id <> l.id)
        then v_insta else l.instagram end,
      negocio = case when l.negocio = '' then left(coalesce(v_lead->>'negocio', ''), 80) else l.negocio end,
      faturamento_atual = case when l.faturamento_atual = ''
        then left(coalesce(v_lead->>'faturamento_atual', v_lead->>'faturamento', ''), 40) else l.faturamento_atual end,
      faturamento_desejado = case when l.faturamento_desejado = ''
        then left(coalesce(v_lead->>'faturamento_desejado', ''), 40) else l.faturamento_desejado end,
      dificuldade = case when l.dificuldade = '' then left(coalesce(v_lead->>'dificuldade', ''), 500) else l.dificuldade end,
      ultimo_evento_em = greatest(l.ultimo_evento_em, v_em)
    where l.id = v_existente.id;

    if v_tipo = 'formulario' then
      v_tipo_evento := 'nova_tentativa';
    elsif v_tipo = 'pagamento' then
      v_tipo_evento := case when exists (
        select 1 from public.zh_leads_eventos e
        where e.lead_id = v_existente.id and e.tipo in ('pagamento', 'comprou_de_novo')
      ) then 'comprou_de_novo' else 'pagamento' end;
    else
      v_tipo_evento := 'etapa';
    end if;
  end if;

  v_lead_id := v_existente.id;

  -- Avanço de etapa: nunca para trás; perdido volta ao funil com novo formulário ou compra.
  if v_novo or v_existente.etapa = 'perdido'
     or public.zh_leads_ordem_etapa(v_alvo) > public.zh_leads_ordem_etapa(v_existente.etapa) then
    if v_tipo = 'pagamento' then
      v_acao := case v_alvo
        when 'comprou_livro' then 'Oferecer o Zatti Hub (12x de R$59,90)'
        else 'Oferecer a consultoria; se não fechar, acompanhamento mensal de R$497' end;
      v_acao_em := (v_em at time zone 'America/Sao_Paulo')::date + case v_alvo when 'comprou_livro' then 3 else 14 end;
    elsif v_tipo = 'formulario' then
      v_acao := case when v_produto ilike '%consultoria%'
        then 'Chamar no WhatsApp e marcar a reunião de diagnóstico'
        else 'Ver se concluiu o pagamento; se não, chamar no WhatsApp hoje' end;
      v_acao_em := (v_em at time zone 'America/Sao_Paulo')::date;
    end if;
    update public.zh_leads l set
      etapa = v_alvo,
      etapa_desde = case when v_novo then l.etapa_desde else v_em end,
      motivo_perda = '',
      proxima_acao = coalesce(v_acao, l.proxima_acao),
      proxima_acao_em = case when v_acao is null then l.proxima_acao_em else v_acao_em end
    where l.id = v_lead_id;
  end if;

  insert into public.zh_leads_eventos (
    lead_id, chave_externa, em, tipo, de_etapa, para_etapa, produto, valor, pagamento_id, texto, dados, autor
  ) values (
    v_lead_id, v_chave, v_em, v_tipo_evento,
    case when v_novo then null else v_existente.etapa end,
    (select l.etapa from public.zh_leads l where l.id = v_lead_id),
    left(v_produto, 80), v_valor, v_pagamento_id,
    left(coalesce(p_evento->>'texto', ''), 1000),
    case when v_tipo = 'formulario' then
      jsonb_strip_nulls(jsonb_build_object(
        'nome', left(v_lead->>'nome', 80), 'negocio', left(v_lead->>'negocio', 80),
        'origem', v_origem, 'pagina', left(v_lead->>'pagina', 80),
        'faturamento_atual', left(coalesce(v_lead->>'faturamento_atual', v_lead->>'faturamento'), 40),
        'faturamento_desejado', left(v_lead->>'faturamento_desejado', 40),
        'dificuldade', left(v_lead->>'dificuldade', 500)))
      else '{}'::jsonb end,
    case when v_tipo = 'etapa' then 'sdr' when v_tipo = 'formulario' then 'site' else 'vini' end
  )
  returning id into v_evento_id;

  return jsonb_build_object('ok', true, 'repetido', false, 'novo_lead', v_novo, 'lead_id', v_lead_id, 'evento_id', v_evento_id);
end;
$$;

-- Mesmos grants da 20261116230000 (create or replace mantém os da produção,
-- inclusive o revoke do vini_operador da 20261109230000).
revoke all on function public.zh_leads_inserir_lead(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.zh_leads_registrar_evento(text, jsonb) from public;
grant execute on function public.zh_leads_registrar_evento(text, jsonb) to anon, authenticated;

commit;
