-- Financeiro Gerencial V1 completa (22/09): Provisões trabalhistas,
-- liquidação de provisão, Fechamento mensal, histórico de auditoria e
-- encerramento de recorrência. Tudo aditivo - nenhuma coluna existente muda
-- de tipo, nenhum dado é apagado. Arquitetura em
-- `_execucao/zatti-hub/financeiro-gerencial-v1-arquitetura.md` (Cérebro do Gestor).

-- ── Liquidação de provisão como origem de lançamento ────────────────────────
-- As 3 contas de CMO só-de-provisão (Férias, 13º salário, Provisão de multa
-- do FGTS) passam a aceitar lançamento, mas só de despesa e só com
-- `origem = 'liquidacao_provisao'` (guia paga). Esse lançamento entra no caixa
-- pelas parcelas/baixas e nunca na DRE - quem alimenta a DRE dessas contas
-- continua sendo o cálculo de provisão (`src/lib/financeiro-gerencial/provisoes.ts`).
alter table public.fin_lancamentos drop constraint if exists fin_lancamentos_origem_check;
alter table public.fin_lancamentos add constraint fin_lancamentos_origem_check
  check (origem in ('comum', 'recorrencia', 'liquidacao_provisao'));

create or replace function public.proteger_lancamento_financeiro()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_categoria record;
begin
  if auth.uid() is null then
    return new;
  end if;

  select nivel, papel_dre, arquivado
    into v_categoria
    from public.fin_categorias
    where unidade_id = new.unidade_id and id = new.categoria_id;

  if not found then
    raise exception 'Categoria invalida para lancamento' using errcode = '23514';
  end if;
  if v_categoria.nivel <> 'conta' then
    raise exception 'Categoria precisa ser uma conta-folha, nao grupo ou subgrupo' using errcode = '23514';
  end if;
  if v_categoria.arquivado then
    raise exception 'Categoria arquivada nao pode receber lancamento' using errcode = '23514';
  end if;
  if public.papel_dre_somente_provisao(v_categoria.papel_dre) then
    if new.origem <> 'liquidacao_provisao' or new.tipo <> 'despesa' then
      raise exception 'Conta de provisao so recebe despesa de liquidacao de provisao' using errcode = '23514';
    end if;
  elsif new.origem = 'liquidacao_provisao' then
    raise exception 'Liquidacao de provisao precisa usar Ferias, 13o salario ou Provisao de multa do FGTS' using errcode = '23514';
  end if;
  if new.tipo = 'receita' and v_categoria.papel_dre is distinct from 'receita' then
    raise exception 'Lancamento de receita so pode usar categoria com papel_dre = receita' using errcode = '23514';
  end if;
  if new.tipo = 'despesa' and v_categoria.papel_dre = 'receita' then
    raise exception 'Lancamento de despesa nao pode usar categoria de receita' using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ── Parâmetros de provisão (histórico = as próprias linhas) ─────────────────
-- Só insert: mudar parâmetro é gravar linha nova com `vigente_desde`; a
-- competência usa a linha mais recente com `vigente_desde <= competência`.
-- Sem linha nenhuma, vale o padrão da planilha Financeiro Zatti (no app).
create table if not exists public.fin_provisoes_parametros (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  vigente_desde date not null check (extract(day from vigente_desde) = 1),
  percentual_ferias numeric(10,6) not null check (percentual_ferias between 0 and 100),
  percentual_adicional_terco numeric(10,6) not null check (percentual_adicional_terco between 0 and 100),
  percentual_encargos_ferias numeric(10,6) not null check (percentual_encargos_ferias between 0 and 100),
  percentual_decimo_terceiro numeric(10,6) not null check (percentual_decimo_terceiro between 0 and 100),
  percentual_encargos_decimo_terceiro numeric(10,6) not null check (percentual_encargos_decimo_terceiro between 0 and 100),
  percentual_multa_fgts numeric(10,6) not null check (percentual_multa_fgts between 0 and 100),
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now()
);

create index if not exists fin_provisoes_parametros_unidade_idx
  on public.fin_provisoes_parametros (unidade_id, vigente_desde desc, criado_em desc);

alter table public.fin_provisoes_parametros enable row level security;

create policy "fin_provisoes_parametros_select" on public.fin_provisoes_parametros
  for select to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_provisoes_parametros_insert_gestao" on public.fin_provisoes_parametros
  for insert to authenticated
  with check (
    public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao'])
    and criado_por = auth.uid()
  );

