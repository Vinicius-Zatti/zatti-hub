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
  v_linha jsonb;
  v_c jsonb;
  v_sku text;
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 500 then
    raise exception 'Lista de produtos inválida.' using errcode = 'P0001';
  end if;

  for v_linha in select value from jsonb_array_elements(p_linhas) loop
    v_sku := v_linha ->> 'sku';
    v_c := coalesce(v_linha -> 'campos', '{}'::jsonb);
    if v_sku is null or length(v_sku) = 0 or jsonb_typeof(v_c) <> 'object' then
      raise exception 'Lista de produtos inválida.' using errcode = 'P0001';
    end if;

    update public.produtos p
    set posicao = case when v_c ? 'posicao' then (v_c ->> 'posicao')::numeric else p.posicao end,
        grupo = case when v_c ? 'grupo' then v_c ->> 'grupo' else p.grupo end,
        nome = case when v_c ? 'nome' then v_c ->> 'nome' else p.nome end,
        unidade_base = case when v_c ? 'unidade_base' then v_c ->> 'unidade_base' else p.unidade_base end,
        preco_unitario = case when v_c ? 'preco_unitario' then (v_c ->> 'preco_unitario')::numeric else p.preco_unitario end,
        estoque_necessario_semana = case when v_c ? 'estoque_necessario_semana'
          then (v_c ->> 'estoque_necessario_semana')::numeric else p.estoque_necessario_semana end,
        estoque_minimo = case when v_c ? 'estoque_minimo' then (v_c ->> 'estoque_minimo')::numeric else p.estoque_minimo end,
        nome_compra = case when v_c ? 'nome_compra' then v_c ->> 'nome_compra' else p.nome_compra end,
        unidade_embalagem_fornecedor = case when v_c ? 'unidade_embalagem_fornecedor'
          then v_c ->> 'unidade_embalagem_fornecedor' else p.unidade_embalagem_fornecedor end,
        qtd_unidade_base_por_embalagem = case when v_c ? 'qtd_unidade_base_por_embalagem'
          then (v_c ->> 'qtd_unidade_base_por_embalagem')::numeric else p.qtd_unidade_base_por_embalagem end,
        preco_fornecedor = case when v_c ? 'preco_fornecedor' then (v_c ->> 'preco_fornecedor')::numeric else p.preco_fornecedor end,
        fornecedor_1 = case when v_c ? 'fornecedor_1' then v_c ->> 'fornecedor_1' else p.fornecedor_1 end,
        fornecedor_2 = case when v_c ? 'fornecedor_2' then v_c ->> 'fornecedor_2' else p.fornecedor_2 end,
        fornecedor_3 = case when v_c ? 'fornecedor_3' then v_c ->> 'fornecedor_3' else p.fornecedor_3 end,
        fornecedor_4 = case when v_c ? 'fornecedor_4' then v_c ->> 'fornecedor_4' else p.fornecedor_4 end,
        observacoes = case when v_c ? 'observacoes' then v_c ->> 'observacoes' else p.observacoes end,
        ativo = case when v_c ? 'ativo' then (v_c ->> 'ativo')::boolean else p.ativo end,
        revenda = case when v_c ? 'revenda' then (v_c ->> 'revenda')::boolean else p.revenda end,
        atualizado_em = now()
    where p.unidade_id = p_unidade_id and p.sku = v_sku;

    if not found then
      raise exception 'O produto % não está mais no Cadastro. Recarregue a página.', v_sku using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

revoke all on function public.salvar_produtos_campos(text, jsonb) from public, anon;
grant execute on function public.salvar_produtos_campos(text, jsonb) to authenticated;

commit;
