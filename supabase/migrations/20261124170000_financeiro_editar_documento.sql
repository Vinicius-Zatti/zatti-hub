-- Contas a Pagar e Receber (24/11/2026): editar a nota inteira depois de lançada, no mesmo
-- formulário da Caixa de Entrada (fornecedor, número, descrição, emissão, competência, conta,
-- observação, linhas de Plano de Contas e vencimentos), em vez de corrigir lançamento por lançamento.
--
-- Regras:
-- - Só Gestão/master (mesma regra de update/delete de fin_lancamentos e fin_parcelas).
-- - fin_documentos não tem policy de update: SECURITY DEFINER com checagem explícita, como
--   fin_trocar_contraparte. Os gatilhos (período fechado, Plano de Contas, coerência com o
--   documento, auditoria) continuam valendo pelo auth.uid() de quem chamou.
-- - Nota sem nenhum pagamento (nem estornado) e sem vínculo de Conciliação: tudo muda. Os
--   lançamentos existentes são reaproveitados na ordem (arquivo anexado e histórico continuam
--   apontando para eles), linha a mais vira lançamento novo, linha a menos sai (o arquivo anexado
--   a ela passa para a 1ª linha) e as parcelas são regravadas com o rateio novo.
-- - Nota com pagamento ou conciliação: dados, fornecedor e Plano de Contas mudam; valores e
--   vencimentos precisam ficar iguais (pagamento nunca é apagado). Para mudar valor, estorne antes.
-- Entrada (jsonb, centavos inteiros, mesmo formato de fin_documento_criar sem chave/origem/tipo):
-- { unidade, documento_id, contraparte_id, numero, descricao, data_emissao, data_competencia,
--   conta_financeira_id, observacao, vencimentos: [datas], linhas: [{ categoria_id, descricao,
--   valor, celulas: [centavos por vencimento] }] }
create or replace function public.fin_documento_editar(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unidade text := p->>'unidade';
  v_doc_id uuid := nullif(p->>'documento_id', '')::uuid;
  v_doc record;
  v_contraparte uuid := nullif(p->>'contraparte_id', '')::uuid;
  v_conta uuid := nullif(p->>'conta_financeira_id', '')::uuid;
  v_vencs jsonb := p->'vencimentos';
  v_linhas jsonb := p->'linhas';
  v_n int;
  v_i int;
  v_j int;
  v_linha jsonb;
  v_celula bigint;
  v_soma_linha bigint;
  v_total bigint := 0;
  v_soma_col bigint[];
  v_antigos uuid[];
  v_m int;
  v_lanc uuid;
  v_papel text;
  v_numero int;
  v_qtd int;
  v_travado boolean;
  v_atual jsonb;
  v_novo jsonb;
begin
  if auth.uid() is null or not public.usuario_pode_usar_financeiro_gerencial(v_unidade, array['gestao']) then
    raise exception 'Editar nota e restrito a Gestao/master' using errcode = '42501';
  end if;
  select id, tipo into v_doc from public.fin_documentos
    where unidade_id = v_unidade and id = v_doc_id for update;
  if not found then
    raise exception 'Nota invalida' using errcode = '23514';
  end if;
  if char_length(trim(coalesce(p->>'descricao', ''))) not between 1 and 200 then
    raise exception 'Descricao obrigatoria' using errcode = '23514';
  end if;
  if v_contraparte is not null and not exists (
    select 1 from public.fin_contrapartes where unidade_id = v_unidade and id = v_contraparte and ativo
  ) then
    raise exception 'Fornecedor ou cliente invalido' using errcode = '23514';
  end if;
  if v_conta is not null and not exists (
    select 1 from public.fin_contas_financeiras where unidade_id = v_unidade and id = v_conta
  ) then
    raise exception 'Conta financeira invalida' using errcode = '23514';
  end if;
  if jsonb_typeof(v_vencs) <> 'array' or jsonb_typeof(v_linhas) <> 'array' then
    raise exception 'Documento sem vencimentos ou linhas' using errcode = '23514';
  end if;
  v_n := jsonb_array_length(v_vencs);
  if v_n < 1 or v_n > 360 or jsonb_array_length(v_linhas) < 1 or jsonb_array_length(v_linhas) > 50 then
    raise exception 'Quantidade de vencimentos ou linhas fora do limite' using errcode = '23514';
  end if;

  -- Mesma conferência do rateio de fin_documento_criar.
  v_soma_col := array_fill(0::bigint, array[v_n]);
  for v_i in 0 .. jsonb_array_length(v_linhas) - 1 loop
    v_linha := v_linhas->v_i;
    if jsonb_array_length(v_linha->'celulas') <> v_n then
      raise exception 'Linha % com quantidade de vencimentos diferente', v_i + 1 using errcode = '23514';
    end if;
    if not exists (select 1 from public.fin_categorias c
                   where c.unidade_id = v_unidade and c.id = (v_linha->>'categoria_id')::uuid) then
      raise exception 'Plano de Contas invalido na linha %', v_i + 1 using errcode = '23514';
    end if;
    v_soma_linha := 0;
    for v_j in 0 .. v_n - 1 loop
      v_celula := (v_linha->'celulas'->>v_j)::bigint;
      if v_celula < 0 then
        raise exception 'Rateio com valor negativo' using errcode = '23514';
      end if;
      v_soma_linha := v_soma_linha + v_celula;
      v_soma_col[v_j + 1] := v_soma_col[v_j + 1] + v_celula;
    end loop;
    if v_soma_linha <= 0 or v_soma_linha <> (v_linha->>'valor')::bigint then
      raise exception 'Linha % nao fecha com o proprio valor', v_i + 1 using errcode = '23514';
    end if;
    v_total := v_total + v_soma_linha;
  end loop;
  for v_j in 1 .. v_n loop
    if v_soma_col[v_j] <= 0 then
      raise exception 'Vencimento % sem valor', v_j using errcode = '23514';
    end if;
  end loop;

  select array_agg(id order by criado_em, id) into v_antigos
    from public.fin_lancamentos where unidade_id = v_unidade and documento_id = v_doc_id;
  v_m := coalesce(array_length(v_antigos, 1), 0);

  -- Travado: qualquer pagamento (mesmo estornado) ou vínculo de Conciliação nas parcelas/lançamentos.
  v_travado := exists (
      select 1 from public.fin_baixas b join public.fin_parcelas pa on pa.id = b.parcela_id
       where pa.unidade_id = v_unidade and pa.lancamento_id = any(v_antigos))
    or exists (
      select 1 from public.fin_conciliacao_decisao_vinculos v
       where v.lancamento_id = any(v_antigos)
          or v.parcela_id in (select id from public.fin_parcelas where lancamento_id = any(v_antigos)));

  if v_travado then
    -- Estrutura atual: por linha (ordem dos lançamentos) o valor em centavos de cada vencimento.
    select jsonb_build_object(
             'vencimentos', (select coalesce(jsonb_agg(d order by k), '[]'::jsonb) from (
                 select pa.vencimento_documento as k, min(pa.data_prevista)::text as d
                   from public.fin_parcelas pa where pa.lancamento_id = any(v_antigos)
                  group by pa.vencimento_documento) vv),
             'celulas', (select coalesce(jsonb_agg(c order by o), '[]'::jsonb) from (
                 select o, (select jsonb_agg(coalesce((select round(pa.valor * 100)::bigint
                                                         from public.fin_parcelas pa
                                                        where pa.lancamento_id = l.id and pa.vencimento_documento = k), 0) order by k)
                              from generate_series(1, v_n) k) as c
                   from unnest(v_antigos) with ordinality as l(id, o)) cc))
      into v_atual;
    select jsonb_build_object(
             'vencimentos', v_vencs,
             'celulas', (select jsonb_agg(l->'celulas' order by o) from jsonb_array_elements(v_linhas) with ordinality as x(l, o)))
      into v_novo;
    if jsonb_array_length(v_linhas) <> v_m
       or (select jsonb_agg(to_jsonb(x)) from jsonb_array_elements_text(v_atual->'vencimentos') x)
          is distinct from (select jsonb_agg(to_jsonb(x)) from jsonb_array_elements_text(v_novo->'vencimentos') x)
       or (select jsonb_agg(c) from jsonb_array_elements(v_atual->'celulas') c)
          is distinct from (select jsonb_agg((select jsonb_agg((e)::bigint) from jsonb_array_elements_text(c) e))
                              from jsonb_array_elements(v_novo->'celulas') c) then
      raise exception 'Nota com pagamento: valores e vencimentos nao mudam. Estorne o pagamento antes'
        using errcode = 'P0001';
    end if;
  end if;

  -- Documento primeiro: o gatilho confere cada lançamento contra a contraparte do documento.
  update public.fin_documentos
     set contraparte_id = v_contraparte,
         numero = nullif(trim(p->>'numero'), ''),
         descricao = trim(p->>'descricao'),
         data_emissao = nullif(p->>'data_emissao', '')::date,
         total = v_total / 100.0
   where unidade_id = v_unidade and id = v_doc_id;

  -- Linha a menos: o arquivo anexado a ela passa para a 1ª linha; o lançamento sai (sem parcelas
  -- pagas, garantido acima; as parcelas saem em cascata).
  for v_i in jsonb_array_length(v_linhas) + 1 .. v_m loop
    update public.fin_caixa_entrada set lancamento_id = v_antigos[1]
     where unidade_id = v_unidade and lancamento_id = v_antigos[v_i];
    delete from public.fin_lancamentos where unidade_id = v_unidade and id = v_antigos[v_i];
  end loop;

  if not v_travado then
    delete from public.fin_parcelas
     where unidade_id = v_unidade and lancamento_id = any(v_antigos[1:least(v_m, jsonb_array_length(v_linhas))]);
  end if;

  for v_i in 0 .. jsonb_array_length(v_linhas) - 1 loop
    v_linha := v_linhas->v_i;
    select c.papel_dre into v_papel from public.fin_categorias c
      where c.unidade_id = v_unidade and c.id = (v_linha->>'categoria_id')::uuid;
    if v_i < v_m then
      v_lanc := v_antigos[v_i + 1];
      update public.fin_lancamentos
         set categoria_id = (v_linha->>'categoria_id')::uuid,
             descricao = coalesce(nullif(trim(v_linha->>'descricao'), ''), trim(p->>'descricao')),
             data_competencia = (p->>'data_competencia')::date,
             conta_financeira_id = v_conta,
             observacao = coalesce(p->>'observacao', ''),
             contraparte_id = v_contraparte,
             origem = case when v_papel in ('cmo_ferias', 'cmo_decimo_terceiro', 'cmo_multa_fgts') then 'liquidacao_provisao' else 'comum' end
       where unidade_id = v_unidade and id = v_lanc;
    else
      insert into public.fin_lancamentos (
        unidade_id, tipo, origem, categoria_id, descricao, data_competencia, conta_financeira_id,
        observacao, criado_por, documento_id, contraparte_id
      ) values (
        v_unidade, v_doc.tipo,
        case when v_papel in ('cmo_ferias', 'cmo_decimo_terceiro', 'cmo_multa_fgts') then 'liquidacao_provisao' else 'comum' end,
        (v_linha->>'categoria_id')::uuid,
        coalesce(nullif(trim(v_linha->>'descricao'), ''), trim(p->>'descricao')),
        (p->>'data_competencia')::date, v_conta, coalesce(p->>'observacao', ''),
        auth.uid(), v_doc_id, v_contraparte
      ) returning id into v_lanc;
    end if;

    if v_travado then
      -- Valores e datas iguais (conferido acima): só a conta prevista acompanha a nota.
      update public.fin_parcelas set conta_financeira_id = v_conta
       where unidade_id = v_unidade and lancamento_id = v_lanc;
      continue;
    end if;

    select count(*) into v_qtd from jsonb_array_elements_text(v_linha->'celulas') c where c::bigint > 0;
    v_numero := 0;
    for v_j in 0 .. v_n - 1 loop
      v_celula := (v_linha->'celulas'->>v_j)::bigint;
      continue when v_celula = 0;
      v_numero := v_numero + 1;
      insert into public.fin_parcelas (
        unidade_id, lancamento_id, numero, total_parcelas, valor, data_prevista,
        conta_financeira_id, vencimento_documento
      ) values (
        v_unidade, v_lanc, v_numero, v_qtd, v_celula / 100.0, (v_vencs->>v_j)::date, v_conta, v_j + 1
      );
    end loop;
  end loop;

  return v_doc_id;
end;
$$;

revoke all on function public.fin_documento_editar(jsonb) from public, anon;
grant execute on function public.fin_documento_editar(jsonb) to authenticated;