drop trigger if exists auditar_escrita on public.fin_provisoes_parametros;
create trigger auditar_escrita
  after insert or update or delete on public.fin_provisoes_parametros
  for each row execute function public.auditar_escrita_financeiro_gerencial();

-- ── Reversão de provisão (sobra que não vai ser paga) ───────────────────────
create table if not exists public.fin_provisoes_reversoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  tipo text not null check (tipo in ('ferias', 'decimo_terceiro', 'multa_fgts')),
  competencia date not null check (extract(day from competencia) = 1),
  valor numeric(14,2) not null check (valor > 0),
  motivo text not null check (char_length(trim(motivo)) between 3 and 300),
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now()
);

create index if not exists fin_provisoes_reversoes_unidade_idx
  on public.fin_provisoes_reversoes (unidade_id, competencia);

alter table public.fin_provisoes_reversoes enable row level security;

create policy "fin_provisoes_reversoes_select" on public.fin_provisoes_reversoes
  for select to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_provisoes_reversoes_insert_gestao" on public.fin_provisoes_reversoes
  for insert to authenticated
  with check (
    public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao'])
    and criado_por = auth.uid()
  );
create policy "fin_provisoes_reversoes_delete_gestao" on public.fin_provisoes_reversoes
  for delete to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));

drop trigger if exists auditar_escrita on public.fin_provisoes_reversoes;
create trigger auditar_escrita
  after insert or update or delete on public.fin_provisoes_reversoes
  for each row execute function public.auditar_escrita_financeiro_gerencial();

-- ── Fechamento mensal ───────────────────────────────────────────────────────
-- Uma linha por mês que já foi fechado alguma vez. Reabrir exige motivo; o
-- histórico completo (quem fechou/reabriu e quando) fica em `logs_auditoria`
-- pelo gatilho de auditoria.
create table if not exists public.fin_fechamentos (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  competencia date not null check (extract(day from competencia) = 1),
  fechado boolean not null,
  motivo_reabertura text not null default '' check (char_length(motivo_reabertura) <= 300),
  atualizado_por uuid not null references auth.users(id),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, competencia),
  check (fechado or char_length(trim(motivo_reabertura)) >= 3)
);

alter table public.fin_fechamentos enable row level security;

create policy "fin_fechamentos_select" on public.fin_fechamentos
  for select to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_fechamentos_insert_gestao" on public.fin_fechamentos
  for insert to authenticated
  with check (
    public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao'])
    and atualizado_por = auth.uid()
  );
create policy "fin_fechamentos_update_gestao" on public.fin_fechamentos
  for update to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']))
  with check (
    public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao'])
    and atualizado_por = auth.uid()
  );

drop trigger if exists auditar_escrita on public.fin_fechamentos;
create trigger auditar_escrita
  after insert or update or delete on public.fin_fechamentos
  for each row execute function public.auditar_escrita_financeiro_gerencial();

create or replace function public.periodo_financeiro_fechado(p_unidade_id text, p_data date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.fin_fechamentos f
    where f.unidade_id = p_unidade_id
      and f.competencia = date_trunc('month', p_data)::date
      and f.fechado
  );
$$;

revoke all on function public.periodo_financeiro_fechado(text, date) from public, anon;
grant execute on function public.periodo_financeiro_fechado(text, date) to authenticated;

-- Barreira real do fechamento: Operacional não escreve em mês fechado, por
-- qualquer porta (Server Action ou chamada direta). Gestão/master passam
-- (alteração histórica é deles, sempre com auditoria). Na parcela, o UPDATE
-- automático de `recalcular_parcela_apos_baixa` (só `atualizado_em`) não é
-- barrado - pagar hoje uma conta de um mês fechado continua liberado; o que
-- vale é a data da baixa.
create or replace function public.bloquear_periodo_fechado_financeiro()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_unidade_id text;
  v_datas date[] := '{}';
  v_data date;
  v_competencia date;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_unidade_id := coalesce(new.unidade_id, old.unidade_id);
  if public.usuario_pode_usar_financeiro_gerencial(v_unidade_id, array['gestao']) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'fin_lancamentos' then
    if tg_op <> 'INSERT' then v_datas := v_datas || old.data_competencia; end if;
    if tg_op <> 'DELETE' then v_datas := v_datas || new.data_competencia; end if;
  elsif tg_table_name = 'fin_parcelas' then
    if tg_op = 'UPDATE'
      and new.valor is not distinct from old.valor
      and new.data_prevista is not distinct from old.data_prevista
      and new.conta_financeira_id is not distinct from old.conta_financeira_id then
      return new;
    end if;
    if tg_op <> 'INSERT' then v_datas := v_datas || old.data_prevista; end if;
    if tg_op <> 'DELETE' then v_datas := v_datas || new.data_prevista; end if;
    select l.data_competencia into v_competencia
      from public.fin_lancamentos l
      where l.id = coalesce(new.lancamento_id, old.lancamento_id);
    if v_competencia is not null then v_datas := v_datas || v_competencia; end if;
  elsif tg_table_name = 'fin_baixas' then
    v_datas := v_datas || new.data;
  end if;

  foreach v_data in array v_datas loop
    if public.periodo_financeiro_fechado(v_unidade_id, v_data) then
      raise exception 'Mes fechado: so Gestao/master pode alterar lancamentos deste periodo' using errcode = '42501';
    end if;
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists bloquear_periodo_fechado on public.fin_lancamentos;
create trigger bloquear_periodo_fechado
  before insert or update or delete on public.fin_lancamentos
  for each row execute function public.bloquear_periodo_fechado_financeiro();

