-- Achado na revisão do pacote P0 (12/08), rodando `supabase start` +
-- `supabase test db` do zero pela primeira vez nesta máquina: nenhuma
-- tabela da aplicação nunca recebeu `GRANT` explícito pra `authenticated`
-- em nenhuma migration. Em produção isso nunca deu problema porque toda
-- tabela foi criada por SQL solto no SQL Editor do painel do Supabase, e
-- o próprio painel aplica esses grants automaticamente por trás quando
-- você usa a UI - só que isso nunca ficou registrado em nenhuma migration
-- (não é algo capturado em SQL, é ação do painel). Reconstruir o banco só
-- com `supabase/migrations/*.sql`, como este pacote P0 exige testar,
-- expõe a lacuna: toda consulta como `authenticated` falha com
-- "permission denied for table X", antes mesmo do RLS entrar em jogo -
-- GRANT de tabela é checado primeiro, independente de RLS.
--
-- Revisado em 12/08 pra conceder só o verbo que o código realmente usa
-- por tabela (não SELECT/INSERT/UPDATE/DELETE uniforme em tudo) - checado
-- direto no código-fonte (grep de `.from("<tabela>")` em toda `src/`),
-- não por suposição:
--
--   organizacoes, unidades, perfis, vinculos  -> só SELECT (nunca
--     escritos pelo app - convite/cadastro é manual, ver AGENTS.md)
--   logs_auditoria                            -> só INSERT (o app nunca
--     lê auditoria de volta - ver registrarAuditoria em acesso.ts)
--   pedidos, consolidados_vendas              -> SELECT, INSERT, UPDATE
--     (nenhum DELETE no código)
--   contagens                                 -> SELECT, INSERT (sem
--     UPDATE nem DELETE - contagem é sempre um novo registro)
--   pedido_itens                              -> SELECT, INSERT, UPDATE,
--     DELETE (único lugar do app com `.delete()` de verdade -
--     src/lib/pedidos.ts, remover item perdedor da cotação)
--   produtos, fornecedores, contagem_itens    -> SELECT, INSERT, UPDATE
--     (upsert usa as duas primeiras; sem DELETE)
--
-- RLS continua sendo quem de fato decide QUAIS LINHAS cada papel alcança
-- (produtos_insert_gestao etc. já bloqueiam operacional mesmo com o GRANT
-- de INSERT concedido aqui - comprovado no teste 6 da suíte pgTAP). Este
-- GRANT só destrava a tabela pra RLS ser avaliado, nunca substitui RLS.
--
-- `service_role` recebe o CRUD completo em todas (é o papel confiável de
-- bypass administrativo por design - BYPASSRLS, nunca exposto a cliente,
-- a chave nunca sai do servidor). Não é usado por nenhum código desta
-- branch hoje, mas é o padrão de toda ferramenta admin futura (ex:
-- onboarding administrativo, branch separada) e de scripts operacionais.
--
-- `anon` NÃO recebe grant nenhum, em nenhuma tabela - revisado depois de
-- feedback de que "SELECT pra anon com zero policy" ainda é concessão
-- mais ampla do que o necessário. O mínimo de verdade pra um papel que
-- não deveria alcançar nada é NENHUM grant: `anon` recebe "permission
-- denied" direto (barreira de GRANT, checada antes até da RLS), em vez
-- de conseguir montar a query e só então ser filtrado pra zero linhas.
-- Cadastro público está desabilitado (ver SECURITY.md) - não existe
-- nenhuma tela nem fluxo que dependa de `anon` ler qualquer tabela desta
-- lista.
--
-- `public.limites_taxa` fica de fora de propósito - a migration
-- `20260811093000_p0_rate_limiting.sql` já revoga tudo dela e só libera
-- through da função `checar_rate_limit()` (SECURITY DEFINER); dar GRANT
-- direto na tabela abriria um jeito de burlar o rate limit escrevendo nela
-- direto.

grant select on table
  public.organizacoes,
  public.unidades,
  public.perfis,
  public.vinculos
to authenticated;

grant insert on table
  public.logs_auditoria
to authenticated;

grant select, insert, update on table
  public.pedidos,
  public.consolidados_vendas,
  public.produtos,
  public.fornecedores,
  public.contagem_itens
to authenticated;

grant select, insert on table
  public.contagens
to authenticated;

grant select, insert, update, delete on table
  public.pedido_itens
to authenticated;

grant select, insert, update, delete on table
  public.organizacoes,
  public.unidades,
  public.perfis,
  public.vinculos,
  public.logs_auditoria,
  public.pedidos,
  public.pedido_itens,
  public.consolidados_vendas,
  public.produtos,
  public.fornecedores,
  public.contagens,
  public.contagem_itens
to service_role;

-- ── rollback manual (referência, não executa) ──────────────────────────
-- revoke select, insert, update, delete on table
--   organizacoes, unidades, perfis, vinculos, logs_auditoria, pedidos,
--   pedido_itens, consolidados_vendas, produtos, fornecedores, contagens,
--   contagem_itens
-- from authenticated, service_role;
-- (anon nunca recebeu grant nesta versão - nada a revogar pra ele.)
-- Reverter isso derruba o app inteiro (toda consulta volta a dar
-- "permission denied"), só fazer se for reverter a migration que criou a
-- tabela junto.
