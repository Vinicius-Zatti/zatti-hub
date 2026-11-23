-- Contas a Pagar e Receber (23/11/2026): trocar o fornecedor/cliente de uma conta já lançada.
-- O lançamento de documento herda a contraparte do documento (gatilho coerir_lancamento_documento)
-- e fin_documentos não tem policy de update. Esta função troca as duas pontas juntas, só para
-- Gestão/master, sem abrir update genérico no documento. Não mexe em valor, data nem baixa.
create or replace function public.fin_trocar_contraparte(p_unidade text, p_lancamento uuid, p_contraparte uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lanc record;
  v_qtd int;
begin
  if auth.uid() is null or not public.usuario_pode_usar_financeiro_gerencial(p_unidade, array['gestao']) then
    raise exception 'Trocar fornecedor e restrito a Gestao/master' using errcode = '42501';
  end if;
  select id, documento_id into v_lanc
    from public.fin_lancamentos where unidade_id = p_unidade and id = p_lancamento for update;
  if not found then
    raise exception 'Lancamento invalido' using errcode = '23514';
  end if;
  if p_contraparte is not null and not exists (
    select 1 from public.fin_contrapartes where unidade_id = p_unidade and id = p_contraparte and ativo
  ) then
    raise exception 'Fornecedor ou cliente invalido' using errcode = '23514';
  end if;

  if v_lanc.documento_id is null then
    update public.fin_lancamentos set contraparte_id = p_contraparte
      where unidade_id = p_unidade and id = p_lancamento;
    get diagnostics v_qtd = row_count;
  else
    -- Documento primeiro: o gatilho confere cada lançamento contra a contraparte do documento.
    update public.fin_documentos set contraparte_id = p_contraparte
      where unidade_id = p_unidade and id = v_lanc.documento_id;
    update public.fin_lancamentos set contraparte_id = p_contraparte
      where unidade_id = p_unidade and documento_id = v_lanc.documento_id;
    get diagnostics v_qtd = row_count;
  end if;
  return v_qtd;
end;
$$;

revoke all on function public.fin_trocar_contraparte(text, uuid, uuid) from public, anon;
grant execute on function public.fin_trocar_contraparte(text, uuid, uuid) to authenticated;
