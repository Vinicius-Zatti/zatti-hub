-- Edição de Dados grava só os campos alterados (parecer do Codex de 26/10/2026).
-- Salvar e Salvar todos faziam upsert da linha inteira do produto. Com a grade aberta antes de
-- a cotação ligar um fornecedor (vincular_fornecedor_produto), salvar outro campo devolvia a
-- vaga vazia e apagava o vínculo. Aqui cada produto recebe só as colunas que vieram em
-- `campos` (o app manda apenas o que mudou desde que a grade carregou); as outras ficam como
-- estão no banco. Tudo numa transação: se um produto for recusado (gatilho de pré-preparo,
-- produto excluído no meio), nenhum é gravado, como no upsert de antes.
--
-- p_linhas: [{"sku": "...", "campos": {"nome": "...", "fornecedor_2": "", ...}}, ...]
--
-- Só aditiva: função nova. Nenhuma tabela, coluna ou função existente muda.

begin;

create or replace function public.salvar_produtos_campos(
  p_unidade_id text,
  p_linhas jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total int;
  v_gravados int;
  v_ausente text;
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 500
     or exists (
       select 1 from jsonb_array_elements(p_linhas) e
       where jsonb_typeof(e.value) <> 'object'
         or coalesce(e.value ->> 'sku', '') = ''
         or jsonb_typeof(coalesce(e.value -> 'campos', '{}'::jsonb)) <> 'object'
     )
     or (select count(*) from jsonb_array_elements(p_linhas))
        <> (select count(distinct e.value ->> 'sku') from jsonb_array_elements(p_linhas) e) then
    raise exception 'Lista de produtos inválida.' using errcode = 'P0001';
  end if;
  v_total := jsonb_array_length(p_linhas);

  -- Um UPDATE só para o lote inteiro (mesma velocidade do upsert de antes).
  update public.produtos p
  set posicao = case when e.c ? 'posicao' then (e.c ->> 'posicao')::numeric else p.posicao end,
      grupo = case when e.c ? 'grupo' then e.c ->> 'grupo' else p.grupo end,
      nome = case when e.c ? 'nome' then e.c ->> 'nome' else p.nome end,
      unidade_base = case when e.c ? 'unidade_base' then e.c ->> 'unidade_base' else p.unidade_base end,
      preco_unitario = case when e.c ? 'preco_unitario' then (e.c ->> 'preco_unitario')::numeric else p.preco_unitario end,
      estoque_necessario_semana = case when e.c ? 'estoque_necessario_semana'
        then (e.c ->> 'estoque_necessario_semana')::numeric else p.estoque_necessario_semana end,
      estoque_minimo = case when e.c ? 'estoque_minimo' then (e.c ->> 'estoque_minimo')::numeric else p.estoque_minimo end,
      nome_compra = case when e.c ? 'nome_compra' then e.c ->> 'nome_compra' else p.nome_compra end,
      unidade_embalagem_fornecedor = case when e.c ? 'unidade_embalagem_fornecedor'
        then e.c ->> 'unidade_embalagem_fornecedor' else p.unidade_embalagem_fornecedor end,
      qtd_unidade_base_por_embalagem = case when e.c ? 'qtd_unidade_base_por_embalagem'
        then (e.c ->> 'qtd_unidade_base_por_embalagem')::numeric else p.qtd_unidade_base_por_embalagem end,
      preco_fornecedor = case when e.c ? 'preco_fornecedor' then (e.c ->> 'preco_fornecedor')::numeric else p.preco_fornecedor end,
      fornecedor_1 = case when e.c ? 'fornecedor_1' then e.c ->> 'fornecedor_1' else p.fornecedor_1 end,
      fornecedor_2 = case when e.c ? 'fornecedor_2' then e.c ->> 'fornecedor_2' else p.fornecedor_2 end,
      fornecedor_3 = case when e.c ? 'fornecedor_3' then e.c ->> 'fornecedor_3' else p.fornecedor_3 end,
      fornecedor_4 = case when e.c ? 'fornecedor_4' then e.c ->> 'fornecedor_4' else p.fornecedor_4 end,
      observacoes = case when e.c ? 'observacoes' then e.c ->> 'observacoes' else p.observacoes end,
      ativo = case when e.c ? 'ativo' then (e.c ->> 'ativo')::boolean else p.ativo end,
      revenda = case when e.c ? 'revenda' then (e.c ->> 'revenda')::boolean else p.revenda end,
      atualizado_em = now()
  from (
    select x.value ->> 'sku' as sku, coalesce(x.value -> 'campos', '{}'::jsonb) as c
    from jsonb_array_elements(p_linhas) x
  ) e
  where p.unidade_id = p_unidade_id and p.sku = e.sku;
  get diagnostics v_gravados = row_count;

  -- Produto excluído no meio (ou de unidade sem acesso): recusa o lote inteiro.
  if v_gravados <> v_total then
    select x.value ->> 'sku' into v_ausente
    from jsonb_array_elements(p_linhas) x
    where not exists (
      select 1 from public.produtos p where p.unidade_id = p_unidade_id and p.sku = x.value ->> 'sku'
    )
    limit 1;
    raise exception 'O produto % não está mais no Cadastro. Recarregue a página.', coalesce(v_ausente, '')
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.salvar_produtos_campos(text, jsonb) from public, anon;
grant execute on function public.salvar_produtos_campos(text, jsonb) to authenticated;

commit;
