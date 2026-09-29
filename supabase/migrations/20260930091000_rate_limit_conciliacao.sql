-- Conciliação V1 (fatia piloto): chaves novas de limite de requisição.
-- Redefine a função com a lista completa vigente (última versão em
-- 20260924130000_gestao_clientes.sql) mais as duas chaves da Conciliação.
begin;

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
      ('fin_recorrencia_criar', 30, 600),
      ('fin_lancamento_excluir', 30, 600),
      ('fin_estoque_mensal_salvar', 30, 600),
      ('fin_saidas_sem_receita_salvar', 60, 600),
      ('tempo_frente_salvar', 30, 600),
      ('tempo_valor_hora_salvar', 30, 600),
      ('tempo_meta_mensal_salvar', 30, 600),
      ('tempo_cronometro_acao', 120, 600),
      ('tempo_lancamento_criar', 60, 600),
      ('tempo_lancamento_editar', 60, 600),
      ('tempo_lancamento_excluir', 30, 600),
      ('agenda_tarefa_salvar', 60, 600),
      ('agenda_tarefa_excluir', 30, 600),
      ('agenda_marcar_execucao', 120, 600),
      ('setor_salvar', 30, 600),
      ('setor_designar', 60, 600),
      ('contagem_abrir', 60, 600),
      ('fin_provisao_parametros_salvar', 30, 600),
      ('fin_provisao_reversao_salvar', 30, 600),
      ('fin_fechamento_salvar', 30, 600),
      ('fin_recorrencia_encerrar', 30, 600),
      ('clientes_salvar', 120, 600),
      ('clientes_reuniao', 60, 600),
      ('fin_conciliacao_importar', 20, 600),
      ('fin_conciliacao_reprocessar', 20, 600)
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

revoke all on function public.consumir_limite_requisicao(text) from public, anon;
grant execute on function public.consumir_limite_requisicao(text) to authenticated;

commit;
