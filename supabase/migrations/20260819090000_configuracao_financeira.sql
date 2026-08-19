-- Calculadora de Margem de Contribuição: guarda faturamento médio, custo
-- fixo médio e lucro mensal desejado por unidade (1 linha, upsert) - usado
-- pra calcular a margem de contribuição necessária, que por sua vez
-- alimenta o "Preço de Venda Sugerido" de cada ficha técnica de venda.
-- Dado sensível (faturamento/lucro do cliente) - só Gestão/master vê e
-- edita, mesmo padrão do CMV Real em Estoque.
begin;

create table if not exists public.configuracao_financeira (
  unidade_id text primary key references public.unidades(id),
  faturamento_medio_mensal numeric(14,2) not null default 0 check (faturamento_medio_mensal >= 0),
  custo_fixo_medio_mensal numeric(14,2) not null default 0 check (custo_fixo_medio_mensal >= 0),
  lucro_desejado_valor numeric(14,2) not null default 0 check (lucro_desejado_valor >= 0),
  atualizado_por uuid references auth.users(id),
  atualizado_em timestamptz not null default now()
);

alter table public.configuracao_financeira enable row level security;

create policy "configuracao_financeira_gestao" on public.configuracao_financeira
  for all to authenticated
  using (public.usuario_pode_usar_fichas(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_fichas(unidade_id, array['gestao']));

create or replace function public.proteger_configuracao_financeira()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  return new;
end;
$$;

revoke all on function public.proteger_configuracao_financeira() from public, anon, authenticated;

drop trigger if exists proteger_configuracao_financeira on public.configuracao_financeira;
create trigger proteger_configuracao_financeira
  before insert or update on public.configuracao_financeira
  for each row execute function public.proteger_configuracao_financeira();

commit;
