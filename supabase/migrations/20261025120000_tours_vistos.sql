-- Tour no primeiro acesso de cada módulo (Navegação V2, fase 4, 25/10/2026).
-- Uma linha por usuário e módulo quando o tour já apareceu: ele não volta
-- sozinho (o XMenu repete o tour a cada sessão, e isso irrita). Rever é pelo
-- botão "Rever o tour" e não grava nada.
-- Cada usuário lê e insere só as próprias linhas; não há update nem delete
-- para o app. O app aguenta esta migration ainda não aplicada: se a leitura
-- falhar, o tour simplesmente não aparece.

create table if not exists public.tours_vistos (
  user_id uuid not null references auth.users (id) on delete cascade,
  modulo text not null check (modulo ~ '^[a-z][a-z_]{0,39}$'),
  visto_em timestamptz not null default now(),
  primary key (user_id, modulo)
);

comment on table public.tours_vistos is
  'Tour do primeiro acesso já visto, por usuário e módulo (Navegação V2, fase 4).';

alter table public.tours_vistos enable row level security;

revoke all on table public.tours_vistos from public, anon, authenticated;
grant select, insert on table public.tours_vistos to authenticated;
grant all on table public.tours_vistos to service_role;

drop policy if exists tours_vistos_select on public.tours_vistos;
create policy tours_vistos_select on public.tours_vistos
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists tours_vistos_insert on public.tours_vistos;
create policy tours_vistos_insert on public.tours_vistos
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Papéis do Vini (regra de 19/10/2026: tabela nova traz a própria política).
grant select, insert, update, delete on table public.tours_vistos to vini_operador;
drop policy if exists vini_operador_tudo on public.tours_vistos;
create policy vini_operador_tudo on public.tours_vistos
  for all to vini_operador using (true) with check (true);

grant select on table public.tours_vistos to vini_leitura;
drop policy if exists vini_leitura_select on public.tours_vistos;
create policy vini_leitura_select on public.tours_vistos
  for select to vini_leitura using (true);
