-- Checklist Garante: janela de conclusão até o fim do dia (decisão 3 de Vinícius,
-- 13/10/2026). Antes, depois do horário limite + 60 min (padrão) o checklist fechava.
-- Agora o padrão é concluir até 23:59:59 (América/São Paulo) do dia do checklist;
-- a gestão pode definir uma tolerância menor em Modelos > Regras da unidade.
-- Concluir depois do horário limite continua sendo atraso (P = 0 na nota).
--
--   garante_regras_unidade.atraso_max_min   passa a aceitar nulo = até o fim do dia
--                                           (novo padrão; 0 a 1440 continua valendo
--                                           como tolerância em minutos)
--   garante_fim_do_dia(data)                23:59:59 do dia, no fuso da operação
--   garante_janela / gatilho da execução    fecha_em = fim do dia quando a regra
--                                           vigente não tem tolerância
--   garante_definir_regra                   aceita atraso nulo
--
-- Versionamento (não reescreve o passado): execução já iniciada mantém o fecha_em
-- gravado; ocorrência não iniciada usa a regra vigente na data. Unidade cuja regra
-- vigente é a padrão criada pela migration da fase 2a (60 min, sem autor) ganha uma
-- versão a partir de AMANHÃ com "até o fim do dia", igual ao que a gestão faria na
-- tela. Regra definida pela gestão (com autor) não muda. Unidade sem regra alguma
-- passa a usar o novo padrão direto (antes caía nos 60 min implícitos).
--
-- Idempotente. O app em produção continua funcionando com isto aplicado antes da
-- publicação: as RPCs mantêm a assinatura e o app antigo manda minutos.

begin;

-- ══ Coluna: nulo = até o fim do dia ═════════════════════════════════════
alter table public.garante_regras_unidade alter column atraso_max_min drop not null;
alter table public.garante_regras_unidade alter column atraso_max_min drop default;
comment on column public.garante_regras_unidade.atraso_max_min is
  'Tolerância de atraso em minutos (0 a 1440) depois do horário limite. Nulo = até 23:59:59 do dia do checklist (padrão desde 13/10/2026).';

-- ══ Fim do dia no fuso da operação ══════════════════════════════════════
create or replace function public.garante_fim_do_dia(p_data date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_data + 1)::timestamp at time zone 'America/Sao_Paulo') - interval '1 second';
$$;
revoke all on function public.garante_fim_do_dia(date) from public, anon;
grant execute on function public.garante_fim_do_dia(date) to authenticated;

