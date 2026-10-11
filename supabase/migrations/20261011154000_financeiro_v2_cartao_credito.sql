-- Financeiro V2, fatia F3 (11/10/2026): cartão de crédito com faturas.
--
-- D7 com o veredito do Codex (AJUSTADO, depois da réplica):
-- - Compra no cartão = despesa normal com competência na DATA DA COMPRA (regra de Vinícius) e conta
--   financeira = cartão. A parcela k da compra cai na fatura k-1 meses depois da fatura da compra.
-- - Fatura tem identidade estável (cartão + mês de referência); vencimento é atributo editável.
-- - "Pagamento de fatura" baixa as parcelas da fatura com a conta BANCÁRIA, na data do pagamento:
--   o caixa sai uma vez, no dia certo, sem despesa nova, e a DFC continua por Plano de Contas.
-- - No Fluxo projetado "Todas as contas" as parcelas do cartão aparecem no vencimento da fatura.
-- - Estorno de compra já paga (crédito na fatura) fica para depois: a V1 só cancela ou reduz
--   parcela ainda não paga (regra existente da parcela).
begin;

alter table public.fin_contas_financeiras drop constraint if exists fin_contas_financeiras_tipo_check;
alter table public.fin_contas_financeiras add constraint fin_contas_financeiras_tipo_check
  check (tipo in ('banco', 'caixa', 'carteira_digital', 'cartao_credito'));
alter table public.fin_contas_financeiras
  add column if not exists dia_fechamento smallint check (dia_fechamento between 1 and 31),
  add column if not exists dia_vencimento smallint check (dia_vencimento between 1 and 31),
  add column if not exists conta_pagadora_id uuid;
alter table public.fin_contas_financeiras
  drop constraint if exists fin_contas_cartao_campos,
  add constraint fin_contas_cartao_campos check (
    (tipo = 'cartao_credito') = (dia_fechamento is not null and dia_vencimento is not null)
  ),
  drop constraint if exists fin_contas_conta_pagadora_fkey,
  add constraint fin_contas_conta_pagadora_fkey
    foreign key (unidade_id, conta_pagadora_id) references public.fin_contas_financeiras(unidade_id, id);

create table if not exists public.fin_faturas_cartao (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  conta_cartao_id uuid not null,
  referencia date not null check (extract(day from referencia) = 1),
  fechamento date not null,
  vencimento date not null,
  criado_em timestamptz not null default now(),
  unique (unidade_id, id),
  unique (conta_cartao_id, referencia),
  foreign key (unidade_id, conta_cartao_id) references public.fin_contas_financeiras(unidade_id, id)
);

alter table public.fin_parcelas add column if not exists fatura_id uuid;
alter table public.fin_parcelas
  drop constraint if exists fin_parcelas_fatura_fkey,
  add constraint fin_parcelas_fatura_fkey foreign key (unidade_id, fatura_id) references public.fin_faturas_cartao(unidade_id, id);
create index if not exists fin_parcelas_fatura on public.fin_parcelas (fatura_id) where fatura_id is not null;

create table if not exists public.fin_fatura_pagamentos (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  fatura_id uuid not null,
  conta_financeira_id uuid not null,
  valor numeric(14,2) not null check (valor > 0),
  data date not null,
  chave text not null check (char_length(chave) between 8 and 120),
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  unique (unidade_id, chave),
  foreign key (unidade_id, fatura_id) references public.fin_faturas_cartao(unidade_id, id),
  foreign key (unidade_id, conta_financeira_id) references public.fin_contas_financeiras(unidade_id, id)
);

alter table public.fin_faturas_cartao enable row level security;
alter table public.fin_fatura_pagamentos enable row level security;
create policy "fin_faturas_cartao_select" on public.fin_faturas_cartao
  for select to authenticated using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_fatura_pagamentos_select" on public.fin_fatura_pagamentos
  for select to authenticated using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
revoke insert, update, delete on table public.fin_faturas_cartao, public.fin_fatura_pagamentos from authenticated;
create trigger auditar_escrita after insert or update or delete on public.fin_faturas_cartao
  for each row execute function public.auditar_escrita_financeiro_gerencial();
create trigger auditar_escrita after insert or update or delete on public.fin_fatura_pagamentos
  for each row execute function public.auditar_escrita_financeiro_gerencial();

