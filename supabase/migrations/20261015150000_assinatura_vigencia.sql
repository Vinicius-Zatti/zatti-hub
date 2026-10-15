-- Vigência anual de quem compra o Zatti Hub (15/10/2026).
-- Decisão de Vinícius: a venda continua anual, pagamento único em 12x. Sem cobrança automática:
-- perto do fim o cliente recebe avisos pelo WhatsApp (30, 7 e 1 dia antes e no dia) com o link de
-- renovação. Depois de vencer, 10 dias de uso com aviso e depois o app trava, sem apagar dado.
--
--   organizacoes.vigencia_fim       último dia de uso pago; null = nunca vence (contas manuais e antigas)
--   organizacoes.renovacao_token    identifica a conta no link de renovação (aleatório, sem dado pessoal)
--   zh_assinatura_avisos            um registro por aviso enviado (organização + marco + vigência):
--                                   o Vini nunca repete o mesmo aviso, nem depois de reiniciar
--   zh_renovacoes                   um registro por pagamento de renovação (idempotência)
--   zh_assinatura_renovar           service role: estende a vigência em 12 meses a partir do maior
--                                   entre hoje e o fim atual
--
-- Rodar DEPOIS do CRIAR_zatti_compra_cadastro_automatico e ANTES de publicar o app.
-- Só acrescenta. Idempotente.
begin;

alter table public.organizacoes
  add column if not exists vigencia_fim date,
  add column if not exists renovacao_token text;

comment on column public.organizacoes.vigencia_fim is
  'Último dia de uso pago (15/10/2026). Null = sem vigência (contas criadas à mão ou antes da compra automática).';
comment on column public.organizacoes.renovacao_token is
  'Identifica a conta no link de renovação do site. Aleatório, nunca dado pessoal.';

create unique index if not exists organizacoes_renovacao_token_unico
  on public.organizacoes (renovacao_token) where renovacao_token is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizacoes_renovacao_token_formato') then
    alter table public.organizacoes
      add constraint organizacoes_renovacao_token_formato
      check (renovacao_token is null or renovacao_token ~ '^[A-Za-z0-9_-]{24,64}$');
  end if;
end $$;

-- ── Avisos já enviados ─────────────────────────────────────────────────────
create table if not exists public.zh_assinatura_avisos (
  organizacao_id text not null references public.organizacoes(id) on delete cascade,
  marco text not null check (marco in ('d30', 'd7', 'd1', 'd0')),
  vigencia_fim date not null,
  enviado_em timestamptz not null default now(),
  primary key (organizacao_id, marco, vigencia_fim)
);
alter table public.zh_assinatura_avisos enable row level security;
revoke all on table public.zh_assinatura_avisos from public, anon, authenticated;
grant select, insert on table public.zh_assinatura_avisos to service_role;

-- ── Renovações pagas ───────────────────────────────────────────────────────
create table if not exists public.zh_renovacoes (
  pagamento_id text primary key check (pagamento_id ~ '^[0-9]{1,20}$'),
  organizacao_id text not null references public.organizacoes(id) on delete restrict,
  valor numeric(12, 2),
  fim_anterior date,
  fim_novo date not null,
  criado_em timestamptz not null default now()
);
alter table public.zh_renovacoes enable row level security;
revoke all on table public.zh_renovacoes from public, anon, authenticated;
grant select, insert on table public.zh_renovacoes to service_role;

-- Devolve {organizacao_id, restaurante, fim_anterior, fim_novo, repetido}. Token desconhecido = erro.
create or replace function public.zh_assinatura_renovar(p_token text, p_pagamento_id text, p_valor numeric)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org public.organizacoes%rowtype;
  v_ren public.zh_renovacoes%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_novo date;
begin
  if p_pagamento_id is null or p_pagamento_id !~ '^[0-9]{1,20}$' then
    raise exception 'Pagamento invalido' using errcode = '22023';
  end if;
  select * into v_org from public.organizacoes o
   where o.renovacao_token = p_token and p_token is not null
   for update;
  if not found then
    raise exception 'Conta nao encontrada' using errcode = 'P0002';
  end if;

  select * into v_ren from public.zh_renovacoes r where r.pagamento_id = p_pagamento_id;
  if found then
    return jsonb_build_object('organizacao_id', v_ren.organizacao_id, 'restaurante', v_org.nome,
      'fim_anterior', v_ren.fim_anterior, 'fim_novo', v_ren.fim_novo, 'repetido', true);
  end if;

  v_novo := (greatest(v_hoje, coalesce(v_org.vigencia_fim, v_hoje)) + interval '12 months')::date;
  insert into public.zh_renovacoes (pagamento_id, organizacao_id, valor, fim_anterior, fim_novo)
  values (p_pagamento_id, v_org.id, p_valor, v_org.vigencia_fim, v_novo);
  update public.organizacoes o set vigencia_fim = v_novo where o.id = v_org.id;

  return jsonb_build_object('organizacao_id', v_org.id, 'restaurante', v_org.nome,
    'fim_anterior', v_org.vigencia_fim, 'fim_novo', v_novo, 'repetido', false);
end;
$$;
revoke all on function public.zh_assinatura_renovar(text, text, numeric) from public, anon, authenticated;
grant execute on function public.zh_assinatura_renovar(text, text, numeric) to service_role;

commit;
