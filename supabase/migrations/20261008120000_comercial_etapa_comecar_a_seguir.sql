-- Comercial: etapa nova "Começar a seguir" (ajuste de Vinícius em 08/10/2026).
--   - `comecar_a_seguir` entra antes de `mandar_primeira_mensagem`: o lead da
--     prospecção do Instagram entra nela; Vinícius segue o perfil e passa para
--     "Mandar primeira mensagem"; depois de mandar, "Abordado";
--   - ordem do funil deslocada em +1 (perdido continua 0);
--   - cadastro na tela e importação em lote entram em `comecar_a_seguir`;
--   - a entrada do Vini aceita `comecar_a_seguir` entre as etapas permitidas;
--   - leads em "Mandar primeira mensagem" nunca tocados (só o evento `criado`)
--     passam para a etapa nova, com evento `etapa` na linha do tempo.
-- Nada é apagado: check trocado, funções recriadas (cópia da 20261007150000
-- com só o necessário alterado) e leads intocados movidos de etapa.
begin;

-- ── Etapa nova (troca o check da migração 20261007150000) ──────────────────
alter table public.zh_leads drop constraint if exists zh_leads_etapa_check;
alter table public.zh_leads add constraint zh_leads_etapa_check check (etapa in
  ('comecar_a_seguir', 'mandar_primeira_mensagem', 'abordado', 'respondeu', 'link_enviado',
   'preencheu_formulario', 'comprou_livro', 'comprou_app', 'em_acompanhamento', 'reuniao_diagnostico',
   'consultoria_fechada', 'perdido'));

-- ── Ordem do funil (a mesma de src/lib/comercial/funil.ts) ──────────────────
create or replace function public.zh_leads_ordem_etapa(p_etapa text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_etapa
    when 'comecar_a_seguir' then 1 when 'mandar_primeira_mensagem' then 2 when 'abordado' then 3
    when 'respondeu' then 4 when 'link_enviado' then 5 when 'preencheu_formulario' then 6
    when 'comprou_livro' then 7 when 'comprou_app' then 8 when 'em_acompanhamento' then 9
    when 'reuniao_diagnostico' then 10 when 'consultoria_fechada' then 11
    when 'perdido' then 0 else null end;
$$;

-- ── Cadastro de um lead (base do cadastro na tela e da importação) ─────────
-- Sem grant: só as funções abaixo chamam. Não sobrescreve lead existente
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
  if v_origem not in ('instagram', 'whatsapp', 'ligacao', 'site', 'indicacao', 'teste', 'outra') then
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

-- Importação em lote da prospecção do Instagram (scripts/importar-leads-instagram.mjs).
-- Origem e etapa fixas; cada item é independente (inválido não derruba o lote,
-- repetido não duplica nem sobrescreve).
create or replace function public.zh_leads_importar(p_leads jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_indice integer := 0;
  v_r jsonb;
  v_inseridos integer := 0;
  v_repetidos jsonb := '[]'::jsonb;
  v_invalidos jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_leads) is distinct from 'array' or jsonb_array_length(p_leads) > 500 then
    raise exception 'Lista de leads invalida (array de ate 500 itens)' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_leads) loop
    v_indice := v_indice + 1;
    begin
      if jsonb_typeof(v_item) is distinct from 'object' then
        raise exception 'Item nao e objeto' using errcode = '22023';
      end if;
      v_r := public.zh_leads_inserir_lead(
        v_item || jsonb_build_object('origem', 'instagram', 'etapa', 'comecar_a_seguir'),
        'vinicius', 'Importado da prospecção do Instagram');
      if (v_r->>'existente')::boolean then
        v_repetidos := v_repetidos || jsonb_build_object('item', v_indice, 'instagram', v_item->>'instagram');
      else
        v_inseridos := v_inseridos + 1;
      end if;
    exception when others then
      v_invalidos := v_invalidos || jsonb_build_object('item', v_indice, 'instagram', v_item->>'instagram', 'motivo', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('inseridos', v_inseridos, 'repetidos', v_repetidos, 'invalidos', v_invalidos);
end;
$$;

-- ── Entrada do Vini: aceita também `comecar_a_seguir` ───────────────────────
-- p_evento: {chave, tipo: formulario|pagamento|etapa, em?, lead: {whatsapp?, instagram?, ...},
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
  if v_origem not in ('instagram', 'whatsapp', 'ligacao', 'site', 'indicacao', 'teste') then
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
    update public.zh_leads l set
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

-- ── Leads nunca tocados vão para a etapa nova ───────────────────────────────
-- Só quem está em "Mandar primeira mensagem" e tem como único evento o `criado`.
with intocados as (
  select l.id from public.zh_leads l
  where l.etapa = 'mandar_primeira_mensagem'
    and exists (select 1 from public.zh_leads_eventos e where e.lead_id = l.id and e.tipo = 'criado')
    and not exists (select 1 from public.zh_leads_eventos e where e.lead_id = l.id and e.tipo <> 'criado')
),
movidos as (
  update public.zh_leads l set etapa = 'comecar_a_seguir', etapa_desde = now()
  from intocados i where l.id = i.id
  returning l.id
)
insert into public.zh_leads_eventos (lead_id, tipo, de_etapa, para_etapa, texto, autor)
select m.id, 'etapa', 'mandar_primeira_mensagem', 'comecar_a_seguir', 'Etapa nova Começar a seguir (08/10)', 'vinicius'
from movidos m;

revoke all on function public.zh_leads_ordem_etapa(text) from public;
grant execute on function public.zh_leads_ordem_etapa(text) to authenticated;
revoke all on function public.zh_leads_inserir_lead(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.zh_leads_importar(jsonb) from public, anon, authenticated;
grant execute on function public.zh_leads_importar(jsonb) to service_role;
revoke all on function public.zh_leads_registrar_evento(text, jsonb) from public;
grant execute on function public.zh_leads_registrar_evento(text, jsonb) to anon, authenticated;

commit;
