-- Módulo pessoal "Agenda" (rotina diária de Vinícius: compromisso, prioridade,
-- bloco e rotina). Mesmo recorte do módulo "Meu Tempo": só master vê e opera,
-- sem organizacao_id/unidade_id, escopado por usuário (`criado_por =
-- auth.uid()`) pra um segundo master nunca enxergar a agenda do primeiro.
-- Prefixo `zh_agenda_`.
--
-- Divisão das fontes, decidida com Vinícius em 15/09/2026:
--   - rotina permanente  -> `_conhecimento/agenda-semanal.md` no Cérebro do
--     Gestor continua sendo a fonte oficial; esta tabela é publicação dela
--     (script `agenda:publicar`), nunca uma segunda autoridade;
--   - compromisso datado -> Google Calendar, lido na hora, não gravado aqui;
--   - tarefa/prioridade  -> digitada no app, esta é a fonte.
begin;

-- ── Rotina permanente (publicação da grade semanal) ────────────────────────
-- Uma linha por faixa de horário de cada dia da semana. `dia_semana` segue o
-- padrão do Postgres (0 = domingo ... 6 = sábado), igual a `extract(dow from
-- data)`, pra consultar por data sem tabela de conversão.
--
-- IDENTIDADE: `chave` é o `agenda-id` escrito à mão em cada linha da grade
-- (`<!-- agenda-id:seg-horizzon-manha -->`). Não deriva de posição, horário
-- nem texto: tudo isso muda com frequência na grade real, e identidade
-- derivada faria a tarefa de uma sexta-feira futura passar a apontar, calada,
-- para outra atividade (ou perder a ligação a cada ajuste de observação).
-- `ordem` fica só como ordenação de exibição.
--
-- HISTÓRICO: faixa nunca é apagada. Faixa que sai da grade vira `ativa =
-- false`, com tarefas e execuções intactas; se o mesmo `agenda-id` voltar, a
-- faixa é reativada com o histórico dela.
--
-- `rotulo` guarda o texto da atividade exatamente como está na grade
-- ("Protegido (prioridade da semana)", "Horizzon (fixo)"). A grade tem regra
-- condicional em prosa que nenhum parser resolve sozinho ("só vira prep se
-- houver reunião marcada") - por isso o texto vai inteiro pra tela, em vez de
-- virar campo estruturado que mentiria sobre a condição.
create table if not exists public.zh_agenda_rotinas (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid not null references auth.users(id),
  dia_semana smallint not null check (dia_semana between 0 and 6),
  -- Mesmo formato de `PADRAO_AGENDA_ID` em src/lib/agenda/grade.ts.
  chave text not null check (chave ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(chave) <= 64),
  ordem smallint not null check (ordem >= 0),
  hora_inicio time,
  hora_fim time,
  rotulo text not null check (length(trim(rotulo)) > 0),
  -- "até 8h", "21h30+": faixa sem hora de início/fim exata. O texto original
  -- da coluna Horário fica aqui pra tela não perder a informação.
  horario_texto text not null default '',
  -- Classificação usada pela tela, seguindo as categorias da Agenda v2:
  --   'bloco'       recipiente de tempo de trabalho (Horizzon, Protegido,
  --                 Zatti estratégico) - é onde prioridade encaixa;
  --   'rotina'      atividade recorrente de operação (relatório semanal,
  --                 prep, follow-up, revisão) - entra na seção Rotinas;
  --   'compromisso' reunião fixa da grade. Não vira Rotina nem Bloco: o
  --                 compromisso do dia vem do Calendar, e estas linhas
  --                 servem de reserva quando o Calendar estiver fora;
  --   'pessoal'     família, treino, almoço, transição - aparece na linha do
  --                 dia, mas nunca recebe prioridade.
  tipo text not null default 'bloco' check (tipo in ('rotina', 'bloco', 'pessoal', 'compromisso')),
  -- false = saiu da grade. A linha fica para preservar tarefa e histórico.
  ativa boolean not null default true,
  publicado_em timestamptz not null default now(),
  unique (criado_por, chave),
  -- Alvo da chave estrangeira composta das duas tabelas abaixo: garante no
  -- banco que tarefa e execução só apontam para faixa do próprio usuário.
  unique (criado_por, id)
);

create index if not exists zh_agenda_rotinas_dia_idx
  on public.zh_agenda_rotinas (criado_por, dia_semana, ordem);

-- ── Tarefa e prioridade do dia (digitadas no app) ──────────────────────────
-- `prioridade = true` é o resultado que precisa terminar naquele dia.
-- `prioridade_posicao` (1 a 4) existe para o teto de 4 prioridades da Agenda
-- v2 ser atômico: o índice único parcial mais abaixo impede a quinta linha
-- mesmo com duas requisições simultâneas. Contar antes de inserir não impede
-- (duas contagens leem 3 e ambas inserem a quarta e a quinta).
create table if not exists public.zh_agenda_tarefas (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid not null references auth.users(id),
  data date not null,
  titulo text not null check (length(trim(titulo)) > 0),
  detalhe text not null default '',
  prioridade boolean not null default false,
  prioridade_posicao smallint check (prioridade_posicao between 1 and 4),
  ordem smallint not null default 0 check (ordem >= 0),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'feita', 'nao_feita', 'adiada')),
  rotina_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- Posição existe exatamente quando é prioridade.
  check (prioridade = (prioridade_posicao is not null)),
  -- `restrict`: a publicação nunca apaga faixa (só inativa), e esta trava
  -- garante que nem um delete manual solte ou leve junto o trabalho planejado.
  foreign key (criado_por, rotina_id)
    references public.zh_agenda_rotinas(criado_por, id) on delete restrict
);

