-- Trava do vini_operador e token da porta de equipe (09/11/2026).
-- Prova: o operador lê acessos, empresas e unidades mas não escreve; a auditoria só cresce; segredos,
-- senhas e certificados ficam fora; funções sensíveis não executam; a agenda semanal continua.
-- O token 'equipe' exige um ator, e o ator só vale enquanto for master ativo. Só fixtures de teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

-- ── Tabelas ──────────────────────────────────────────────────────────────
select is(
  (select count(*)::int
     from unnest(array['vinculos', 'perfis', 'organizacoes', 'unidades']) t,
          unnest(array['INSERT', 'UPDATE', 'DELETE']) p
    where has_table_privilege('vini_operador', 'public.' || t, p)),
  0,
  'operador não escreve em vínculos, perfis, organizações nem unidades'
);
select ok(has_table_privilege('vini_operador', 'public.vinculos', 'SELECT'), 'operador continua lendo vínculos');
select ok(has_table_privilege('vini_operador', 'public.unidades', 'SELECT'), 'operador continua lendo unidades');

select ok(has_table_privilege('vini_operador', 'public.logs_auditoria', 'INSERT'), 'operador acrescenta auditoria');
select ok(
  not has_table_privilege('vini_operador', 'public.logs_auditoria', 'UPDATE')
  and not has_table_privilege('vini_operador', 'public.logs_auditoria', 'DELETE'),
  'operador não altera nem apaga auditoria'
);

select is(
  (select count(*)::int
     from unnest(array['fin_integracao_tokens', 'conteudo_segredos', 'zh_leads_segredos', 'fin_conciliacao_segredos',
                       'senhas_temporarias', 'fin_sefaz_certificados', 'zh_provisionamentos']) t,
          unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
    where has_table_privilege('vini_operador', 'public.' || t, p)),
  0,
  'operador não toca em segredos, senhas, certificados nem registros de compra'
);
select is(
  (select count(*)::int from pg_policies
    where policyname = 'vini_operador_tudo'
      and tablename in ('fin_integracao_tokens', 'conteudo_segredos', 'zh_leads_segredos', 'fin_conciliacao_segredos',
                        'senhas_temporarias', 'fin_sefaz_certificados', 'zh_provisionamentos')),
  0,
  'nenhuma policy do operador sobra nas tabelas de segredo'
);

-- ── Funções ──────────────────────────────────────────────────────────────
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype <> 'trigger'::regtype
      and (p.proname like 'fin_sefaz\_%' or p.proname like 'conteudo_api\_%'
           or p.proname in ('fin_caixa_entrada_registrar', 'fin_integracao_token_valido', 'fin_integracao_token_ator',
                            'conteudo_token_valido', 'zh_leads_registrar_evento', 'fin_conciliacao_resumo_semanal_ia',
                            'zh_provisionamento_reservar', 'gerar_senha_provisoria_conta', 'rotacionar_senha_temporaria',
                            'iniciar_primeiro_acesso', 'concluir_primeiro_acesso', 'liberar_trava_senha',
                            'editar_vinculo_acesso', 'revogar_vinculo_equipe', 'marcar_titular_organizacao',
                            'salvar_permissoes_modulo', 'atualizar_whatsapp_vinculo', 'equipe_limpar_acessos_auth'))
      and has_function_privilege('vini_operador', p.oid, 'EXECUTE')),
  0,
  'operador não executa função de SEFAZ, token, senha, acesso nem segredo'
);
select ok(
  has_function_privilege('vini_operador', 'public.publicar_agenda_semanal(jsonb, uuid)', 'EXECUTE'),
  'a agenda semanal do Vini continua liberada'
);
select ok(
  not has_function_privilege('authenticated', 'public.fin_integracao_token_ator(text, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.fin_integracao_token_ator(text, text)', 'EXECUTE'),
  'só o servidor confere o ator do token'
);

-- ── Token 'equipe' ───────────────────────────────────────────────────────
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000f901', 'tv-master@teste.local', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f902', 'tv-gestor@teste.local', 'x', now(), 'authenticated', 'authenticated');
insert into organizacoes (id, nome, tipo_cliente, ativo) values ('org-tv', 'Cliente TV', 'saas', true);
insert into vinculos (id, user_id, organizacao_id, unidade_id, role, status) values
  ('00000000-0000-0000-0000-00000000f911', '00000000-0000-0000-0000-00000000f901', 'org-tv', null, 'master', 'ativo'),
  ('00000000-0000-0000-0000-00000000f912', '00000000-0000-0000-0000-00000000f902', 'org-tv', null, 'gestao', 'ativo');

select throws_ok(
  $$insert into public.fin_integracao_tokens (escopo, versao, hash)
    values ('equipe', 901, encode(extensions.digest('sem-ator', 'sha256'), 'hex'))$$,
  '23514',
  null,
  'token de equipe sem ator é recusado'
);

insert into public.fin_integracao_tokens (escopo, versao, hash, ator_user_id) values
  ('equipe', 902, encode(extensions.digest(convert_to(repeat('a', 40), 'UTF8'), 'sha256'), 'hex'), '00000000-0000-0000-0000-00000000f901'),
  ('equipe', 903, encode(extensions.digest(convert_to(repeat('b', 40), 'UTF8'), 'sha256'), 'hex'), '00000000-0000-0000-0000-00000000f902');

select is(
  public.fin_integracao_token_ator(repeat('a', 40), 'equipe'),
  '00000000-0000-0000-0000-00000000f901'::uuid,
  'token certo devolve o master que responde por ele'
);
select is(public.fin_integracao_token_ator(repeat('c', 40), 'equipe'), null, 'token errado não devolve ninguém');
select is(public.fin_integracao_token_ator(repeat('a', 40), 'caixa_entrada'), null, 'token de equipe não vale em outro escopo');
select is(public.fin_integracao_token_ator(repeat('b', 40), 'equipe'), null, 'ator que não é master não vale');

update vinculos set status = 'revogado' where id = '00000000-0000-0000-0000-00000000f911';
select is(public.fin_integracao_token_ator(repeat('a', 40), 'equipe'), null, 'master revogado derruba a porta');

select * from finish();
rollback;
