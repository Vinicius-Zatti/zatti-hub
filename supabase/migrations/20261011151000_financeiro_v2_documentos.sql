-- Financeiro V2, fatia F1 (11/10/2026): contrapartes, documento com rateio e criação transacional.
--
-- Desenho: _execucao/zatti-hub/financeiro-v2-desenho.md (D1, D2, D6), com o veredito do Codex.
-- - Documento é só agrupador: cada linha de Plano de Contas vira um `fin_lancamentos` comum com
--   `documento_id`. DRE, DFC, fluxo e provisões continuam lendo `categoria_id` sem mudança.
-- - O rateio em centavos é calculado no servidor (função pura testada) e conferido aqui: soma de
--   cada linha, soma de cada vencimento e nenhuma célula negativa. Célula zero não vira parcela.
-- - `fin_documento_criar` é SECURITY INVOKER: RLS, gatilhos de período fechado e de Plano de Contas
--   do usuário valem. Tudo numa transação: acabou o lançamento órfão.
-- - Idempotência: (unidade, chave) única; mesma chave com outro conteúdo é erro.
-- - Estorno de baixa passa a exigir valor e conta iguais aos da baixa original (achado do Codex).
begin;

-- ── Contrapartes ──────────────────────────────────────────────────────────
create table if not exists public.fin_contrapartes (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  nome text not null check (char_length(trim(nome)) between 1 and 160),
  documento text check (documento ~ '^([0-9]{11}|[0-9]{14})$'),
  tipo text not null default 'fornecedor' check (tipo in ('fornecedor', 'cliente', 'ambos')),
  ativo boolean not null default true,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, id)
);

create unique index if not exists fin_contrapartes_documento_unico
  on public.fin_contrapartes (unidade_id, documento) where documento is not null;
create index if not exists fin_contrapartes_nome on public.fin_contrapartes (unidade_id, lower(nome));

alter table public.fin_contrapartes enable row level security;
create policy "fin_contrapartes_select" on public.fin_contrapartes
  for select to authenticated using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_contrapartes_insert" on public.fin_contrapartes
  for insert to authenticated
  with check (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null) and criado_por = auth.uid());
create policy "fin_contrapartes_update_gestao" on public.fin_contrapartes
  for update to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));

create trigger tocar_atualizado_em before update on public.fin_contrapartes
  for each row execute function public.tocar_atualizado_em();
create trigger auditar_escrita after insert or update or delete on public.fin_contrapartes
  for each row execute function public.auditar_escrita_financeiro_gerencial();

-- ── Documentos ────────────────────────────────────────────────────────────
create table if not exists public.fin_documentos (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  tipo text not null check (tipo in ('receita', 'despesa')),
  contraparte_id uuid,
  numero text check (numero is null or char_length(trim(numero)) between 1 and 60),
  descricao text not null check (char_length(trim(descricao)) between 1 and 200),
  data_emissao date,
  origem text not null default 'manual'
    check (origem in ('manual', 'conciliacao', 'caixa_entrada', 'importacao_planilha')),
  chave_idempotencia text not null check (char_length(chave_idempotencia) between 8 and 120),
  conteudo_digest text not null check (conteudo_digest ~ '^[0-9a-f]{64}$'),
  total numeric(14,2) not null check (total > 0),
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  unique (unidade_id, id),
  unique (unidade_id, chave_idempotencia),
  foreign key (unidade_id, contraparte_id) references public.fin_contrapartes(unidade_id, id)
);

create index if not exists fin_documentos_contraparte on public.fin_documentos (unidade_id, contraparte_id);

alter table public.fin_documentos enable row level security;
create policy "fin_documentos_select" on public.fin_documentos
  for select to authenticated using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_documentos_insert" on public.fin_documentos
  for insert to authenticated
  with check (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null) and criado_por = auth.uid());
create policy "fin_documentos_delete_gestao" on public.fin_documentos
  for delete to authenticated using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));

create trigger auditar_escrita after insert or update or delete on public.fin_documentos
  for each row execute function public.auditar_escrita_financeiro_gerencial();

