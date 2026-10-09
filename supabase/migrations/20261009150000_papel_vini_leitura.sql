-- Papel só de leitura para o Vini consultar os dados dos clientes (vendas, estoque, compras,
-- financeiro e acompanhamento). Nunca escreve: a sessão nasce READ ONLY e só tem SELECT.
-- A senha é definida fora do repositório e fica no cofre local (ZATTI_HUB_LEITURA_URL).
-- Fora da lista: acessos e usuários (perfis, vinculos, fin_acesso_*), segredos, auditoria,
-- leads com telefone de terceiros, agenda e tempo internos de Vinícius.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'vini_leitura') then
    create role vini_leitura login noinherit connection limit 3;
  end if;
end
$$;

alter role vini_leitura set default_transaction_read_only = on;
alter role vini_leitura set statement_timeout = '15s';

grant usage on schema public to vini_leitura;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizacoes', 'unidades', 'setores', 'produtos', 'produto_setores', 'fornecedores',
    'pedidos', 'pedido_itens', 'contagens', 'contagem_itens', 'contagem_setores',
    'contagem_escopo', 'consolidados_vendas', 'fichas_tecnicas', 'ficha_componentes',
    'ficha_etapas', 'ficha_versoes', 'categorias_ficha', 'configuracao_financeira',
    'fin_categorias', 'fin_classificacoes', 'fin_contas_financeiras', 'fin_lancamentos',
    'fin_parcelas', 'fin_baixas', 'fin_fechamentos', 'fin_estoque_mensal',
    'fin_movimentos_importados', 'fin_importacoes', 'fin_recorrencias',
    'fin_provisoes_parametros', 'fin_provisoes_reversoes', 'fin_saidas_sem_receita',
    'zh_clientes_acompanhamentos', 'zh_clientes_diagnostico', 'zh_clientes_etapas',
    'zh_clientes_indicadores', 'zh_clientes_itens', 'zh_clientes_reunioes'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select on public.%I to vini_leitura', t);
      execute format('drop policy if exists vini_leitura_select on public.%I', t);
      execute format(
        'create policy vini_leitura_select on public.%I for select to vini_leitura using (true)',
        t
      );
    end if;
  end loop;
end
$$;
