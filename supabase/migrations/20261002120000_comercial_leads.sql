-- Comercial (Escritório > Comercial): CRM de leads da Zatti. V1 interna, só
-- master lê e escreve, igual ao resto do Escritório. Prefixo `zh_leads`.
--
-- Decisões de Vinícius (02/10/2026), ver `_execucao/zatti-hub/crm-leads-v1-desenho.md`:
--   - um lead por pessoa (WhatsApp), mas nada é sobrescrito: cada formulário,
--     compra ou mudança vira evento na linha do tempo;
--   - "comprou livro" e "comprou app" são etapas separadas, com próxima ação
--     sugerida diferente (livro -> app; app -> consultoria, downsell R$497);
--   - "Virou cliente" vincula o lead a uma organização já cadastrada.
--
-- Fonte da verdade: estas tabelas. O Vini grava pela rota /api/leads/eventos
-- com token próprio (SHA-256 em `zh_leads_segredos`, sem grant), no mesmo
-- padrão de `fin_conciliacao_segredos`. Sem delete pela aplicação.
begin;

-- ── Leads (um por WhatsApp, só dígitos, sem o 55) ──────────────────────────
create table if not exists public.zh_leads (
  id uuid primary key default gen_random_uuid(),
  whatsapp text not null unique check (whatsapp ~ '^[0-9]{10,11}$'),
  nome text not null check (length(trim(nome)) > 0 and length(nome) <= 80),
  negocio text not null default '' check (length(negocio) <= 80),
  origem text not null default 'site'
    check (origem in ('instagram', 'whatsapp', 'ligacao', 'site', 'indicacao', 'teste', 'outra')),
  produto_interesse text not null default '' check (length(produto_interesse) <= 80),
  etapa text not null default 'preencheu_formulario' check (etapa in
    ('abordado', 'respondeu', 'link_enviado', 'preencheu_formulario', 'comprou_livro', 'comprou_app',
     'em_acompanhamento', 'reuniao_diagnostico', 'consultoria_fechada', 'perdido')),
  motivo_perda text not null default '' check (length(motivo_perda) <= 300),
  faturamento_atual text not null default '' check (length(faturamento_atual) <= 40),
  faturamento_desejado text not null default '' check (length(faturamento_desejado) <= 40),
  dificuldade text not null default '' check (length(dificuldade) <= 500),
  proxima_acao text not null default '' check (length(proxima_acao) <= 300),
  proxima_acao_em date,
  organizacao_id text references public.organizacoes(id) on delete restrict,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  etapa_desde timestamptz not null default now(),
  ultimo_evento_em timestamptz not null default now()
);

create index if not exists zh_leads_etapa_idx on public.zh_leads (etapa);

-- ── Linha do tempo ─────────────────────────────────────────────────────────
create table if not exists public.zh_leads_eventos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.zh_leads(id) on delete restrict,
  -- Chave do evento vinda do Vini (id do formulário, "pag-<id>"): reenvio não duplica.
  chave_externa text unique check (chave_externa is null or length(chave_externa) between 1 and 120),
  em timestamptz not null default now(),
  tipo text not null check (tipo in
    ('formulario', 'nova_tentativa', 'pagamento', 'comprou_de_novo', 'etapa', 'nota', 'proxima_acao',
     'perdido', 'virou_cliente')),
  de_etapa text,
  para_etapa text,
  produto text not null default '' check (length(produto) <= 80),
  valor numeric(12, 2),
  pagamento_id text check (pagamento_id is null or pagamento_id ~ '^[0-9]{1,20}$'),
  texto text not null default '' check (length(texto) <= 1000),
  -- Cópia do que a pessoa preencheu naquele formulário (o lead não é sobrescrito).
  dados jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object' and length(dados::text) <= 4000),
  autor text not null check (autor in ('site', 'vini', 'sdr', 'vinicius')),
  criado_por uuid default auth.uid() references auth.users(id)
);

create index if not exists zh_leads_eventos_lead_idx on public.zh_leads_eventos (lead_id, em);

-- ── Segredo da integração com o Vini (só o hash) ───────────────────────────
create table if not exists public.zh_leads_segredos (
  chave text not null check (chave in ('vini_eventos')),
  versao integer not null check (versao > 0),
  valor text not null check (char_length(valor) = 64),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  primary key (chave, versao)
);
alter table public.zh_leads_segredos enable row level security;
revoke all on public.zh_leads_segredos from public, anon, authenticated;

-- ── atualizado_em ──────────────────────────────────────────────────────────
drop trigger if exists tocar_atualizado_em on public.zh_leads;
create trigger tocar_atualizado_em before update on public.zh_leads
  for each row execute function public.tocar_atualizado_em();

-- ── RLS: só master (aal2 via usuario_e_master), sem delete ─────────────────
alter table public.zh_leads enable row level security;
alter table public.zh_leads_eventos enable row level security;

do $$
declare t text;
begin
  foreach t in array array['zh_leads', 'zh_leads_eventos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.usuario_e_master())', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.usuario_e_master())', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.usuario_e_master()) with check (public.usuario_e_master())', t || '_update', t);
  end loop;
end $$;