create index if not exists zh_agenda_tarefas_data_idx
  on public.zh_agenda_tarefas (criado_por, data, prioridade desc, ordem);

-- O teto de 4 prioridades por dia, garantido pelo banco.
create unique index if not exists zh_agenda_tarefas_prioridade_unica
  on public.zh_agenda_tarefas (criado_por, data, prioridade_posicao)
  where prioridade_posicao is not null;

drop trigger if exists tocar_atualizado_em on public.zh_agenda_tarefas;
create trigger tocar_atualizado_em
  before update on public.zh_agenda_tarefas
  for each row execute function public.tocar_atualizado_em();

-- ── Execução de rotina num dia (o "marquei o que fiz") ─────────────────────
-- Uma rotina da grade não tem linha aqui enquanto ninguém marcar nada: a
-- ausência de linha é 'pendente'. Marcar de novo atualiza a mesma linha.
create table if not exists public.zh_agenda_execucoes (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid not null references auth.users(id),
  data date not null,
  rotina_id uuid not null,
  situacao text not null check (situacao in ('feita', 'nao_feita', 'adiada')),
  observacao text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (criado_por, data, rotina_id),
  -- `restrict`, nunca `cascade`: histórico de execução não some junto com a
  -- faixa por nenhum caminho.
  foreign key (criado_por, rotina_id)
    references public.zh_agenda_rotinas(criado_por, id) on delete restrict
);

create index if not exists zh_agenda_execucoes_data_idx
  on public.zh_agenda_execucoes (criado_por, data);

drop trigger if exists tocar_atualizado_em on public.zh_agenda_execucoes;
create trigger tocar_atualizado_em
  before update on public.zh_agenda_execucoes
  for each row execute function public.tocar_atualizado_em();

-- ── Coerência entre a tarefa/execução e a faixa apontada ───────────────────
-- A chave estrangeira composta já garante o dono. Falta garantir que a faixa
-- está ativa, é do mesmo dia da semana da data e do tipo que aquela seção
-- aceita - senão daria pra encaixar a prioridade de uma sexta num bloco de
-- terça, marcar "feita" num horário de família ou planejar trabalho numa
-- faixa que já saiu da grade. A aplicação valida antes (mensagem boa) e este
-- gatilho é a última barreira, valendo também pra chamada direta à API.
-- Só dispara em insert ou em update que escreve `rotina_id` ou `data`: tarefa
-- que ficou numa faixa inativa continua podendo ser marcada como feita ou não
-- feita, que só escreve `situacao`.
create or replace function public.validar_faixa_da_agenda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dia_semana smallint;
  v_tipo text;
  v_ativa boolean;
  v_tipos_aceitos text[];
begin
  if new.rotina_id is null then
    return new;
  end if;

  select r.dia_semana, r.tipo, r.ativa into v_dia_semana, v_tipo, v_ativa
  from public.zh_agenda_rotinas r
  where r.id = new.rotina_id and r.criado_por = new.criado_por;

  if v_dia_semana is null then
    raise exception 'Faixa da agenda não encontrada para este usuário.' using errcode = '23514';
  end if;

  if not v_ativa then
    raise exception 'A faixa escolhida saiu da agenda semanal.' using errcode = '23514';
  end if;

  if v_dia_semana <> extract(dow from new.data)::smallint then
    raise exception 'A faixa escolhida é de outro dia da semana.' using errcode = '23514';
  end if;

  v_tipos_aceitos := case tg_table_name
    when 'zh_agenda_tarefas' then array['bloco']
    else array['rotina']
  end;

  if not (v_tipo = any (v_tipos_aceitos)) then
    raise exception 'A faixa "%" não aceita esse tipo de marcação.', v_tipo using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists validar_faixa on public.zh_agenda_tarefas;