-- ── Lançamento e parcela ganham o vínculo ─────────────────────────────────
alter table public.fin_lancamentos
  add column if not exists documento_id uuid,
  add column if not exists contraparte_id uuid;

alter table public.fin_lancamentos
  drop constraint if exists fin_lancamentos_documento_fkey,
  add constraint fin_lancamentos_documento_fkey
    foreign key (unidade_id, documento_id) references public.fin_documentos(unidade_id, id) on delete restrict,
  drop constraint if exists fin_lancamentos_contraparte_fkey,
  add constraint fin_lancamentos_contraparte_fkey
    foreign key (unidade_id, contraparte_id) references public.fin_contrapartes(unidade_id, id);

create index if not exists fin_lancamentos_documento on public.fin_lancamentos (unidade_id, documento_id)
  where documento_id is not null;

-- Posição do vencimento dentro do documento (1..N). Identifica "o vencimento 2 do documento" em
-- todas as linhas, mesmo quando uma linha não tem parcela naquele vencimento (célula zero).
alter table public.fin_parcelas
  add column if not exists vencimento_documento smallint check (vencimento_documento is null or vencimento_documento > 0);

-- Lançamento de documento herda tipo e contraparte do documento (precedência do documento).
create or replace function public.coerir_lancamento_documento()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_doc record;
begin
  if new.documento_id is null then
    return new;
  end if;
  select tipo, contraparte_id into v_doc
    from public.fin_documentos where unidade_id = new.unidade_id and id = new.documento_id;
  if not found then
    raise exception 'Documento invalido para o lancamento' using errcode = '23514';
  end if;
  if v_doc.tipo is distinct from new.tipo then
    raise exception 'Lancamento com tipo diferente do documento' using errcode = '23514';
  end if;
  if new.contraparte_id is distinct from v_doc.contraparte_id then
    raise exception 'Contraparte do lancamento diferente da do documento' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists coerir_lancamento_documento on public.fin_lancamentos;
create trigger coerir_lancamento_documento
  before insert or update on public.fin_lancamentos
  for each row execute function public.coerir_lancamento_documento();

-- ── Estorno exige valor e conta da baixa original ─────────────────────────
create or replace function public.proteger_baixa_financeira()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_parcela record;
  v_original record;
begin
  if auth.uid() is null then
    return new;
  end if;

  select id, unidade_id, valor, status
    into v_parcela
    from public.fin_parcelas
    where id = new.parcela_id
    for update;

  if not found or v_parcela.unidade_id is distinct from new.unidade_id then
    raise exception 'Parcela invalida para baixa' using errcode = '42501';
  end if;
  if v_parcela.status = 'cancelado' then
    raise exception 'Parcela cancelada nao aceita baixa' using errcode = '42501';
  end if;

  if new.tipo = 'baixa' then
    if new.valor + public.saldo_baixado_parcela(new.parcela_id) > v_parcela.valor then
      raise exception 'Valor maior que o saldo em aberto da parcela' using errcode = '23514';
    end if;
  else
    if not public.usuario_pode_usar_financeiro_gerencial(new.unidade_id, array['gestao']) then
      raise exception 'Estorno de baixa e restrito a Gestao/master' using errcode = '42501';
    end if;
    select id, parcela_id, tipo, valor, conta_financeira_id into v_original
      from public.fin_baixas where id = new.estorno_de_baixa_id;
    if not found or v_original.parcela_id is distinct from new.parcela_id or v_original.tipo <> 'baixa' then
      raise exception 'Estorno so pode referenciar uma baixa da mesma parcela' using errcode = '42501';
    end if;
    if new.valor <> v_original.valor or new.conta_financeira_id is distinct from v_original.conta_financeira_id then
      raise exception 'Estorno precisa ter o mesmo valor e a mesma conta da baixa original' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

