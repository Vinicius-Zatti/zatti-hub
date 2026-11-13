-- Avaliações: roleta de prêmios no fim da pesquisa dos apps (13/11/2026). Vinícius: "a pessoa que
-- pediu no ifood roda a roleta pra ganhar pedido no app direto mesmo". Modelo do Falaê (roleta de 6
-- prêmios, cupom com código e validade, usado na próxima compra).
--   - avaliacoes_premios: prêmios de cada restaurante (nome, regra, peso do sorteio, ligado);
--   - avaliacoes_pesquisas.roleta_ativa e cupom_validade_dias (30 de fábrica);
--   - avaliacoes_cupons: um por avaliação, código de 6 letras, válido até a data, baixa pela gestão;
--   - avaliacoes_registrar devolve o id da resposta só quando a roleta vale (app, ligada, com prêmio);
--   - avaliacoes_girar_roleta (só o servidor): até 2 h depois da avaliação, um cupom por avaliação e
--     um por WhatsApp a cada 30 dias no restaurante (o número identifica o cupom e barra quem
--     responde várias vezes para juntar prêmio);
--   - avaliacoes_salvar_roleta e avaliacoes_baixar_cupom: gestão com "editar".
-- O prêmio nunca depende de avaliar no Google (regra do Google): é por responder a pesquisa.

-- ══ 1. Tabelas ═══════════════════════════════════════════════════════════
alter table public.avaliacoes_pesquisas
  add column if not exists roleta_ativa boolean not null default false,
  add column if not exists cupom_validade_dias smallint not null default 30;
alter table public.avaliacoes_pesquisas drop constraint if exists avaliacoes_pesquisas_cupom_validade_check;
alter table public.avaliacoes_pesquisas add constraint avaliacoes_pesquisas_cupom_validade_check
  check (cupom_validade_dias between 1 and 180);

create table if not exists public.avaliacoes_premios (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id) on delete restrict,
  nome text not null check (char_length(btrim(nome)) between 2 and 60),
  regra text check (regra is null or char_length(btrim(regra)) between 2 and 120),
  peso smallint not null default 1 check (peso between 1 and 100),
  ordem smallint not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists avaliacoes_premios_unidade on public.avaliacoes_premios (unidade_id, ativo, ordem);

create table if not exists public.avaliacoes_cupons (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id) on delete restrict,
  resposta_id uuid not null unique references public.avaliacoes_respostas(id) on delete restrict,
  premio_id uuid not null references public.avaliacoes_premios(id) on delete restrict,
  -- Cópia do prêmio no dia do sorteio (a gestão pode mudar o texto depois).
  premio_nome text not null,
  premio_regra text,
  codigo text not null unique check (codigo ~ '^[A-HJ-NP-Z2-9]{6}$'),
  whatsapp text not null check (whatsapp ~ '^55[1-9][0-9]{9,10}$'),
  criado_em timestamptz not null default now(),
  valido_ate timestamptz not null,
  usado_em timestamptz,
  usado_por uuid references auth.users(id) on delete set null
);
create index if not exists avaliacoes_cupons_unidade_data on public.avaliacoes_cupons (unidade_id, criado_em desc);
create index if not exists avaliacoes_cupons_whatsapp on public.avaliacoes_cupons (unidade_id, whatsapp, criado_em desc);

alter table public.avaliacoes_premios enable row level security;
alter table public.avaliacoes_cupons enable row level security;
revoke all on table public.avaliacoes_premios, public.avaliacoes_cupons from public, anon, authenticated;
grant select on table public.avaliacoes_premios, public.avaliacoes_cupons to authenticated;
grant select, insert, update, delete on table public.avaliacoes_premios, public.avaliacoes_cupons to service_role;
drop policy if exists avaliacoes_premios_select on public.avaliacoes_premios;
create policy avaliacoes_premios_select on public.avaliacoes_premios for select to authenticated
  using (public.usuario_pode_usar_avaliacoes(unidade_id, 'ver'));
drop policy if exists avaliacoes_cupons_select on public.avaliacoes_cupons;
create policy avaliacoes_cupons_select on public.avaliacoes_cupons for select to authenticated
  using (public.usuario_pode_usar_avaliacoes(unidade_id, 'ver'));
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'vini_operador') then
    revoke insert, update, delete, truncate on table public.avaliacoes_premios, public.avaliacoes_cupons from vini_operador;
    grant select on table public.avaliacoes_premios, public.avaliacoes_cupons to vini_operador;
    execute 'drop policy if exists vini_operador_leitura on public.avaliacoes_premios';
    execute 'create policy vini_operador_leitura on public.avaliacoes_premios for select to vini_operador using (true)';
    execute 'drop policy if exists vini_operador_leitura on public.avaliacoes_cupons';
    execute 'create policy vini_operador_leitura on public.avaliacoes_cupons for select to vini_operador using (true)';
  end if;
