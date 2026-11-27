-- Comercial: pagamento do Mini Expert iFood e do Diagnóstico de Delivery, e rastreio de anúncio (26/11/2026).
-- No lançamento do Mini Expert iFood, a zh_leads_registrar_evento só aceitava pagamento de 'livro' e 'zatti-hub':
-- o Vini manda 'raio-x-delivery' (Mini Expert iFood, R$ 47) e 'diagnostico-delivery' (Diagnóstico de Delivery,
-- R$ 47,90), o Hub respondia 400 e o Vini descartava o evento. E o campo `rastreio` (UTMs, clique e cookies da Meta,
-- página e event_id do Pixel) que o Vini passou a mandar era ignorado.
--   - etapas novas 'comprou_raio_x' ("Comprou Mini Expert", o id do produto continua raio-x-delivery) e
--     'comprou_diagnostico' ("Comprou diagnóstico"), entre 'comprou_livro' e 'comprou_app' (produtos de entrada; a
--     mesma ordem de src/lib/comercial/funil.ts). Compra nunca rebaixa: quem já está em comprou_app fica;
--   - próxima ação: Mini Expert -> oferecer o Zatti Hub no 7º dia (roteiro dia 0/3/7 do comprador, vault
--     _conhecimento/zatti/mini-expert-ifood-sdr.md); Diagnóstico -> conferir no mesmo dia se a loja liberou o acesso
--     no Portal do Parceiro do iFood (vini src/zatti/diagnostico-delivery.js);
--   - `rastreio`: só os campos conhecidos, strings no formato esperado (o mesmo de rastreio-anuncio.js do Vini);
--     campo estranho ou fora do formato é descartado em silêncio, nunca derruba o evento (um pagamento não se perde
--     por causa de uma UTM). Fica inteiro em zh_leads_eventos.dados.rastreio;
--   - zh_leads.rastreio (novo): a origem do anúncio do primeiro toque (só UTMs e página, sem clique nem cookie),
--     gravada uma vez e nunca sobrescrita;
--   - zh_leads_registrar_negociacao recriada (cópia da 20261118130000) só para reconhecer a sugestão nova da ficha
--     como ação automática.
-- Nada é apagado. Funções recriadas a partir da 20261118080000 / 20261118130000.
begin;

-- ── Etapas novas (troca o check da 20261008120000) ────────────────────────
alter table public.zh_leads drop constraint if exists zh_leads_etapa_check;
alter table public.zh_leads add constraint zh_leads_etapa_check check (etapa in
  ('comecar_a_seguir', 'mandar_primeira_mensagem', 'abordado', 'respondeu', 'link_enviado',
   'preencheu_formulario', 'comprou_livro', 'comprou_raio_x', 'comprou_diagnostico', 'comprou_app',
   'em_acompanhamento', 'reuniao_diagnostico', 'consultoria_fechada', 'perdido'));