-- ── Criação transacional de documento ─────────────────────────────────────
-- Entrada (jsonb), valores em centavos inteiros:
-- { unidade, chave, digest, tipo, contraparte_id, numero, descricao, data_emissao, data_competencia,
--   conta_financeira_id, observacao, origem, vencimentos: [datas], linhas: [{ categoria_id, descricao,
--   valor, celulas: [centavos por vencimento] }] }
create or replace function public.fin_documento_criar(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_unidade text := p->>'unidade';
  v_chave text := p->>'chave';
  -- Digest calculado aqui (achado do Codex): o que o cliente manda não vale como prova de conteúdo.
  v_digest text := encode(extensions.digest(convert_to((p - 'digest')::text, 'UTF8'), 'sha256'), 'hex');
  v_tipo text := p->>'tipo';
  v_existente record;
  v_doc uuid;
  v_lanc uuid;
  v_vencs jsonb := p->'vencimentos';
  v_linhas jsonb := p->'linhas';
  v_n int;
  v_i int;
  v_j int;
  v_linha jsonb;
  v_celula bigint;
  v_soma_linha bigint;
  v_total bigint := 0;
  v_soma_col bigint[];
  v_numero int;
  v_qtd int;
  v_papel text;
begin
  if auth.uid() is null or not public.usuario_pode_usar_financeiro_gerencial(v_unidade, null) then
    raise exception 'Sem acesso ao Financeiro desta unidade' using errcode = '42501';
  end if;
  if v_tipo not in ('receita', 'despesa') then
    raise exception 'Tipo invalido' using errcode = '23514';
  end if;
  if jsonb_typeof(v_vencs) <> 'array' or jsonb_typeof(v_linhas) <> 'array' then
    raise exception 'Documento sem vencimentos ou linhas' using errcode = '23514';
  end if;
  v_n := jsonb_array_length(v_vencs);
  if v_n < 1 or v_n > 360 or jsonb_array_length(v_linhas) < 1 or jsonb_array_length(v_linhas) > 50 then
    raise exception 'Quantidade de vencimentos ou linhas fora do limite' using errcode = '23514';
  end if;

  -- Idempotência: mesma chave devolve o mesmo documento; conteúdo diferente é erro.
  perform pg_advisory_xact_lock(hashtextextended(v_unidade || ':' || v_chave, 0));
  select id, conteudo_digest into v_existente
    from public.fin_documentos where unidade_id = v_unidade and chave_idempotencia = v_chave;
  if found then
    if v_existente.conteudo_digest <> v_digest then
      raise exception 'Chave de idempotencia reutilizada com outro conteudo' using errcode = '23505';
    end if;
    return v_existente.id;
  end if;

  -- Conferência do rateio: célula >= 0, soma da linha = valor da linha, soma do vencimento > 0.
  v_soma_col := array_fill(0::bigint, array[v_n]);
  for v_i in 0 .. jsonb_array_length(v_linhas) - 1 loop
    v_linha := v_linhas->v_i;
    if jsonb_array_length(v_linha->'celulas') <> v_n then
      raise exception 'Linha % com quantidade de vencimentos diferente', v_i + 1 using errcode = '23514';
    end if;
    v_soma_linha := 0;
    for v_j in 0 .. v_n - 1 loop
      v_celula := (v_linha->'celulas'->>v_j)::bigint;
      if v_celula < 0 then
        raise exception 'Rateio com valor negativo' using errcode = '23514';
      end if;
      v_soma_linha := v_soma_linha + v_celula;
      v_soma_col[v_j + 1] := v_soma_col[v_j + 1] + v_celula;
    end loop;
    if v_soma_linha <= 0 or v_soma_linha <> (v_linha->>'valor')::bigint then
      raise exception 'Linha % nao fecha com o proprio valor', v_i + 1 using errcode = '23514';
    end if;
    v_total := v_total + v_soma_linha;
  end loop;
  for v_j in 1 .. v_n loop
    if v_soma_col[v_j] <= 0 then
      raise exception 'Vencimento % sem valor', v_j using errcode = '23514';
    end if;
  end loop;

  insert into public.fin_documentos (
    unidade_id, tipo, contraparte_id, numero, descricao, data_emissao, origem,
    chave_idempotencia, conteudo_digest, total, criado_por
  ) values (
    v_unidade, v_tipo, nullif(p->>'contraparte_id', '')::uuid, nullif(trim(p->>'numero'), ''),
    p->>'descricao', nullif(p->>'data_emissao', '')::date, coalesce(p->>'origem', 'manual'),
    v_chave, v_digest, v_total / 100.0, auth.uid()
  ) returning id into v_doc;

  for v_i in 0 .. jsonb_array_length(v_linhas) - 1 loop
    v_linha := v_linhas->v_i;
    select c.papel_dre into v_papel from public.fin_categorias c
      where c.unidade_id = v_unidade and c.id = (v_linha->>'categoria_id')::uuid;

    insert into public.fin_lancamentos (
      unidade_id, tipo, origem, categoria_id, descricao, data_competencia, conta_financeira_id,
      observacao, criado_por, documento_id, contraparte_id
    ) values (
      v_unidade, v_tipo,
      case when v_papel in ('cmo_ferias', 'cmo_decimo_terceiro', 'cmo_multa_fgts') then 'liquidacao_provisao' else 'comum' end,
      (v_linha->>'categoria_id')::uuid,
      coalesce(nullif(trim(v_linha->>'descricao'), ''), p->>'descricao'),
      (p->>'data_competencia')::date,
      nullif(p->>'conta_financeira_id', '')::uuid,
      coalesce(p->>'observacao', ''),
      auth.uid(), v_doc, nullif(p->>'contraparte_id', '')::uuid
    ) returning id into v_lanc;

    select count(*) into v_qtd from jsonb_array_elements_text(v_linha->'celulas') c where c::bigint > 0;
    v_numero := 0;
    for v_j in 0 .. v_n - 1 loop
      v_celula := (v_linha->'celulas'->>v_j)::bigint;
      continue when v_celula = 0;
      v_numero := v_numero + 1;
      insert into public.fin_parcelas (
        unidade_id, lancamento_id, numero, total_parcelas, valor, data_prevista,
        conta_financeira_id, vencimento_documento
      ) values (
        v_unidade, v_lanc, v_numero, v_qtd, v_celula / 100.0, (v_vencs->>v_j)::date,
        nullif(p->>'conta_financeira_id', '')::uuid, v_j + 1
      );
    end loop;
  end loop;

  return v_doc;
end;
$$;

revoke all on function public.fin_documento_criar(jsonb) from public, anon;
grant execute on function public.fin_documento_criar(jsonb) to authenticated;

-- ── Requisições idempotentes (baixa de documento e pagamento de fatura) ────
create table if not exists public.fin_requisicoes (
  unidade_id text not null references public.unidades(id),
  operacao text not null check (operacao in ('documento_baixar', 'fatura_pagar')),
  chave text not null check (char_length(chave) between 8 and 160),
  digest text not null,
  resultado jsonb not null,
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  primary key (unidade_id, operacao, chave)
);
alter table public.fin_requisicoes enable row level security;
revoke all on table public.fin_requisicoes from public, anon, authenticated;

-- ── Baixa de um vencimento do documento sobre o saldo restante ────────────
-- { unidade, documento_id, vencimento, conta_financeira_id, data, valor (centavos), observacao, chave }
-- Distribui o valor pelas parcelas daquele vencimento na proporção do saldo em aberto de cada uma
-- (maior resto, desempate pela ordem do lançamento), sob lock. Valor maior que o saldo é erro.
-- SECURITY DEFINER com checagem explícita de acesso; sem tabela temporária (achado do Codex). Os
-- gatilhos de baixa e período fechado continuam valendo pelo auth.uid() de quem chamou.
create or replace function public.fin_documento_baixar(p jsonb)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade text := p->>'unidade';
  v_chave text := p->>'chave';
  v_valor bigint := (p->>'valor')::bigint;
  v_digest text := encode(extensions.digest(convert_to(p::text, 'UTF8'), 'sha256'), 'hex');
  v_req public.fin_requisicoes;
  v_ids uuid[];
  v_saldos numeric[];
  v_bases bigint[];
  v_fracoes numeric[];
  v_total numeric := 0;
  v_resto bigint;
  v_n int;
  v_k int;
  v_ordem int[];
  v_qtd int := 0;
begin
  if auth.uid() is null or not public.usuario_pode_usar_financeiro_gerencial(v_unidade, null) then
    raise exception 'Sem acesso ao Financeiro desta unidade' using errcode = '42501';
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'Valor da baixa invalido' using errcode = '23514';
  end if;
  if v_chave is null or char_length(v_chave) < 8 then
    raise exception 'Chave da baixa obrigatoria' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fin_req:documento_baixar:' || v_unidade || ':' || v_chave, 0));
  select * into v_req from public.fin_requisicoes
    where unidade_id = v_unidade and operacao = 'documento_baixar' and chave = v_chave;
  if found then
    if v_req.digest <> v_digest then
      raise exception 'Chave da baixa reutilizada com outro conteudo' using errcode = '23505';
    end if;
    return (v_req.resultado->>'baixas')::int;
  end if;

  -- Trava as parcelas do vencimento (ordem estável) e só então lê os saldos.
  select array_agg(id order by ordem_l, id), array_agg(saldo order by ordem_l, id)
    into v_ids, v_saldos
    from (
      select pa.id, l.criado_em as ordem_l,
             (pa.valor - public.saldo_baixado_parcela(pa.id)) * 100 as saldo
        from public.fin_parcelas pa
        join public.fin_lancamentos l on l.unidade_id = pa.unidade_id and l.id = pa.lancamento_id
       where pa.unidade_id = v_unidade
         and l.documento_id = (p->>'documento_id')::uuid
         and pa.vencimento_documento = (p->>'vencimento')::int
         and pa.status in ('aberto', 'parcial')
       order by l.criado_em, pa.id
       for update of pa
    ) t
   where t.saldo > 0;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    raise exception 'Vencimento sem saldo em aberto' using errcode = '23514';
  end if;
  for v_k in 1 .. v_n loop v_total := v_total + v_saldos[v_k]; end loop;
  if v_valor > v_total then
    raise exception 'Valor maior que o saldo em aberto do vencimento' using errcode = '23514';
  end if;

  v_bases := array_fill(0::bigint, array[v_n]);
  v_fracoes := array_fill(0::numeric, array[v_n]);
  v_resto := v_valor;
  for v_k in 1 .. v_n loop
    v_bases[v_k] := trunc(v_saldos[v_k] * v_valor / v_total)::bigint;
    v_fracoes[v_k] := mod(v_saldos[v_k] * v_valor, v_total) / v_total;
    v_resto := v_resto - v_bases[v_k];
  end loop;
  -- Centavos que sobram vão para os maiores restos (desempate pela ordem).
  select array_agg(i order by v_fracoes[i] desc, i) into v_ordem from generate_series(1, v_n) i;
  for v_k in 1 .. v_resto loop
    v_bases[v_ordem[v_k]] := v_bases[v_ordem[v_k]] + 1;
  end loop;

  for v_k in 1 .. v_n loop
    continue when v_bases[v_k] <= 0;
    insert into public.fin_baixas (unidade_id, parcela_id, tipo, conta_financeira_id, valor, data, observacao, criado_por)
    values (v_unidade, v_ids[v_k], 'baixa', (p->>'conta_financeira_id')::uuid, v_bases[v_k] / 100.0,
            (p->>'data')::date, coalesce(p->>'observacao', ''), auth.uid());
    v_qtd := v_qtd + 1;
  end loop;

  insert into public.fin_requisicoes (unidade_id, operacao, chave, digest, resultado, criado_por)
  values (v_unidade, 'documento_baixar', v_chave, v_digest, jsonb_build_object('baixas', v_qtd), auth.uid());
  return v_qtd;
end;
$$;

revoke all on function public.fin_documento_baixar(jsonb) from public, anon;
grant execute on function public.fin_documento_baixar(jsonb) to authenticated;

commit;