create trigger validar_faixa
  before insert or update of rotina_id, data on public.zh_agenda_tarefas
  for each row execute function public.validar_faixa_da_agenda();

drop trigger if exists validar_faixa on public.zh_agenda_execucoes;
create trigger validar_faixa
  before insert or update of rotina_id, data on public.zh_agenda_execucoes
  for each row execute function public.validar_faixa_da_agenda();

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Mesmo recorte de `zh_tempo_*`: master E dono da linha, inclusive no SELECT.
alter table public.zh_agenda_rotinas enable row level security;
alter table public.zh_agenda_tarefas enable row level security;
alter table public.zh_agenda_execucoes enable row level security;

-- Rotina é só leitura pela aplicação: quem escreve é a função de publicação
-- abaixo (security definer), a partir da grade do vault. Sem policy de
-- insert/update/delete de propósito - assim uma chamada direta à Data API
-- não consegue inventar rotina que não existe no `agenda-semanal.md`.
create policy "zh_agenda_rotinas_select" on public.zh_agenda_rotinas
  for select to authenticated
  using (public.usuario_e_master() and criado_por = auth.uid());

create policy "zh_agenda_tarefas_select" on public.zh_agenda_tarefas
  for select to authenticated
  using (public.usuario_e_master() and criado_por = auth.uid());
create policy "zh_agenda_tarefas_insert" on public.zh_agenda_tarefas
  for insert to authenticated
  with check (public.usuario_e_master() and criado_por = auth.uid());
create policy "zh_agenda_tarefas_update" on public.zh_agenda_tarefas
  for update to authenticated
  using (public.usuario_e_master() and criado_por = auth.uid())
  with check (public.usuario_e_master() and criado_por = auth.uid());
create policy "zh_agenda_tarefas_delete" on public.zh_agenda_tarefas
  for delete to authenticated
  using (public.usuario_e_master() and criado_por = auth.uid());

create policy "zh_agenda_execucoes_select" on public.zh_agenda_execucoes
  for select to authenticated
  using (public.usuario_e_master() and criado_por = auth.uid());
create policy "zh_agenda_execucoes_insert" on public.zh_agenda_execucoes
  for insert to authenticated
  with check (public.usuario_e_master() and criado_por = auth.uid());
create policy "zh_agenda_execucoes_update" on public.zh_agenda_execucoes
  for update to authenticated
  using (public.usuario_e_master() and criado_por = auth.uid())
  with check (public.usuario_e_master() and criado_por = auth.uid());
create policy "zh_agenda_execucoes_delete" on public.zh_agenda_execucoes
  for delete to authenticated
  using (public.usuario_e_master() and criado_por = auth.uid());