-- ── Ordem do funil (a mesma de src/lib/comercial/funil.ts) ──────────────────
-- Só serve para comparar (nenhum número é guardado), então renumerar é seguro.
create or replace function public.zh_leads_ordem_etapa(p_etapa text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_etapa
    when 'comecar_a_seguir' then 1 when 'mandar_primeira_mensagem' then 2 when 'abordado' then 3
    when 'respondeu' then 4 when 'link_enviado' then 5 when 'preencheu_formulario' then 6
    when 'comprou_livro' then 7 when 'comprou_raio_x' then 8 when 'comprou_diagnostico' then 9
    when 'comprou_app' then 10 when 'em_acompanhamento' then 11
    when 'reuniao_diagnostico' then 12 when 'consultoria_fechada' then 13
    when 'perdido' then 0 else null end;
$$;

-- ── Origem do anúncio no lead (primeiro toque) ─────────────────────────────
alter table public.zh_leads add column if not exists rastreio jsonb;
alter table public.zh_leads drop constraint if exists zh_leads_rastreio_check;
alter table public.zh_leads add constraint zh_leads_rastreio_check check (
  rastreio is null or (jsonb_typeof(rastreio) = 'object' and octet_length(rastreio::text) <= 4000));

-- ── Rastreio de anúncio: só campos conhecidos, no formato esperado ─────────
-- Devolve null quando não sobra nenhum campo. Sem grant: só as funções do Comercial chamam.
create or replace function public.zh_leads_limpar_rastreio(p_rastreio jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_saida jsonb := '{}'::jsonb;
  v_campo text;
  v_valor text;
  v_formato text;
  v_maximo integer;
begin
  if p_rastreio is null or jsonb_typeof(p_rastreio) <> 'object' then
    return null;
  end if;
  -- Tamanho conferido à parte: o regex do Postgres não aceita repetição acima de {255}.
  for v_campo, v_formato, v_maximo in
    select c.campo, c.formato, c.maximo from (values
      ('utm_source', '^[^[:cntrl:]<>"]+$', 150),
      ('utm_medium', '^[^[:cntrl:]<>"]+$', 150),
      ('utm_campaign', '^[^[:cntrl:]<>"]+$', 150),
      ('utm_content', '^[^[:cntrl:]<>"]+$', 150),
      ('utm_term', '^[^[:cntrl:]<>"]+$', 150),
      ('fbclid', '^[A-Za-z0-9_-]+$', 500),
      ('fbc', '^fb\.[0-9]\.[0-9]{10,13}\.[A-Za-z0-9_-]+$', 530),
      ('fbp', '^fb\.[0-9]\.[0-9]{10,13}\.[0-9]{1,20}$', 40),
      -- Só página https do site (o Vini já confere; aqui é a segunda barreira).
      ('pagina_url', '^https://(www\.)?zatticonsultoria\.com\.br(/[^[:space:][:cntrl:]<>"]*)?$', 500),
      ('event_id_lead', '^[A-Za-z0-9._:-]+$', 100),
      ('event_id_checkout', '^[A-Za-z0-9._:-]+$', 100)
    ) as c(campo, formato, maximo)
  loop
    if jsonb_typeof(p_rastreio->v_campo) = 'string' then
      v_valor := btrim(p_rastreio->>v_campo);
      if char_length(v_valor) between 1 and v_maximo and v_valor ~ v_formato then
        v_saida := v_saida || jsonb_build_object(v_campo, v_valor);
      end if;
    end if;
  end loop;
  return case when v_saida = '{}'::jsonb then null else v_saida end;
end;
$$;
revoke all on function public.zh_leads_limpar_rastreio(jsonb) from public, anon, authenticated;

-- ── Entrada do Vini: Mini Expert, Diagnóstico e rastreio ───────────────────
-- p_evento: {chave, tipo: formulario|pagamento|etapa, em?, lead: {whatsapp?, instagram?, origem?, ...},
--            pagamento?: {produto: livro|zatti-hub|raio-x-delivery|diagnostico-delivery, valor, pagamento_id},
--            rastreio?: {utm_source?, utm_medium?, utm_campaign?, utm_content?, utm_term?, fbclid?, fbc?, fbp?,
--                        pagina_url?, event_id_lead?, event_id_checkout?}, para_etapa?, texto?}
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
  v_rastreio jsonb := public.zh_leads_limpar_rastreio(p_evento->'rastreio');
  v_anuncio jsonb;
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

  -- Origem do anúncio que fica no lead: só UTMs e página (clique e cookies da Meta ficam só no evento).
  v_anuncio := (select jsonb_object_agg(r.key, r.value) from jsonb_each(coalesce(v_rastreio, '{}'::jsonb)) r
    where r.key in ('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'pagina_url'));
  if v_anuncio is not null then
    v_anuncio := v_anuncio || jsonb_build_object('em', v_em);
  end if;

  -- Etapa que o evento pede.
  if v_tipo = 'formulario' then
    v_alvo := 'preencheu_formulario';
    v_produto := left(coalesce(v_lead->>'produto', ''), 80);
  elsif v_tipo = 'pagamento' then
    v_produto := coalesce(p_evento->'pagamento'->>'produto', '');
    if v_produto not in ('livro', 'zatti-hub', 'raio-x-delivery', 'diagnostico-delivery') then
      raise exception 'Produto de pagamento invalido' using errcode = '22023';
    end if;
    v_alvo := case v_produto
      when 'livro' then 'comprou_livro'
      when 'raio-x-delivery' then 'comprou_raio_x'
      when 'diagnostico-delivery' then 'comprou_diagnostico'
      else 'comprou_app' end;
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
      faturamento_atual, faturamento_desejado, dificuldade, criado_em, etapa_desde, ultimo_evento_em, rastreio
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
      v_em, v_em, v_em,
      v_anuncio
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
      rastreio = coalesce(l.rastreio, v_anuncio), -- primeiro toque: gravado uma vez, nunca sobrescrito
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
        when 'comprou_raio_x' then 'Oferecer o Zatti Hub (12x de R$59,90)'
        when 'comprou_diagnostico' then 'Conferir se a loja liberou o acesso no Portal do Parceiro do iFood'
        else 'Oferecer a consultoria; se não fechar, acompanhamento mensal de R$497' end;
      v_acao_em := (v_em at time zone 'America/Sao_Paulo')::date + case v_alvo
        when 'comprou_livro' then 3 when 'comprou_raio_x' then 7 when 'comprou_diagnostico' then 0 else 14 end;
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
      else '{}'::jsonb end
      || jsonb_strip_nulls(jsonb_build_object('rastreio', v_rastreio)),
    case when v_tipo = 'etapa' then 'sdr' when v_tipo = 'formulario' then 'site' else 'vini' end
  )
  returning id into v_evento_id;

  return jsonb_build_object('ok', true, 'repetido', false, 'novo_lead', v_novo, 'lead_id', v_lead_id, 'evento_id', v_evento_id);
end;
$$;

-- p_evento: {chave, tipo: 'negociacao', em?, lead: {whatsapp? | instagram?}, reuniao_em: 'AAAA-MM-DD',
--            proxima_acao, proxima_acao_em?: 'AAAA-MM-DD', texto?}
create or replace function public.zh_leads_registrar_negociacao(p_token text, p_evento jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chave text := nullif(trim(p_evento->>'chave'), '');
  v_em timestamptz := coalesce((p_evento->>'em')::timestamptz, now());
  v_lead jsonb := coalesce(p_evento->'lead', '{}'::jsonb);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_reuniao date := (p_evento->>'reuniao_em')::date;
  v_acao text := nullif(trim(coalesce(p_evento->>'proxima_acao', '')), '');
  v_acao_em date := (p_evento->>'proxima_acao_em')::date;
  v_whats text;
  v_insta text;
  v_existente public.zh_leads%rowtype;
  v_evento_id uuid;
  v_lead_id uuid;
  v_acao_automatica boolean;
begin
  -- Mesma validação de token da zh_leads_registrar_evento.
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
  if coalesce(p_evento->>'tipo', '') <> 'negociacao' then
    raise exception 'Tipo de evento invalido' using errcode = '22023';
  end if;
  if jsonb_typeof(v_lead) <> 'object' then
    raise exception 'Evento invalido' using errcode = '22023';
  end if;
  -- A reunião já aconteceu e é recente: o Vini só move depois da reunião, nunca antes.
  if v_reuniao is null or v_reuniao > v_hoje or v_reuniao < v_hoje - 60 then
    raise exception 'Data da reuniao invalida' using errcode = '22023';
  end if;
  if v_acao is null or char_length(v_acao) > 300 then
    raise exception 'Proxima acao invalida' using errcode = '22023';
  end if;
  if v_acao_em is not null and (v_acao_em < v_reuniao or v_acao_em > v_hoje + 60) then
    raise exception 'Prazo da proxima acao invalido' using errcode = '22023';
  end if;
  v_em := least(v_em, now()); -- etapa_desde nunca no futuro

  -- Reenvio da mesma chave: devolve o que já existe, sem gravar de novo.
  select e.id, e.lead_id into v_evento_id, v_lead_id
  from public.zh_leads_eventos e where e.chave_externa = v_chave;
  if v_evento_id is not null then
    return jsonb_build_object('ok', true, 'repetido', true, 'lead_id', v_lead_id);
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
    raise exception 'Informe WhatsApp ou Instagram' using errcode = '22023';
  end if;

  -- Pelo WhatsApp com DDD + 8 últimos dígitos (bate com e sem o nono dígito, como o SDR); se não achar, pelo @.
  if v_whats is not null then
    select * into v_existente from public.zh_leads l
    where l.whatsapp is not null and left(l.whatsapp, 2) || right(l.whatsapp, 8) = left(v_whats, 2) || right(v_whats, 8)
    order by l.ultimo_evento_em desc -- mesmo desempate da leitura do SDR (estagio-lead.js)
    limit 1
    for update;
  end if;
  if v_existente.id is null and v_insta is not null then
    select * into v_existente from public.zh_leads l where l.instagram = v_insta for update;
  end if;
  if v_existente.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_lead');
  end if;

  -- Ação que o sistema escreveu sozinho (pode ser trocada); qualquer outra é de Vinícius e fica.
  v_acao_automatica := v_existente.proxima_acao = ''
    or v_existente.proxima_acao like 'Ver se concluiu o pagamento%'
    or v_existente.proxima_acao = 'Chamar no WhatsApp e marcar a reunião de diagnóstico'
    or v_existente.proxima_acao like 'Oferecer o Zatti Hub%'
    or v_existente.proxima_acao like 'Oferecer a consultoria%'
    or v_existente.proxima_acao like 'Registrar o combinado da reunião%'
    or v_existente.proxima_acao like 'Conferir se a loja liberou o acesso%'
    -- Sugestões da etapa que a ficha já traz preenchidas (SUGESTAO_ETAPA em src/lib/comercial/funil.ts; o teste
    -- conversa.test.ts confere que as duas listas batem).
    or v_existente.proxima_acao in (
      'Seguir o perfil no Instagram e passar para Mandar primeira mensagem',
      'Mandar a primeira mensagem curta pelo Direct, sem link',
      'Esperar resposta; retomar no 2º dia',
      'Mandar o link da página com a origem do canal',
      'Ver se abriu o link; retomar em 2 dias',
      'Ver se concluiu o pagamento; se não, chamar no WhatsApp hoje',
      'Oferecer o Zatti Hub (12x de R$59,90)',
      'Oferecer a consultoria; se não fechar, acompanhamento mensal de R$497',
      'Conferir se a loja liberou o acesso no Portal do Parceiro do iFood',
      'Leitura do mês e oferecer a consultoria',
      'Mandar a proposta da consultoria',
      'Marcar ''Virou cliente'' e iniciar o acompanhamento',
      'Nutrição: voltar a falar num novo ciclo');

  if v_existente.etapa in ('consultoria_fechada', 'perdido')
     or (v_existente.etapa = 'reuniao_diagnostico' and not v_acao_automatica) then
    return jsonb_build_object('ok', true, 'mudou', false, 'etapa', v_existente.etapa, 'lead_id', v_existente.id);
  end if;

  update public.zh_leads l set
    etapa = 'reuniao_diagnostico',
    etapa_desde = case when l.etapa = 'reuniao_diagnostico' then l.etapa_desde else v_em end,
    motivo_perda = '',
    proxima_acao = case when v_acao_automatica then left(v_acao, 300) else l.proxima_acao end,
    proxima_acao_em = case when v_acao_automatica then v_acao_em else l.proxima_acao_em end,
    ultimo_evento_em = greatest(l.ultimo_evento_em, v_em)
  where l.id = v_existente.id;

  insert into public.zh_leads_eventos (lead_id, chave_externa, em, tipo, de_etapa, para_etapa, texto, dados, autor)
  values (
    v_existente.id, v_chave, v_em,
    case when v_existente.etapa = 'reuniao_diagnostico' then 'proxima_acao' else 'etapa' end,
    v_existente.etapa, 'reuniao_diagnostico',
    left(coalesce(nullif(p_evento->>'texto', ''), 'Reunião de diagnóstico feita em ' || to_char(v_reuniao, 'DD/MM')), 1000),
    jsonb_strip_nulls(jsonb_build_object('reuniao_em', v_reuniao,
      'proxima_acao', case when v_acao_automatica then left(v_acao, 300) else v_existente.proxima_acao end,
      'proxima_acao_em', case when v_acao_automatica then v_acao_em else v_existente.proxima_acao_em end,
      'proxima_acao_anterior', nullif(v_existente.proxima_acao, ''))),
    'sdr'
  )
  on conflict (chave_externa) do nothing;

  return jsonb_build_object('ok', true, 'mudou', true, 'de_etapa', v_existente.etapa, 'etapa', 'reuniao_diagnostico',
    'lead_id', v_existente.id);
end;
$$;

-- Mesmos grants das migrações anteriores (create or replace mantém os da produção, inclusive o revoke do
-- vini_operador da 20261109230000 e da 20261118130000; repetidos aqui para o banco montado do zero).
revoke all on function public.zh_leads_registrar_evento(text, jsonb) from public;
grant execute on function public.zh_leads_registrar_evento(text, jsonb) to anon, authenticated;
revoke all on function public.zh_leads_registrar_negociacao(text, jsonb) from public;
grant execute on function public.zh_leads_registrar_negociacao(text, jsonb) to anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'vini_operador') then
    revoke execute on function public.zh_leads_registrar_evento(text, jsonb) from vini_operador;
    revoke execute on function public.zh_leads_registrar_negociacao(text, jsonb) from vini_operador;
    revoke execute on function public.zh_leads_limpar_rastreio(jsonb) from vini_operador;
  end if;
end $$;

commit;