revoke all on public.zh_leads, public.zh_leads_eventos from public, anon, authenticated;
grant select, insert, update on public.zh_leads, public.zh_leads_eventos to authenticated;

-- ── Regras do funil (as mesmas de src/lib/comercial/funil.ts) ──────────────
-- Ordem das etapas: compra ou avanço automático nunca rebaixa um lead.
create or replace function public.zh_leads_ordem_etapa(p_etapa text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_etapa
    when 'abordado' then 1 when 'respondeu' then 2 when 'link_enviado' then 3
    when 'preencheu_formulario' then 4 when 'comprou_livro' then 5 when 'comprou_app' then 6
    when 'em_acompanhamento' then 7 when 'reuniao_diagnostico' then 8 when 'consultoria_fechada' then 9
    when 'perdido' then 0 else null end;
$$;

-- WhatsApp só com dígitos, sem o 55 do Brasil.
create or replace function public.zh_leads_normalizar_whatsapp(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^55[0-9]{10,11}$' then substr(d, 3)
    else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

-- ── Entrada do Vini: formulário, pagamento e (depois) etapas do SDR ────────
-- p_evento: {chave, tipo: formulario|pagamento|etapa, em?, lead: {...},
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

  v_whats := public.zh_leads_normalizar_whatsapp(v_lead->>'whatsapp');
  if v_whats !~ '^[0-9]{10,11}$' then
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
    if v_alvo not in ('abordado', 'respondeu', 'link_enviado') then
      raise exception 'Etapa invalida para o Vini' using errcode = '22023';
    end if;
  end if;

  select * into v_existente from public.zh_leads l where l.whatsapp = v_whats for update;

  if not found then
    v_novo := true;
    insert into public.zh_leads (
      whatsapp, nome, negocio, origem, produto_interesse, etapa,
      faturamento_atual, faturamento_desejado, dificuldade, criado_em, etapa_desde, ultimo_evento_em
    ) values (
      v_whats,
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

-- ── Ações de Vinícius na tela (security invoker: o RLS de master vale) ─────
-- p_acao: etapa | perdido | proxima_acao | nota | virou_cliente
create or replace function public.zh_leads_atualizar(p_lead_id uuid, p_acao text, p_dados jsonb)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_lead public.zh_leads%rowtype;
  v_para text;
  v_texto text := left(trim(coalesce(p_dados->>'texto', '')), 1000);
  v_data date := nullif(p_dados->>'data', '')::date;
  v_org text := nullif(p_dados->>'organizacao_id', '');
  v_evento uuid;
begin
  if not public.usuario_e_master() then
    raise exception 'Sem permissao' using errcode = '42501';
  end if;
  select * into v_lead from public.zh_leads l where l.id = p_lead_id for update;
  if not found then
    raise exception 'Lead nao encontrado' using errcode = 'P0002';
  end if;

  if p_acao = 'etapa' then
    v_para := p_dados->>'para_etapa';
    if public.zh_leads_ordem_etapa(v_para) is null or v_para = 'perdido' then
      raise exception 'Etapa invalida' using errcode = '22023';
    end if;
    update public.zh_leads l set etapa = v_para, etapa_desde = now(), motivo_perda = '', ultimo_evento_em = now()
    where l.id = p_lead_id;
  elsif p_acao = 'perdido' then
    if length(v_texto) < 3 then
      raise exception 'Motivo obrigatorio' using errcode = '22023';
    end if;
    v_para := 'perdido';
    update public.zh_leads l set etapa = 'perdido', etapa_desde = now(), motivo_perda = left(v_texto, 300),
      proxima_acao = '', proxima_acao_em = null, ultimo_evento_em = now()
    where l.id = p_lead_id;
  elsif p_acao = 'proxima_acao' then
    update public.zh_leads l set proxima_acao = left(v_texto, 300), proxima_acao_em = v_data, ultimo_evento_em = now()
    where l.id = p_lead_id;
  elsif p_acao = 'nota' then
    if length(v_texto) = 0 then
      raise exception 'Nota vazia' using errcode = '22023';
    end if;
    update public.zh_leads l set ultimo_evento_em = now() where l.id = p_lead_id;
  elsif p_acao = 'virou_cliente' then
    if v_org is null or not exists (select 1 from public.organizacoes o where o.id = v_org and o.ativo) then
      raise exception 'Cliente nao encontrado' using errcode = '22023';
    end if;
    update public.zh_leads l set organizacao_id = v_org, ultimo_evento_em = now() where l.id = p_lead_id;
  else
    raise exception 'Acao invalida' using errcode = '22023';
  end if;

  insert into public.zh_leads_eventos (lead_id, tipo, de_etapa, para_etapa, texto, dados, autor)
  values (
    p_lead_id,
    case p_acao when 'etapa' then 'etapa' else p_acao end,
    case when v_para is not null then v_lead.etapa end,
    v_para,
    case p_acao
      when 'proxima_acao' then concat_ws(' - ', nullif(v_texto, ''), to_char(v_data, 'DD/MM/YYYY'))
      else v_texto end,
    case when p_acao = 'virou_cliente' then jsonb_build_object('organizacao_id', v_org) else '{}'::jsonb end,
    'vinicius'
  )
  returning id into v_evento;
  return v_evento;
end;
$$;

revoke all on function public.zh_leads_ordem_etapa(text) from public;
grant execute on function public.zh_leads_ordem_etapa(text) to authenticated;
revoke all on function public.zh_leads_normalizar_whatsapp(text) from public;
grant execute on function public.zh_leads_normalizar_whatsapp(text) to authenticated;
revoke all on function public.zh_leads_registrar_evento(text, jsonb) from public;
grant execute on function public.zh_leads_registrar_evento(text, jsonb) to anon, authenticated;
revoke all on function public.zh_leads_atualizar(uuid, text, jsonb) from public, anon;
grant execute on function public.zh_leads_atualizar(uuid, text, jsonb) to authenticated;

-- ── Rate limit: lista vigente (20260930091000) + comercial_salvar ──────────
create or replace function public.consumir_limite_requisicao(p_chave text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_janela_segundos integer;
  v_contagem integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  select configuracao.limite, configuracao.janela_segundos
    into v_limite, v_janela_segundos
  from (
    values
      ('sugerir_sku', 10, 3600),
      ('registrar_contagem', 30, 600),
      ('corrigir_contagem', 120, 600),
      ('salvar_produtos', 30, 600),
      ('salvar_fornecedores', 30, 600),
      ('pedidos_cotacao', 120, 600),
      ('recebimento', 60, 600),
      ('consolidado_criar', 30, 600),
      ('consolidado_editar', 60, 600),
      ('trocar_organizacao', 30, 600),
      ('ficha_salvar', 60, 600),
      ('ficha_excluir', 30, 600),
      ('categoria_ficha_criar', 30, 600),
      ('conversao_produto_salvar', 60, 600),
      ('configuracao_financeira_salvar', 30, 600),
      ('ficha_preco_venda_salvar', 120, 600),
      ('categoria_ficha_editar', 30, 600),
      ('categoria_ficha_excluir', 30, 600),
      ('excluir_produto', 30, 600),
      ('ficha_precos_canal_salvar', 120, 600),
      ('fin_conta_financeira_salvar', 30, 600),
      ('fin_categoria_criar', 30, 600),
      ('fin_categoria_editar', 30, 600),
      ('fin_lancamento_criar', 60, 600),
      ('fin_lancamento_editar', 60, 600),
      ('fin_baixa_registrar', 60, 600),
      ('fin_baixa_estornar', 30, 600),
      ('fin_recorrencia_criar', 30, 600),
      ('fin_lancamento_excluir', 30, 600),
      ('fin_estoque_mensal_salvar', 30, 600),
      ('fin_saidas_sem_receita_salvar', 60, 600),
      ('tempo_frente_salvar', 30, 600),
      ('tempo_valor_hora_salvar', 30, 600),
      ('tempo_meta_mensal_salvar', 30, 600),
      ('tempo_cronometro_acao', 120, 600),
      ('tempo_lancamento_criar', 60, 600),
      ('tempo_lancamento_editar', 60, 600),
      ('tempo_lancamento_excluir', 30, 600),
      ('agenda_tarefa_salvar', 60, 600),
      ('agenda_tarefa_excluir', 30, 600),
      ('agenda_marcar_execucao', 120, 600),
      ('setor_salvar', 30, 600),
      ('setor_designar', 60, 600),
      ('contagem_abrir', 60, 600),
      ('fin_provisao_parametros_salvar', 30, 600),
      ('fin_provisao_reversao_salvar', 30, 600),
      ('fin_fechamento_salvar', 30, 600),
      ('fin_recorrencia_encerrar', 30, 600),
      ('clientes_salvar', 120, 600),
      ('clientes_reuniao', 60, 600),
      ('fin_conciliacao_importar', 20, 600),
      ('fin_conciliacao_reprocessar', 20, 600),
      ('comercial_salvar', 120, 600)
  ) as configuracao(chave, limite, janela_segundos)
  where configuracao.chave = p_chave;

  if v_limite is null then
    raise exception 'Limite de requisicao desconhecido' using errcode = '22023';
  end if;

  insert into public.limites_requisicao as atual (
    user_id,
    chave,
    janela_inicio,
    contagem
  )
  values (auth.uid(), p_chave, now(), 1)
  on conflict (user_id, chave) do update
  set
    janela_inicio = case
      when excluded.janela_inicio - atual.janela_inicio
        >= make_interval(secs => v_janela_segundos)
      then excluded.janela_inicio
      else atual.janela_inicio
    end,
    contagem = case
      when excluded.janela_inicio - atual.janela_inicio
        >= make_interval(secs => v_janela_segundos)
      then 1
      else atual.contagem + 1
    end
  returning contagem into v_contagem;

  return v_contagem <= v_limite;
end;
$$;

revoke all on function public.consumir_limite_requisicao(text) from public, anon;
grant execute on function public.consumir_limite_requisicao(text) to authenticated;

revoke all on function public.consumir_limite_requisicao(text) from public, anon;
grant execute on function public.consumir_limite_requisicao(text) to authenticated;

commit;
