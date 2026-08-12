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
-- Concede só o necessário: SELECT/INSERT/UPDATE/DELETE pras tabelas que o
-- app realmente lê/escreve por PostgREST (authenticated) ou por
-- `service_role` (que também precisa do GRANT de base - BYPASSRLS só pula
-- o filtro de linha, não o `GRANT` de tabela). RLS continua sendo quem de
-- fato decide quais linhas cada papel alcança - este GRANT só destrava a
-- tabela pra RLS ser avaliado, não é ele quem autoriza.
--
-- `anon` recebe só SELECT (nunca INSERT/UPDATE/DELETE - não existe
-- escrita pública nesta aplicação). Não é pra "liberar leitura pública":
-- é pra deixar a RLS ser quem responde, de forma uniforme com todo o
-- resto do sistema - sem o GRANT, `anon` recebe "permission denied"
-- (erro de permissão de tabela, checado antes da RLS); com o GRANT, RLS
-- entra em jogo e devolve zero linhas (nenhuma policy de `anon` foi
-- criada em nenhuma tabela) - mesmo resultado final (`anon` não vê nada),
-- mas de um jeito consistente com como toda outra checagem de acesso
-- deste app funciona (RLS decide, não o sistema de permissão de tabela).
-- A suíte pgTAP (`p0_matriz_autorizacao.sql`) já esperava esse
-- comportamento - sem esse GRANT ela falha com "permission denied" em vez
-- de confirmar "zero linhas".
--
-- `public.limites_taxa` fica de fora de propósito - a migration
-- `20260811093000_p0_rate_limiting.sql` já revoga tudo dela e só libera
-- through da função `checar_rate_limit()` (SECURITY DEFINER); dar GRANT
-- direto na tabela abriria um jeito de burlar o rate limit escrevendo nela
-- direto.

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
to authenticated, service_role;

grant select on table
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
to anon;

-- ── rollback manual (referência, não executa) ──────────────────────────
-- revoke select, insert, update, delete on table <mesma lista> from
-- authenticated, service_role; revoke select on table <mesma lista> from
-- anon; - reverter isso derruba o app inteiro (toda consulta volta a dar
-- "permission denied"), só fazer se for reverter a migration que criou a
-- tabela junto.
