-- Financeiro V2, fatia F2 (11/10/2026): a Conciliação passa a gravar no financeiro.
--
-- Desenho D3-D5 com o veredito do Codex (_execucao/zatti-hub/financeiro-v2-desenho.md):
-- - Decisão durável (`fin_conciliacao_decisoes`) com vínculos a baixas, lançamentos de ajuste,
--   descontos e transferências. Nada é apagado: desfazer gera estorno e marca a decisão desfeita.
-- - `fin_conciliacao_decidir` (SECURITY DEFINER com atestado, padrão da Conciliação) revalida
--   acesso, unidade de cada referência, conta, direção, saldo e estado, sob lock. Lote de até 200
--   itens, tudo ou nada, com o número do item no erro. Idempotente por chave de requisição.
-- - Ações: baixar_parcelas (1 movimento -> N parcelas, com ajuste explícito), vincular_baixas
--   (pagamento já registrado à mão), criar_documento (nota nova já paga), transferencia (contas
--   próprias, fora da DRE) e ignorar (com motivo).
-- - Aprendizado só sugere (decisão de Vinícius): "Confirmar e aprender" cria ou reforça regra da
--   unidade; categoria diferente deixa a regra conflitante.
-- - Gatilhos de lançamento, parcela, baixa e período fechado continuam valendo: rodam com o
--   `auth.uid()` de quem decidiu.
begin;

-- ── Período fechado para transferência (mesma regra das baixas) ───────────
create or replace function public.bloquear_periodo_fechado_transferencia()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or public.usuario_pode_usar_financeiro_gerencial(new.unidade_id, array['gestao']) then
    return new;
  end if;
  if public.periodo_financeiro_fechado(new.unidade_id, new.data) then
    raise exception 'Mes fechado: so Gestao/master altera lancamentos desse periodo' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ── Transferências entre contas próprias ──────────────────────────────────
create table if not exists public.fin_transferencias (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  conta_origem_id uuid not null,
  conta_destino_id uuid not null,
  valor numeric(14,2) not null check (valor > 0),
  data date not null,
  descricao text not null default '' check (char_length(descricao) <= 200),
  origem text not null default 'manual' check (origem in ('manual', 'conciliacao')),
  movimento_origem_id uuid,
  movimento_destino_id uuid,
  cancelada_em timestamptz,
  cancelada_por uuid references auth.users(id),
  motivo_cancelamento text check (motivo_cancelamento is null or char_length(motivo_cancelamento) <= 300),
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  unique (unidade_id, id),
  foreign key (unidade_id, conta_origem_id) references public.fin_contas_financeiras(unidade_id, id),
  foreign key (unidade_id, conta_destino_id) references public.fin_contas_financeiras(unidade_id, id),
  foreign key (unidade_id, movimento_origem_id) references public.fin_movimentos_importados(unidade_id, id),
  foreign key (unidade_id, movimento_destino_id) references public.fin_movimentos_importados(unidade_id, id),
  check (conta_origem_id <> conta_destino_id),
  check ((cancelada_em is null) = (cancelada_por is null))
);

create unique index if not exists fin_transferencias_mov_origem
  on public.fin_transferencias (movimento_origem_id) where movimento_origem_id is not null and cancelada_em is null;
create unique index if not exists fin_transferencias_mov_destino
  on public.fin_transferencias (movimento_destino_id) where movimento_destino_id is not null and cancelada_em is null;
create index if not exists fin_transferencias_data on public.fin_transferencias (unidade_id, data);

alter table public.fin_transferencias enable row level security;
create policy "fin_transferencias_select" on public.fin_transferencias
  for select to authenticated using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_transferencias_insert" on public.fin_transferencias
  for insert to authenticated
  with check (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null) and criado_por = auth.uid());

create trigger bloquear_periodo_fechado before insert on public.fin_transferencias
  for each row execute function public.bloquear_periodo_fechado_transferencia();
create trigger auditar_escrita after insert or update or delete on public.fin_transferencias
  for each row execute function public.auditar_escrita_financeiro_gerencial();

-- ── Decisões da conciliação ───────────────────────────────────────────────
create table if not exists public.fin_conciliacao_decisoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  movimento_id uuid not null,
  acao text not null check (acao in ('baixar_parcelas', 'vincular_baixas', 'criar_documento', 'transferencia', 'ignorar')),
  situacao text not null default 'ativa' check (situacao in ('ativa', 'desfeita')),
  motivo text check (motivo is null or char_length(motivo) between 3 and 300),
  modo_aprendizado text not null default 'so_este' check (modo_aprendizado in ('aprender', 'so_este')),
  documento_id uuid,
  transferencia_id uuid,
  regra_id uuid references public.fin_regras_classificacao(id),
  regra_efeito text check (regra_efeito in ('criada', 'reforcada', 'conflito')),
  chave_requisicao text not null,
  decidido_por uuid not null references auth.users(id),
  decidido_em timestamptz not null default now(),
  desfeita_por uuid references auth.users(id),
  desfeita_em timestamptz,
  motivo_desfazer text check (motivo_desfazer is null or char_length(motivo_desfazer) between 3 and 300),
  unique (unidade_id, id),
  foreign key (unidade_id, movimento_id) references public.fin_movimentos_importados(unidade_id, id),
  foreign key (unidade_id, documento_id) references public.fin_documentos(unidade_id, id),
  foreign key (unidade_id, transferencia_id) references public.fin_transferencias(unidade_id, id),
  check ((situacao = 'desfeita') = (desfeita_em is not null and desfeita_por is not null)),
  check (acao <> 'ignorar' or motivo is not null),
  check (acao = 'transferencia' or transferencia_id is null),
  check ((regra_id is null) = (regra_efeito is null))
);

