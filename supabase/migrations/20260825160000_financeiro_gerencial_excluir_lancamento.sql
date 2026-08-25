-- Excluir lançamento errado (pedido explícito de Vinícius em 25/08, caso
-- real: Aluguel lançado errado). Só permitido enquanto nenhuma parcela dele
-- tiver baixa registrada - money já movimentado nunca some por um DELETE,
-- só por estorno (mesmo princípio de `fin_baixas` não ter policy de
-- update/delete nenhuma). Restrito a Gestão/master, mesmo padrão de editar
-- lançamento.
begin;

create or replace function public.impedir_exclusao_lancamento_com_baixa()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return old;
  end if;

  if exists (
    select 1
    from public.fin_parcelas p
    join public.fin_baixas b on b.parcela_id = p.id
    where p.lancamento_id = old.id
  ) then
    raise exception 'Lancamento com baixa registrada nao pode ser excluido - use estorno' using errcode = '23514';
  end if;

  return old;
end;
$$;

drop trigger if exists impedir_exclusao_com_baixa on public.fin_lancamentos;
create trigger impedir_exclusao_com_baixa
  before delete on public.fin_lancamentos
  for each row execute function public.impedir_exclusao_lancamento_com_baixa();

-- RLS de DELETE: só Gestão/master. `fin_parcelas` também precisa de policy
-- de delete pro `on delete cascade` (já existente na FK) ter permissão de
-- completar - `fin_baixas` de propósito sem nenhuma (nunca deve ter linha
-- pra apagar aqui, a trigger acima já bloqueia antes de chegar no cascade).
create policy "fin_lancamentos_delete_gestao" on public.fin_lancamentos
  for delete to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));

create policy "fin_parcelas_delete_gestao" on public.fin_parcelas
  for delete to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));

-- Nova chave de rate limit (`fin_lancamento_excluir`) - função inteira
-- recriada com a lista acumulada, mesmo padrão de toda migração anterior
-- que mexeu em `consumir_limite_requisicao`.
create or replace function public.consumir_limite_requisicao(p_chave text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_janela_segundos integer;
  v_contagem integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  select configuracao.limite, configuracao.janela_segundos
    into v_limite, v_janela_segundos
  from (
    values
      ('sugerir_sku', 10, 3600),
      ('registrar_contagem', 30, 600),
      ('corrigir_contagem', 120, 600),
      ('salvar_produtos', 30, 600),
      ('salvar_fornecedores', 30, 600),
      ('pedidos_cotacao', 120, 600),
      ('recebimento', 60, 600),
      ('consolidado_criar', 30, 600),
      ('consolidado_editar', 60, 600),
      ('trocar_organizacao', 30, 600),
      ('ficha_salvar', 60, 600),
      ('ficha_excluir', 30, 600),
      ('categoria_ficha_criar', 30, 600),
      ('conversao_produto_salvar', 60, 600),
      ('configuracao_financeira_salvar', 30, 600),
      ('ficha_preco_venda_salvar', 120, 600),
      ('categoria_ficha_editar', 30, 600),
      ('categoria_ficha_excluir', 30, 600),
      ('excluir_produto', 30, 600),
      ('ficha_precos_canal_salvar', 120, 600),
      ('fin_conta_financeira_salvar', 30, 600),
      ('fin_categoria_criar', 30, 600),
      ('fin_categoria_editar', 30, 600),
      ('fin_lancamento_criar', 60, 600),
      ('fin_lancamento_editar', 60, 600),
      ('fin_baixa_registrar', 60, 600),
      ('fin_baixa_estornar', 30, 600),
      ('fin_recorrencia_criar', 20, 600),
      ('fin_lancamento_excluir', 30, 600)
  ) as configuracao(chave, limite, janela_segundos)
  where configuracao.chave = p_chave;

  if v_limite is null then
    raise exception 'Limite de requisicao desconhecido' using errcode = '22023';
  end if;

  insert into public.limites_requisicao as atual (
    user_id,
    chave,
    janela_inicio,
    contagem
  )
  values (auth.uid(), p_chave, now(), 1)
  on conflict (user_id, chave) do update
  set
    janela_inicio = case
      when excluded.janela_inicio - atual.janela_inicio
        >= make_interval(secs => v_janela_segundos)
      then excluded.janela_inicio
      else atual.janela_inicio
    end,
    contagem = case
      when excluded.janela_inicio - atual.janela_inicio
        >= make_interval(secs => v_janela_segundos)
      then 1
      else atual.contagem + 1
    end
  returning contagem into v_contagem;

  return v_contagem <= v_limite;
end;
$$;

commit;
