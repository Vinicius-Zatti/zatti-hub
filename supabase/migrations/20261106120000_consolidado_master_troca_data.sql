-- Consolidado de Vendas: o master (consultor da Zatti, com segundo fator)
-- pode trocar a data de um fechamento já lançado (pedido do Vinícius, 06/11/2026).
--
-- Antes: o gatilho `proteger_escrita_consolidado` travava `data` em qualquer
-- update. Agora `data` continua imutável para gestão e operacional do cliente e
-- só muda quando `usuario_e_master()` (vínculo master ativo + aal2). O UNIQUE
-- (unidade_id, data) segue valendo: trocar para um dia já lançado falha com
-- 23505 e nada é sobrescrito.
--
-- Escolher qualquer data ao LANÇAR não precisa de mudança no banco: o insert
-- nunca travou a data (a trava era só na tela).
--
-- RLS conferida, sem mudança: insert = `usuario_pode_usar_consolidado(unidade, null)`
-- e `criado_por = auth.uid()`; update = `usuario_pode_usar_consolidado(unidade,
-- array['gestao'])`, em que `usuario_tem_acesso_unidade` já aceita master com aal2
-- em qualquer unidade ativa. Os gatilhos de permissão por módulo (`vendas` e
-- `vendas.editar_dia_lancado`) continuam valendo.
--
-- Corpo idêntico ao de 20260811090000_seguranca_rls.sql, só com a exceção do
-- master na checagem de `data`.

create or replace function public.proteger_escrita_consolidado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      if not public.usuario_pode_usar_consolidado(new.unidade_id, null) then
        raise exception 'Consolidado nao habilitado para esta unidade' using errcode = '42501';
      end if;
      new.criado_por := auth.uid();
      new.criado_em := now();
      new.atualizado_por := null;
      new.atualizado_em := now();
    else
      if not public.usuario_pode_usar_consolidado(old.unidade_id, array['gestao']) then
        raise exception 'Operacao nao autorizada para este consolidado' using errcode = '42501';
      end if;
      if new.id is distinct from old.id
         or new.unidade_id is distinct from old.unidade_id
         or (new.data is distinct from old.data and not public.usuario_e_master())
         or new.criado_por is distinct from old.criado_por
         or new.criado_em is distinct from old.criado_em then
        raise exception 'Campos imutaveis do consolidado nao podem ser alterados' using errcode = '42501';
      end if;
      new.atualizado_por := auth.uid();
      new.atualizado_em := now();
    end if;
  end if;

  new.total_formas_pagamento :=
    new.credito + new.debito + new.pix + new.dinheiro + new.vale_alimentacao;
  new.total_canais := new.salao + new.delivery_proprio;
  new.total_marketplaces := new.ifood + new.food99;
  new.faturamento_total := new.total_canais + new.total_marketplaces;
  new.diferenca := abs(new.total_formas_pagamento - new.total_canais);
  new.status := case when new.diferenca = 0 then 'conferido' else 'divergente' end;

  return new;
end;
$$;

revoke all on function public.proteger_escrita_consolidado() from public, anon, authenticated;