end;
$$;

-- ══ 2. Configurar a roleta ═══════════════════════════════════════════════
-- p_premios: [{"id"?: uuid, "nome": text, "regra": text|null, "peso": 1..100}], até 8, na ordem da
-- tela. Prêmio que sai da lista é desligado (não apagado: cupom antigo aponta para ele). Ligar a
-- roleta exige ao menos um prêmio.
create or replace function public.avaliacoes_salvar_roleta(p_unidade_id text, p_ativa boolean, p_validade_dias integer, p_premios jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_ordem integer := 0;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_nome text;
  v_regra text;
  v_peso integer;
begin
  if not public.usuario_pode_usar_avaliacoes(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_ativa is null or p_validade_dias is null or p_validade_dias not between 1 and 180 then
    raise exception 'validade_invalida' using errcode = '22023';
  end if;
  if p_premios is null or jsonb_typeof(p_premios) <> 'array' or jsonb_array_length(p_premios) > 8 then
    raise exception 'premios_invalidos' using errcode = '22023';
  end if;
  if p_ativa and jsonb_array_length(p_premios) = 0 then
    raise exception 'roleta_sem_premio' using errcode = '22023';
  end if;
  if not exists (select 1 from public.avaliacoes_pesquisas where unidade_id = p_unidade_id) then
    raise exception 'pesquisa_inexistente' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('avaliacoes_roleta:' || p_unidade_id, 0));

  for v_item in select * from jsonb_array_elements(p_premios) loop
    v_ordem := v_ordem + 1;
    v_nome := btrim(coalesce(v_item ->> 'nome', ''));
    v_regra := nullif(btrim(coalesce(v_item ->> 'regra', '')), '');
    v_peso := case when coalesce(v_item ->> 'peso', '') ~ '^[0-9]{1,3}$' then (v_item ->> 'peso')::integer else 0 end;
    if char_length(v_nome) not between 2 and 60 or (v_regra is not null and char_length(v_regra) > 120) or v_peso not between 1 and 100 then
      raise exception 'premio_invalido' using errcode = '22023';
    end if;
    v_id := null;
    if coalesce(v_item ->> 'id', '') ~ '^[0-9a-f-]{36}$' then
      update public.avaliacoes_premios
         set nome = v_nome, regra = v_regra, peso = v_peso, ordem = v_ordem, ativo = true, atualizado_em = now()
       where id = (v_item ->> 'id')::uuid and unidade_id = p_unidade_id
      returning id into v_id;
    end if;
    if v_id is null then
      insert into public.avaliacoes_premios (unidade_id, nome, regra, peso, ordem)
      values (p_unidade_id, v_nome, v_regra, v_peso, v_ordem)
      returning id into v_id;
    end if;
    v_ids := v_ids || v_id;
  end loop;
  update public.avaliacoes_premios set ativo = false, atualizado_em = now()
   where unidade_id = p_unidade_id and ativo and not (id = any(v_ids));
  update public.avaliacoes_pesquisas
     set roleta_ativa = p_ativa, cupom_validade_dias = p_validade_dias, atualizado_em = now()
   where unidade_id = p_unidade_id;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_novos)
  values (p_unidade_id, auth.uid(), 'avaliacoes_salvar_roleta', 'avaliacoes_pesquisa', p_unidade_id,
          jsonb_build_object('ativa', p_ativa, 'validadeDias', p_validade_dias, 'premios', p_premios));
end;
$$;
revoke all on function public.avaliacoes_salvar_roleta(text, boolean, integer, jsonb) from public, anon;
grant execute on function public.avaliacoes_salvar_roleta(text, boolean, integer, jsonb) to authenticated;

-- Roleta valendo para este restaurante agora (ligada e com prêmio ligado)?
create or replace function public.avaliacoes_roleta_valendo(p_unidade_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.avaliacoes_pesquisas p where p.unidade_id = p_unidade_id and p.roleta_ativa)
     and exists (select 1 from public.avaliacoes_premios r where r.unidade_id = p_unidade_id and r.ativo);
$$;
revoke all on function public.avaliacoes_roleta_valendo(text) from public, anon, authenticated;

