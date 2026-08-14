-- Persistent per-user rate limits for authenticated Server Actions.
-- Keeping counters in Postgres works across Vercel instances and cold starts.

create table if not exists public.limites_requisicao (
  user_id uuid not null references auth.users(id) on delete cascade,
  chave text not null,
  janela_inicio timestamptz not null,
  contagem integer not null,
  primary key (user_id, chave),
  constraint limites_requisicao_contagem_check check (contagem > 0),
  constraint limites_requisicao_chave_check check (length(chave) between 1 and 80)
);

alter table public.limites_requisicao enable row level security;

-- There are intentionally no direct table policies. Authenticated users can
-- only consume a known limit through the function below.
revoke all on table public.limites_requisicao from public, anon, authenticated;

create or replace function public.consumir_limite_requisicao(p_chave text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_janela_segundos integer;
  v_contagem integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  select configuracao.limite, configuracao.janela_segundos
    into v_limite, v_janela_segundos
  from (
    values
      ('sugerir_sku', 10, 3600),
      ('registrar_contagem', 30, 600),
      ('corrigir_contagem', 120, 600),
      ('salvar_produtos', 30, 600),
      ('salvar_fornecedores', 30, 600),
      ('pedidos_cotacao', 120, 600),
      ('recebimento', 60, 600),
      ('consolidado_criar', 30, 600),
      ('consolidado_editar', 60, 600),
      ('trocar_organizacao', 30, 600)
  ) as configuracao(chave, limite, janela_segundos)
  where configuracao.chave = p_chave;

  if v_limite is null then
    raise exception 'Limite de requisicao desconhecido' using errcode = '22023';
  end if;

  insert into public.limites_requisicao as atual (
    user_id,
    chave,
    janela_inicio,
    contagem
  )
  values (auth.uid(), p_chave, now(), 1)
  on conflict (user_id, chave) do update
  set
    janela_inicio = case
      when excluded.janela_inicio - atual.janela_inicio
        >= make_interval(secs => v_janela_segundos)
      then excluded.janela_inicio
      else atual.janela_inicio
    end,
    contagem = case
      when excluded.janela_inicio - atual.janela_inicio
        >= make_interval(secs => v_janela_segundos)
      then 1
      else atual.contagem + 1
    end
  returning contagem into v_contagem;

  return v_contagem <= v_limite;
end;
$$;

revoke all on function public.consumir_limite_requisicao(text) from public, anon;
grant execute on function public.consumir_limite_requisicao(text) to authenticated;
