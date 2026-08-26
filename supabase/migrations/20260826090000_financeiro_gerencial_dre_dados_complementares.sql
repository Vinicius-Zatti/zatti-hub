-- Financeiro gerencial - Dados Complementares da DRE (Receita de Vendas de
-- Produtos + Saídas de Produtos sem Receita). "Estoque mensal" deixa de ser
-- página própria e passa a ser preenchido na própria página da DRE, mas a
-- tabela `fin_estoque_mensal` continua a mesma - só ganha uma coluna nova.
-- Nenhuma linha existente é tocada, nenhum histórico se perde.
begin;

-- Receita de Vendas de Produtos: dado mensal manual, mesma granularidade
-- (unidade + competência) do resto de `fin_estoque_mensal` - por isso vira
-- coluna nova ali, não tabela nova. Serve só de denominador do % CMV (nunca
-- soma na Receita Operacional Bruta, nunca entra na fórmula do CMV em R$).
alter table public.fin_estoque_mensal
  add column if not exists receita_vendas_produtos numeric(14,2) not null default 0 check (receita_vendas_produtos >= 0);

-- Saídas de Produtos sem Receita: granularidade unidade + competência + tipo
-- (6 tipos fixos) - por isso é tabela própria, não coluna. Dado exclusivamente
-- gerencial: nunca soma Receita, nunca altera o CMV, nunca duplica custo -
-- só explica consumo de estoque sem venda associada. Sem view/função de
-- cálculo nova - a tela lê e mostra o Total por tipo em memória.
create table if not exists public.fin_saidas_sem_receita (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  competencia date not null,
  tipo text not null check (tipo in (
    'bonificacao_cortesia',
    'fidelidade',
    'doacao',
    'marketing_degustacao',
    'consumo_interno',
    'perda_desperdicio'
  )),
  valor numeric(14,2) not null default 0 check (valor >= 0),
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (extract(day from competencia) = 1),
  unique (unidade_id, competencia, tipo)
);

create index if not exists fin_saidas_sem_receita_unidade_idx on public.fin_saidas_sem_receita (unidade_id, competencia);

-- Mesmo gatilho de `atualizado_em` de `fin_estoque_mensal` - é genérico (só
-- lê/escreve a coluna `atualizado_em`), reaproveitado em vez de duplicado.
drop trigger if exists atualizar_timestamp on public.fin_saidas_sem_receita;
create trigger atualizar_timestamp
  before update on public.fin_saidas_sem_receita
  for each row execute function public.atualizar_timestamp_estoque_mensal();

-- Mesma auditoria genérica de todo o módulo.
drop trigger if exists auditar_escrita on public.fin_saidas_sem_receita;
create trigger auditar_escrita
  after insert or update or delete on public.fin_saidas_sem_receita
  for each row execute function public.auditar_escrita_financeiro_gerencial();

alter table public.fin_saidas_sem_receita enable row level security;

-- Mesmo padrão de `fin_estoque_mensal`: consulta liberada a qualquer vínculo
-- do módulo (Operacional só consulta), escrita só Gestão/master.
create policy "fin_saidas_sem_receita_select" on public.fin_saidas_sem_receita
  for select to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));

create policy "fin_saidas_sem_receita_insert_gestao" on public.fin_saidas_sem_receita
  for insert to authenticated
  with check (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));

create policy "fin_saidas_sem_receita_update_gestao" on public.fin_saidas_sem_receita
  for update to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));

-- Sem policy de delete - mesma lógica de nunca apagar histórico financeiro,
-- corrige editando o valor do mês/tipo.

-- ── Rate limit: nova chave ─────────────────────────────────────────────────
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
      ('fin_estoque_mensal_salvar', 30, 600),
      ('fin_saidas_sem_receita_salvar', 60, 600)
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