-- ══ 3. Girar ═════════════════════════════════════════════════════════════
-- Só o servidor (service role), depois da avaliação de app gravada. Devolve o cupom (novo ou o que
-- a avaliação já tinha) ou o motivo.
create or replace function public.avaliacoes_girar_roleta(p_resposta_id uuid, p_whatsapp text, p_agora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
  v_p record;
  v_digitos text;
  v_existente record;
  v_total integer;
  v_sorteio integer;
  v_premio record;
  v_codigo text;
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_tentativa integer := 0;
begin
  select r.id, r.unidade_id, r.origem, r.criado_em into v_r from public.avaliacoes_respostas r where r.id = p_resposta_id;
  if not found or v_r.origem <> 'app' then
    return jsonb_build_object('ok', false, 'codigo', 'nao_encontrada');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('avaliacoes_roleta:' || v_r.unidade_id, 0));

  select * into v_existente from public.avaliacoes_cupons c where c.resposta_id = p_resposta_id;
  if found then
    return jsonb_build_object('ok', true, 'repetido', true, 'premioId', v_existente.premio_id, 'premio', v_existente.premio_nome,
                              'regra', v_existente.premio_regra, 'cupom', v_existente.codigo, 'validoAte', v_existente.valido_ate);
  end if;
  if v_r.criado_em < p_agora - interval '2 hours' then
    return jsonb_build_object('ok', false, 'codigo', 'expirada');
  end if;
  select p.cupom_validade_dias, p.nome_exibido into v_p from public.avaliacoes_pesquisas p
    join public.unidades u on u.id = p.unidade_id and u.ativo and u.avaliacoes_habilitado
   where p.unidade_id = v_r.unidade_id;
  if not found or not public.avaliacoes_roleta_valendo(v_r.unidade_id) then
    return jsonb_build_object('ok', false, 'codigo', 'desligada');
  end if;

  v_digitos := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  if v_digitos ~ '^[1-9][0-9]{9,10}$' then
    v_digitos := '55' || v_digitos;
  end if;
  if v_digitos !~ '^55[1-9][0-9]{9,10}$' then
    return jsonb_build_object('ok', false, 'codigo', 'whatsapp_invalido');
  end if;
  select * into v_existente from public.avaliacoes_cupons c
   where c.unidade_id = v_r.unidade_id and c.whatsapp = v_digitos and c.criado_em > p_agora - interval '30 days'
   order by c.criado_em desc limit 1;
  if found then
    return jsonb_build_object('ok', false, 'codigo', 'ja_ganhou', 'cupom', v_existente.codigo, 'premio', v_existente.premio_nome,
                              'validoAte', v_existente.valido_ate);
  end if;

  -- Sorteio pelo peso: número de 1 ao total dos pesos; cai no prêmio cuja faixa acumulada o cobre.
  select sum(peso) into v_total from public.avaliacoes_premios where unidade_id = v_r.unidade_id and ativo;
  v_sorteio := 1 + floor(random() * v_total)::integer;
  select id, nome, regra into v_premio
    from (select id, nome, regra, sum(peso) over (order by ordem, id) as acumulado
            from public.avaliacoes_premios where unidade_id = v_r.unidade_id and ativo) x
   where acumulado >= v_sorteio
   order by acumulado
   limit 1;

  loop
    v_tentativa := v_tentativa + 1;
    select string_agg(substr(v_alfabeto, 1 + floor(random() * 32)::integer, 1), '') into v_codigo from generate_series(1, 6);
    exit when not exists (select 1 from public.avaliacoes_cupons where codigo = v_codigo);
    if v_tentativa > 20 then
      raise exception 'codigo_esgotado';
    end if;
  end loop;

  insert into public.avaliacoes_cupons (unidade_id, resposta_id, premio_id, premio_nome, premio_regra, codigo, whatsapp, criado_em, valido_ate)
  values (v_r.unidade_id, p_resposta_id, v_premio.id, v_premio.nome, v_premio.regra, v_codigo, v_digitos, p_agora,
          p_agora + make_interval(days => v_p.cupom_validade_dias));
  return jsonb_build_object('ok', true, 'premioId', v_premio.id, 'premio', v_premio.nome, 'regra', v_premio.regra, 'cupom', v_codigo,
                            'validoAte', p_agora + make_interval(days => v_p.cupom_validade_dias));
end;
$$;
revoke all on function public.avaliacoes_girar_roleta(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.avaliacoes_girar_roleta(uuid, text, timestamptz) to service_role;

-- ══ 4. Dar baixa no cupom ════════════════════════════════════════════════
create or replace function public.avaliacoes_baixar_cupom(p_unidade_id text, p_codigo text, p_agora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if not public.usuario_pode_usar_avaliacoes(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select * into v_c from public.avaliacoes_cupons where unidade_id = p_unidade_id and codigo = v_codigo for update;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'nao_encontrado');
  end if;
  if v_c.usado_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'ja_usado', 'usadoEm', v_c.usado_em, 'premio', v_c.premio_nome);
  end if;
  if v_c.valido_ate < p_agora then
    return jsonb_build_object('ok', false, 'codigo', 'vencido', 'validoAte', v_c.valido_ate, 'premio', v_c.premio_nome);
  end if;
  update public.avaliacoes_cupons set usado_em = p_agora, usado_por = auth.uid() where id = v_c.id;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_novos)
  values (p_unidade_id, auth.uid(), 'avaliacoes_baixar_cupom', 'avaliacoes_cupom', v_c.id::text,
          jsonb_build_object('codigo', v_c.codigo, 'premio', v_c.premio_nome));
  return jsonb_build_object('ok', true, 'premio', v_c.premio_nome, 'regra', v_c.premio_regra);