-- ── Datas da fatura (pura) ────────────────────────────────────────────────
-- Dia "d" no mês de "p_mes" (dia 1), limitado ao último dia do mês.
create or replace function public.fin_dia_no_mes(p_mes date, p_dia int)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_mes + (least(p_dia, extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'))::int) - 1);
$$;

-- Referência (mês do fechamento) da fatura onde cai uma compra feita em p_compra.
create or replace function public.fin_referencia_fatura(p_compra date, p_dia_fechamento int)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p_compra <= public.fin_dia_no_mes(date_trunc('month', p_compra)::date, p_dia_fechamento)
      then date_trunc('month', p_compra)::date
    else (date_trunc('month', p_compra) + interval '1 month')::date
  end;
$$;

-- Fatura da referência (cria se não existir). Vencimento no mesmo mês se dia_vencimento > dia_fechamento.
create or replace function public.fin_fatura_obter(p_unidade text, p_cartao uuid, p_referencia date)
returns public.fin_faturas_cartao
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_conta public.fin_contas_financeiras;
  v_fatura public.fin_faturas_cartao;
  v_mes_venc date;
begin
  select * into v_conta from public.fin_contas_financeiras where unidade_id = p_unidade and id = p_cartao;
  if not found or v_conta.tipo <> 'cartao_credito' then
    raise exception 'Cartao invalido' using errcode = '23514';
  end if;
  select * into v_fatura from public.fin_faturas_cartao where conta_cartao_id = p_cartao and referencia = p_referencia;
  if found then return v_fatura; end if;
  v_mes_venc := case when v_conta.dia_vencimento > v_conta.dia_fechamento then p_referencia
                     else (p_referencia + interval '1 month')::date end;
  insert into public.fin_faturas_cartao (unidade_id, conta_cartao_id, referencia, fechamento, vencimento)
  values (p_unidade, p_cartao, p_referencia,
          public.fin_dia_no_mes(p_referencia, v_conta.dia_fechamento),
          public.fin_dia_no_mes(v_mes_venc, v_conta.dia_vencimento))
  on conflict (conta_cartao_id, referencia) do nothing;
  select * into v_fatura from public.fin_faturas_cartao where conta_cartao_id = p_cartao and referencia = p_referencia;
  return v_fatura;
end;
$$;
revoke all on function public.fin_fatura_obter(text, uuid, date) from public, anon, authenticated;

-- Parcela de despesa no cartão: entra na fatura certa e vence no vencimento dela. A fatura é sempre
-- calculada aqui (nunca aceita a informada) no insert e quando a conta ou a fatura mudam (achado do
-- Codex). Parcela de documento rateado usa a posição do vencimento, não o número compactado.
-- Roda antes dos gatilhos de período fechado e de proteção (ordem alfabética).
create or replace function public.atribuir_fatura_cartao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo_conta text;
  v_fechamento int;
  v_compra date;
  v_tipo_lanc text;
  v_fatura public.fin_faturas_cartao;
begin
  select tipo, dia_fechamento into v_tipo_conta, v_fechamento
    from public.fin_contas_financeiras where unidade_id = new.unidade_id and id = new.conta_financeira_id;
  if new.conta_financeira_id is null or v_tipo_conta is distinct from 'cartao_credito' then
    new.fatura_id := null;
    return new;
  end if;
  select data_competencia, tipo into v_compra, v_tipo_lanc
    from public.fin_lancamentos where unidade_id = new.unidade_id and id = new.lancamento_id;
  if v_tipo_lanc is distinct from 'despesa' then
    raise exception 'Cartao de credito so recebe despesa' using errcode = '23514';
  end if;
  v_fatura := public.fin_fatura_obter(new.unidade_id, new.conta_financeira_id,
    (public.fin_referencia_fatura(v_compra, v_fechamento)
      + make_interval(months => coalesce(new.vencimento_documento, new.numero) - 1))::date);
  if tg_op = 'INSERT' or new.fatura_id is distinct from v_fatura.id then
    new.data_prevista := v_fatura.vencimento;
  end if;
  new.fatura_id := v_fatura.id;
  return new;
end;
$$;

drop trigger if exists atribuir_fatura_cartao on public.fin_parcelas;
create trigger atribuir_fatura_cartao
  before insert or update of conta_financeira_id, fatura_id on public.fin_parcelas
  for each row execute function public.atribuir_fatura_cartao();

-- ── Pagamento de fatura ───────────────────────────────────────────────────
-- { unidade, fatura_id, conta_financeira_id (conta bancária), data, valor (centavos), chave }
-- SECURITY DEFINER (achado do Codex: sem INSERT direto no histórico de pagamentos). Trava a chave,
-- depois as parcelas, e só então lê o saldo; o valor inteiro precisa ser distribuído.
create or replace function public.fin_fatura_pagar(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade text := p->>'unidade';
  v_valor bigint := (p->>'valor')::bigint;
  v_fatura uuid := (p->>'fatura_id')::uuid;
  v_data date := (p->>'data')::date;
  v_resto bigint;
  v_pag public.fin_fatura_pagamentos;
  v_conta record;
  v_ids uuid[];
  v_saldo bigint;
  v_total bigint := 0;
  v_parte bigint;
  v_k int;
begin
  if auth.uid() is null or not public.usuario_pode_usar_financeiro_gerencial(v_unidade, null) then
    raise exception 'Sem acesso ao Financeiro desta unidade' using errcode = '42501';
  end if;
  if v_valor is null or v_valor <= 0 or v_data is null then
    raise exception 'Valor do pagamento invalido' using errcode = '23514';
  end if;
  if char_length(coalesce(p->>'chave', '')) < 8 then
    raise exception 'Chave do pagamento obrigatoria' using errcode = '23514';
  end if;
  select id, tipo into v_conta from public.fin_contas_financeiras
    where unidade_id = v_unidade and id = (p->>'conta_financeira_id')::uuid and ativo;
  if not found or v_conta.tipo = 'cartao_credito' then
    raise exception 'Escolha a conta que pagou a fatura' using errcode = '23514';
  end if;
  if not exists (select 1 from public.fin_faturas_cartao f where f.unidade_id = v_unidade and f.id = v_fatura) then
    raise exception 'Fatura invalida' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fin_req:fatura_pagar:' || v_unidade || ':' || (p->>'chave'), 0));
  select * into v_pag from public.fin_fatura_pagamentos where unidade_id = v_unidade and chave = p->>'chave';
  if found then
    if v_pag.fatura_id is distinct from v_fatura or v_pag.conta_financeira_id is distinct from v_conta.id
       or round(v_pag.valor * 100)::bigint is distinct from v_valor or v_pag.data is distinct from v_data then
      raise exception 'Chave do pagamento reutilizada com outro conteudo' using errcode = '23505';
    end if;
    return v_pag.id;
  end if;

  select array_agg(pa.id order by l.data_competencia, l.criado_em, pa.id) into v_ids
    from public.fin_parcelas pa
    join public.fin_lancamentos l on l.unidade_id = pa.unidade_id and l.id = pa.lancamento_id
   where pa.unidade_id = v_unidade and pa.fatura_id = v_fatura and pa.status in ('aberto', 'parcial');
  perform 1 from public.fin_parcelas where id = any(coalesce(v_ids, '{}')) order by id for update;
  for v_k in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    v_total := v_total + round((select valor - public.saldo_baixado_parcela(id) from public.fin_parcelas where id = v_ids[v_k]) * 100)::bigint;
  end loop;
  if v_total < v_valor then
    raise exception 'Valor maior que o saldo em aberto da fatura' using errcode = '23514';
  end if;

  insert into public.fin_fatura_pagamentos (unidade_id, fatura_id, conta_financeira_id, valor, data, chave, criado_por)
  values (v_unidade, v_fatura, v_conta.id, v_valor / 100.0, v_data, p->>'chave', auth.uid())
  returning * into v_pag;

  v_resto := v_valor;
  for v_k in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    exit when v_resto = 0;
    select round((valor - public.saldo_baixado_parcela(id)) * 100)::bigint into v_saldo
      from public.fin_parcelas where id = v_ids[v_k] and status in ('aberto', 'parcial');
    v_parte := least(coalesce(v_saldo, 0), v_resto);
    continue when v_parte <= 0;
    insert into public.fin_baixas (unidade_id, parcela_id, tipo, conta_financeira_id, valor, data, observacao, criado_por)
    values (v_unidade, v_ids[v_k], 'baixa', v_conta.id, v_parte / 100.0, v_data, 'Pagamento de fatura', auth.uid());
    v_resto := v_resto - v_parte;
  end loop;
  if v_resto <> 0 then
    raise exception 'Pagamento nao distribuido integralmente' using errcode = '23514';
  end if;
  return v_pag.id;
end;
$$;
revoke all on function public.fin_fatura_pagar(jsonb) from public, anon;
grant execute on function public.fin_fatura_pagar(jsonb) to authenticated;

-- Corrigir o vencimento real de uma fatura (Gestão): a fatura e suas parcelas mudam juntas.
create or replace function public.fin_fatura_alterar_vencimento(p_unidade text, p_fatura uuid, p_vencimento date)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.usuario_pode_usar_financeiro_gerencial(p_unidade, array['gestao']) then
    raise exception 'Alterar vencimento de fatura e restrito a Gestao/master' using errcode = '42501';
  end if;
  update public.fin_faturas_cartao set vencimento = p_vencimento where unidade_id = p_unidade and id = p_fatura;
  if not found then raise exception 'Fatura invalida' using errcode = '23514'; end if;
  update public.fin_parcelas set data_prevista = p_vencimento
   where unidade_id = p_unidade and fatura_id = p_fatura and status <> 'cancelado';
end;
$$;
revoke all on function public.fin_fatura_alterar_vencimento(text, uuid, date) from public, anon;
grant execute on function public.fin_fatura_alterar_vencimento(text, uuid, date) to authenticated;

commit;
