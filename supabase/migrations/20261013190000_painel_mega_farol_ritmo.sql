-- Painel M.E.G.A., farol por ritmo (decisão 4 de Vinícius, 13/10/2026): meta de custos
-- variáveis em R$ no mês, teto do ritmo (Custos de Venda Variáveis + Freelancers).
--
-- Desenho: `_execucao/zatti-hub/painel-mega-farol-semanal-desenho.md`. Sem meta padrão: coluna
-- nula = sem cor no painel. A RPC `fin_meta_unidade_salvar` ganha o 7º parâmetro com default
-- null, então o app atual (que manda 6) continua funcionando depois desta migração; salvar
-- metas pelo app antigo nesse intervalo grava null no campo novo (ele não o conhece).
-- A assinatura de 6 parâmetros é removida para não haver duas funções com o mesmo nome no
-- PostgREST.
--
-- Desfazer: recriar a função de 6 parâmetros (migração 20261013030000) e
-- `alter table public.fin_metas_unidade drop column custos_variaveis;`.
begin;

alter table public.fin_metas_unidade
  add column if not exists custos_variaveis numeric(14,2)
    check (custos_variaveis is null or custos_variaveis > 0);

comment on column public.fin_metas_unidade.custos_variaveis is
  'Teto de custos variáveis em R$ no mês (Custos de Venda Variáveis + Freelancers) para o farol por ritmo do Painel M.E.G.A. (13/10/2026). Nulo = sem meta.';

drop function if exists public.fin_meta_unidade_salvar(text, date, numeric, numeric, numeric, numeric);

create or replace function public.fin_meta_unidade_salvar(
  p_unidade text,
  p_vigente_desde date,
  p_faturamento numeric,
  p_cmv_percentual numeric,
  p_custo_fixo_percentual numeric,
  p_resultado numeric,
  p_custos_variaveis numeric default null
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
    unidade_id, vigente_desde, faturamento, cmv_percentual, custo_fixo_percentual, resultado, custos_variaveis, criado_por, atualizado_por
  ) values (
    p_unidade, p_vigente_desde, p_faturamento, p_cmv_percentual, p_custo_fixo_percentual, p_resultado, p_custos_variaveis, auth.uid(), auth.uid()
  )
  on conflict (unidade_id, vigente_desde) do update set
    faturamento = excluded.faturamento,
    cmv_percentual = excluded.cmv_percentual,
    custo_fixo_percentual = excluded.custo_fixo_percentual,
    resultado = excluded.resultado,
    custos_variaveis = excluded.custos_variaveis,
    atualizado_por = excluded.atualizado_por
  returning m.id into v_id;

  return v_id;
end;
$$;

revoke all on function public.fin_meta_unidade_salvar(text, date, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.fin_meta_unidade_salvar(text, date, numeric, numeric, numeric, numeric, numeric) to authenticated;

commit;
