-- Financeiro Gerencial, Conciliação e Uso de IA só para Vinícius (29/09/2026).
--
-- Decisão de Vinícius, textual: "só eu posso ter acesso ao financeiro de qq
-- cliente então caso alguem alem de mim tem acesso ja retira por favor até
-- segunda ordem". Vale para toda unidade, inclusive Gestão, Operacional e
-- qualquer outro master.
--
-- Mecanismo explícito e reversível, sem apagar vínculo nem dado:
-- - `fin_acesso_exclusivo` (linha única): liga/desliga a restrição. Linha
--   ausente conta como restrição ligada (falha fechada).
-- - `fin_acesso_titulares`: quem é o titular. Semeada com as contas de
--   Vinícius (os dois e-mails dele) que tenham vínculo master ativo.
-- - `usuario_e_titular_financeiro()`: com a restrição ligada, exige titular
--   E master com segundo fator (`usuario_e_master()`, aal2).
-- - `usuario_pode_usar_financeiro_gerencial` passa a exigir o helper acima.
--   Toda policy das tabelas `fin_*`, os gatilhos, as RPCs da Conciliação
--   (via `usuario_pode_usar_conciliacao`) e o bucket `fin-conciliacao` já
--   dependem dessa função, então a regra vale em todo o banco de uma vez.
--
-- Desfazer ("segunda ordem"): `update public.fin_acesso_exclusivo set ativo =
-- false where id;` volta à matriz anterior (Gestão/Operacional por unidade).
-- Nenhuma tabela ou policy antiga foi reescrita.
begin;

create table if not exists public.fin_acesso_exclusivo (
  id boolean primary key default true check (id),
  ativo boolean not null default true,
  motivo text not null,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.fin_acesso_titulares (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

-- Configuração administrativa: sem policy e sem grant, só SQL do dono.
alter table public.fin_acesso_exclusivo enable row level security;
alter table public.fin_acesso_titulares enable row level security;
revoke all on table public.fin_acesso_exclusivo from public, anon, authenticated;
revoke all on table public.fin_acesso_titulares from public, anon, authenticated;

insert into public.fin_acesso_exclusivo (id, ativo, motivo)
values (true, true, 'Vinícius, 29/09/2026: Financeiro de qualquer cliente só para ele, até segunda ordem')
on conflict (id) do nothing;

insert into public.fin_acesso_titulares (user_id)
select u.id
from auth.users u
where lower(u.email) in ('consultoriazatti@gmail.com', 'viniciusczanetti@gmail.com')
  and exists (
    select 1 from public.vinculos v
    where v.user_id = u.id and v.status = 'ativo' and v.role = 'master'
  )
on conflict (user_id) do nothing;

create or replace function public.usuario_e_titular_financeiro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      not coalesce((select e.ativo from public.fin_acesso_exclusivo e where e.id), true)
      or (
        public.usuario_e_master()
        and exists (select 1 from public.fin_acesso_titulares t where t.user_id = auth.uid())
      )
    );
$$;

revoke all on function public.usuario_e_titular_financeiro() from public, anon;
grant execute on function public.usuario_e_titular_financeiro() to authenticated;

-- Mesma assinatura e mesmo corpo de 20260824090000, com a exigência nova.
create or replace function public.usuario_pode_usar_financeiro_gerencial(
  p_unidade_id text,
  p_papeis text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.usuario_tem_acesso_unidade(p_unidade_id, p_papeis)
    and exists (
      select 1 from public.unidades u
      where u.id = p_unidade_id
        and u.financeiro_gerencial_habilitado = true
    )
    and public.usuario_e_titular_financeiro();
$$;

revoke all on function public.usuario_pode_usar_financeiro_gerencial(text, text[]) from public, anon;
grant execute on function public.usuario_pode_usar_financeiro_gerencial(text, text[]) to authenticated;

-- `periodo_financeiro_fechado` (20260922100000) respondia para qualquer
-- unidade sem conferir acesso. Continua executável por `authenticated`
-- (o gatilho invoker de período fechado depende dela), mas agora recusa quem
-- não pode usar o Financeiro da unidade. SQL administrativo (sem usuário)
-- segue com a resposta real.
create or replace function public.periodo_financeiro_fechado(p_unidade_id text, p_data date)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and not public.usuario_pode_usar_financeiro_gerencial(p_unidade_id, null) then
    raise exception 'Sem acesso ao Financeiro desta unidade' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.fin_fechamentos f
    where f.unidade_id = p_unidade_id
      and f.competencia = date_trunc('month', p_data)::date
      and f.fechado
  );
end;
$$;

revoke all on function public.periodo_financeiro_fechado(text, date) from public, anon;
grant execute on function public.periodo_financeiro_fechado(text, date) to authenticated;

commit;
