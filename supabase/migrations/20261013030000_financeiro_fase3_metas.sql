-- Financeiro V2, Fase 3, item 3 (13/10/2026): metas da unidade para o farol do Painel M.E.G.A.
--
-- Desenho: `_execucao/zatti-hub/financeiro-v2-fase3-desenho.md`. Nenhuma meta padrão: sem linha
-- aqui (ou com o campo nulo), o painel mostra o número sem cor. O farol compara o número da DRE
-- com a meta vigente no mês, e a vigência é por mês (`vigente_desde`, sempre dia 1): mudar a meta
-- a partir de um mês cria outra linha e não altera o farol dos meses anteriores.
--
-- Percentuais em fração (0.32 = 32%), igual aos percentuais que a DRE já calcula.
-- Leitura: quem acessa o Financeiro da unidade (mesma regra exclusiva de 29/09 e da unidade
-- liberada de 11/10, via `usuario_pode_usar_financeiro_gerencial`). Escrita: só pela RPC
-- `fin_meta_unidade_salvar`, Gestão ou master, nunca INSERT/UPDATE/DELETE direto.
--
-- Desfazer: `drop function public.fin_meta_unidade_salvar(text, date, numeric, numeric, numeric, numeric);`
-- e `drop table public.fin_metas_unidade;` (nenhuma outra tabela depende dela).
begin;

create table if not exists public.fin_metas_unidade (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  vigente_desde date not null check (extract(day from vigente_desde) = 1),
  faturamento numeric(14,2) check (faturamento is null or faturamento > 0),
  cmv_percentual numeric(7,4) check (cmv_percentual is null or (cmv_percentual > 0 and cmv_percentual < 1)),
  custo_fixo_percentual numeric(7,4) check (custo_fixo_percentual is null or (custo_fixo_percentual > 0 and custo_fixo_percentual < 1)),
  resultado numeric(14,2),
  criado_por uuid not null references auth.users(id),
  atualizado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, vigente_desde)
);

comment on table public.fin_metas_unidade is
  'Financeiro V2 Fase 3 (13/10/2026): metas da unidade para o farol do Painel M.E.G.A., com vigência por mês. Escrita só pela RPC fin_meta_unidade_salvar.';

alter table public.fin_metas_unidade enable row level security;

drop policy if exists "fin_metas_unidade_select" on public.fin_metas_unidade;
create policy "fin_metas_unidade_select" on public.fin_metas_unidade
  for select to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));

revoke all on table public.fin_metas_unidade from anon;
revoke insert, update, delete, truncate on table public.fin_metas_unidade from authenticated;
grant select on table public.fin_metas_unidade to authenticated;

-- Mesmos gatilhos genéricos do módulo (timestamp e auditoria).
drop trigger if exists atualizar_timestamp on public.fin_metas_unidade;
create trigger atualizar_timestamp
  before update on public.fin_metas_unidade
  for each row execute function public.atualizar_timestamp_estoque_mensal();

drop trigger if exists auditar_escrita on public.fin_metas_unidade;
create trigger auditar_escrita
  after insert or update or delete on public.fin_metas_unidade
  for each row execute function public.auditar_escrita_financeiro_gerencial();

-- Grava (ou corrige) as metas vigentes a partir de um mês. Campo nulo = sem meta naquele
-- indicador a partir desse mês. Só Gestão/master com acesso ao Financeiro da unidade.
create or replace function public.fin_meta_unidade_salvar(
  p_unidade text,
  p_vigente_desde date,
  p_faturamento numeric,
  p_cmv_percentual numeric,
  p_custo_fixo_percentual numeric,
  p_resultado numeric
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.usuario_pode_usar_financeiro_gerencial(p_unidade, array['gestao']) then
    raise exception 'Definir meta e restrito a Gestao/master com acesso ao Financeiro' using errcode = '42501';
  end if;
  if p_vigente_desde is null or extract(day from p_vigente_desde) <> 1 then
    raise exception 'A meta vale a partir do primeiro dia de um mes' using errcode = '23514';
  end if;

  insert into public.fin_metas_unidade as m (
    unidade_id, vigente_desde, faturamento, cmv_percentual, custo_fixo_percentual, resultado, criado_por, atualizado_por
  ) values (
    p_unidade, p_vigente_desde, p_faturamento, p_cmv_percentual, p_custo_fixo_percentual, p_resultado, auth.uid(), auth.uid()
  )
  on conflict (unidade_id, vigente_desde) do update set
    faturamento = excluded.faturamento,
    cmv_percentual = excluded.cmv_percentual,
    custo_fixo_percentual = excluded.custo_fixo_percentual,
    resultado = excluded.resultado,
    atualizado_por = excluded.atualizado_por
  returning m.id into v_id;

  return v_id;
end;
$$;

revoke all on function public.fin_meta_unidade_salvar(text, date, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.fin_meta_unidade_salvar(text, date, numeric, numeric, numeric, numeric) to authenticated;

commit;
