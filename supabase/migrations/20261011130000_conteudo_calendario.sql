-- Conteúdo (Escritório > Conteúdo): calendário editorial do @viniciusczanetti, que sai do Notion e
-- passa a morar no Zatti Hub. Interno da Zatti, só master, igual ao Comercial.
-- Especificação aprovada pelo Codex em 11/10/2026: `_execucao/zatti-hub/conteudo-calendario-v1.md`.
--
--   - `conteudo_pecas`: uma linha por peça. `versao` sobe a cada mudança; quem grava manda a versão
--     que leu e, se divergir, recebe erro (a rota devolve 409). Sem delete: "tirar" uma peça é
--     voltar o status para Ideia e limpar a data.
--   - `conteudo_pecas_eventos`: auditoria (antes/depois, autor, origem hub|vini|import), gravada na
--     mesma transação da mudança, dentro das RPCs.
--   - `conteudo_segredos`: SHA-256 do token do Vini (rota /api/conteudo/pecas), sem grant.
--   - Escrita só por RPC: a tela usa `conteudo_hub_salvar` (confere master); a rota usa
--     `conteudo_api_*` (confere o token). Campos, listas e limites validados dentro da RPC.
--   - Reimportar do Notion não sobrescreve: `origem_notion_id` único e o POST devolve a peça atual.
begin;

-- ── Peças ──────────────────────────────────────────────────────────────────
create table if not exists public.conteudo_pecas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) > 0 and char_length(titulo) <= 200),
  data date,
  hora time,
  status text not null default 'Ideia' check (status in
    ('Ideia', 'Roteiro pronto', 'Gravado', 'Editado', 'Publicado Teste', 'Publicado todos')),
  formato text not null default '' check (formato in
    ('', 'Vídeo lo-fi frontal', 'Vídeo câmera traseira', 'Caixinha de perguntas', 'Tela verde',
     'Carrossel de fotos', 'Crença escrita', 'Quebra de expectativa', 'Vídeo texto (b-roll)')),
  etapa_funil text not null default '' check (etapa_funil in ('', 'Topo', 'Meio', 'Fundo')),
  roteiro text not null default '' check (char_length(roteiro) <= 20000),
  legenda text not null default '' check (char_length(legenda) <= 5000),
  link_referencia text not null default '' check (char_length(link_referencia) <= 1000),
  link_arquivos text not null default '' check (char_length(link_arquivos) <= 1000),
  observacao text not null default '' check (char_length(observacao) <= 2000),
  origem_notion_id text unique check (origem_notion_id is null or origem_notion_id ~ '^[A-Za-z0-9-]{1,64}$'),
  versao integer not null default 1 check (versao > 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por text not null default '' check (char_length(criado_por) <= 120),
  atualizado_por text not null default '' check (char_length(atualizado_por) <= 120),
  origem_ultima_mudanca text not null default 'hub' check (origem_ultima_mudanca in ('hub', 'vini', 'import')),
  check (hora is null or data is not null)
);

create index if not exists conteudo_pecas_data_idx on public.conteudo_pecas (data, hora);
create index if not exists conteudo_pecas_status_idx on public.conteudo_pecas (status);

drop trigger if exists tocar_atualizado_em on public.conteudo_pecas;
create trigger tocar_atualizado_em before update on public.conteudo_pecas
  for each row execute function public.tocar_atualizado_em();

-- ── Auditoria ──────────────────────────────────────────────────────────────
create table if not exists public.conteudo_pecas_eventos (
  id uuid primary key default gen_random_uuid(),
  peca_id uuid not null references public.conteudo_pecas(id) on delete restrict,
  acao text not null check (acao in ('criar', 'editar')),
  antes jsonb,
  depois jsonb not null,
  autor text not null check (char_length(autor) between 1 and 120),
  origem text not null check (origem in ('hub', 'vini', 'import')),
  em timestamptz not null default now()
);

create index if not exists conteudo_pecas_eventos_peca_idx on public.conteudo_pecas_eventos (peca_id, em);

