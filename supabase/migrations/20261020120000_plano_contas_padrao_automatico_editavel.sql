-- Plano de contas padrão automático e editável (pedido de Vinícius em 20/10/2026).
-- 1. Unidade que liga o Financeiro recebe o plano padrão na hora. Desde 15/10 toda unidade nova nasce
--    com o Financeiro ligado, mas a semeadura era um passo manual e ficou esquecida (The House BH,
--    Dona Ninguém e Betones estavam sem plano). As que já estão ligadas e vazias recebem agora.
-- 2. Grupos de contas (grupo principal e subgrupo) continuam fixos. Dentro deles, Gestão renomeia e
--    remove qualquer conta, inclusive a padrão. Remover conta padrão é sempre arquivar (a semeadura
--    usa codigo_sistema e recriaria a linha apagada); conta própria nunca usada é apagada; usada é
--    arquivada e o histórico continua na DRE.
-- 3. Contas que o app usa nos cálculos podem ser renomeadas, nunca arquivadas nem apagadas:
--    folha, FGTS e INSS (base das provisões), as 3 de provisão e a de equipamentos (DFC).
-- Observação para migrações futuras: conta padrão agora pode ter nome editado pelo cliente; não
-- "corrigir" nome de conta padrão em massa sem decisão de Vinícius.
begin;

-- ── 1) Semeadura automática ──────────────────────────────────────────────
create or replace function public.semear_plano_ao_ligar_financeiro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.financeiro_gerencial_habilitado
     and (tg_op = 'INSERT' or not coalesce(old.financeiro_gerencial_habilitado, false)) then
    perform public.semear_categorias_financeiras(new.id);
  end if;
  return null;
end;
$$;

revoke all on function public.semear_plano_ao_ligar_financeiro() from public, anon, authenticated;

drop trigger if exists semear_plano_ao_ligar_financeiro on public.unidades;
create trigger semear_plano_ao_ligar_financeiro
  after insert or update of financeiro_gerencial_habilitado on public.unidades
  for each row execute function public.semear_plano_ao_ligar_financeiro();

do $$
declare
  v_unidade text;
begin
  for v_unidade in
    select u.id from public.unidades u
    where u.financeiro_gerencial_habilitado
      and not exists (select 1 from public.fin_categorias c where c.unidade_id = u.id)
  loop
    perform public.semear_categorias_financeiras(v_unidade);
  end loop;
end
$$;

-- ── 2) Contas essenciais ─────────────────────────────────────────────────
-- Mesma lista de CONTAS_ESSENCIAIS em src/lib/financeiro-gerencial/categorias.ts.
create or replace function public.categoria_financeira_essencial(p_codigo text, p_papel text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_codigo in ('cmo_folha_salarial', 'cmo_fgts', 'cmo_inss_folha', 'sno_equipamentos_investimentos'), false)
    or coalesce(p_papel in ('cmo_ferias', 'cmo_decimo_terceiro', 'cmo_multa_fgts'), false);
$$;

-- ── 3) Gatilho: grupo fixo, conta editável ───────────────────────────────
create or replace function public.proteger_categoria_financeira()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if old.padrao then
      raise exception 'Conta padrao nao e apagada: ela e arquivada' using errcode = '42501';
    end if;
    if old.nivel <> 'conta' then
      raise exception 'Grupo de contas nao pode ser apagado' using errcode = '42501';
    end if;
    return old;
  end if;

  new.nome := trim(new.nome);
  if tg_op = 'INSERT' and not (new.nivel = 'conta' and not new.padrao and new.codigo_sistema is null) then
    raise exception 'Grupo de contas e conta padrao nao sao criados pelo app' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.nivel <> 'conta' then
      raise exception 'Grupo de contas nao pode ser alterado' using errcode = '42501';
    end if;
    if new.id is distinct from old.id
       or new.unidade_id is distinct from old.unidade_id
       or new.parent_id is distinct from old.parent_id
       or new.nivel is distinct from old.nivel
       or new.papel_dre is distinct from old.papel_dre
       or new.codigo_sistema is distinct from old.codigo_sistema
       or new.padrao is distinct from old.padrao
       or new.ordem is distinct from old.ordem
       or new.criado_em is distinct from old.criado_em then
      raise exception 'Só nome e arquivamento podem mudar numa conta';
    end if;
    if new.arquivado and not old.arquivado
       and public.categoria_financeira_essencial(old.codigo_sistema, old.papel_dre) then
      raise exception 'Essa conta e usada nos calculos do app: pode renomear, nao remover' using errcode = '42501';
    end if;
    new.atualizado_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_categoria_financeira on public.fin_categorias;
create trigger proteger_categoria_financeira
  before insert or update or delete on public.fin_categorias
  for each row execute function public.proteger_categoria_financeira();

-- ── 4) Políticas: Gestão edita conta padrão e apaga conta própria ────────
drop policy if exists "fin_categorias_update_gestao" on public.fin_categorias;
create policy "fin_categorias_update_gestao" on public.fin_categorias
  for update to authenticated
  using (nivel = 'conta' and public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']))
  with check (nivel = 'conta' and public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));

drop policy if exists "fin_categorias_delete_gestao" on public.fin_categorias;
create policy "fin_categorias_delete_gestao" on public.fin_categorias
  for delete to authenticated
  using (
    padrao = false and nivel = 'conta'
    and public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao'])
  );

commit;
