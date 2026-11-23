-- Contas a Pagar e Receber (23/11/2026): corrigir data e conta de um pagamento já registrado.
-- Pagamento nunca é editado nem apagado (fin_baixas não tem update/delete): a correção estorna a
-- baixa original e grava uma nova com a data e a conta certas, mesmo valor, numa transação só.
-- Só Gestão/master (o estorno já exige). Pagamento que veio da Conciliação se corrige desfazendo
-- a conciliação, para o extrato não ficar apontando para um pagamento estornado.
create or replace function public.fin_corrigir_pagamento(p_unidade text, p_baixas uuid[], p_data date, p_conta uuid)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_b record;
  v_qtd int := 0;
begin
  if auth.uid() is null or not public.usuario_pode_usar_financeiro_gerencial(p_unidade, array['gestao']) then
    raise exception 'Corrigir pagamento e restrito a Gestao/master' using errcode = '42501';
  end if;
  if p_baixas is null or cardinality(p_baixas) = 0 or cardinality(p_baixas) > 100 or p_data is null or p_conta is null then
    raise exception 'Pagamento invalido' using errcode = '23514';
  end if;
  if not exists (select 1 from public.fin_contas_financeiras where unidade_id = p_unidade and id = p_conta) then
    raise exception 'Conta financeira invalida' using errcode = '23514';
  end if;
  if exists (select 1 from public.fin_conciliacao_decisao_vinculos where baixa_id = any(p_baixas) and ativo) then
    raise exception 'Pagamento veio da Conciliacao: desfaca a conciliacao para corrigir' using errcode = 'P0001';
  end if;

  for v_b in
    select id, parcela_id, tipo, conta_financeira_id, valor, data, observacao
      from public.fin_baixas
     where unidade_id = p_unidade and id = any(p_baixas)
     order by id
       for update
  loop
    if v_b.tipo <> 'baixa' or exists (select 1 from public.fin_baixas e where e.estorno_de_baixa_id = v_b.id) then
      raise exception 'Pagamento ja desfeito' using errcode = '23514';
    end if;
    insert into public.fin_baixas (unidade_id, parcela_id, tipo, estorno_de_baixa_id, conta_financeira_id, valor, data, observacao, criado_por)
      values (p_unidade, v_b.parcela_id, 'estorno', v_b.id, v_b.conta_financeira_id, v_b.valor, v_b.data,
              'Correção do pagamento (data ou conta)', auth.uid());
    insert into public.fin_baixas (unidade_id, parcela_id, tipo, conta_financeira_id, valor, data, observacao, criado_por)
      values (p_unidade, v_b.parcela_id, 'baixa', p_conta, v_b.valor, p_data, v_b.observacao, auth.uid());
    v_qtd := v_qtd + 1;
  end loop;
  if v_qtd <> cardinality(p_baixas) then
    raise exception 'Pagamento invalido' using errcode = '23514';
  end if;
  return v_qtd;
end;
$$;

revoke all on function public.fin_corrigir_pagamento(text, uuid[], date, uuid) from public, anon;
grant execute on function public.fin_corrigir_pagamento(text, uuid[], date, uuid) to authenticated;