-- ── Segredo da integração com o Vini (só o hash) ───────────────────────────
create table if not exists public.conteudo_segredos (
  chave text not null check (chave in ('vini')),
  versao integer not null check (versao > 0),
  valor text not null check (char_length(valor) = 64),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  primary key (chave, versao)
);
alter table public.conteudo_segredos enable row level security;
revoke all on public.conteudo_segredos from public, anon, authenticated;

-- ── RLS: só master lê; escrita só pelas RPCs ───────────────────────────────
alter table public.conteudo_pecas enable row level security;
alter table public.conteudo_pecas_eventos enable row level security;

drop policy if exists conteudo_pecas_select on public.conteudo_pecas;
create policy conteudo_pecas_select on public.conteudo_pecas
  for select to authenticated using (public.usuario_e_master());
drop policy if exists conteudo_pecas_eventos_select on public.conteudo_pecas_eventos;
create policy conteudo_pecas_eventos_select on public.conteudo_pecas_eventos
  for select to authenticated using (public.usuario_e_master());

revoke all on public.conteudo_pecas, public.conteudo_pecas_eventos from public, anon, authenticated;
grant select on public.conteudo_pecas, public.conteudo_pecas_eventos to authenticated;

-- ── Peça em JSON (contrato da API: hora "HH:MM") ───────────────────────────
create or replace function public.conteudo_peca_json(p public.conteudo_pecas)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select to_jsonb(p) || jsonb_build_object('hora', to_char(p.hora, 'HH24:MI'));
$$;

-- ── Token do Vini ──────────────────────────────────────────────────────────
create or replace function public.conteudo_token_valido(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_token is not null and char_length(p_token) between 32 and 200 and exists (
    select 1 from public.conteudo_segredos s
    where s.chave = 'vini' and s.ativo
      and s.valor = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
  );
$$;

-- ── Validação dos campos (mesmas regras de src/lib/conteudo/pecas.ts) ───────
-- Aplica sobre a peça base só as chaves enviadas. Chave fora da lista, tipo errado, valor fora das
-- listas ou acima do limite: erro 22023 com o nome do campo.
create or replace function public.conteudo_aplicar_campos(p_base public.conteudo_pecas, p_campos jsonb)
returns public.conteudo_pecas
language plpgsql
stable
set search_path = ''
as $$
declare
  v public.conteudo_pecas := p_base;
  k text;
  t text;
begin
  if p_campos is null or jsonb_typeof(p_campos) <> 'object' or length(p_campos::text) > 100000 then
    raise exception 'Campos invalidos' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_campos) loop
    if k not in ('titulo', 'data', 'hora', 'status', 'formato', 'etapa_funil', 'roteiro', 'legenda',
                 'link_referencia', 'link_arquivos', 'observacao') then
      raise exception 'Campo nao permitido: %', k using errcode = '22023';
    end if;
    if jsonb_typeof(p_campos->k) not in ('string', 'null') then
      raise exception 'Campo invalido: %', k using errcode = '22023';
    end if;
  end loop;

  if p_campos ? 'titulo' then
    t := btrim(coalesce(p_campos->>'titulo', ''));
    if t = '' or char_length(t) > 200 then
      raise exception 'Campo invalido: titulo' using errcode = '22023';
    end if;
    v.titulo := t;
  end if;

  if p_campos ? 'data' then
    t := nullif(btrim(coalesce(p_campos->>'data', '')), '');
    if t is null then
      v.data := null;
    else
      if t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Campo invalido: data' using errcode = '22023';
      end if;
      begin
        v.data := t::date;
      exception when others then
        raise exception 'Campo invalido: data' using errcode = '22023';
      end;
      if to_char(v.data, 'YYYY-MM-DD') <> t then
        raise exception 'Campo invalido: data' using errcode = '22023';
      end if;
    end if;
  end if;

  if p_campos ? 'hora' then
    t := nullif(btrim(coalesce(p_campos->>'hora', '')), '');
    if t is null then
      v.hora := null;
    else
      if t !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$' then
        raise exception 'Campo invalido: hora' using errcode = '22023';
      end if;
      v.hora := t::time;
    end if;
  end if;

  if p_campos ? 'status' then
    t := p_campos->>'status';
    if t is null or t not in ('Ideia', 'Roteiro pronto', 'Gravado', 'Editado', 'Publicado Teste', 'Publicado todos') then
      raise exception 'Campo invalido: status' using errcode = '22023';
    end if;
    v.status := t;
  end if;

  if p_campos ? 'formato' then
    t := coalesce(p_campos->>'formato', '');
    if t not in ('', 'Vídeo lo-fi frontal', 'Vídeo câmera traseira', 'Caixinha de perguntas', 'Tela verde',
                 'Carrossel de fotos', 'Crença escrita', 'Quebra de expectativa', 'Vídeo texto (b-roll)') then
      raise exception 'Campo invalido: formato' using errcode = '22023';
    end if;
    v.formato := t;
  end if;

  if p_campos ? 'etapa_funil' then
    t := coalesce(p_campos->>'etapa_funil', '');
    if t not in ('', 'Topo', 'Meio', 'Fundo') then
      raise exception 'Campo invalido: etapa_funil' using errcode = '22023';
    end if;
    v.etapa_funil := t;
  end if;

  if p_campos ? 'roteiro' then
    t := coalesce(p_campos->>'roteiro', '');
    if char_length(t) > 20000 then raise exception 'Campo invalido: roteiro' using errcode = '22023'; end if;
    v.roteiro := t;
  end if;
  if p_campos ? 'legenda' then
    t := coalesce(p_campos->>'legenda', '');
    if char_length(t) > 5000 then raise exception 'Campo invalido: legenda' using errcode = '22023'; end if;
    v.legenda := t;
  end if;
  if p_campos ? 'link_referencia' then
    t := btrim(coalesce(p_campos->>'link_referencia', ''));
    if char_length(t) > 1000 then raise exception 'Campo invalido: link_referencia' using errcode = '22023'; end if;
    v.link_referencia := t;
  end if;
  if p_campos ? 'link_arquivos' then
    t := btrim(coalesce(p_campos->>'link_arquivos', ''));
    if char_length(t) > 1000 then raise exception 'Campo invalido: link_arquivos' using errcode = '22023'; end if;
    v.link_arquivos := t;
  end if;
  if p_campos ? 'observacao' then
    t := coalesce(p_campos->>'observacao', '');
    if char_length(t) > 2000 then raise exception 'Campo invalido: observacao' using errcode = '22023'; end if;
    v.observacao := t;
  end if;

  -- Sem data não há hora ("tirar" a peça limpa a data e leva a hora junto).
  if v.data is null then
    v.hora := null;
  end if;
  return v;