create unique index if not exists fin_conciliacao_decisao_ativa
  on public.fin_conciliacao_decisoes (movimento_id) where situacao = 'ativa';

create table if not exists public.fin_conciliacao_decisao_vinculos (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  decisao_id uuid not null,
  papel text not null check (papel in ('principal', 'ajuste', 'vinculada', 'desconto')),
  baixa_id uuid references public.fin_baixas(id),
  lancamento_id uuid,
  parcela_id uuid references public.fin_parcelas(id),
  valor_anterior numeric(14,2),
  ativo boolean not null default true,
  foreign key (unidade_id, decisao_id) references public.fin_conciliacao_decisoes(unidade_id, id),
  foreign key (unidade_id, lancamento_id) references public.fin_lancamentos(unidade_id, id),
  check (papel <> 'desconto' or (parcela_id is not null and valor_anterior is not null)),
  check (papel = 'desconto' or baixa_id is not null)
);

-- Uma baixa só pode sustentar uma decisão ativa.
create unique index if not exists fin_conciliacao_baixa_vinculada_uma_vez
  on public.fin_conciliacao_decisao_vinculos (baixa_id) where ativo and baixa_id is not null;
create index if not exists fin_conciliacao_vinculos_decisao on public.fin_conciliacao_decisao_vinculos (decisao_id);

create table if not exists public.fin_conciliacao_requisicoes (
  unidade_id text not null references public.unidades(id),
  chave text not null check (char_length(chave) between 8 and 120),
  digest text not null,
  resultado jsonb not null,
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  primary key (unidade_id, chave)
);

alter table public.fin_conciliacao_decisoes enable row level security;
alter table public.fin_conciliacao_decisao_vinculos enable row level security;
alter table public.fin_conciliacao_requisicoes enable row level security;
revoke all on table public.fin_conciliacao_decisoes, public.fin_conciliacao_decisao_vinculos,
  public.fin_conciliacao_requisicoes from public, anon, authenticated;
grant select on table public.fin_conciliacao_decisoes, public.fin_conciliacao_decisao_vinculos to authenticated;
create policy "fin_conciliacao_decisoes_select" on public.fin_conciliacao_decisoes
  for select to authenticated using (public.usuario_pode_usar_conciliacao(unidade_id, null));
create policy "fin_conciliacao_decisao_vinculos_select" on public.fin_conciliacao_decisao_vinculos
  for select to authenticated using (public.usuario_pode_usar_conciliacao(unidade_id, null));

-- ── Classificação: fim da trava do piloto, coerência da decisão ──────────
alter table public.fin_classificacoes drop constraint if exists fin_classificacoes_sem_decisao_na_fatia_piloto;
alter table public.fin_classificacoes
  add constraint fin_classificacoes_decisao_coerente check (
    (decisao is null) = (decidido_por is null) and (decisao is null) = (decidido_em is null)
    and (decisao is null or decisao in ('baixar_parcelas', 'vincular_baixas', 'criar_documento', 'transferencia', 'ignorar'))
    and (modo_aprendizado is null or modo_aprendizado in ('aprender', 'so_este'))
    and (categoria_final_id is null or decisao is not null)
  );

-- ── Regras: aprendizado e condições editáveis (D4, D5) ───────────────────
alter table public.fin_regras_classificacao drop constraint if exists fin_regras_classificacao_origem_check;
alter table public.fin_regras_classificacao
  add constraint fin_regras_classificacao_origem_check check (origem in ('manual', 'carga_dq', 'aprendizado'));
alter table public.fin_regras_classificacao
  add column if not exists nome text check (nome is null or char_length(trim(nome)) between 1 and 80),
  add column if not exists condicao text not null default 'igual' check (condicao in ('igual', 'contem', 'comeca_com')),
  add column if not exists valor_min numeric(14,2) check (valor_min is null or valor_min > 0),
  add column if not exists valor_max numeric(14,2) check (valor_max is null or valor_max > 0),
  add column if not exists prioridade integer not null default 100 check (prioridade between 1 and 10000);
