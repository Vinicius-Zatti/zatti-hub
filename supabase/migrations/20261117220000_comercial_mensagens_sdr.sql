-- Comercial: conversa do SDR guardada no CRM (pedido de Vinícius em 17/11/2026:
-- "toda conversa que está no SDR tem que ser arquivada... não pode ficar de fora
-- do nosso CRM").
--   - zh_leads_eventos aceita o tipo novo 'mensagem': cada mensagem trocada pelo
--     SDR do Vini (WhatsApp ou Direct) vira um evento na linha do tempo do lead;
--   - função nova zh_leads_registrar_mensagem, chamada pela mesma rota
--     POST /api/leads/eventos quando tipo = 'mensagem', com o mesmo token da
--     zh_leads_registrar_evento;
--   - só arquiva: não cria lead (sem lead com aquele WhatsApp/@ devolve
--     {ok: false, motivo: 'sem_lead'}), não mexe em etapa nem em nenhum campo
--     do lead; reenvio da mesma chave não duplica (chave_externa única).
-- Nada é apagado.
begin;

-- ── Tipo novo (lista completa da 20261007150000 + 'mensagem') ──────────────
alter table public.zh_leads_eventos drop constraint if exists zh_leads_eventos_tipo_check;
alter table public.zh_leads_eventos add constraint zh_leads_eventos_tipo_check check (tipo in
  ('criado', 'formulario', 'nova_tentativa', 'pagamento', 'comprou_de_novo', 'etapa', 'nota',
   'proxima_acao', 'perdido', 'virou_cliente', 'mensagem'));

-- ── Mensagem do SDR ────────────────────────────────────────────────────────
-- p_evento: {chave, tipo: 'mensagem', em, texto, lead: {whatsapp? | instagram?},
--            mensagem: {de: lead|vinicius|sdr, canal: whatsapp|instagram}}
create or replace function public.zh_leads_registrar_mensagem(p_token text, p_evento jsonb)
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
  v_msg jsonb := coalesce(p_evento->'mensagem', '{}'::jsonb);
  v_de text := p_evento->'mensagem'->>'de';
  v_canal text := p_evento->'mensagem'->>'canal';
  v_whats text;
  v_insta text;
  v_lead_id uuid;
  v_evento_id uuid;
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
  if coalesce(p_evento->>'tipo', '') <> 'mensagem' then
    raise exception 'Tipo de evento invalido' using errcode = '22023';
  end if;
  if jsonb_typeof(v_lead) <> 'object' or jsonb_typeof(v_msg) <> 'object' then
    raise exception 'Evento invalido' using errcode = '22023';
  end if;
  if v_de is null or v_de not in ('lead', 'vinicius', 'sdr') then
    raise exception 'Autor da mensagem invalido' using errcode = '22023';
  end if;
  if v_canal is null or v_canal not in ('whatsapp', 'instagram') then
    raise exception 'Canal da mensagem invalido' using errcode = '22023';
  end if;
  if p_evento ? 'texto' and jsonb_typeof(p_evento->'texto') <> 'string' then
    raise exception 'Texto invalido' using errcode = '22023';
  end if;

  -- Reenvio da mesma chave: devolve o que já existe, sem gravar de novo.
  select e.id, e.lead_id into v_evento_id, v_lead_id
  from public.zh_leads_eventos e where e.chave_externa = v_chave;
  if v_evento_id is not null then
    return jsonb_build_object('ok', true, 'duplicado', true, 'lead_id', v_lead_id);
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

  -- Primeiro pelo WhatsApp; se não achar, pelo Instagram. Nunca cria lead.
  if v_whats is not null then
    select l.id into v_lead_id from public.zh_leads l where l.whatsapp = v_whats;
  end if;
  if v_lead_id is null and v_insta is not null then
    select l.id into v_lead_id from public.zh_leads l where l.instagram = v_insta;
  end if;
  if v_lead_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_lead');
  end if;

  insert into public.zh_leads_eventos (lead_id, chave_externa, em, tipo, texto, dados, autor)
  values (
    v_lead_id, v_chave, v_em, 'mensagem',
    left(coalesce(p_evento->>'texto', ''), 1000),
    jsonb_build_object('de', v_de, 'canal', v_canal),
    case when v_de = 'vinicius' then 'vinicius' else 'sdr' end
  )
  on conflict (chave_externa) do nothing
  returning id into v_evento_id;

  -- Corrida com um reenvio simultâneo da mesma chave: vale o que gravou primeiro.
  if v_evento_id is null then
    select e.lead_id into v_lead_id from public.zh_leads_eventos e where e.chave_externa = v_chave;
    return jsonb_build_object('ok', true, 'duplicado', true, 'lead_id', v_lead_id);
  end if;

  return jsonb_build_object('ok', true, 'duplicado', false, 'lead_id', v_lead_id);
end;
$$;

-- Mesmos grants da zh_leads_registrar_evento (a rota chama como anon, com o token).
revoke all on function public.zh_leads_registrar_mensagem(text, jsonb) from public;
grant execute on function public.zh_leads_registrar_mensagem(text, jsonb) to anon, authenticated;

-- Mesma trava da 20261109230000: o vini_operador não chama a entrada por token.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'vini_operador') then
    revoke execute on function public.zh_leads_registrar_mensagem(text, jsonb) from vini_operador;
  end if;
end $$;

commit;
