-- Checklist Garante: responsável por acompanhar e avisos pelo WhatsApp do Vini (13/10/2026).
-- Decisão 1 de Vinícius (13/10): a gestão marca quem acompanha o Garante da unidade; avisos de
-- checklist atrasado e de item crítico fora da meta vão para o WhatsApp dessa pessoa, pelo Vini.
-- Desenho: _execucao/zatti-hub/garante-responsavel-avisos-desenho.md, com os padrões de
-- decisoes-13-10-perguntas.md (quem marca: Zatti em Acessos e a gestão em Regras da unidade;
-- envio das 7h às 23h todos os dias; avisos do mesmo ciclo numa mensagem só; nasce desligado).
--
--   fin_integracao_tokens              ganha o escopo 'garante' (token do Vini, hash SHA-256)
--   garante_avisos_destinatarios       quem acompanha: um ativo por unidade; guarda só o vínculo,
--                                      o WhatsApp é lido de `vinculos` na hora de montar o envio
--   garante_definir_responsavel_avisos gestão da unidade ou master marca (ou desmarca com nulo);
--                                      só vínculo ativo de gestão (ou master) que alcança a
--                                      unidade e tem WhatsApp; auditoria na unidade alterada
--   garante_avisos                     pendências: 'atrasado' (passou do horário limite, ainda na
--                                      janela), 'nao_concluido' (janela fechou sem concluir) e
--                                      'critico_fora_da_meta' (resposta de item crítico fora)
--   garante_avisos_gerar               interna: gera o que falta (7 dias, a partir do primeiro
--                                      responsável) e revalida pendências (cancela resolvido,
--                                      expira com mais de 7 dias)
--   garante_avisos_reservar            service role: roda a geração de toda unidade com
--                                      responsável, reserva o que vai sair (uma tentativa por
--                                      unidade e ciclo) só das 7h às 23h e só com responsável
--                                      válido; reserva sem confirmação em 15 min vira 'incerto'
--   garante_avisos_confirmar           service role: fecha a tentativa ('enviado', 'incerto' ou
--                                      'falhou'; 'falhou' volta à fila até 3 tentativas)
--
-- Sem token cadastrado nada é enviado: a rota responde 401 e o Vini fica desligado.
-- Idempotente. O app em produção continua funcionando com isto aplicado antes da publicação
-- (só acrescenta tabelas e funções; nenhuma RPC existente muda).

begin;

-- ══ Token do Vini: escopo 'garante' ═════════════════════════════════════
-- O check do escopo nasceu sem nome (inline na coluna); acha pelo conteúdo e recria.
do $$
declare
  v record;
begin
  for v in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.fin_integracao_tokens'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%escopo%'
  loop
    execute format('alter table public.fin_integracao_tokens drop constraint %I', v.conname);
  end loop;
end $$;
alter table public.fin_integracao_tokens
  add constraint fin_integracao_tokens_escopo_check check (escopo in ('caixa_entrada', 'alertas', 'garante'));

-- ══ Responsável por acompanhar o Garante ════════════════════════════════
create table if not exists public.garante_avisos_destinatarios (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  vinculo_id uuid not null references public.vinculos(id) on delete cascade,
  ativo boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  desativado_em timestamptz,
  check (ativo = (desativado_em is null))
);
create unique index if not exists garante_avisos_destinatario_unico
  on public.garante_avisos_destinatarios (unidade_id) where ativo;
create index if not exists garante_avisos_destinatarios_vinculo
  on public.garante_avisos_destinatarios (vinculo_id);

alter table public.garante_avisos_destinatarios enable row level security;
revoke all on table public.garante_avisos_destinatarios from public, anon, authenticated;
grant select on table public.garante_avisos_destinatarios to authenticated;
drop policy if exists garante_avisos_destinatarios_select on public.garante_avisos_destinatarios;
create policy garante_avisos_destinatarios_select on public.garante_avisos_destinatarios
  for select to authenticated
  using (public.usuario_pode_usar_garante(unidade_id, array['gestao']));

