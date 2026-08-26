-- Financeiro gerencial - DRE V1 (por competência, Zatti Teste/Zatti Burger).
-- Único objeto novo de schema desta fase: `fin_estoque_mensal` (controle
-- manual mensal de estoque, valor em R$, exigido pela fórmula de CMV -
-- Estoque inicial + Estoque final de Mercadorias/Embalagens). Já era previsto
-- no comentário de `fin_categorias` na migração de fundação
-- (20260824090000_...sql): "Estoque inicial/final de Mercadorias e
-- Embalagens (linhas do CMV) não entram aqui: vêm de `fin_estoque_mensal`,
-- não são categoria que recebe lançamento." Nenhuma tabela existente muda de
-- forma - a DRE em si é calculada em memória (`src/lib/financeiro-gerencial/dre.ts`)
-- a partir de `fin_lancamentos`/`fin_parcelas`/`fin_categorias` já existentes
-- mais esta tabela nova, sem view/função nova no banco.
begin;

create table if not exists public.fin_estoque_mensal (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  -- Sempre dia 1 do mês (mês é a granularidade real; o dia é só convenção de
  -- armazenamento) - `check` abaixo trava isso na escrita.
  competencia date not null,
  estoque_inicial_mercadorias numeric(14,2) not null default 0 check (estoque_inicial_mercadorias >= 0),
  estoque_inicial_embalagens numeric(14,2) not null default 0 check (estoque_inicial_embalagens >= 0),
  estoque_final_mercadorias numeric(14,2) not null default 0 check (estoque_final_mercadorias >= 0),
  estoque_final_embalagens numeric(14,2) not null default 0 check (estoque_final_embalagens >= 0),
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (extract(day from competencia) = 1),
  unique (unidade_id, competencia)
);

create index if not exists fin_estoque_mensal_unidade_idx on public.fin_estoque_mensal (unidade_id, competencia);

create or replace function public.atualizar_timestamp_estoque_mensal()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists atualizar_timestamp on public.fin_estoque_mensal;
create trigger atualizar_timestamp
  before update on public.fin_estoque_mensal
  for each row execute function public.atualizar_timestamp_estoque_mensal();

-- Auditoria: mesma função genérica usada por toda tabela do módulo (lê
-- unidade_id/id via NEW/OLD, não precisa de nada específico desta tabela).
drop trigger if exists auditar_escrita on public.fin_estoque_mensal;
create trigger auditar_escrita
  after insert or update or delete on public.fin_estoque_mensal
  for each row execute function public.auditar_escrita_financeiro_gerencial();

alter table public.fin_estoque_mensal enable row level security;

-- Consulta: qualquer vínculo do módulo (Operacional inclusive - "Operacional
-- pode apenas consultar"). Escrita: só Gestão/master, mesmo padrão de
-- `fin_categorias`/`fin_contas_financeiras` (master conta como gestão dentro
-- de `usuario_tem_acesso_unidade`).
create policy "fin_estoque_mensal_select" on public.fin_estoque_mensal
  for select to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));

create policy "fin_estoque_mensal_insert_gestao" on public.fin_estoque_mensal
  for insert to authenticated
  with check (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));

create policy "fin_estoque_mensal_update_gestao" on public.fin_estoque_mensal
  for update to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));

-- Sem policy de delete: estoque mensal errado se corrige editando o mês
-- (mesma lógica de nunca apagar histórico financeiro já aplicada a
-- fin_baixas/fin_lancamentos com baixa).

-- ── Rate limit: nova chave ─────────────────────────────────────────────────
-- Recria a função inteira com a lista acumulada (mesmo padrão de toda
-- migração anterior que mexeu em `consumir_limite_requisicao`) - substituir
-- sem repetir as chaves já existentes as desativaria silenciosamente.
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
      ('trocar_organizacao', 30, 600),
      ('ficha_salvar', 60, 600),
      ('ficha_excluir', 30, 600),
      ('categoria_ficha_criar', 30, 600),
      ('conversao_produto_salvar', 60, 600),
      ('configuracao_financeira_salvar', 30, 600),
      ('ficha_preco_venda_salvar', 120, 600),
      ('categoria_ficha_editar', 30, 600),
      ('categoria_ficha_excluir', 30, 600),
      ('excluir_produto', 30, 600),
      ('ficha_precos_canal_salvar', 120, 600),
      ('fin_conta_financeira_salvar', 30, 600),
      ('fin_categoria_criar', 30, 600),
      ('fin_categoria_editar', 30, 600),
      ('fin_lancamento_criar', 60, 600),
      ('fin_lancamento_editar', 60, 600),
      ('fin_baixa_registrar', 60, 600),
      ('fin_baixa_estornar', 30, 600),
      ('fin_recorrencia_criar', 20, 600),
      ('fin_lancamento_excluir', 30, 600),
      ('fin_estoque_mensal_salvar', 30, 600)
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

commit;
