-- Comercial: o Vini move o card para "Reunião de diagnóstico" depois da reunião (SDR-142, 18/11/2026).
-- O Davide (Visconde) fez a reunião em 17/11 e recebeu a proposta, mas o card ficou em "Preencheu formulário"
-- com a próxima ação automática "Ver se concluiu o pagamento": a zh_leads_registrar_evento só deixa o Vini
-- chegar até link_enviado, e Vinícius não move card à mão. Decisão de 18/11 (opção B): o Vini move até
-- reuniao_diagnostico e escreve a próxima ação.
--   - função nova zh_leads_registrar_negociacao, chamada pela mesma rota POST /api/leads/eventos quando
--     tipo = 'negociacao', com o mesmo token da zh_leads_registrar_evento (que não muda: a 20261118080000
--     da origem Reforma a recria, e as duas migrações não se cruzam);
--   - nunca cria lead (sem lead devolve {ok: false, motivo: 'sem_lead'});
--   - só para frente: card em reuniao_diagnostico, consultoria_fechada ou perdido não muda de etapa;
--   - próxima ação: só troca a que está vazia ou é automática (do formulário, do pagamento ou o próprio
--     lembrete do Vini); a que Vinícius escreveu fica, e a anterior vai para a linha do tempo;
--   - reenvio da mesma chave não duplica.
-- Nada é apagado.
begin;

