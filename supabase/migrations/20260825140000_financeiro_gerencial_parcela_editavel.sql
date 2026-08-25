-- Parcela deixa de ser 100% imutável a pedido explícito de Vinícius em
-- 25/08 (ciente do risco - já viu o alerta e escolheu "editar sempre,
-- mesmo com baixa" em vez de travar depois da 1ª baixa). Valor, data
-- prevista e conta financeira da parcela passam a ser editáveis por
-- Gestão/master; numero/total_parcelas/lancamento_id continuam fixos (editar
-- não adiciona/remove parcela, só corrige uma já existente - reestruturar o
-- parcelamento continua sendo excluir e lançar de novo). Aditiva - não edita
-- a migração `20260824090000_...sql` que criou a trigger original.
begin;

-- Única regra nova de integridade: valor editado nunca pode ficar menor que
-- o que já foi baixado contra essa parcela - sem isso, dava pra editar um
-- valor de R$1000 já baixado em R$600 pra R$500 e o gatilho calcularia
-- "quitado" com R$100 baixados a mais sem nenhum registro do excedente.
-- Mover a data ou trocar a conta prevista não tem esse risco (não mexe em
-- dinheiro já movimentado), por isso só valor tem a checagem extra.
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