drop trigger if exists bloquear_periodo_fechado on public.fin_parcelas;
create trigger bloquear_periodo_fechado
  before insert or update or delete on public.fin_parcelas
  for each row execute function public.bloquear_periodo_fechado_financeiro();

drop trigger if exists bloquear_periodo_fechado on public.fin_baixas;
create trigger bloquear_periodo_fechado
  before insert on public.fin_baixas
  for each row execute function public.bloquear_periodo_fechado_financeiro();

-- ── Histórico de auditoria do módulo (tela de Fechamento) ───────────────────
-- `logs_auditoria` não tem policy de select (de propósito); esta função
-- devolve só as linhas `fin_*` da unidade, só pra Gestão/master, com o nome
-- de quem alterou.
create or replace function public.listar_auditoria_financeiro_gerencial(p_unidade_id text, p_limite integer default 300)
returns table (
  id uuid,
  criado_em timestamptz,
  acao text,
  entidade text,
  entidade_id text,
  autor text,
  dados_antigos jsonb,
  dados_novos jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.criado_em, l.acao, l.entidade, l.entidade_id,
         coalesce(nullif(trim(p.nome), ''), 'Usuário') as autor,
         l.dados_antigos, l.dados_novos
    from public.logs_auditoria l
    left join public.perfis p on p.id = l.user_id
   where public.usuario_pode_usar_financeiro_gerencial(p_unidade_id, array['gestao'])
     and l.unidade_id = p_unidade_id
     and l.entidade like 'fin\_%'
   order by l.criado_em desc
   limit least(greatest(coalesce(p_limite, 300), 1), 500);
$$;

revoke all on function public.listar_auditoria_financeiro_gerencial(text, integer) from public, anon;
grant execute on function public.listar_auditoria_financeiro_gerencial(text, integer) to authenticated;

-- ── Encerrar recorrência ────────────────────────────────────────────────────
create policy "fin_recorrencias_update_gestao" on public.fin_recorrencias
  for update to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));

-- ── Rate limit: novas chaves do Financeiro V1 completa ─────────────────────
-- Recria a funcao inteira com a lista acumulada (mesmo padrao das migracoes
-- anteriores) - substituir sem repetir as chaves existentes as desativaria.
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
      ('fin_recorrencia_criar', 30, 600),
      ('fin_lancamento_excluir', 30, 600),
      ('fin_estoque_mensal_salvar', 30, 600),
      ('fin_saidas_sem_receita_salvar', 60, 600),
      ('tempo_frente_salvar', 30, 600),
      ('tempo_valor_hora_salvar', 30, 600),
      ('tempo_meta_mensal_salvar', 30, 600),
      ('tempo_cronometro_acao', 120, 600),
      ('tempo_lancamento_criar', 60, 600),
      ('tempo_lancamento_editar', 60, 600),
      ('tempo_lancamento_excluir', 30, 600),
      ('agenda_tarefa_salvar', 60, 600),
      ('agenda_tarefa_excluir', 30, 600),
      ('agenda_marcar_execucao', 120, 600),
      ('setor_salvar', 30, 600),
      ('setor_designar', 60, 600),
      ('contagem_abrir', 60, 600),
      ('fin_provisao_parametros_salvar', 30, 600),
      ('fin_provisao_reversao_salvar', 30, 600),
      ('fin_fechamento_salvar', 30, 600),
      ('fin_recorrencia_encerrar', 30, 600)
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
