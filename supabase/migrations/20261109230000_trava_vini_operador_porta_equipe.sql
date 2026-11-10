-- Trava do vini_operador e porta de acesso de equipe (09/11/2026, revisão de segurança).
--
-- O papel vini_operador (19/10) nasceu com escrita em todas as tabelas. Só permissões por módulo e
-- titulares tinham sido travados depois. Quem tivesse a URL dele dava master a qualquer conta,
-- apagava a auditoria e lia segredos. Decisão de Vinícius (09/11): o Vini continua cadastrando e
-- ajustando dado do dia a dia, mas acesso de equipe passa pela porta do Hub (POST /api/equipe/acesso),
-- com token próprio do escopo 'equipe'. O Hub confere a regra e grava quem pediu. Master nunca sai
-- por essa porta.

-- ── 1. Token do escopo 'equipe', com o dono do pedido ──────────────────────
-- Só a lista de escopos é recriada. A trava do ator (fin_integracao_tokens_equipe_ator_check) também
-- cita "escopo": migração futura que copiar este laço precisa manter a exclusão abaixo.
do $$
declare
  v record;
begin
  for v in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.fin_integracao_tokens'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%escopo%'
       and c.conname <> 'fin_integracao_tokens_equipe_ator_check'
  loop
    execute format('alter table public.fin_integracao_tokens drop constraint %I', v.conname);
  end loop;
end $$;

-- Quem responde pelo que a porta faz: uma conta master. A auditoria e as funções de acesso
-- conferem esse ator como conferem quem clica na tela.
alter table public.fin_integracao_tokens
  add column if not exists ator_user_id uuid references auth.users (id) on delete restrict;

alter table public.fin_integracao_tokens
  add constraint fin_integracao_tokens_escopo_check
  check (escopo in ('caixa_entrada', 'alertas', 'garante', 'provisionamento', 'sefaz', 'equipe'));

alter table public.fin_integracao_tokens
  add constraint fin_integracao_tokens_equipe_ator_check
  check (escopo <> 'equipe' or ator_user_id is not null);

-- Devolve o ator do token só se o token vale e o ator ainda é master ativo. Master revogado
-- derruba a porta junto.
create or replace function public.fin_integracao_token_ator(p_token text, p_escopo text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.ator_user_id
    from public.fin_integracao_tokens t
   where p_token is not null
     and char_length(p_token) between 32 and 200
     and t.escopo = p_escopo
     and t.ativo
     and t.ator_user_id is not null
     and t.hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
     and exists (
       select 1 from public.vinculos v
        where v.user_id = t.ator_user_id and v.status = 'ativo' and v.role = 'master'
     )
   limit 1;
$$;

revoke all on function public.fin_integracao_token_ator(text, text) from public, anon, authenticated;
grant execute on function public.fin_integracao_token_ator(text, text) to service_role;

-- ── 2. Trava das tabelas ───────────────────────────────────────────────────
-- Acesso, empresas e unidades: o operador continua lendo, não escreve mais.
revoke insert, update, delete, truncate
  on public.vinculos, public.perfis, public.organizacoes, public.unidades
  from vini_operador;

-- Auditoria: lê e acrescenta, nunca altera nem apaga.
revoke update, delete, truncate on public.logs_auditoria from vini_operador;

-- Segredos, senhas e registros de compra: nada.
revoke all
  on public.fin_integracao_tokens, public.conteudo_segredos, public.zh_leads_segredos,
     public.fin_conciliacao_segredos, public.senhas_temporarias, public.fin_sefaz_certificados,
     public.zh_provisionamentos
  from vini_operador;

do $$
declare
  t text;
begin
  foreach t in array array[
    'fin_integracao_tokens', 'conteudo_segredos', 'zh_leads_segredos', 'fin_conciliacao_segredos',
    'senhas_temporarias', 'fin_sefaz_certificados', 'zh_provisionamentos'
  ] loop
    execute format('drop policy if exists vini_operador_tudo on public.%I', t);
  end loop;
end $$;

-- ── 3. Trava das funções sensíveis ─────────────────────────────────────────
-- O default de 19/10 dá EXECUTE ao operador em toda função nova; as da SEFAZ e de segredo/acesso
-- esqueceram de revogar. Pelo nome, todas as versões. Função de gatilho fica de fora (dispara sem
-- conferir EXECUTE). publicar_agenda_semanal, usada pelo Vini, continua liberada.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prorettype <> 'trigger'::regtype
       and p.proname = any (array[
         'fin_sefaz_pendencias', 'fin_sefaz_progresso', 'fin_sefaz_inicio_da_busca',
         'fin_caixa_entrada_registrar', 'fin_integracao_token_valido', 'fin_integracao_token_ator',
         'conteudo_token_valido', 'conteudo_api_listar', 'conteudo_api_criar', 'conteudo_api_atualizar',
         'zh_leads_registrar_evento', 'fin_conciliacao_resumo_semanal_ia', 'zh_provisionamento_reservar',
         'gerar_senha_provisoria_conta', 'rotacionar_senha_temporaria', 'iniciar_primeiro_acesso',
         'concluir_primeiro_acesso', 'liberar_trava_senha', 'editar_vinculo_acesso',
         'revogar_vinculo_equipe', 'marcar_titular_organizacao', 'salvar_permissoes_modulo',
         'atualizar_whatsapp_vinculo', 'equipe_limpar_acessos_auth'
       ])
  loop
    execute format('revoke execute on function %s from vini_operador', f.assinatura);
  end loop;
end $$;
