-- Período de teste grátis do Zatti Hub (27/10/2026).
-- Decisão de Vinícius: mesmo mecanismo da vigência anual (20261015150000). Conta em teste usa
-- `vigencia_fim` como último dia do teste: faixa com o link de pagamento, 10 dias de carência
-- depois do fim e então o app trava, sem apagar dado. Os avisos seguem a mesma lógica da
-- assinatura; o GET de avisos leva `periodo_teste` para quem envia trocar o texto.
--
--   organizacoes.periodo_teste     true = `vigencia_fim` é o fim do teste grátis, não de um ano pago
--   zh_assinatura_renovar          pagar a assinatura anual encerra o teste: zera a marca e conta
--                                  12 meses a partir do dia do pagamento (não soma sobre o fim do
--                                  teste). Conta paga segue como antes: maior entre hoje e o fim + 12 meses.
--
-- O app (authenticated) só lê `organizacoes` pela política de vínculo e não escreve nela; a coluna
-- herda isso. vini_operador e vini_leitura herdam os grants que já têm na tabela.
-- Só acrescenta. Idempotente.
begin;

alter table public.organizacoes
  add column if not exists periodo_teste boolean not null default false;

comment on column public.organizacoes.periodo_teste is
  'Período de teste grátis (27/10/2026): vigencia_fim é o último dia do teste. Pagar a assinatura anual zera esta marca.';

-- Devolve {organizacao_id, restaurante, fim_anterior, fim_novo, repetido, era_teste}. Token desconhecido = erro.
create or replace function public.zh_assinatura_renovar(p_token text, p_pagamento_id text, p_valor numeric)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org public.organizacoes%rowtype;
  v_ren public.zh_renovacoes%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_novo date;
begin
  if p_pagamento_id is null or p_pagamento_id !~ '^[0-9]{1,20}$' then
    raise exception 'Pagamento invalido' using errcode = '22023';
  end if;
  select * into v_org from public.organizacoes o
   where o.renovacao_token = p_token and p_token is not null
   for update;
  if not found then
    raise exception 'Conta nao encontrada' using errcode = 'P0002';
  end if;

  select * into v_ren from public.zh_renovacoes r where r.pagamento_id = p_pagamento_id;
  if found then
    return jsonb_build_object('organizacao_id', v_ren.organizacao_id, 'restaurante', v_org.nome,
      'fim_anterior', v_ren.fim_anterior, 'fim_novo', v_ren.fim_novo, 'repetido', true,
      'era_teste', false);
  end if;

  if v_org.periodo_teste then
    -- Fim do teste: o ano pago começa no dia do pagamento.
    v_novo := (v_hoje + interval '12 months')::date;
  else
    v_novo := (greatest(v_hoje, coalesce(v_org.vigencia_fim, v_hoje)) + interval '12 months')::date;
  end if;
  insert into public.zh_renovacoes (pagamento_id, organizacao_id, valor, fim_anterior, fim_novo)
  values (p_pagamento_id, v_org.id, p_valor, v_org.vigencia_fim, v_novo);
  update public.organizacoes o set vigencia_fim = v_novo, periodo_teste = false where o.id = v_org.id;

  return jsonb_build_object('organizacao_id', v_org.id, 'restaurante', v_org.nome,
    'fim_anterior', v_org.vigencia_fim, 'fim_novo', v_novo, 'repetido', false,
    'era_teste', v_org.periodo_teste);
end;
$$;
revoke all on function public.zh_assinatura_renovar(text, text, numeric) from public, anon, authenticated, vini_operador;
grant execute on function public.zh_assinatura_renovar(text, text, numeric) to service_role;

commit;