end;
$$;

-- ── Gravação única (criar ou editar) com auditoria na mesma transação ──────
-- p_id null = criar. Editar exige a versão lida; divergente = erro PT409 (a rota devolve 409).
-- Devolve {peca, existente}: existente = true quando o origem_notion_id já estava no Hub.
create or replace function public.conteudo_gravar(
  p_id uuid, p_versao integer, p_campos jsonb, p_origem text, p_autor text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_campos jsonb := coalesce(p_campos, '{}'::jsonb);
  v_notion text;
  v_atual public.conteudo_pecas;
  v_nova public.conteudo_pecas;
  v_autor text := left(coalesce(nullif(btrim(p_autor), ''), p_origem), 120);
begin
  if p_origem not in ('hub', 'vini', 'import') then
    raise exception 'Origem invalida' using errcode = '22023';
  end if;
  if jsonb_typeof(v_campos) <> 'object' then
    raise exception 'Campos invalidos' using errcode = '22023';
  end if;

  if p_id is null then
    if v_campos ? 'origem_notion_id' then
      if jsonb_typeof(v_campos->'origem_notion_id') not in ('string', 'null') then
        raise exception 'Campo invalido: origem_notion_id' using errcode = '22023';
      end if;
      v_notion := nullif(btrim(coalesce(v_campos->>'origem_notion_id', '')), '');
      v_campos := v_campos - 'origem_notion_id';
      if v_notion is not null and v_notion !~ '^[A-Za-z0-9-]{1,64}$' then
        raise exception 'Campo invalido: origem_notion_id' using errcode = '22023';
      end if;
    end if;

    if not (v_campos ? 'titulo') then
      raise exception 'Campo invalido: titulo' using errcode = '22023';
    end if;

    v_atual.id := gen_random_uuid();
    v_atual.status := 'Ideia';
    v_atual.formato := '';
    v_atual.etapa_funil := '';
    v_atual.roteiro := '';
    v_atual.legenda := '';
    v_atual.link_referencia := '';
    v_atual.link_arquivos := '';
    v_atual.observacao := '';
    v_nova := public.conteudo_aplicar_campos(v_atual, v_campos);

    -- Reimportação: o payload já foi validado acima; devolve a peça como está, sem sobrescrever
    -- o que foi editado no Hub.
    if v_notion is not null then
      select * into v_atual from public.conteudo_pecas c where c.origem_notion_id = v_notion;
      if found then
        return jsonb_build_object('peca', public.conteudo_peca_json(v_atual), 'existente', true);
      end if;
    end if;
    v_nova.origem_notion_id := v_notion;
    v_nova.versao := 1;
    v_nova.criado_em := now();
    v_nova.atualizado_em := now();
    v_nova.criado_por := v_autor;
    v_nova.atualizado_por := v_autor;
    v_nova.origem_ultima_mudanca := p_origem;

    insert into public.conteudo_pecas select (v_nova).*
    on conflict (origem_notion_id) do nothing
    returning * into v_atual;
    if not found then
      select * into v_atual from public.conteudo_pecas c where c.origem_notion_id = v_notion;
      return jsonb_build_object('peca', public.conteudo_peca_json(v_atual), 'existente', true);
    end if;

    insert into public.conteudo_pecas_eventos (peca_id, acao, antes, depois, autor, origem)
    values (v_atual.id, 'criar', null, to_jsonb(v_atual), v_autor, p_origem);
    return jsonb_build_object('peca', public.conteudo_peca_json(v_atual), 'existente', false);
  end if;

  -- Editar
  if v_campos = '{}'::jsonb then
    raise exception 'Nenhum campo para mudar' using errcode = '22023';
  end if;
  select * into v_atual from public.conteudo_pecas c where c.id = p_id for update;
  if not found then
    raise exception 'Peca nao encontrada' using errcode = 'P0002';
  end if;
  if p_versao is null or p_versao <> v_atual.versao then
    raise exception 'Versao divergente' using errcode = 'PT409';
  end if;

  v_nova := public.conteudo_aplicar_campos(v_atual, v_campos);
  if (v_nova.titulo, v_nova.data, v_nova.hora, v_nova.status, v_nova.formato, v_nova.etapa_funil,
      v_nova.roteiro, v_nova.legenda, v_nova.link_referencia, v_nova.link_arquivos, v_nova.observacao)
     is not distinct from
     (v_atual.titulo, v_atual.data, v_atual.hora, v_atual.status, v_atual.formato, v_atual.etapa_funil,
      v_atual.roteiro, v_atual.legenda, v_atual.link_referencia, v_atual.link_arquivos, v_atual.observacao) then
    return jsonb_build_object('peca', public.conteudo_peca_json(v_atual), 'existente', true);
  end if;

  update public.conteudo_pecas c set
    titulo = v_nova.titulo,
    data = v_nova.data,
    hora = v_nova.hora,
    status = v_nova.status,
    formato = v_nova.formato,
    etapa_funil = v_nova.etapa_funil,
    roteiro = v_nova.roteiro,
    legenda = v_nova.legenda,
    link_referencia = v_nova.link_referencia,
    link_arquivos = v_nova.link_arquivos,
    observacao = v_nova.observacao,
    versao = c.versao + 1,
    atualizado_por = v_autor,
    origem_ultima_mudanca = p_origem
  where c.id = p_id
  returning * into v_nova;

  insert into public.conteudo_pecas_eventos (peca_id, acao, antes, depois, autor, origem)
  values (p_id, 'editar', to_jsonb(v_atual), to_jsonb(v_nova), v_autor, p_origem);
  return jsonb_build_object('peca', public.conteudo_peca_json(v_nova), 'existente', true);
end;
$$;

-- ── Rota do Vini (/api/conteudo/pecas), token conferido aqui dentro ────────
create or replace function public.conteudo_api_listar(p_token text, p_de date, p_ate date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.conteudo_token_valido(p_token) then
    raise exception 'Nao autorizado' using errcode = '42501';
  end if;
  if (p_de is null) <> (p_ate is null) or p_ate < p_de or p_ate - p_de > 366 then
    raise exception 'Periodo invalido' using errcode = '22023';
  end if;
  return jsonb_build_object('pecas', coalesce((
    select jsonb_agg(public.conteudo_peca_json(c.p) order by (c.p).data nulls last, (c.p).hora nulls first, (c.p).criado_em)
    from (
      select x as p from public.conteudo_pecas x
      where p_de is null or x.data between p_de and p_ate
      order by x.data nulls last, x.hora nulls first, x.criado_em
      limit 5000
    ) c
  ), '[]'::jsonb));
end;
$$;

create or replace function public.conteudo_api_criar(p_token text, p_peca jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_import boolean;
begin
  if not public.conteudo_token_valido(p_token) then
    raise exception 'Nao autorizado' using errcode = '42501';
  end if;
  if p_peca is null or jsonb_typeof(p_peca) <> 'object' then
    raise exception 'Campos invalidos' using errcode = '22023';
  end if;
  v_import := nullif(btrim(coalesce(p_peca->>'origem_notion_id', '')), '') is not null;
  return public.conteudo_gravar(null, null, p_peca,
    case when v_import then 'import' else 'vini' end,
    case when v_import then 'import' else 'vini' end);
end;
$$;

create or replace function public.conteudo_api_atualizar(p_token text, p_id uuid, p_versao integer, p_campos jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.conteudo_token_valido(p_token) then
    raise exception 'Nao autorizado' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'Campo invalido: id' using errcode = '22023';
  end if;
  return public.conteudo_gravar(p_id, p_versao, p_campos, 'vini', 'vini');
end;
$$;

-- ── Tela do Hub (só master, aal2) ──────────────────────────────────────────
create or replace function public.conteudo_hub_salvar(p_id uuid, p_versao integer, p_campos jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.usuario_e_master() then
    raise exception 'Sem permissao' using errcode = '42501';
  end if;
  if p_campos ? 'origem_notion_id' then
    raise exception 'Campo nao permitido: origem_notion_id' using errcode = '22023';
  end if;
  return public.conteudo_gravar(p_id, p_versao, p_campos, 'hub',
    coalesce(nullif(auth.jwt() ->> 'email', ''), auth.uid()::text));
end;
$$;

revoke all on function public.conteudo_peca_json(public.conteudo_pecas) from public, anon, authenticated;
revoke all on function public.conteudo_token_valido(text) from public, anon, authenticated;
revoke all on function public.conteudo_aplicar_campos(public.conteudo_pecas, jsonb) from public, anon, authenticated;
revoke all on function public.conteudo_gravar(uuid, integer, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.conteudo_api_listar(text, date, date) from public, anon, authenticated;
revoke all on function public.conteudo_api_criar(text, jsonb) from public, anon, authenticated;
revoke all on function public.conteudo_api_atualizar(text, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.conteudo_hub_salvar(uuid, integer, jsonb) from public, anon, authenticated;
-- A rota chama com a chave anon (sem sessão); o token é a barreira, conferido dentro da RPC.
grant execute on function public.conteudo_api_listar(text, date, date) to anon;
grant execute on function public.conteudo_api_criar(text, jsonb) to anon;
grant execute on function public.conteudo_api_atualizar(text, uuid, integer, jsonb) to anon;
grant execute on function public.conteudo_hub_salvar(uuid, integer, jsonb) to authenticated;

-- ── Rate limit: lista vigente (20261007090000) + conteudo_salvar ──────────
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
      ('sugerir_sku', 60, 3600),
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
      ('comercial_salvar', 120, 600),
      ('erro_navegador_registrar', 20, 600),
      ('conteudo_salvar', 120, 600)
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

commit;