-- ══ Janela de uma ocorrência ════════════════════════════════════════════
-- Sem regra, ou regra sem tolerância: fecha no fim do dia. Com tolerância: prazo +
-- minutos (como antes). Antecedência padrão continua 120 min.
create or replace function public.garante_janela(p_unidade_id text, p_data date, p_horario time)
returns table (prazo timestamptz, abre_em timestamptz, fecha_em timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.prazo,
         b.prazo - make_interval(mins => coalesce(r.antecedencia_min, 120)),
         case when r.atraso_max_min is null then public.garante_fim_do_dia(p_data)
              else b.prazo + make_interval(mins => r.atraso_max_min) end
    from (select ((p_data + p_horario) at time zone 'America/Sao_Paulo') as prazo) b
    left join lateral (
      select g.antecedencia_min, g.atraso_max_min
        from public.garante_regras_unidade g
       where g.unidade_id = p_unidade_id and g.vigente_desde <= p_data
       order by g.vigente_desde desc
       limit 1
    ) r on true;
$$;

-- Execução gravada sem janela (só o servidor) ganha a da regra vigente na data.
create or replace function public.garante_execucoes_preencher_janela()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_a integer;
  v_b integer;
begin
  if new.abre_em is null or new.fecha_em is null then
    select coalesce(g.antecedencia_min, 120), g.atraso_max_min into v_a, v_b
      from (select 1) x
      left join lateral (
        select r.antecedencia_min, r.atraso_max_min from public.garante_regras_unidade r
         where r.unidade_id = new.unidade_id and r.vigente_desde <= new.data
         order by r.vigente_desde desc limit 1
      ) g on true;
    new.abre_em := coalesce(new.abre_em, new.prazo - make_interval(mins => v_a));
    new.fecha_em := coalesce(new.fecha_em,
      case when v_b is null then public.garante_fim_do_dia(new.data) else new.prazo + make_interval(mins => v_b) end);
  end if;
  return new;
end;
$$;

-- ══ Gestão define a regra: atraso nulo = até o fim do dia ═══════════════
create or replace function public.garante_definir_regra(
  p_unidade_id text, p_antecedencia_min integer, p_atraso_max_min integer, p_vigente_desde date default null,
  p_prazo_plano_horas integer default null
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje date := public.garante_hoje();
  v_data date := coalesce(p_vigente_desde, public.garante_hoje() + 1);
  v_base date;
  v_prazo integer;
begin
  if not public.usuario_pode_usar_garante(p_unidade_id, array['gestao']) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_data <= v_hoje then raise exception 'so_data_futura' using errcode = '22023'; end if;
  if p_antecedencia_min is null or p_antecedencia_min not between 0 and 720
     or (p_atraso_max_min is not null and p_atraso_max_min not between 0 and 1440)
     or (p_prazo_plano_horas is not null and p_prazo_plano_horas not between 1 and 168) then
    raise exception 'regra_invalida' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('garante_regra:' || p_unidade_id, 0));
  -- Unidade sem regra ganha antes a regra padrão (120 min antes, até o fim do dia)
  -- desde a primeira programação, para a nota do passado continuar igual.
  if not exists (select 1 from public.garante_regras_unidade where unidade_id = p_unidade_id) then
    select least(v_hoje, coalesce(min(p.vigente_desde), v_hoje)) into v_base
      from public.garante_publicacoes p where p.unidade_id = p_unidade_id;
    insert into public.garante_regras_unidade (unidade_id, vigente_desde, criado_por)
    values (p_unidade_id, v_base, auth.uid());
  end if;

  delete from public.garante_regras_unidade where unidade_id = p_unidade_id and vigente_desde > v_data;
  v_prazo := coalesce(p_prazo_plano_horas, public.garante_prazo_plano_horas(p_unidade_id, v_data));
  insert into public.garante_regras_unidade (unidade_id, vigente_desde, antecedencia_min, atraso_max_min, prazo_plano_horas, criado_por)
  values (p_unidade_id, v_data, p_antecedencia_min, p_atraso_max_min, v_prazo, auth.uid())
  on conflict (unidade_id, vigente_desde) do update
     set antecedencia_min = excluded.antecedencia_min, atraso_max_min = excluded.atraso_max_min,
         prazo_plano_horas = excluded.prazo_plano_horas, criado_por = excluded.criado_por, criado_em = now();
  return v_data;
end;
$$;

-- ══ Unidades com a regra padrão da fase 2a: nova versão a partir de amanhã ═══
-- Só a regra vigente sem autor (criada pela migration) e com os 60 min padrão,
-- sem versão futura agendada pela gestão. Rodar de novo não cria outra.
insert into public.garante_regras_unidade (unidade_id, vigente_desde, antecedencia_min, atraso_max_min, prazo_plano_horas)
select r.unidade_id, public.garante_hoje() + 1, r.antecedencia_min, null, r.prazo_plano_horas
  from public.garante_regras_unidade r
 where r.criado_por is null
   and r.atraso_max_min = 60
   and r.vigente_desde = (
     select max(v.vigente_desde) from public.garante_regras_unidade v
      where v.unidade_id = r.unidade_id and v.vigente_desde <= public.garante_hoje()
   )
   and not exists (
     select 1 from public.garante_regras_unidade f
      where f.unidade_id = r.unidade_id and f.vigente_desde > public.garante_hoje()
   )
on conflict (unidade_id, vigente_desde) do nothing;

commit;
