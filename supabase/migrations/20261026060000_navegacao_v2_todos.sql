-- Navegação V2 liberada para todos os clientes (fase 8, 26/10/2026, ok de Vinícius).
-- Permissões por módulo deixam de ser só do piloto (Zatti Burger): toda organização pode gravar
-- exceções. O resto das regras de salvar_permissoes_modulo não muda. `create or replace` mantém
-- os grants (só service_role executa; vini_operador revogado na 20261025090000).
create or replace function public.organizacao_no_piloto_permissoes(p_organizacao_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select true;
$$;
