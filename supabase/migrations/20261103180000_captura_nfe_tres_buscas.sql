-- Captura de NF-e: três buscas por dia, 8h, 12h e 16h de Brasília (Vinícius, 03/11/2026). Substitui
-- "uma rodada boa por dia": a Ciência sai numa busca e o XML liberado chega na seguinte, no mesmo dia.
-- Cada busca tem até 3 tentativas. A reserva de 61 min continua garantindo a regra de 1 hora da SEFAZ.

-- Início da busca em vigor. Antes das 8h ainda vale a das 16h de ontem.
create or replace function public.fin_sefaz_inicio_da_busca(p_agora timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  with l as (select (p_agora at time zone 'America/Sao_Paulo') as t)
  select (date_trunc('day', l.t) + case
      when extract(hour from l.t) >= 16 then interval '16 hours'
      when extract(hour from l.t) >= 12 then interval '12 hours'
      when extract(hour from l.t) >= 8 then interval '8 hours'
      else interval '-8 hours' end) at time zone 'America/Sao_Paulo'
    from l
$$;
revoke all on function public.fin_sefaz_inicio_da_busca(timestamptz) from public, anon, authenticated;
grant execute on function public.fin_sefaz_inicio_da_busca(timestamptz) to service_role;

create or replace function public.fin_sefaz_pendencias()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_busca timestamptz := public.fin_sefaz_inicio_da_busca(now());
  v_ids uuid[];
begin
  with livres as (
    select c.id
      from public.fin_sefaz_certificados c
     where c.ativo and c.envelope is not null
       and (c.bloqueado_ate is null or c.bloqueado_ate < now())
       and not exists (select 1 from public.fin_sefaz_rodadas r
                        where r.certificado_id = c.id and r.situacao = 'ok' and r.iniciado_em >= v_busca)
       and (select count(*) from public.fin_sefaz_rodadas r
             where r.certificado_id = c.id and r.iniciado_em >= v_busca) < 3
     for update of c skip locked
  ), reservados as (
    update public.fin_sefaz_certificados c
       set bloqueado_ate = now() + interval '61 minutes', atualizado_em = now()
      from livres where c.id = livres.id
    returning c.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from reservados;

  return jsonb_build_object(
    'certificados', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'unidadeId', c.unidade_id, 'unidadeNome', u.nome, 'cnpj', c.cnpj, 'uf', c.uf,
        'ultNsu', c.ult_nsu, 'validoAte', c.valido_ate, 'envelope', c.envelope,
        'tentativasHoje', (select count(*) from public.fin_sefaz_rodadas r
                            where r.certificado_id = c.id and (r.iniciado_em at time zone 'America/Sao_Paulo')::date = v_hoje),
        'tentativasBusca', (select count(*) from public.fin_sefaz_rodadas r
                             where r.certificado_id = c.id and r.iniciado_em >= v_busca)))
      from public.fin_sefaz_certificados c join public.unidades u on u.id = c.unidade_id
     where c.id = any(v_ids)), '[]'::jsonb),
    'pendentes', coalesce((select jsonb_agg(jsonb_build_object(
        'certificadoId', n.certificado_id, 'chave', n.chave, 'situacao', n.situacao, 'cienciaEm', n.ciencia_em))
      from (select n.*, row_number() over (partition by n.certificado_id order by n.criado_em) as ordem
              from public.fin_sefaz_notas n
             where n.certificado_id = any(v_ids) and n.situacao in ('resumo', 'ciencia')) n
     where n.ordem <= 1000), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.fin_sefaz_pendencias() from public, anon, authenticated;
grant execute on function public.fin_sefaz_pendencias() to service_role;
