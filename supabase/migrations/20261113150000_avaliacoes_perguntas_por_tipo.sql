-- Avaliações: perguntas próprias de cada tipo de pesquisa (13/11/2026). Vinícius, sobre a versão no
-- ar: delivery e app faziam as mesmas perguntas do salão ("quanto tempo você esperou?", "como foi o
-- atendimento?"). Modelado no Falaê (pesquisa de satisfação de restaurante que ele mandou estudar):
--   - catálogo novo de perguntas, cada uma valendo só nos tipos em que faz sentido
--     (avaliacoes_pergunta_no_tipo). Salão: atendimento, comida, tempo até a mesa, ambiente, quem
--     atendeu (desligada de fábrica), indicaria, comentário, como conheceu. Delivery próprio: pedido
--     certo, comida, temperatura e embalagem, tempo de entrega, atendimento no pedido, indicaria,
--     comentário. Apps: pedido certo, comida, temperatura e embalagem, indicaria, comentário;
--   - "quem atendeu": lista de nomes por restaurante (avaliacoes_pesquisas.atendentes) + "não lembro";
--   - link "pedir direto com a gente", mostrado no fim da pesquisa dos apps;
--   - sem o contraste mínimo entre a cor principal e a de fundo: na página nova a cor principal é
--     só a capa e a faixa do topo; o que a pessoa toca usa preto ou branco (o que contrastar mais);
--   - nota baixa = qualquer estrela até 2, indicaria até 6 ou pedido que veio errado.
-- A coluna `espera` (faixas de tempo) fica para as respostas antigas; a pergunta sai do modelo.
-- Rodar junto com o merge: depois dela o salão exige tempo e ambiente e o delivery exige pedido certo
-- e embalagem, que a página antiga não manda (avaliação pela página antiga daria erro até o deploy).

-- ══ 1. Colunas novas ═════════════════════════════════════════════════════
alter table public.avaliacoes_respostas
  add column if not exists tempo smallint check (tempo between 1 and 5),
  add column if not exists ambiente smallint check (ambiente between 1 and 5),
  add column if not exists embalagem smallint check (embalagem between 1 and 5),
  add column if not exists entrega smallint check (entrega between 1 and 5),
  add column if not exists atendimento_pedido smallint check (atendimento_pedido between 1 and 5),
  add column if not exists pedido_certo boolean,
  add column if not exists atendente text check (atendente is null or char_length(atendente) between 1 and 40);

-- O painel lê as respostas por lista de colunas (os hashes ficam de fora): as novas entram na lista.
grant select (tempo, ambiente, embalagem, entrega, atendimento_pedido, pedido_certo, atendente)
  on public.avaliacoes_respostas to authenticated;

alter table public.avaliacoes_pesquisas
  add column if not exists atendentes text[] not null default '{}'::text[],
  add column if not exists link_pedido_direto text;
alter table public.avaliacoes_pesquisas drop constraint if exists avaliacoes_pesquisas_atendentes_check;
alter table public.avaliacoes_pesquisas add constraint avaliacoes_pesquisas_atendentes_check
  check (cardinality(atendentes) <= 30);
alter table public.avaliacoes_pesquisas drop constraint if exists avaliacoes_pesquisas_link_pedido_check;
alter table public.avaliacoes_pesquisas add constraint avaliacoes_pesquisas_link_pedido_check
  check (link_pedido_direto is null or (link_pedido_direto ~ '^https://' and char_length(link_pedido_direto) <= 500));

-- ══ 2. Catálogo ══════════════════════════════════════════════════════════
-- Em que tipo de pesquisa cada pergunta vale. Espelho de `CATALOGO` em src/lib/avaliacoes/perguntas.ts.
create or replace function public.avaliacoes_pergunta_no_tipo(p_chave text, p_origem text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_chave
    when 'atendimento' then p_origem = 'salao'
    when 'tempo' then p_origem = 'salao'
    when 'ambiente' then p_origem = 'salao'
    when 'atendente' then p_origem = 'salao'
    when 'conheceu' then p_origem = 'salao'
    when 'pedido_certo' then p_origem in ('delivery', 'app')
    when 'embalagem' then p_origem in ('delivery', 'app')
    when 'entrega' then p_origem = 'delivery'
    when 'atendimento_pedido' then p_origem = 'delivery'
    when 'comida' then true
    when 'nps' then true
    when 'comentario' then true
    when 'espera' then true -- só versões antigas
    else false
  end;
$$;
revoke all on function public.avaliacoes_pergunta_no_tipo(text, text) from public, anon, authenticated;

-- Lista de perguntas: chaves conhecidas, sem repetir, texto de 3 a 200 e ao menos uma ligada.
-- Chave que falta vale desligada (versões antigas têm só 6).
create or replace function public.avaliacoes_validar_perguntas(p_perguntas jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_chaves text[] := '{}';
  v_ativas integer := 0;
  v_texto text;
begin
  if p_perguntas is null or jsonb_typeof(p_perguntas) <> 'array' or jsonb_array_length(p_perguntas) not between 1 and 20 then
    return 'perguntas_invalidas';
  end if;
  for v_item in select * from jsonb_array_elements(p_perguntas) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'chave', '') not in ('atendimento', 'comida', 'tempo', 'ambiente', 'atendente', 'pedido_certo',
                                                   'embalagem', 'entrega', 'atendimento_pedido', 'nps', 'comentario',
                                                   'conheceu', 'espera')
       or (v_item ->> 'chave') = any (v_chaves)
       or jsonb_typeof(v_item -> 'ativa') is distinct from 'boolean'
       or jsonb_typeof(v_item -> 'texto') is distinct from 'string' then
      return 'perguntas_invalidas';
    end if;
    v_chaves := v_chaves || (v_item ->> 'chave');
    v_texto := btrim(v_item ->> 'texto');
    if char_length(v_texto) < 3 or char_length(v_texto) > 200 then
      return 'texto_pergunta';
    end if;
    if (v_item ->> 'ativa')::boolean then
      v_ativas := v_ativas + 1;
    end if;
  end loop;
  if v_ativas = 0 then
    return 'nenhuma_ativa';
  end if;
  return null;
end;
$$;
revoke all on function public.avaliacoes_validar_perguntas(jsonb) from public, anon, authenticated;

create or replace function public.avaliacoes_perguntas_padrao()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '[
    {"chave": "atendimento", "texto": "Como você avalia o nosso atendimento?", "ativa": true},
    {"chave": "pedido_certo", "texto": "Seu pedido chegou certinho, sem faltar nada?", "ativa": true},
    {"chave": "comida", "texto": "E o sabor da comida?", "ativa": true},
    {"chave": "embalagem", "texto": "Chegou quentinho e bem embalado?", "ativa": true},
    {"chave": "tempo", "texto": "E o tempo até o pedido chegar na mesa?", "ativa": true},
    {"chave": "entrega", "texto": "E o tempo de entrega?", "ativa": true},
    {"chave": "atendimento_pedido", "texto": "Como foi o atendimento no pedido?", "ativa": true},
    {"chave": "ambiente", "texto": "E o nosso ambiente?", "ativa": true},
    {"chave": "atendente", "texto": "Quem atendeu você?", "ativa": false},
    {"chave": "nps", "texto": "De 0 a 10, quanto você indicaria a gente para um amigo?", "ativa": true},
    {"chave": "comentario", "texto": "Ajude a gente a entender o que precisamos melhorar para ganhar um 9 ou 10.", "ativa": true},
    {"chave": "conheceu", "texto": "Como você conheceu a gente?", "ativa": true}
  ]'::jsonb;
$$;
revoke all on function public.avaliacoes_perguntas_padrao() from public, anon, authenticated;

-- ══ 3. Marca sem contraste mínimo ════════════════════════════════════════
create or replace function public.avaliacoes_salvar_marca(
  p_unidade_id text,
  p_nome_exibido text,
  p_cor_principal text,
  p_cor_fundo text,
  p_texto_agradecimento text,
  p_link_google text,
  p_ativa boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes record;
  v_link text := nullif(btrim(coalesce(p_link_google, '')), '');
begin
  if not public.usuario_pode_usar_avaliacoes(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_nome_exibido, ''))) not between 2 and 60 then
    raise exception 'nome_invalido' using errcode = '22023';
  end if;
  if coalesce(p_cor_principal, '') !~ '^#[0-9A-F]{6}$' or coalesce(p_cor_fundo, '') !~ '^#[0-9A-F]{6}$' then
    raise exception 'cor_invalida' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_texto_agradecimento, ''))) not between 3 and 200 then
    raise exception 'agradecimento_invalido' using errcode = '22023';
  end if;
  if v_link is not null and (v_link !~ '^https://' or char_length(v_link) > 500) then
    raise exception 'link_google_invalido' using errcode = '22023';
  end if;
  if p_ativa is null then
    raise exception 'pedido_invalido' using errcode = '22023';
  end if;

  select * into v_antes from public.avaliacoes_pesquisas where unidade_id = p_unidade_id for update;
  if not found then
    raise exception 'pesquisa_inexistente' using errcode = '22023';
  end if;
  update public.avaliacoes_pesquisas
     set nome_exibido = btrim(p_nome_exibido), cor_principal = p_cor_principal, cor_fundo = p_cor_fundo,
         texto_agradecimento = btrim(p_texto_agradecimento), link_google = v_link, ativa = p_ativa,
         atualizado_em = now()
   where id = v_antes.id;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (p_unidade_id, auth.uid(), 'avaliacoes_salvar_marca', 'avaliacoes_pesquisa', v_antes.id::text,
          jsonb_build_object('nome', v_antes.nome_exibido, 'corPrincipal', v_antes.cor_principal, 'corFundo', v_antes.cor_fundo,
                             'linkGoogle', v_antes.link_google, 'ativa', v_antes.ativa),
          jsonb_build_object('nome', btrim(p_nome_exibido), 'corPrincipal', p_cor_principal, 'corFundo', p_cor_fundo,
                             'linkGoogle', v_link, 'ativa', p_ativa));
