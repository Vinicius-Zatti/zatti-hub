-- P0 segurança multi-tenant - rate limiting persistente e fail-closed.
--
-- Cobre as superfícies que o app realmente controla: Server Actions e a
-- rota /auth/callback. Login, "esqueci minha senha" e troca de senha vão
-- direto do navegador pro Supabase Auth (supabase.auth.signInWithPassword /
-- resetPasswordForEmail / updateUser, chamados client-side) - o servidor
-- Next.js nunca vê essas requisições, então não tem como aplicar rate
-- limit próprio nelas. Esse ponto não é controlável pela aplicação; fica
-- registrado aqui e no SECURITY.md, e a mitigação é a configuração nativa
-- de rate limit + CAPTCHA do Supabase Auth (external, ver SECURITY.md).
--
-- Por que uma tabela + função em vez de limitar em memória no processo
-- Next.js: em memória não sobrevive a reinício nem funciona com mais de
-- uma instância do servidor rodando (Vercel roda várias) - cada instância
-- teria seu próprio contador, o limite de verdade nunca seria respeitado.
-- Persistente no Postgres garante um contador único não importa quantas
-- instâncias do app estejam de pé.
--
-- Idempotente: `create table if not exists`, `create or replace function`.

create table if not exists public.limites_taxa (
  chave text not null,
  acao text not null,
  janela_inicio timestamptz not null,
  contagem integer not null default 0,
  primary key (chave, acao, janela_inicio)
);

comment on table public.limites_taxa is
  'Contador de rate limit por chave (ex: user:<uuid> ou ip:<endereco>) + ação + janela de tempo fixa. Só a função checar_rate_limit mexe aqui - sem policy de authenticated/anon de propósito.';

alter table public.limites_taxa enable row level security;

-- Nenhuma policy criada de propósito: com RLS ligado e zero policy, select/
-- insert/update/delete de authenticated e anon são negados por padrão.
-- Escrita só acontece via checar_rate_limit(), que roda SECURITY DEFINER.
revoke all on public.limites_taxa from public, authenticated, anon;

create or replace function public.checar_rate_limit(
  p_chave text,
  p_acao text,
  p_limite integer,
  p_janela_segundos integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_janela timestamptz;
  v_contagem integer;
begin
  -- Fail closed: qualquer parâmetro fora do esperado bloqueia em vez de
  -- liberar. Isso nunca deveria acontecer vindo do app (os valores são
  -- constantes no código, não input do usuário), mas se acontecer o
  -- default é negar a ação, não permitir.
  if p_chave is null or length(p_chave) = 0
     or p_acao is null or length(p_acao) = 0
     or p_limite is null or p_limite <= 0
     or p_janela_segundos is null or p_janela_segundos <= 0 then
    return false;
  end if;

  -- Janela fixa (bucket) de p_janela_segundos, não janela deslizante -
  -- mais simples e barato, suficiente pra frear abuso sem precisar de
  -- limpeza contínua fina.
  v_janela := to_timestamp(floor(extract(epoch from now()) / p_janela_segundos) * p_janela_segundos);

  insert into public.limites_taxa as lt (chave, acao, janela_inicio, contagem)
  values (p_chave, p_acao, v_janela, 1)
  on conflict (chave, acao, janela_inicio)
  do update set contagem = lt.contagem + 1
  returning lt.contagem into v_contagem;

  return v_contagem <= p_limite;
exception
  when others then
    -- Fail closed: erro inesperado (ex: banco fora do ar) nunca deve
    -- liberar a ação - só não deveria derrubar a request inteira com uma
    -- exceção não tratada, então devolve "bloqueado" de forma controlada.
    return false;
end;
$$;

comment on function public.checar_rate_limit(text, text, integer, integer) is
  'Incrementa o contador da janela atual e devolve true só se ainda está dentro do limite. Fail-closed: parâmetro inválido ou erro interno sempre devolve false.';

revoke all on function public.checar_rate_limit(text, text, integer, integer) from public;
grant execute on function public.checar_rate_limit(text, text, integer, integer) to authenticated;

-- Operacional: linhas de janelas antigas se acumulam (uma por chave+ação+
-- janela). Sem custo de storage relevante no volume esperado do app, mas
-- fica registrada a rotina de limpeza recomendada pra quem for configurar
-- pg_cron no projeto (fora do escopo do app - requer habilitar a extensão
-- no painel do Supabase):
--   select cron.schedule('limpar_rate_limits', '0 3 * * *',
--     $$delete from public.limites_taxa where janela_inicio < now() - interval '2 days'$$);
