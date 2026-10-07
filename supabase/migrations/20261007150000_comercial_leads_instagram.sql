-- Comercial: prospecção ativa pelo Instagram (ajuste de Vinícius em 07/10/2026).
--   - etapa nova `mandar_primeira_mensagem`, antes de `abordado`;
--   - lead pode existir só com o @ do Instagram (WhatsApp passa a opcional,
--     mas um dos dois é obrigatório); o link do perfil é derivado na tela;
--   - dados da prospecção em colunas próprias (cidade/bairro, seguidores,
--     último post, nota e avaliações no Google, se vende por delivery);
--   - cadastro manual na tela (`zh_leads_criar`, só master) e importação em
--     lote pelo script `scripts/importar-leads-instagram.mjs`
--     (`zh_leads_importar`, só service_role), as duas com evento `criado`;
--   - a entrada do Vini (`zh_leads_registrar_evento`) localiza o lead pelo
--     WhatsApp e, se não houver, pelo Instagram. Contrato da rota
--     /api/leads/eventos mantido: `lead.instagram` é campo novo opcional.
-- Nada é apagado: só colunas novas, checks trocados e funções recriadas.
begin;

-- ── Colunas novas e WhatsApp opcional ──────────────────────────────────────
alter table public.zh_leads
  add column if not exists instagram text
    check (instagram is null or instagram ~ '^[a-z0-9._]{1,30}$'),
  add column if not exists cidade_bairro text not null default ''
    check (length(cidade_bairro) <= 120),
  add column if not exists seguidores integer check (seguidores is null or seguidores >= 0),
  add column if not exists ultimo_post_em date,
  add column if not exists nota_google numeric(2, 1)
    check (nota_google is null or nota_google between 0 and 5),
  add column if not exists avaliacoes_google integer
    check (avaliacoes_google is null or avaliacoes_google >= 0),
  add column if not exists vende_delivery text not null default ''
    check (vende_delivery in ('', 'ifood', 'proprio', 'nao'));

-- O unique e o check de formato do WhatsApp continuam valendo quando preenchido.
alter table public.zh_leads alter column whatsapp drop not null;

alter table public.zh_leads drop constraint if exists zh_leads_contato_check;
alter table public.zh_leads add constraint zh_leads_contato_check
  check (whatsapp is not null or instagram is not null);

create unique index if not exists zh_leads_instagram_unico
  on public.zh_leads (instagram) where instagram is not null;

-- ── Etapa nova e evento `criado` (troca os checks da migração 20261002120000) ─
do $$
declare v_nome text;
begin
  for v_nome in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.zh_leads'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%preencheu_formulario%'
  loop
    execute format('alter table public.zh_leads drop constraint %I', v_nome);
  end loop;
  for v_nome in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.zh_leads_eventos'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%nova_tentativa%'
  loop
    execute format('alter table public.zh_leads_eventos drop constraint %I', v_nome);
  end loop;
end $$;

alter table public.zh_leads add constraint zh_leads_etapa_check check (etapa in
  ('mandar_primeira_mensagem', 'abordado', 'respondeu', 'link_enviado', 'preencheu_formulario',
   'comprou_livro', 'comprou_app', 'em_acompanhamento', 'reuniao_diagnostico', 'consultoria_fechada',
   'perdido'));

alter table public.zh_leads_eventos add constraint zh_leads_eventos_tipo_check check (tipo in
  ('criado', 'formulario', 'nova_tentativa', 'pagamento', 'comprou_de_novo', 'etapa', 'nota',
   'proxima_acao', 'perdido', 'virou_cliente'));

-- ── Ordem do funil (a mesma de src/lib/comercial/funil.ts) ──────────────────
create or replace function public.zh_leads_ordem_etapa(p_etapa text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_etapa
    when 'mandar_primeira_mensagem' then 1 when 'abordado' then 2 when 'respondeu' then 3
    when 'link_enviado' then 4 when 'preencheu_formulario' then 5 when 'comprou_livro' then 6
    when 'comprou_app' then 7 when 'em_acompanhamento' then 8 when 'reuniao_diagnostico' then 9
    when 'consultoria_fechada' then 10
    when 'perdido' then 0 else null end;
$$;

-- @ do Instagram: minúsculo, sem @, sem URL (aceita "@Fulano", "instagram.com/fulano/").
-- A mesma regra de `normalizarInstagram` em src/lib/comercial/funil.ts.
create or replace function public.zh_leads_normalizar_instagram(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(p, ''))), '^(https?://)?(www\.|m\.)?instagram\.com/', ''),
      '^@+|[/?#].*$', '', 'g'),
    '');
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
  v_etapa text := coalesce(nullif(p_lead->>'etapa', ''), 'mandar_primeira_mensagem');
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

-- Cadastro na tela (Escritório > Comercial > Novo lead): só master.
create or replace function public.zh_leads_criar(p_dados jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_r jsonb;
begin
  if not public.usuario_e_master() then
    raise exception 'Sem permissao' using errcode = '42501';
  end if;
  v_r := public.zh_leads_inserir_lead(coalesce(p_dados, '{}'::jsonb), 'vinicius', 'Cadastrado no Comercial');
  if (v_r->>'existente')::boolean then
    raise exception 'Lead ja existe' using errcode = '23505';
  end if;
  return (v_r->>'lead_id')::uuid;
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
        v_item || jsonb_build_object('origem', 'instagram', 'etapa', 'mandar_primeira_mensagem'),
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

-- ── Entrada do Vini: agora localiza por WhatsApp e, se não houver, por Instagram ─
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
    if v_alvo is null or v_alvo not in ('mandar_primeira_mensagem', 'abordado', 'respondeu', 'link_enviado') then
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

revoke all on function public.zh_leads_normalizar_instagram(text) from public;
grant execute on function public.zh_leads_normalizar_instagram(text) to authenticated;
revoke all on function public.zh_leads_inserir_lead(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.zh_leads_criar(jsonb) from public, anon;
grant execute on function public.zh_leads_criar(jsonb) to authenticated;
revoke all on function public.zh_leads_importar(jsonb) from public, anon, authenticated;
grant execute on function public.zh_leads_importar(jsonb) to service_role;
revoke all on function public.zh_leads_registrar_evento(text, jsonb) from public;
grant execute on function public.zh_leads_registrar_evento(text, jsonb) to anon, authenticated;

commit;
