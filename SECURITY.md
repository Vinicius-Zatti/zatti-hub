# Segurança do Zatti Hub

Este documento descreve as barreiras implementadas no pacote P0 e a
configuração externa (fora do código) necessária pra elas funcionarem de
verdade. A `anon`/`publishable key` do Supabase é pública por design; o
isolamento real fica em Auth, RLS, policies e validação server-side. Nunca
adicionar uma `service_role` ao frontend ou a uma variável `NEXT_PUBLIC_*`.

## Ordem de rollout recomendada

1. Fazer backup do banco e aplicar primeiro num projeto de staging.
2. Aplicar `supabase/migrations/20260811_p0_rls_hardening.sql`.
3. Aplicar `supabase/migrations/20260811_p0_rate_limiting.sql`.
4. Publicar a aplicação (build usa Next.js 16.3.0).
5. Um usuário `master` precisa entrar e cadastrar o TOTP em `/mfa` antes de
   qualquer outra pessoa depender de acesso `master` - a partir do passo 2,
   sessão `master` sem AAL2 já não enxerga organização/unidade nenhuma.
6. Cadastrar `NEXT_PUBLIC_TURNSTILE_SITE_KEY` na Vercel e fazer novo deploy.
7. Só depois do widget aparecer em login e recuperação de senha, cadastrar a
   secret key do Turnstile no Supabase Auth e habilitar CAPTCHA. A secret
   nunca vai para a Vercel nem para o repositório.
8. Rodar `supabase test db` (suite em `supabase/tests/database/`) contra o
   staging antes de promover pra produção.

Entre os passos 2 e 5, sessões `master` em AAL1 ficam sem acesso a dado de
cliente nenhum - intencional, é a barreira funcionando.

## Configuração externa obrigatória

### Supabase Auth
- Manter cadastro público desabilitado - usuários entram só por convite.
- Ativar proteção contra senha vazada e exigir senha mínima de 12
  caracteres, se disponível no plano.
- Revisar/apertar os rate limits nativos de login, recuperação de senha e
  troca de email do Auth (esse é o ponto que a aplicação não controla - ver
  seção "Limitação conhecida" abaixo).
- Habilitar CAPTCHA (Turnstile) só depois do passo 7 acima.
- Restringir URLs de redirecionamento aos domínios oficiais de
  staging/produção.

### Vercel
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: variáveis públicas, sem problema expor.
- `service_role` do Supabase: **não é usada em nenhum lugar do código hoje**.
  Se algum dia for necessária (ex: job administrativo), só em variável
  server-only, nunca `NEXT_PUBLIC_*`, nunca logada.

## Limitação conhecida (registrada, não é omissão)

Login (`signInWithPassword`), "esqueci minha senha"
(`resetPasswordForEmail`) e troca de senha (`updateUser`) chamam o SDK do
Supabase Auth **direto do navegador** - o servidor Next.js nunca vê essas
requisições, então `src/lib/rate-limit.ts` não consegue protegê-las
diretamente. Mitigação: rate limit nativo do Supabase Auth (configuração
acima) + Turnstile no login e na recuperação de senha.

Toda superfície que passa pelo servidor (Server Actions e a rota
`/auth/callback`) tem rate limiting próprio, persistente (Postgres, não em
memória - sobrevive a reinício e funciona com várias instâncias do app) e
fail-closed (erro na checagem bloqueia a ação, nunca libera por omissão).

## Testes

- `npm test` - testes unitários (vitest) dos helpers de segurança
  (validação, erro público, rate limit fail-closed, anti formula-injection).
- `supabase test db` - suite pgTAP (`supabase/tests/database/`) da matriz
  de autorização multi-tenant. Exige o stack local do Supabase (Docker) ou
  um projeto de staging.