end;
$$;
revoke all on function public.avaliacoes_baixar_cupom(text, text, timestamptz) from public, anon;
grant execute on function public.avaliacoes_baixar_cupom(text, text, timestamptz) to authenticated;

-- ══ 5. Página pública recebe a roleta ════════════════════════════════════
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
           'atendentes', to_jsonb(p.atendentes), 'linkPedidoDireto', p.link_pedido_direto,
           'roleta', case when p.roleta_ativa then
                       (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.nome, 'regra', r.regra) order by r.ordem, r.id), '[]'::jsonb)
                          from public.avaliacoes_premios r where r.unidade_id = p.unidade_id and r.ativo)
                     else '[]'::jsonb end,
           'cupomValidadeDias', p.cupom_validade_dias,
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

-- ══ 6. Gravação devolve o id quando a roleta vale ════════════════════════
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
  v_chave text;
  v_nps smallint;
  v_espera text;
  v_pedido_certo boolean;
  v_atendente text;
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

  -- Estrelas de 1 a 5 (obrigatórias quando ligadas e do tipo).
  foreach v_chave in array array['atendimento', 'comida', 'tempo', 'ambiente', 'embalagem', 'entrega', 'atendimento_pedido'] loop
    if public.avaliacoes_pergunta_ativa(v_perguntas, v_chave) and public.avaliacoes_pergunta_no_tipo(v_chave, p_origem) then
      v_val := p_respostas -> v_chave;
      if v_val is null or jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}') !~ '^[1-5]$' then
        return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', v_chave);
      end if;
      v_estrelas := v_estrelas || jsonb_build_object(v_chave, (v_val #>> '{}')::smallint);
    end if;
  end loop;
  if public.avaliacoes_pergunta_ativa(v_perguntas, 'pedido_certo') and public.avaliacoes_pergunta_no_tipo('pedido_certo', p_origem) then
    v_val := p_respostas -> 'pedido_certo';
    if v_val is null or jsonb_typeof(v_val) <> 'boolean' then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'pedido_certo');
    end if;
    v_pedido_certo := (v_val #>> '{}')::boolean;
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
  if public.avaliacoes_pergunta_ativa(v_perguntas, 'atendente') and p_origem = 'salao' and cardinality(v_p.atendentes) > 0 then
    v_val := p_respostas -> 'atendente';
    if v_val is not null and jsonb_typeof(v_val) <> 'null' then
      if jsonb_typeof(v_val) <> 'string' or not ((v_val #>> '{}') = 'nao_lembro' or (v_val #>> '{}') = any(v_p.atendentes)) then
        return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'atendente');
      end if;
      v_atendente := v_val #>> '{}';
    end if;
  end if;
  if public.avaliacoes_pergunta_ativa(v_perguntas, 'conheceu') and public.avaliacoes_pergunta_no_tipo('conheceu', p_origem) then
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

  v_baixa := exists (select 1 from jsonb_each_text(v_estrelas) e where e.value::smallint <= 2)
             or coalesce(v_nps <= 6, false) or coalesce(v_pedido_certo = false, false);

  insert into public.avaliacoes_respostas (
    pesquisa_id, unidade_id, versao, origem, atendimento, comida, tempo, ambiente, embalagem, entrega, atendimento_pedido,
    pedido_certo, atendente, espera, nps, conheceu, conheceu_outro, comentario,
    nota_baixa, whatsapp, consentimento_em, consentimento_versao, consentimento_texto, hash_ip, hash_dispositivo, criado_em
  ) values (
    v_p.id, v_p.unidade_id, v_p.versao_atual, p_origem,
    (v_estrelas ->> 'atendimento')::smallint, (v_estrelas ->> 'comida')::smallint, (v_estrelas ->> 'tempo')::smallint,
    (v_estrelas ->> 'ambiente')::smallint, (v_estrelas ->> 'embalagem')::smallint, (v_estrelas ->> 'entrega')::smallint,
    (v_estrelas ->> 'atendimento_pedido')::smallint,
    v_pedido_certo, v_atendente, v_espera, v_nps, v_conheceu,
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