-- ── Publicação da grade semanal ────────────────────────────────────────────
-- Recebe a grade inteira já lida de `_conhecimento/agenda-semanal.md` e
-- aplica numa transação só. A grade do vault é a verdade sobre o que está
-- ATIVO; o histórico é do banco e nunca é apagado por uma publicação.
--
-- Casa pelo `agenda-id` (coluna `chave`):
--   - id que já existe: a MESMA linha é atualizada (horário, texto, ordem,
--     tipo) e as tarefas e execuções ligadas a ela seguem ligadas;
--   - id novo: linha nova;
--   - id que sumiu da grade: `ativa = false`, nada é apagado;
--   - id inativo que voltou: reativado com o histórico dele.
--
-- Falha fechada, sem gravar nada, quando: a lista vem vazia (arquivo mal
-- lido desativaria a rotina inteira), falta id ou o id está fora do formato,
-- há id repetido, ou um id existente aparece em outro dia da semana (tarefas
-- já planejadas naquele id são de datas do dia antigo).
--
-- Formato esperado (jsonb):
-- [{"dia_semana":1,"chave":"seg-horizzon-manha","ordem":2,"hora_inicio":"09:00",
--   "hora_fim":"10:00","rotulo":"Horizzon (fixo)","horario_texto":"9h-10h",
--   "tipo":"bloco"}, ...]
--
-- Devolve {"publicadas": n, "inativadas": [ids], "reativadas": [ids]} para o
-- script mostrar o que saiu e o que voltou - nada muda calado.
create or replace function public.publicar_agenda_semanal(p_grade jsonb, p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_total integer;
  v_chave_invalida text;
  v_chave_repetida text;
  v_chave_trocou_dia text;
  v_inativadas text[];
  v_reativadas text[];
begin
  if jsonb_typeof(p_grade) is distinct from 'array' then
    raise exception 'A grade precisa ser uma lista de faixas de horário.';
  end if;

  if jsonb_array_length(p_grade) = 0 then
    raise exception 'A grade veio vazia - publicação abortada para não desativar a rotina inteira.';
  end if;

  -- Sem master informado, usa o primeiro master ativo (mesmo critério de
  -- `semear_dados_iniciais_tempo`).
  v_user_id := coalesce(
    p_user_id,
    (select v.user_id from public.vinculos v
      where v.status = 'ativo' and v.role = 'master'
      order by v.created_at
      limit 1)
  );

  if v_user_id is null then
    raise exception 'Nenhum master ativo encontrado para publicar a agenda.';
  end if;

  select coalesce(item ->> 'rotulo', '(sem rótulo)') into v_chave_invalida
  from jsonb_array_elements(p_grade) as item
  where coalesce(item ->> 'chave', '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or length(item ->> 'chave') > 64
  limit 1;

  if v_chave_invalida is not null then
    raise exception 'A faixa "%" veio sem agenda-id válido - publicação abortada.', v_chave_invalida;
  end if;

  select item ->> 'chave' into v_chave_repetida
  from jsonb_array_elements(p_grade) as item
  group by item ->> 'chave'
  having count(*) > 1
  limit 1;

  if v_chave_repetida is not null then
    raise exception 'O agenda-id "%" está repetido na grade - publicação abortada.', v_chave_repetida;
  end if;

  select r.chave into v_chave_trocou_dia
  from jsonb_array_elements(p_grade) as item
  join public.zh_agenda_rotinas r
    on r.criado_por = v_user_id and r.chave = item ->> 'chave'
  where r.dia_semana <> (item ->> 'dia_semana')::smallint
  limit 1;

  if v_chave_trocou_dia is not null then
    raise exception 'O agenda-id "%" mudou de dia da semana. Faixa de outro dia precisa de id novo - publicação abortada.', v_chave_trocou_dia;
  end if;

  select coalesce(array_agg(r.chave order by r.chave), '{}') into v_reativadas
  from public.zh_agenda_rotinas r
  where r.criado_por = v_user_id
    and not r.ativa
    and exists (select 1 from jsonb_array_elements(p_grade) as item where item ->> 'chave' = r.chave);

  with inativadas as (
    update public.zh_agenda_rotinas r
    set ativa = false
    where r.criado_por = v_user_id
      and r.ativa
      and not exists (select 1 from jsonb_array_elements(p_grade) as item where item ->> 'chave' = r.chave)
    returning r.chave
  )
  select coalesce(array_agg(chave order by chave), '{}') into v_inativadas from inativadas;

  insert into public.zh_agenda_rotinas
    (criado_por, dia_semana, chave, ordem, hora_inicio, hora_fim, rotulo, horario_texto, tipo, ativa)
  select
    v_user_id,
    (item ->> 'dia_semana')::smallint,
    item ->> 'chave',
    (item ->> 'ordem')::smallint,
    nullif(item ->> 'hora_inicio', '')::time,
    nullif(item ->> 'hora_fim', '')::time,
    item ->> 'rotulo',
    coalesce(item ->> 'horario_texto', ''),
    coalesce(item ->> 'tipo', 'bloco'),
    true
  from jsonb_array_elements(p_grade) as item
  on conflict (criado_por, chave) do update
  set ordem = excluded.ordem,
      hora_inicio = excluded.hora_inicio,
      hora_fim = excluded.hora_fim,
      rotulo = excluded.rotulo,
      horario_texto = excluded.horario_texto,
      tipo = excluded.tipo,
      ativa = true,
      publicado_em = now();

  get diagnostics v_total = row_count;

  return jsonb_build_object(
    'publicadas', v_total,
    'inativadas', to_jsonb(v_inativadas),
    'reativadas', to_jsonb(v_reativadas)
  );
end;
$$;

-- Só o service role publica (o script `agenda:publicar` roda com essa chave).
-- EXECUTE em função nova é concedido a PUBLIC por padrão no Postgres - sem o
-- revoke abaixo, qualquer usuário autenticado do app chamaria a função pela
-- Data API e reescreveria a grade inteira.
revoke all on function public.publicar_agenda_semanal(jsonb, uuid) from public;
revoke all on function public.publicar_agenda_semanal(jsonb, uuid) from anon, authenticated;
grant execute on function public.publicar_agenda_semanal(jsonb, uuid) to service_role;

revoke all on function public.validar_faixa_da_agenda() from public, anon, authenticated;

commit;