-- Por que um vínculo não serve como responsável (nulo = serve): precisa estar ativo, ser
-- gestão da organização alcançando a unidade (vínculo da organização inteira ou desta unidade)
-- ou master, e ter WhatsApp. Operacional não entra: o aviso aponta para o Quadro do dia,
-- que só a gestão vê. Interna (sem grant): as RPCs e o ciclo chamam.
create or replace function public.garante_motivo_vinculo_avisos(p_unidade_id text, p_vinculo_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (
      select 1
        from public.vinculos v
        join public.unidades u on u.id = p_unidade_id and u.ativo
        join public.organizacoes o on o.id = u.organizacao_id and o.ativo
       where v.id = p_vinculo_id
         and v.status = 'ativo'
         and (v.role = 'master'
              or (v.role = 'gestao' and v.organizacao_id = u.organizacao_id
                  and (v.unidade_id is null or v.unidade_id = u.id)))
    ) then 'vinculo_nao_elegivel'
    when not exists (select 1 from public.vinculos v where v.id = p_vinculo_id and v.whatsapp is not null)
      then 'vinculo_sem_whatsapp'
    else null
  end;
$$;
revoke all on function public.garante_motivo_vinculo_avisos(text, uuid) from public, anon, authenticated;

-- Gestão da unidade (ou master) marca quem acompanha; nulo desmarca. Devolve o vínculo que
-- ficou. Troca sem mudança não grava nada. Auditoria na unidade alterada (não na da sessão).
create or replace function public.garante_definir_responsavel_avisos(p_unidade_id text, p_vinculo_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atual uuid;
  v_motivo text;
begin
  if not public.usuario_pode_usar_garante(p_unidade_id, array['gestao']) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_vinculo_id is not null then
    v_motivo := public.garante_motivo_vinculo_avisos(p_unidade_id, p_vinculo_id);
    if v_motivo is not null then
      raise exception '%', v_motivo using errcode = '22023';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('garante_avisos_resp:' || p_unidade_id, 0));
  select d.vinculo_id into v_atual
    from public.garante_avisos_destinatarios d
   where d.unidade_id = p_unidade_id and d.ativo;
  if v_atual is not distinct from p_vinculo_id then
    return p_vinculo_id;
  end if;

  update public.garante_avisos_destinatarios
     set ativo = false, desativado_em = now()
   where unidade_id = p_unidade_id and ativo;
  if p_vinculo_id is not null then
    insert into public.garante_avisos_destinatarios (unidade_id, vinculo_id, criado_por)
    values (p_unidade_id, p_vinculo_id, auth.uid());
  end if;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (p_unidade_id, auth.uid(), 'garante_definir_responsavel_avisos', 'garante_avisos_destinatario', p_unidade_id,
          jsonb_build_object('vinculoId', v_atual), jsonb_build_object('vinculoId', p_vinculo_id));
  return p_vinculo_id;
end;
$$;
revoke all on function public.garante_definir_responsavel_avisos(text, uuid) from public, anon;
grant execute on function public.garante_definir_responsavel_avisos(text, uuid) to authenticated;

-- ══ Pendências de aviso ═════════════════════════════════════════════════
-- Chave estável por aviso (nunca repete): tipo:publicação:data para atrasado e não concluído,
-- critico:execução:item para o crítico. `detalhes` guarda o que a mensagem precisa (nome do
-- checklist, horário, data, item, valor, meta, primeiro nome de quem respondeu); o texto é
-- montado pelo app. Estados: pendente -> reservado -> enviado | incerto | falhou (definitivo
-- depois de 3 tentativas); pendente -> cancelado (problema resolvido) | expirado (> 7 dias).
-- Sem escrita para usuário; leitura pela gestão da unidade (tela Regras da unidade).
create table if not exists public.garante_avisos (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  chave text not null check (length(chave) between 12 and 200),
  tipo text not null check (tipo in ('atrasado', 'nao_concluido', 'critico_fora_da_meta')),
  publicacao_id uuid,
  execucao_id uuid,
  item_id uuid,
  data date not null,
  evento_em timestamptz not null,
  janela_fecha_em timestamptz,
  detalhes jsonb not null default '{}'::jsonb,
  estado text not null default 'pendente'
    check (estado in ('pendente', 'reservado', 'enviado', 'falhou', 'incerto', 'cancelado', 'expirado')),
  tentativas integer not null default 0 check (tentativas between 0 and 3),
  tentativa_id uuid,
  reservado_em timestamptz,
  fechado_em timestamptz,
  motivo text check (motivo is null or length(motivo) <= 40),
  gerado_em timestamptz not null default now(),
  unique (unidade_id, chave),
  foreign key (publicacao_id, unidade_id) references public.garante_publicacoes (id, unidade_id) on delete cascade,
  foreign key (execucao_id, unidade_id) references public.garante_execucoes (id, unidade_id) on delete cascade,
  check ((tipo = 'critico_fora_da_meta') = (execucao_id is not null and item_id is not null)),
  check (tipo = 'critico_fora_da_meta' or publicacao_id is not null),
  check ((estado in ('pendente', 'reservado')) = (fechado_em is null)),
  check (estado <> 'reservado' or (tentativa_id is not null and reservado_em is not null))
);
create index if not exists garante_avisos_unidade_estado on public.garante_avisos (unidade_id, estado);
create index if not exists garante_avisos_reservados on public.garante_avisos (tentativa_id) where estado = 'reservado';

alter table public.garante_avisos enable row level security;
revoke all on table public.garante_avisos from public, anon, authenticated;
grant select on table public.garante_avisos to authenticated;
drop policy if exists garante_avisos_select on public.garante_avisos;
create policy garante_avisos_select on public.garante_avisos
  for select to authenticated
  using (public.usuario_pode_usar_garante(unidade_id, array['gestao']));

-- ══ Geração e revalidação (interna) ═════════════════════════════════════
-- Olha os últimos 7 dias (nunca antes da primeira regra da unidade nem de antes do primeiro
-- responsável: aviso não cobra o que aconteceu antes de alguém acompanhar). Ocorrência =
-- publicação x data como a agenda vê (vigência, dia da semana, fora de dia sem operação), mais
-- execução existente não concluída. `p_agora` é o relógio do ciclo (as RPCs passam now()).
create or replace function public.garante_avisos_gerar(p_unidade_id text, p_agora timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje date := (p_agora at time zone 'America/Sao_Paulo')::date;
  v_limite timestamptz := p_agora - interval '7 days';
  v_inicio timestamptz;
  v_de date;
  v_total integer := 0;
  v_n integer;
begin
  select min(d.criado_em) into v_inicio
    from public.garante_avisos_destinatarios d
   where d.unidade_id = p_unidade_id;
  if v_inicio is null then
    return 0;
  end if;
  v_inicio := greatest(v_inicio, v_limite);
  select greatest((v_inicio at time zone 'America/Sao_Paulo')::date,
                  coalesce(min(r.vigente_desde), (v_inicio at time zone 'America/Sao_Paulo')::date))
    into v_de
    from public.garante_regras_unidade r
   where r.unidade_id = p_unidade_id;

  if v_de <= v_hoje then
    -- Atrasado (passou do horário limite, ainda dá para concluir) e não concluído (janela fechou).
    with oc as (
      select p.id as publicacao_id, d.dia::date as data, p.horario_limite,
             coalesce(e.modelo_nome, m.nome) as modelo_nome, p.responsavel_id,
             coalesce(e.prazo, j.prazo) as prazo, coalesce(e.fecha_em, j.fecha_em) as fecha_em
        from generate_series(v_de, v_hoje, interval '1 day') d(dia)
        join public.garante_publicacoes p on p.unidade_id = p_unidade_id
        join public.garante_modelos m on m.id = p.modelo_id
        left join public.garante_execucoes e on e.publicacao_id = p.id and e.data = d.dia::date
        cross join lateral public.garante_janela(p_unidade_id, d.dia::date, p.horario_limite) j
       where (e.id is not null and e.situacao <> 'concluida')
          or (e.id is null and p.ativo
              and d.dia::date >= p.vigente_desde and (p.vigente_ate is null or d.dia::date <= p.vigente_ate)
              and extract(dow from d.dia::date)::smallint = any (p.dias_semana)
              and not exists (select 1 from public.garante_dias_sem_operacao s
                               where s.unidade_id = p_unidade_id and s.data = d.dia::date))
    )
    insert into public.garante_avisos (unidade_id, chave, tipo, publicacao_id, data, evento_em, janela_fecha_em, detalhes)
    select p_unidade_id, t.tipo || ':' || o.publicacao_id::text || ':' || o.data::text, t.tipo, o.publicacao_id, o.data,
           case when t.tipo = 'atrasado' then o.prazo else o.fecha_em end, o.fecha_em,
           jsonb_build_object('modelo_nome', o.modelo_nome, 'horario_limite', left(o.horario_limite::text, 5),
                              'data', o.data, 'responsavel_nome', pf.nome)
      from oc o
      cross join (values ('atrasado'), ('nao_concluido')) t(tipo)
      left join public.perfis pf on pf.id = o.responsavel_id
     where (t.tipo = 'atrasado' and o.prazo < p_agora and p_agora <= o.fecha_em and o.prazo >= v_inicio)
        or (t.tipo = 'nao_concluido' and o.fecha_em < p_agora and o.fecha_em >= v_inicio)
    on conflict (unidade_id, chave) do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;

    -- Item crítico respondido fora da meta (gerado enquanto a chave não existir).
    insert into public.garante_avisos (unidade_id, chave, tipo, execucao_id, item_id, data, evento_em, detalhes)
    select p_unidade_id, 'critico:' || e.id::text || ':' || r.item_id::text, 'critico_fora_da_meta', e.id, r.item_id, e.data,
           r.respondido_em,
           jsonb_build_object('modelo_nome', e.modelo_nome, 'data', e.data, 'item_titulo', s.item ->> 'titulo',
                              'item_tipo', s.item ->> 'tipo', 'valor_bool', r.valor_bool, 'valor_numero', r.valor_numero,
                              'meta_min', s.item -> 'meta_min', 'meta_max', s.item -> 'meta_max', 'responsavel_nome', pf.nome)
      from public.garante_execucoes e
      join public.garante_respostas r on r.execucao_id = e.id and r.dentro_meta = false and not r.nao_se_aplica
      join lateral jsonb_array_elements(e.snapshot) s(item)
        on (s.item ->> 'id')::uuid = r.item_id and coalesce((s.item ->> 'critico')::boolean, false)
      left join public.perfis pf on pf.id = r.respondido_por
     where e.unidade_id = p_unidade_id and e.data >= v_de
       and r.respondido_em >= v_inicio and r.respondido_em <= p_agora
    on conflict (unidade_id, chave) do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end if;

  -- Revalidação: não se cobra problema resolvido.
  update public.garante_avisos a
     set estado = 'cancelado', fechado_em = p_agora, motivo = 'concluido'
   where a.unidade_id = p_unidade_id and a.estado = 'pendente' and a.tipo in ('atrasado', 'nao_concluido')
     and exists (select 1 from public.garante_execucoes e
                  where e.publicacao_id = a.publicacao_id and e.data = a.data and e.situacao = 'concluida');
  update public.garante_avisos a
     set estado = 'cancelado', fechado_em = p_agora, motivo = 'janela_fechada'
   where a.unidade_id = p_unidade_id and a.estado = 'pendente' and a.tipo = 'atrasado'
     and a.janela_fecha_em < p_agora;
  update public.garante_avisos a
     set estado = 'cancelado', fechado_em = p_agora, motivo = 'corrigido'
   where a.unidade_id = p_unidade_id and a.estado = 'pendente' and a.tipo = 'critico_fora_da_meta'
     and not exists (select 1 from public.garante_respostas r
                      where r.execucao_id = a.execucao_id and r.item_id = a.item_id
                        and r.dentro_meta = false and not r.nao_se_aplica);
  update public.garante_avisos a
     set estado = 'expirado', fechado_em = p_agora, motivo = 'mais_de_7_dias'
   where a.unidade_id = p_unidade_id and a.estado = 'pendente' and a.evento_em < v_limite;
  return v_total;
end;
$$;
revoke all on function public.garante_avisos_gerar(text, timestamptz) from public, anon, authenticated;

-- ══ Ciclo do Vini: reservar o que vai sair ══════════════════════════════
-- Para cada unidade com responsável ativo e módulo ligado: gera e revalida; depois, só das 7h
-- às 23h (São Paulo) e só se o responsável continua válido (ativo, gestão ou master alcançando
-- a unidade, com WhatsApp), reserva todas as pendências numa tentativa única e devolve a lista.
-- Responsável inválido: as pendências ficam paradas (a tela mostra), nada é reservado.
-- Reserva sem confirmação em 15 min vira 'incerto' e NÃO volta à fila: o WhatsApp pode ter saído.
create or replace function public.garante_avisos_reservar(p_agora timestamptz default now())
returns table (unidade_id text, unidade_nome text, tentativa_id uuid, telefone text, destinatario_nome text, avisos jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hora integer := extract(hour from (p_agora at time zone 'America/Sao_Paulo'))::integer;
  v_u record;
  v_tentativa uuid;
  v_avisos jsonb;
begin
  update public.garante_avisos a
     set estado = 'incerto', fechado_em = p_agora, motivo = 'reserva_vencida'
   where a.estado = 'reservado' and a.reservado_em < p_agora - interval '15 minutes';

  for v_u in
    select d.unidade_id as unidade, u.nome as nome_unidade, d.vinculo_id as vinculo, v.whatsapp as whatsapp,
           pf.nome as nome_pessoa, public.garante_motivo_vinculo_avisos(d.unidade_id, d.vinculo_id) as motivo
      from public.garante_avisos_destinatarios d
      join public.unidades u on u.id = d.unidade_id and u.ativo and u.garante_habilitado
      join public.vinculos v on v.id = d.vinculo_id
      left join public.perfis pf on pf.id = v.user_id
     where d.ativo
     order by d.unidade_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('garante_avisos:' || v_u.unidade, 0));
    perform public.garante_avisos_gerar(v_u.unidade, p_agora);
    if v_u.motivo is not null or v_hora < 7 or v_hora >= 23 then
      continue;
    end if;
    v_tentativa := gen_random_uuid();
    with r as (
      update public.garante_avisos a
         set estado = 'reservado', tentativa_id = v_tentativa, reservado_em = p_agora, tentativas = a.tentativas + 1
       where a.unidade_id = v_u.unidade and a.estado = 'pendente'
       returning a.chave, a.tipo, a.evento_em, a.detalhes
    )
    select jsonb_agg(jsonb_build_object('chave', r.chave, 'tipo', r.tipo, 'evento_em', r.evento_em, 'detalhes', r.detalhes)
                     order by r.evento_em, r.chave)
      into v_avisos
      from r;
    if v_avisos is null then
      continue;
    end if;
    unidade_id := v_u.unidade;
    unidade_nome := v_u.nome_unidade;
    tentativa_id := v_tentativa;
    telefone := v_u.whatsapp;
    destinatario_nome := v_u.nome_pessoa;
    avisos := v_avisos;
    return next;
  end loop;
end;
$$;
revoke all on function public.garante_avisos_reservar(timestamptz) from public, anon, authenticated;
grant execute on function public.garante_avisos_reservar(timestamptz) to service_role;

-- ══ Confirmação do Vini ═════════════════════════════════════════════════
-- Fecha só o que ainda está reservado nessa tentativa (reserva já vencida ignora um 'falhou'
-- tardio; repetir é inócuo). 'falhou' (recusa clara, 4xx) volta à fila até a 3ª tentativa.
create or replace function public.garante_avisos_confirmar(p_tentativa_id uuid, p_resultado text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if p_tentativa_id is null or p_resultado is null or p_resultado not in ('enviado', 'falhou', 'incerto') then
    raise exception 'resultado_invalido' using errcode = '22023';
  end if;
  update public.garante_avisos a
     set estado = case when p_resultado = 'enviado' then 'enviado'
                       when p_resultado = 'incerto' then 'incerto'
                       when a.tentativas >= 3 then 'falhou'
                       else 'pendente' end,
         fechado_em = case when p_resultado = 'falhou' and a.tentativas < 3 then null else now() end,
         motivo = case when p_resultado = 'falhou' then 'falhou_' || a.tentativas::text else null end
   where a.tentativa_id = p_tentativa_id and a.estado = 'reservado';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.garante_avisos_confirmar(uuid, text) from public, anon, authenticated;
grant execute on function public.garante_avisos_confirmar(uuid, text) to service_role;

-- ══ Service role: só leitura das duas tabelas (telas de Acessos e Regras da unidade, depois de
-- requireMaster / requireGestaoGarante) e as duas RPCs do ciclo. Escrita só pelas RPCs. ═══════
grant select on table public.garante_avisos_destinatarios, public.garante_avisos to service_role;

commit;