alter table public.fin_regras_classificacao
  drop constraint if exists fin_regras_faixa_valor,
  add constraint fin_regras_faixa_valor check (valor_min is null or valor_max is null or valor_min <= valor_max);

drop index if exists public.fin_regras_local_ativa;
create unique index fin_regras_local_ativa
  on public.fin_regras_classificacao (unidade_id, padrao_normalizado, direcao, condicao,
    coalesce(valor_min, 0), coalesce(valor_max, 0))
  where escopo = 'unidade' and situacao = 'ativa';

-- ── Aprendizado ───────────────────────────────────────────────────────────
create or replace function public.fin_conciliacao_aprender(
  p_unidade text, p_padrao text, p_direcao text, p_categoria uuid, p_versao_normalizacao int
)
returns table (regra_id uuid, efeito text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_regra public.fin_regras_classificacao;
  v_org text;
begin
  select organizacao_id into v_org from public.unidades where id = p_unidade;
  select * into v_regra from public.fin_regras_classificacao r
    where r.unidade_id = p_unidade and r.escopo = 'unidade' and r.padrao_normalizado = p_padrao
      and r.direcao = p_direcao and r.condicao = 'igual' and r.valor_min is null and r.valor_max is null
      and r.situacao in ('ativa', 'conflitante')
    order by (r.situacao = 'ativa') desc
    limit 1
    for update;

  if not found then
    insert into public.fin_regras_classificacao (
      organizacao_id, unidade_id, escopo, padrao_normalizado, versao_normalizacao, direcao, categoria_id,
      situacao, confirmacoes, origem, criado_por, primeira_confirmacao_em, ultima_confirmacao_em
    ) values (
      v_org, p_unidade, 'unidade', p_padrao, p_versao_normalizacao, p_direcao, p_categoria,
      'ativa', 1, 'aprendizado', auth.uid(), now(), now()
    ) returning * into v_regra;
    insert into public.fin_regras_classificacao_versoes (regra_id, versao, situacao, categoria_id, motivo, alterado_por)
    values (v_regra.id, 1, 'ativa', p_categoria, 'Aprendida na conciliação', auth.uid());
    return query select v_regra.id, 'criada'::text;
    return;
  end if;

  if v_regra.situacao = 'ativa' and v_regra.categoria_id = p_categoria then
    update public.fin_regras_classificacao
      set confirmacoes = confirmacoes + 1, ultima_confirmacao_em = now(), atualizado_em = now()
      where id = v_regra.id;
    return query select v_regra.id, 'reforcada'::text;
    return;
  end if;

  -- Categoria diferente (ou regra já em conflito): para de sugerir até a Gestão revisar.
  update public.fin_regras_classificacao
    set situacao = 'conflitante', versao = versao + 1, atualizado_em = now(),
        motivo_alteracao = 'Confirmação com outro Plano de Contas'
    where id = v_regra.id;
  insert into public.fin_regras_classificacao_versoes (regra_id, versao, situacao, categoria_id, motivo, alterado_por)
  values (v_regra.id, v_regra.versao + 1, 'conflitante', p_categoria, 'Confirmação com outro Plano de Contas', auth.uid());
  return query select v_regra.id, 'conflito'::text;
end;
$$;
revoke all on function public.fin_conciliacao_aprender(text, text, text, uuid, int) from public, anon, authenticated;

-- ── Lançamento de ajuste já pago (juros, multa, tarifa, desconto concedido, juros recebidos) ──
create or replace function public.fin_conciliacao_lancar_ajuste(
  p_unidade text, p_mov public.fin_movimentos_importados, p_tipo text, p_categoria uuid, p_centavos bigint
)
returns table (lancamento_id uuid, baixa_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lanc uuid;
  v_parc uuid;
  v_baixa uuid;
begin
  if p_categoria is null or not exists (
    select 1 from public.fin_categorias c where c.unidade_id = p_unidade and c.id = p_categoria
  ) then
    raise exception 'Plano de Contas do ajuste invalido' using errcode = '23514';
  end if;
  insert into public.fin_lancamentos (unidade_id, tipo, origem, categoria_id, descricao, data_competencia,
    conta_financeira_id, observacao, criado_por)
  values (p_unidade, p_tipo, 'comum', p_categoria, left('Ajuste de conciliação: ' || p_mov.descricao_original, 200),
    p_mov.data, p_mov.conta_financeira_id, 'Criado pela Conciliação', auth.uid())
  returning id into v_lanc;
  insert into public.fin_parcelas (unidade_id, lancamento_id, numero, total_parcelas, valor, data_prevista, conta_financeira_id)
  values (p_unidade, v_lanc, 1, 1, p_centavos / 100.0, p_mov.data, p_mov.conta_financeira_id)
  returning id into v_parc;
  insert into public.fin_baixas (unidade_id, parcela_id, tipo, conta_financeira_id, valor, data, observacao, criado_por)
  values (p_unidade, v_parc, 'baixa', p_mov.conta_financeira_id, p_centavos / 100.0, p_mov.data, 'Conciliação', auth.uid())
  returning id into v_baixa;
  return query select v_lanc, v_baixa;
end;
$$;
revoke all on function public.fin_conciliacao_lancar_ajuste(text, public.fin_movimentos_importados, text, uuid, bigint)
  from public, anon, authenticated;

-- ── Aplicar um item ───────────────────────────────────────────────────────
create or replace function public.fin_conciliacao_aplicar_item(p_unidade text, p_chave text, p_item jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mov public.fin_movimentos_importados;
  v_acao text := p_item->>'acao';
  v_tipo text;
  v_mov_cent bigint;
  v_soma bigint := 0;
  v_dif bigint;
  v_dec uuid;
  v_doc uuid;
  v_transf uuid;
  v_el jsonb;
  v_parc record;
  v_baixa uuid;
  v_cent bigint;
  v_estado text;
  v_ajuste jsonb := p_item->'ajuste';
  v_ajuste_lanc uuid;
  v_ajuste_baixa uuid;
  v_aprender boolean := coalesce((p_item->>'aprender')::boolean, false);
  v_regra uuid;
  v_efeito text;
  v_categoria_final uuid := nullif(p_item->>'categoria_aprendida', '')::uuid;
  v_outra_conta uuid;
  v_par public.fin_movimentos_importados;
begin
  select * into v_mov from public.fin_movimentos_importados
    where unidade_id = p_unidade and id = (p_item->>'movimento_id')::uuid
    for update;
  if not found then
    raise exception 'Movimento invalido' using errcode = '42501';
  end if;
  if v_mov.estado not in ('pendente', 'revisar') then
    raise exception 'Movimento ja tratado' using errcode = 'P0001';
  end if;
  v_tipo := case when v_mov.direcao = 'entrada' then 'receita' else 'despesa' end;
  v_mov_cent := round(v_mov.valor * 100)::bigint;

  insert into public.fin_conciliacao_decisoes (unidade_id, movimento_id, acao, motivo, modo_aprendizado,
    transferencia_id, chave_requisicao, decidido_por)
  values (p_unidade, v_mov.id, v_acao, nullif(trim(p_item->>'motivo'), ''),
    case when v_aprender then 'aprender' else 'so_este' end,
    null, p_chave, auth.uid())
  returning id into v_dec;

  if v_acao = 'baixar_parcelas' then
    for v_el in select * from jsonb_array_elements(p_item->'parcelas') loop
      v_cent := (v_el->>'valor')::bigint;
      if v_cent is null or v_cent <= 0 then
        raise exception 'Valor de parcela invalido' using errcode = '23514';
      end if;
      select pa.id, pa.valor, pa.status, l.tipo into v_parc
        from public.fin_parcelas pa
        join public.fin_lancamentos l on l.unidade_id = pa.unidade_id and l.id = pa.lancamento_id
        where pa.unidade_id = p_unidade and pa.id = (v_el->>'parcela_id')::uuid
        for update of pa;
      if not found then
        raise exception 'Parcela invalida' using errcode = '42501';
      end if;
      if v_parc.tipo <> v_tipo then
        raise exception 'Parcela de % nao concilia movimento de %', v_parc.tipo, v_mov.direcao using errcode = '23514';
      end if;
      insert into public.fin_baixas (unidade_id, parcela_id, tipo, conta_financeira_id, valor, data, observacao, criado_por)
      values (p_unidade, v_parc.id, 'baixa', v_mov.conta_financeira_id, v_cent / 100.0, v_mov.data, 'Conciliação', auth.uid())
      returning id into v_baixa;
      insert into public.fin_conciliacao_decisao_vinculos (unidade_id, decisao_id, papel, baixa_id, parcela_id)
      values (p_unidade, v_dec, 'principal', v_baixa, v_parc.id);
      v_soma := v_soma + v_cent;

      -- Quitar o restante como desconto obtido (só Gestão: o gatilho da parcela exige).
      if coalesce((v_el->>'quitar_restante')::boolean, false) then
        insert into public.fin_conciliacao_decisao_vinculos (unidade_id, decisao_id, papel, parcela_id, valor_anterior)
        values (p_unidade, v_dec, 'desconto', v_parc.id, v_parc.valor);
        update public.fin_parcelas set valor = public.saldo_baixado_parcela(v_parc.id) where id = v_parc.id;
      end if;
    end loop;
    if v_soma = 0 then
      raise exception 'Escolha pelo menos uma parcela' using errcode = '23514';
    end if;

    v_dif := v_mov_cent - v_soma;
    if v_dif <> 0 then
      if v_ajuste is null or (v_ajuste->>'valor')::bigint <> abs(v_dif) then
        raise exception 'Diferenca de % centavos sem ajuste correspondente', v_dif using errcode = '23514';
      end if;
      if v_mov.direcao = 'saida' and v_dif < 0 then
        raise exception 'Pagamento menor que as parcelas: use baixa parcial ou quite o restante como desconto' using errcode = '23514';
      end if;
      select a.lancamento_id, a.baixa_id into v_ajuste_lanc, v_ajuste_baixa
        from public.fin_conciliacao_lancar_ajuste(p_unidade, v_mov,
          case when v_mov.direcao = 'entrada' and v_dif > 0 then 'receita' else 'despesa' end,
          (v_ajuste->>'categoria_id')::uuid, abs(v_dif)) a;
      insert into public.fin_conciliacao_decisao_vinculos (unidade_id, decisao_id, papel, baixa_id, lancamento_id)
      values (p_unidade, v_dec, 'ajuste', v_ajuste_baixa, v_ajuste_lanc);
    elsif v_ajuste is not null then
      raise exception 'Ajuste informado sem diferenca' using errcode = '23514';
    end if;
    v_estado := 'conciliado';

  elsif v_acao = 'vincular_baixas' then
    for v_el in select * from jsonb_array_elements(p_item->'baixas') loop
      select b.id, b.valor, b.conta_financeira_id, b.tipo, l.tipo as tipo_lanc into v_parc
        from public.fin_baixas b
        join public.fin_parcelas pa on pa.id = b.parcela_id
        join public.fin_lancamentos l on l.unidade_id = pa.unidade_id and l.id = pa.lancamento_id
        where b.unidade_id = p_unidade and b.id = (v_el#>>'{}')::uuid
        for update of b;
      if not found or v_parc.tipo <> 'baixa' then
        raise exception 'Baixa invalida' using errcode = '42501';
      end if;
      if exists (select 1 from public.fin_baixas e where e.estorno_de_baixa_id = v_parc.id) then
        raise exception 'Baixa ja estornada' using errcode = '23514';
      end if;
      if v_parc.conta_financeira_id <> v_mov.conta_financeira_id or v_parc.tipo_lanc <> v_tipo then
        raise exception 'Baixa de outra conta ou de outro tipo' using errcode = '23514';
      end if;
      insert into public.fin_conciliacao_decisao_vinculos (unidade_id, decisao_id, papel, baixa_id)
      values (p_unidade, v_dec, 'vinculada', v_parc.id);
      v_soma := v_soma + round(v_parc.valor * 100)::bigint;
    end loop;
    if v_soma <> v_mov_cent then
      raise exception 'As baixas somam % centavos e o movimento %', v_soma, v_mov_cent using errcode = '23514';
    end if;
    v_estado := 'conciliado';

  elsif v_acao = 'criar_documento' then
    if (p_item->'documento'->>'tipo') is distinct from v_tipo then
      raise exception 'Documento de tipo diferente do movimento' using errcode = '23514';
    end if;
    v_doc := public.fin_documento_criar((p_item->'documento') || jsonb_build_object(
      'unidade', p_unidade, 'origem', 'conciliacao', 'conta_financeira_id', v_mov.conta_financeira_id,
      'vencimentos', jsonb_build_array(v_mov.data)));
    if (select round(total * 100)::bigint from public.fin_documentos where id = v_doc) <> v_mov_cent then
      raise exception 'Documento com total diferente do movimento' using errcode = '23514';
    end if;
    perform public.fin_documento_baixar(jsonb_build_object('unidade', p_unidade, 'documento_id', v_doc,
      'vencimento', 1, 'conta_financeira_id', v_mov.conta_financeira_id, 'data', v_mov.data,
      'valor', v_mov_cent, 'observacao', 'Conciliação', 'chave', 'conc-' || v_dec::text));
    insert into public.fin_conciliacao_decisao_vinculos (unidade_id, decisao_id, papel, baixa_id, parcela_id)
    select p_unidade, v_dec, 'principal', b.id, b.parcela_id
      from public.fin_baixas b
      join public.fin_parcelas pa on pa.id = b.parcela_id
      join public.fin_lancamentos l on l.unidade_id = pa.unidade_id and l.id = pa.lancamento_id
     where l.documento_id = v_doc and b.tipo = 'baixa';
    update public.fin_conciliacao_decisoes set documento_id = v_doc where id = v_dec;
    v_estado := 'conciliado';

  elsif v_acao = 'transferencia' then
    if p_item ? 'transferencia_id' then
      -- Segunda ponta de uma transferência que já existe.
      select id into v_transf from public.fin_transferencias t
        where t.unidade_id = p_unidade and t.id = (p_item->>'transferencia_id')::uuid and t.cancelada_em is null
          and round(t.valor * 100)::bigint = v_mov_cent
          and ((v_mov.direcao = 'saida' and t.conta_origem_id = v_mov.conta_financeira_id and t.movimento_origem_id is null)
            or (v_mov.direcao = 'entrada' and t.conta_destino_id = v_mov.conta_financeira_id and t.movimento_destino_id is null))
        for update;
      if not found then
        raise exception 'Transferencia nao corresponde a este movimento' using errcode = '23514';
      end if;
      update public.fin_transferencias set
        movimento_origem_id = case when v_mov.direcao = 'saida' then v_mov.id else movimento_origem_id end,
        movimento_destino_id = case when v_mov.direcao = 'entrada' then v_mov.id else movimento_destino_id end
        where id = v_transf;
    else
      v_outra_conta := (p_item->>'conta_contraparte_id')::uuid;
      if not exists (select 1 from public.fin_contas_financeiras c
                     where c.unidade_id = p_unidade and c.id = v_outra_conta and c.id <> v_mov.conta_financeira_id
                       and c.tipo <> 'cartao_credito') then
        raise exception 'Conta da outra ponta invalida' using errcode = '23514';
      end if;
      insert into public.fin_transferencias (unidade_id, conta_origem_id, conta_destino_id, valor, data, descricao,
        origem, movimento_origem_id, movimento_destino_id, criado_por)
      values (p_unidade,
        case when v_mov.direcao = 'saida' then v_mov.conta_financeira_id else v_outra_conta end,
        case when v_mov.direcao = 'saida' then v_outra_conta else v_mov.conta_financeira_id end,
        v_mov.valor, v_mov.data, left(v_mov.descricao_original, 200), 'conciliacao',
        case when v_mov.direcao = 'saida' then v_mov.id end,
        case when v_mov.direcao = 'entrada' then v_mov.id end,
        auth.uid())
      returning id into v_transf;
    end if;
    update public.fin_conciliacao_decisoes set transferencia_id = v_transf where id = v_dec;
    v_estado := 'transferencia';
    v_aprender := false;

  elsif v_acao = 'ignorar' then
    if char_length(coalesce(trim(p_item->>'motivo'), '')) < 3 then
      raise exception 'Informe o motivo para ignorar' using errcode = '23514';
    end if;
    v_estado := 'ignorado';
    v_aprender := false;
  else
    raise exception 'Acao invalida' using errcode = '23514';
  end if;

  update public.fin_movimentos_importados set estado = v_estado, motivo_revisao = null where id = v_mov.id;

  if v_aprender and v_categoria_final is not null and char_length(coalesce(p_item->>'padrao', '')) >= 3 then
    select a.regra_id, a.efeito into v_regra, v_efeito
      from public.fin_conciliacao_aprender(p_unidade, p_item->>'padrao', v_mov.direcao, v_categoria_final,
        coalesce((p_item->>'versao_normalizacao')::int, 1)) a;
    update public.fin_conciliacao_decisoes set regra_id = v_regra, regra_efeito = v_efeito where id = v_dec;
  end if;

  update public.fin_classificacoes
    set decisao = v_acao, categoria_final_id = v_categoria_final,
        modo_aprendizado = case when v_aprender then 'aprender' else 'so_este' end,
        decidido_por = auth.uid(), decidido_em = now()
    where movimento_id = v_mov.id and situacao = 'vigente';

  return v_dec;
end;
$$;
revoke all on function public.fin_conciliacao_aplicar_item(text, text, jsonb) from public, anon, authenticated;

-- ── Decidir (lote) ────────────────────────────────────────────────────────
-- Envelope: { op: 'decidir', kv, usuario, unidade, chave, itens: [...] }
create or replace function public.fin_conciliacao_decidir(p_envelope text, p_atestado text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_env jsonb;
  v_unidade text;
  v_chave text;
  v_digest text;
  v_existente public.fin_conciliacao_requisicoes;
  v_itens jsonb;
  v_i int;
  v_ids uuid[] := '{}';
  v_resultado jsonb;
begin
  v_env := public.fin_conciliacao_conferir_atestado(p_envelope, p_atestado, 'decidir');
  v_unidade := v_env->>'unidade';
  v_chave := v_env->>'chave';
  v_itens := v_env->'itens';
  if not public.usuario_pode_usar_conciliacao(v_unidade, null) then
    raise exception 'Sem acesso a Conciliacao desta unidade' using errcode = '42501';
  end if;
  if jsonb_typeof(v_itens) <> 'array' or jsonb_array_length(v_itens) < 1 or jsonb_array_length(v_itens) > 200 then
    raise exception 'Lote precisa ter de 1 a 200 itens' using errcode = '23514';
  end if;
  if v_chave is null or char_length(v_chave) < 8 then
    raise exception 'Chave da requisicao invalida' using errcode = '23514';
  end if;

  v_digest := encode(extensions.digest(convert_to(v_itens::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('fin_conc_req:' || v_unidade || ':' || v_chave, 0));
  select * into v_existente from public.fin_conciliacao_requisicoes where unidade_id = v_unidade and chave = v_chave;
  if found then
    if v_existente.digest <> v_digest then
      raise exception 'Chave da requisicao reutilizada com outro conteudo' using errcode = '23505';
    end if;
    return v_existente.resultado;
  end if;

  -- Ordem estável de lock: movimentos por id.
  perform 1 from public.fin_movimentos_importados m
    where m.unidade_id = v_unidade
      and m.id in (select (e->>'movimento_id')::uuid from jsonb_array_elements(v_itens) e)
    order by m.id for update;

  for v_i in 0 .. jsonb_array_length(v_itens) - 1 loop
    begin
      v_ids := v_ids || public.fin_conciliacao_aplicar_item(v_unidade, v_chave, v_itens->v_i);
    exception when others then
      raise exception 'Item %: %', v_i + 1, sqlerrm using errcode = sqlstate;
    end;
  end loop;

  v_resultado := jsonb_build_object('decisoes', to_jsonb(v_ids));
  insert into public.fin_conciliacao_requisicoes (unidade_id, chave, digest, resultado, criado_por)
  values (v_unidade, v_chave, v_digest, v_resultado, auth.uid());
  perform public.fin_conciliacao_auditar(v_unidade, 'conciliacao_decidida', v_ids[1],
    jsonb_build_object('chave', v_chave, 'itens', jsonb_array_length(v_itens)));
  return v_resultado;
end;
$$;
revoke all on function public.fin_conciliacao_decidir(text, text) from public, anon;
grant execute on function public.fin_conciliacao_decidir(text, text) to authenticated;

-- ── Desfazer (Gestão) ─────────────────────────────────────────────────────
-- Envelope: { op: 'desfazer', kv, usuario, unidade, decisao_id, motivo }
create or replace function public.fin_conciliacao_desfazer(p_envelope text, p_atestado text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_env jsonb;
  v_unidade text;
  v_dec public.fin_conciliacao_decisoes;
  v_motivo text;
  v_v record;
  v_estornos int := 0;
begin
  v_env := public.fin_conciliacao_conferir_atestado(p_envelope, p_atestado, 'desfazer');
  v_unidade := v_env->>'unidade';
  v_motivo := trim(coalesce(v_env->>'motivo', ''));
  if not public.usuario_pode_usar_conciliacao(v_unidade, array['gestao']) then
    raise exception 'Desfazer conciliacao e restrito a Gestao/master' using errcode = '42501';
  end if;
  if char_length(v_motivo) < 3 then
    raise exception 'Informe o motivo para desfazer' using errcode = '23514';
  end if;

  select * into v_dec from public.fin_conciliacao_decisoes
    where unidade_id = v_unidade and id = (v_env->>'decisao_id')::uuid
    for update;
  if not found or v_dec.situacao <> 'ativa' then
    raise exception 'Decisao inexistente ou ja desfeita' using errcode = 'P0001';
  end if;
  perform 1 from public.fin_movimentos_importados where id = v_dec.movimento_id for update;

  -- Estorno das baixas criadas pela decisão (mesmo valor, conta e data da original).
  for v_v in
    select vi.id, vi.papel, vi.baixa_id, vi.lancamento_id, vi.parcela_id, vi.valor_anterior,
           b.parcela_id as b_parcela, b.conta_financeira_id, b.valor, b.data
      from public.fin_conciliacao_decisao_vinculos vi
      left join public.fin_baixas b on b.id = vi.baixa_id
     where vi.decisao_id = v_dec.id and vi.ativo
     order by (vi.papel = 'desconto') desc, vi.id
  loop
    if v_v.papel = 'desconto' then
      update public.fin_parcelas set valor = v_v.valor_anterior where id = v_v.parcela_id;
    elsif v_v.papel in ('principal', 'ajuste') then
      if not exists (select 1 from public.fin_baixas e where e.estorno_de_baixa_id = v_v.baixa_id) then
        insert into public.fin_baixas (unidade_id, parcela_id, tipo, estorno_de_baixa_id, conta_financeira_id, valor, data,
          observacao, criado_por)
        values (v_unidade, v_v.b_parcela, 'estorno', v_v.baixa_id, v_v.conta_financeira_id, v_v.valor, v_v.data,
          left('Conciliação desfeita: ' || v_motivo, 2000), auth.uid());
        v_estornos := v_estornos + 1;
      end if;
      if v_v.papel = 'ajuste' then
        update public.fin_parcelas set status = 'cancelado'
          where lancamento_id = v_v.lancamento_id and status <> 'cancelado';
      end if;
    end if;
    update public.fin_conciliacao_decisao_vinculos set ativo = false where id = v_v.id;
  end loop;

  -- Nota criada por esta conciliação: sem outra baixa ativa, as parcelas são canceladas (o documento
  -- fica no histórico; não sai da DRE apagando, sai cancelando, como no ajuste).
  if v_dec.acao = 'criar_documento' and v_dec.documento_id is not null and not exists (
    select 1 from public.fin_baixas b
      join public.fin_parcelas pa on pa.id = b.parcela_id
      join public.fin_lancamentos l on l.unidade_id = pa.unidade_id and l.id = pa.lancamento_id
     where l.documento_id = v_dec.documento_id and b.tipo = 'baixa'
       and not exists (select 1 from public.fin_baixas e where e.estorno_de_baixa_id = b.id)
  ) then
    update public.fin_parcelas set status = 'cancelado'
     where lancamento_id in (select id from public.fin_lancamentos where unidade_id = v_unidade and documento_id = v_dec.documento_id)
       and status <> 'cancelado';
  end if;

  if v_dec.transferencia_id is not null then
    update public.fin_transferencias set
      movimento_origem_id = case when movimento_origem_id = v_dec.movimento_id then null else movimento_origem_id end,
      movimento_destino_id = case when movimento_destino_id = v_dec.movimento_id then null else movimento_destino_id end
      where id = v_dec.transferencia_id;
    -- Sem nenhuma ponta conciliada, a transferência criada pela conciliação é cancelada.
    update public.fin_transferencias set cancelada_em = now(), cancelada_por = auth.uid(),
        motivo_cancelamento = left('Conciliação desfeita: ' || v_motivo, 300)
      where id = v_dec.transferencia_id and origem = 'conciliacao'
        and movimento_origem_id is null and movimento_destino_id is null and cancelada_em is null;
  end if;

  if v_dec.regra_id is not null then
    if v_dec.regra_efeito = 'criada' then
      update public.fin_regras_classificacao set situacao = 'suspensa', versao = versao + 1,
          motivo_alteracao = 'Conciliação que criou a regra foi desfeita', atualizado_em = now()
        where id = v_dec.regra_id and confirmacoes <= 1 and situacao = 'ativa';
      update public.fin_regras_classificacao set confirmacoes = confirmacoes - 1, atualizado_em = now()
        where id = v_dec.regra_id and confirmacoes > 1;
    elsif v_dec.regra_efeito = 'reforcada' then
      update public.fin_regras_classificacao set confirmacoes = greatest(confirmacoes - 1, 0), atualizado_em = now()
        where id = v_dec.regra_id;
    end if;
  end if;

  update public.fin_conciliacao_decisoes
    set situacao = 'desfeita', desfeita_por = auth.uid(), desfeita_em = now(), motivo_desfazer = v_motivo
    where id = v_dec.id;
  update public.fin_movimentos_importados set estado = 'pendente', motivo_revisao = null where id = v_dec.movimento_id;
  update public.fin_classificacoes
    set decisao = null, categoria_final_id = null, modo_aprendizado = null, decidido_por = null, decidido_em = null
    where movimento_id = v_dec.movimento_id and situacao = 'vigente';

  perform public.fin_conciliacao_auditar(v_unidade, 'conciliacao_desfeita', v_dec.id,
    jsonb_build_object('motivo', v_motivo, 'estornos', v_estornos));
  return jsonb_build_object('desfeita', true, 'estornos', v_estornos);
end;
$$;
revoke all on function public.fin_conciliacao_desfazer(text, text) from public, anon;
grant execute on function public.fin_conciliacao_desfazer(text, text) to authenticated;

-- ── Baixas já registradas que podem sustentar um movimento ────────────────
create or replace function public.fin_conciliacao_candidatos_baixa(p_movimento uuid, p_janela_dias int default 5)
returns table (baixa_id uuid, parcela_id uuid, lancamento_id uuid, descricao text, data date, valor numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mov public.fin_movimentos_importados;
begin
  select * into v_mov from public.fin_movimentos_importados where id = p_movimento;
  if not found or not public.usuario_pode_usar_conciliacao(v_mov.unidade_id, null) then
    raise exception 'Movimento invalido' using errcode = '42501';
  end if;
  return query
    select b.id, b.parcela_id, l.id, l.descricao, b.data, b.valor
      from public.fin_baixas b
      join public.fin_parcelas pa on pa.id = b.parcela_id
      join public.fin_lancamentos l on l.unidade_id = pa.unidade_id and l.id = pa.lancamento_id
     where b.unidade_id = v_mov.unidade_id
       and b.conta_financeira_id = v_mov.conta_financeira_id
       and b.tipo = 'baixa'
       and l.tipo = case when v_mov.direcao = 'entrada' then 'receita' else 'despesa' end
       and b.data between v_mov.data - p_janela_dias and v_mov.data + p_janela_dias
       and b.valor <= v_mov.valor
       and not exists (select 1 from public.fin_baixas e where e.estorno_de_baixa_id = b.id)
       and not exists (select 1 from public.fin_conciliacao_decisao_vinculos vi where vi.baixa_id = b.id and vi.ativo)
     order by abs(b.valor - v_mov.valor), abs(b.data - v_mov.data), b.id
     limit 50;
end;
$$;
revoke all on function public.fin_conciliacao_candidatos_baixa(uuid, int) from public, anon;
grant execute on function public.fin_conciliacao_candidatos_baixa(uuid, int) to authenticated;

commit;
