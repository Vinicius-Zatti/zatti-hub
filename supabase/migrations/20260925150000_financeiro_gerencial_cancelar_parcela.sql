-- Cancelamento lógico de parcela (25/09): "Editar pagamento recorrente"
-- reduz a quantidade de ocorrências sem apagar nada - a parcela sobrando e
-- sem baixa vira `status = 'cancelado'` (o status 'cancelado' já existia na
-- tabela, mas o gatilho sempre recalculava o status e ignorava o que viesse
-- no UPDATE, então ninguém conseguia cancelar). Aditiva: só redefine a
-- função do gatilho. Regras:
-- - só Gestão/master cancela;
-- - parcela com qualquer baixa (saldo baixado diferente de zero) nunca é
--   cancelada;
-- - cancelada continua sem volta (regra que já existia);
-- - fora do cancelamento, o status continua sempre recalculado pelo saldo.
-- Caixa, DRE, Visão geral e Recorrências já ignoram parcela cancelada; baixa
-- em parcela cancelada já é barrada por `proteger_baixa_financeira`.
begin;

create or replace function public.proteger_parcela_financeira()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.unidade_id is distinct from old.unidade_id
       or new.lancamento_id is distinct from old.lancamento_id
       or new.numero is distinct from old.numero
       or new.total_parcelas is distinct from old.total_parcelas
       or new.criado_em is distinct from old.criado_em then
      raise exception 'Numero, total de parcelas e vinculo com o lancamento nao podem mudar - reestruturar parcelamento e excluir e lancar de novo' using errcode = '42501';
    end if;

    if old.status = 'cancelado' then
      raise exception 'Parcela cancelada nao pode ser reaberta' using errcode = '42501';
    end if;

    if new.status = 'cancelado' then
      if not public.usuario_pode_usar_financeiro_gerencial(new.unidade_id, array['gestao']) then
        raise exception 'Cancelar parcela e restrito a Gestao/master' using errcode = '42501';
      end if;
      if public.saldo_baixado_parcela(old.id) <> 0 then
        raise exception 'Parcela com pagamento ou recebimento registrado nao pode ser cancelada' using errcode = '23514';
      end if;
      new.atualizado_em := now();
      return new;
    end if;

    if (new.valor is distinct from old.valor
        or new.data_prevista is distinct from old.data_prevista
        or new.conta_financeira_id is distinct from old.conta_financeira_id)
       and not public.usuario_pode_usar_financeiro_gerencial(new.unidade_id, array['gestao']) then
      raise exception 'Editar valor, data ou conta financeira da parcela e restrito a Gestao/master' using errcode = '42501';
    end if;

    if new.valor is distinct from old.valor and new.valor < public.saldo_baixado_parcela(old.id) then
      raise exception 'Valor da parcela nao pode ficar menor que o total ja baixado' using errcode = '23514';
    end if;

    new.atualizado_em := now();
  end if;

  new.status := public.status_por_saldo_parcela(new.valor, public.saldo_baixado_parcela(new.id));
  return new;
end;
$$;

commit;
