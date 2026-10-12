-- Financeiro V2, fatia F0: liberar o Financeiro para a equipe de UMA unidade (11/10/2026).
--
-- Decisão de Vinícius em 11/10: "o financeiro vai ser para todo mundo, mas coloca primeiro só no
-- zatti burger pra eu testar mesmo, depois a gente muda pra todos".
--
-- A restrição global de 29/09 (`fin_acesso_exclusivo`, titular só Vinícius) continua valendo para
-- as demais unidades. `unidades.financeiro_liberado_equipe = true` abre o módulo para quem tem
-- vínculo com aquela unidade (Gestão, Operacional e master), seguindo a matriz de papéis de antes
-- da restrição. A coluna não tem policy de escrita (unidades só muda por SQL do dono).
--
-- Desfazer: `update public.unidades set financeiro_liberado_equipe = false where id = '<unidade>';`
begin;

alter table public.unidades
  add column if not exists financeiro_liberado_equipe boolean not null default false;

comment on column public.unidades.financeiro_liberado_equipe is
  'Financeiro V2 (11/10/2026): libera o Financeiro Gerencial para a equipe desta unidade, apesar da restrição de titular.';

-- Mesma assinatura de 20260930092000; titular OU unidade liberada.
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
        and (u.financeiro_liberado_equipe or public.usuario_e_titular_financeiro())
    );
$$;

revoke all on function public.usuario_pode_usar_financeiro_gerencial(text, text[]) from public, anon;
grant execute on function public.usuario_pode_usar_financeiro_gerencial(text, text[]) to authenticated;

commit;