end;
$$;
revoke all on function public.avaliacoes_salvar_marca(text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.avaliacoes_salvar_marca(text, text, text, text, text, text, boolean) to authenticated;

-- ══ 4. Quem atendeu e link de pedir direto ═══════════════════════════════
-- Nomes: 1 a 40 letras, sem repetir (ignorando maiúscula), até 30. Link: https, até 500.
create or replace function public.avaliacoes_salvar_extras(p_unidade_id text, p_atendentes text[], p_link_pedido_direto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes record;
  v_nomes text[];
  v_link text := nullif(btrim(coalesce(p_link_pedido_direto, '')), '');
begin
  if not public.usuario_pode_usar_avaliacoes(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select coalesce(array_agg(n order by o), '{}')
    into v_nomes
    from (select distinct on (lower(n)) n, o
            from (select btrim(regexp_replace(x, '\s+', ' ', 'g')) as n, o
                    from unnest(coalesce(p_atendentes, '{}'::text[])) with ordinality as u(x, o)) y
           where n <> ''
           order by lower(n), o) z;
  if cardinality(v_nomes) > 30 then
    raise exception 'atendentes_demais' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_nomes) n where char_length(n) > 40 or lower(n) = 'nao_lembro') then
    raise exception 'atendente_invalido' using errcode = '22023';
  end if;
  if v_link is not null and (v_link !~ '^https://' or char_length(v_link) > 500) then
    raise exception 'link_pedido_invalido' using errcode = '22023';
  end if;
  select * into v_antes from public.avaliacoes_pesquisas where unidade_id = p_unidade_id for update;
  if not found then
    raise exception 'pesquisa_inexistente' using errcode = '22023';
  end if;
  update public.avaliacoes_pesquisas
     set atendentes = v_nomes, link_pedido_direto = v_link, atualizado_em = now()
   where id = v_antes.id;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (p_unidade_id, auth.uid(), 'avaliacoes_salvar_extras', 'avaliacoes_pesquisa', v_antes.id::text,
          jsonb_build_object('atendentes', to_jsonb(v_antes.atendentes), 'linkPedidoDireto', v_antes.link_pedido_direto),
          jsonb_build_object('atendentes', to_jsonb(v_nomes), 'linkPedidoDireto', v_link));
end;
$$;
revoke all on function public.avaliacoes_salvar_extras(text, text[], text) from public, anon;
grant execute on function public.avaliacoes_salvar_extras(text, text[], text) to authenticated;

-- ══ 5. Página pública ════════════════════════════════════════════════════
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

-- ══ 6. Gravação ══════════════════════════════════════════════════════════
-- Pergunta ligada E do tipo desta pesquisa: obrigatória (menos comentário, como conheceu e quem
-- atendeu). Ligada mas de outro tipo: ignorada.
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
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.avaliacoes_registrar(text, text, jsonb, text, boolean, integer, text, integer, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.avaliacoes_registrar(text, text, jsonb, text, boolean, integer, text, integer, text, text, timestamptz)
  to service_role;

-- ══ 7. Alerta leva as notas novas ════════════════════════════════════════
create or replace function public.avaliacoes_alertas_reservar(p_agora timestamptz default now())
returns table (unidade_id text, unidade_nome text, tentativa_id uuid, telefone text, destinatario_nome text, alertas jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hora integer := extract(hour from (p_agora at time zone 'America/Sao_Paulo'))::integer;
  v_u record;
  v_tentativa uuid;
  v_alertas jsonb;
begin
  update public.avaliacoes_alertas a
     set estado = 'incerto', fechado_em = p_agora, motivo = 'reserva_vencida'
   where a.estado = 'reservado' and a.reservado_em < p_agora - interval '15 minutes';
  update public.avaliacoes_alertas a
     set estado = 'expirado', fechado_em = p_agora, motivo = 'mais_de_3_dias'
   where a.estado = 'pendente' and a.gerado_em < p_agora - interval '3 days';

  for v_u in
    select p.unidade_id as unidade, p.nome_exibido as nome, v.whatsapp as whatsapp, pf.nome as nome_pessoa,
           public.avaliacoes_motivo_vinculo_alerta(p.unidade_id, p.alerta_vinculo_id) as motivo
      from public.avaliacoes_pesquisas p
      join public.unidades u on u.id = p.unidade_id and u.ativo and u.avaliacoes_habilitado
      join public.vinculos v on v.id = p.alerta_vinculo_id
      left join public.perfis pf on pf.id = v.user_id
     where exists (select 1 from public.avaliacoes_alertas a where a.unidade_id = p.unidade_id and a.estado = 'pendente')
     order by p.unidade_id
  loop
    if v_u.motivo is not null or v_hora < 7 or v_hora >= 23 then
      continue;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('avaliacoes_alertas:' || v_u.unidade, 0));
    v_tentativa := gen_random_uuid();
    with r as (
      update public.avaliacoes_alertas a
         set estado = 'reservado', tentativa_id = v_tentativa, reservado_em = p_agora, tentativas = a.tentativas + 1
       where a.unidade_id = v_u.unidade and a.estado = 'pendente'
       returning a.resposta_id
    )
    select jsonb_agg(jsonb_build_object(
             'respostaId', s.id, 'criadoEm', s.criado_em, 'origem', s.origem, 'atendimento', s.atendimento,
             'comida', s.comida, 'tempo', s.tempo, 'ambiente', s.ambiente, 'embalagem', s.embalagem,
             'entrega', s.entrega, 'atendimentoPedido', s.atendimento_pedido, 'pedidoCerto', s.pedido_certo,
             'atendente', s.atendente, 'nps', s.nps, 'espera', s.espera, 'comentario', left(s.comentario, 300),
             'whatsappCliente', s.whatsapp) order by s.criado_em, s.id)
      into v_alertas
      from r join public.avaliacoes_respostas s on s.id = r.resposta_id;
    if v_alertas is null then
      continue;
    end if;
    unidade_id := v_u.unidade;
    unidade_nome := v_u.nome;
    tentativa_id := v_tentativa;
    telefone := v_u.whatsapp;
    destinatario_nome := v_u.nome_pessoa;
    alertas := v_alertas;
    return next;
  end loop;
end;
$$;
revoke all on function public.avaliacoes_alertas_reservar(timestamptz) from public, anon, authenticated;
grant execute on function public.avaliacoes_alertas_reservar(timestamptz) to service_role;

-- ══ 8. Pesquisas que já existem passam para o modelo novo ════════════════
-- Versão nova com o modelo novo; texto mudado pela gestão em pergunta que continua (atendimento,
-- comida, indicaria, como conheceu) é mantido. Rodar de novo não cria outra versão.
do $$
declare
  v_p record;
  v_atual jsonb;
  v_nova jsonb;
  v_padrao_antigo jsonb := '{"atendimento": "Como foi o atendimento?", "comida": "Como estava a comida?",
    "nps": "De 0 a 10, quanto você indicaria a gente para um amigo?", "conheceu": "Como você conheceu a gente?"}'::jsonb;
begin
  for v_p in select id, versao_atual from public.avaliacoes_pesquisas for update loop
    select perguntas into v_atual from public.avaliacoes_pesquisa_versoes where pesquisa_id = v_p.id and versao = v_p.versao_atual;
    if exists (select 1 from jsonb_array_elements(v_atual) q where q ->> 'chave' = 'pedido_certo') then
      continue;
    end if;
    select jsonb_agg(
             case when n ->> 'chave' in ('atendimento', 'comida', 'nps', 'conheceu')
                       and a.texto is not null and a.texto <> (v_padrao_antigo ->> (n ->> 'chave'))
                  then jsonb_set(n, '{texto}', to_jsonb(a.texto))
                  else n end
             order by o)
      into v_nova
      from jsonb_array_elements(public.avaliacoes_perguntas_padrao()) with ordinality as e(n, o)
      left join lateral (select q ->> 'texto' as texto from jsonb_array_elements(v_atual) q
                          where q ->> 'chave' = n ->> 'chave' limit 1) a on true;
    insert into public.avaliacoes_pesquisa_versoes (pesquisa_id, versao, perguntas, criado_por)
    values (v_p.id, v_p.versao_atual + 1, v_nova, null);
    update public.avaliacoes_pesquisas set versao_atual = v_p.versao_atual + 1, atualizado_em = now() where id = v_p.id;
  end loop;
end;
$$;