-- p_evento: {chave, tipo: 'negociacao', em?, lead: {whatsapp? | instagram?}, reuniao_em: 'AAAA-MM-DD',
--            proxima_acao, proxima_acao_em?: 'AAAA-MM-DD', texto?}
create or replace function public.zh_leads_registrar_negociacao(p_token text, p_evento jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chave text := nullif(trim(p_evento->>'chave'), '');
  v_em timestamptz := coalesce((p_evento->>'em')::timestamptz, now());
  v_lead jsonb := coalesce(p_evento->'lead', '{}'::jsonb);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_reuniao date := (p_evento->>'reuniao_em')::date;
  v_acao text := nullif(trim(coalesce(p_evento->>'proxima_acao', '')), '');
  v_acao_em date := (p_evento->>'proxima_acao_em')::date;
  v_whats text;
  v_insta text;
  v_existente public.zh_leads%rowtype;
  v_evento_id uuid;
  v_lead_id uuid;
  v_acao_automatica boolean;
begin
  -- Mesma validação de token da zh_leads_registrar_evento.
  if p_token is null or char_length(p_token) < 32 or not exists (
    select 1 from public.zh_leads_segredos s
    where s.chave = 'vini_eventos' and s.ativo
      and s.valor = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
  ) then
    raise exception 'Nao autorizado' using errcode = '42501';
  end if;

  if v_chave is null or length(v_chave) > 120 then
    raise exception 'Evento sem chave' using errcode = '22023';
  end if;
  if coalesce(p_evento->>'tipo', '') <> 'negociacao' then
    raise exception 'Tipo de evento invalido' using errcode = '22023';
  end if;
  if jsonb_typeof(v_lead) <> 'object' then
    raise exception 'Evento invalido' using errcode = '22023';
  end if;
  -- A reunião já aconteceu e é recente: o Vini só move depois da reunião, nunca antes.
  if v_reuniao is null or v_reuniao > v_hoje or v_reuniao < v_hoje - 60 then
    raise exception 'Data da reuniao invalida' using errcode = '22023';
  end if;
  if v_acao is null or char_length(v_acao) > 300 then
    raise exception 'Proxima acao invalida' using errcode = '22023';
  end if;
  if v_acao_em is not null and (v_acao_em < v_reuniao or v_acao_em > v_hoje + 60) then
    raise exception 'Prazo da proxima acao invalido' using errcode = '22023';
  end if;
  v_em := least(v_em, now()); -- etapa_desde nunca no futuro

  -- Reenvio da mesma chave: devolve o que já existe, sem gravar de novo.
  select e.id, e.lead_id into v_evento_id, v_lead_id
  from public.zh_leads_eventos e where e.chave_externa = v_chave;
  if v_evento_id is not null then
    return jsonb_build_object('ok', true, 'repetido', true, 'lead_id', v_lead_id);
  end if;

  v_whats := nullif(public.zh_leads_normalizar_whatsapp(v_lead->>'whatsapp'), '');
  v_insta := public.zh_leads_normalizar_instagram(v_lead->>'instagram');
  if v_whats is not null and v_whats !~ '^[0-9]{10,11}$' then
    raise exception 'WhatsApp invalido' using errcode = '22023';
  end if;
  if v_insta is not null and v_insta !~ '^[a-z0-9._]{1,30}$' then
    raise exception 'Instagram invalido' using errcode = '22023';
  end if;
  if v_whats is null and v_insta is null then
    raise exception 'Informe WhatsApp ou Instagram' using errcode = '22023';
  end if;

  -- Pelo WhatsApp com DDD + 8 últimos dígitos (bate com e sem o nono dígito, como o SDR); se não achar, pelo @.
  if v_whats is not null then
    select * into v_existente from public.zh_leads l
    where l.whatsapp is not null and left(l.whatsapp, 2) || right(l.whatsapp, 8) = left(v_whats, 2) || right(v_whats, 8)
    order by l.ultimo_evento_em desc -- mesmo desempate da leitura do SDR (estagio-lead.js)
    limit 1
    for update;
  end if;
  if v_existente.id is null and v_insta is not null then
    select * into v_existente from public.zh_leads l where l.instagram = v_insta for update;
  end if;
  if v_existente.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_lead');
  end if;

  -- Ação que o sistema escreveu sozinho (pode ser trocada); qualquer outra é de Vinícius e fica.
  v_acao_automatica := v_existente.proxima_acao = ''
    or v_existente.proxima_acao like 'Ver se concluiu o pagamento%'
    or v_existente.proxima_acao = 'Chamar no WhatsApp e marcar a reunião de diagnóstico'
    or v_existente.proxima_acao like 'Oferecer o Zatti Hub%'
    or v_existente.proxima_acao like 'Oferecer a consultoria%'
    or v_existente.proxima_acao like 'Registrar o combinado da reunião%';

  if v_existente.etapa in ('consultoria_fechada', 'perdido')
     or (v_existente.etapa = 'reuniao_diagnostico' and not v_acao_automatica) then
    return jsonb_build_object('ok', true, 'mudou', false, 'etapa', v_existente.etapa, 'lead_id', v_existente.id);
  end if;

  update public.zh_leads l set
    etapa = 'reuniao_diagnostico',
    etapa_desde = case when l.etapa = 'reuniao_diagnostico' then l.etapa_desde else v_em end,
    motivo_perda = '',
    proxima_acao = case when v_acao_automatica then left(v_acao, 300) else l.proxima_acao end,
    proxima_acao_em = case when v_acao_automatica then v_acao_em else l.proxima_acao_em end,
    ultimo_evento_em = greatest(l.ultimo_evento_em, v_em)
  where l.id = v_existente.id;

  insert into public.zh_leads_eventos (lead_id, chave_externa, em, tipo, de_etapa, para_etapa, texto, dados, autor)
  values (
    v_existente.id, v_chave, v_em,
    case when v_existente.etapa = 'reuniao_diagnostico' then 'proxima_acao' else 'etapa' end,
    v_existente.etapa, 'reuniao_diagnostico',
    left(coalesce(nullif(p_evento->>'texto', ''), 'Reunião de diagnóstico feita em ' || to_char(v_reuniao, 'DD/MM')), 1000),
    jsonb_strip_nulls(jsonb_build_object('reuniao_em', v_reuniao,
      'proxima_acao', case when v_acao_automatica then left(v_acao, 300) else v_existente.proxima_acao end,
      'proxima_acao_em', case when v_acao_automatica then v_acao_em else v_existente.proxima_acao_em end,
      'proxima_acao_anterior', nullif(v_existente.proxima_acao, ''))),
    'sdr'
  )
  on conflict (chave_externa) do nothing;

  return jsonb_build_object('ok', true, 'mudou', true, 'de_etapa', v_existente.etapa, 'etapa', 'reuniao_diagnostico',
    'lead_id', v_existente.id);
end;
$$;

-- Mesmos grants da zh_leads_registrar_evento (a rota chama como anon, com o token).
revoke all on function public.zh_leads_registrar_negociacao(text, jsonb) from public;
grant execute on function public.zh_leads_registrar_negociacao(text, jsonb) to anon, authenticated;

-- Mesma trava da 20261109230000: o vini_operador não chama a entrada por token.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'vini_operador') then
    revoke execute on function public.zh_leads_registrar_negociacao(text, jsonb) from vini_operador;
  end if;
end $$;

commit;
