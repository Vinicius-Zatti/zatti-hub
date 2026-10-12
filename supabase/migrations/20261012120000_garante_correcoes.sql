-- Correções do Checklist Garante (revisão final do Codex, 12/10/2026).
-- Veredito: _execucao/zatti-hub/rotinas-mega-v1-veredito-codex.md, "Revisão final do código".
-- 3 (responsável com vínculo na unidade; publicação só por RPC), 8 (parar de usar não apaga
-- o histórico da agenda), 9 (progresso com o mesmo critério da conclusão, foto obrigatória
-- inclusive), 2 (operacional só lê o que pode cumprir), 5 (modelo vazio e número não
-- finito), 6 (Storage valida item e nome) e 10 (janela hoje/ontem em todas as RPCs).
-- Não mexe na Equipe. Idempotente: pode rodar de novo sem efeito colateral.

-- ══ Checklist Garante ═══════════════════════════════════════════════════

-- 5: número finito (NaN e infinito ficam fora de qualquer intervalo).
alter table public.garante_itens drop constraint if exists garante_itens_meta_finita;
alter table public.garante_itens
  add constraint garante_itens_meta_finita check (
    (meta_min is null or meta_min between -1000000 and 1000000)
    and (meta_max is null or meta_max between -1000000 and 1000000)
  );
alter table public.garante_respostas drop constraint if exists garante_respostas_numero_finito;
alter table public.garante_respostas
  add constraint garante_respostas_numero_finito check (valor_numero is null or valor_numero between -1000000000 and 1000000000);

-- 3: modelo e item a gestão cria e edita, nunca apaga (execuções guardam snapshot).
-- Publicação: só leitura direta; criar e encerrar só pelas RPCs abaixo.
drop policy if exists garante_modelos_gestao on public.garante_modelos;
drop policy if exists garante_modelos_gestao_insert on public.garante_modelos;
drop policy if exists garante_modelos_gestao_update on public.garante_modelos;
create policy garante_modelos_gestao_insert on public.garante_modelos for insert to authenticated
  with check (public.usuario_pode_usar_garante(unidade_id, array['gestao']));
create policy garante_modelos_gestao_update on public.garante_modelos for update to authenticated
  using (public.usuario_pode_usar_garante(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_garante(unidade_id, array['gestao']));

drop policy if exists garante_itens_gestao on public.garante_itens;
drop policy if exists garante_itens_gestao_insert on public.garante_itens;
drop policy if exists garante_itens_gestao_update on public.garante_itens;
create policy garante_itens_gestao_insert on public.garante_itens for insert to authenticated
  with check (public.usuario_pode_usar_garante(unidade_id, array['gestao']));
create policy garante_itens_gestao_update on public.garante_itens for update to authenticated
  using (public.usuario_pode_usar_garante(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_garante(unidade_id, array['gestao']));

drop policy if exists garante_publicacoes_gestao on public.garante_publicacoes;

-- Responsável elegível: vínculo ativo ou convidado (ainda vai trocar a senha), que não
-- é master, na organização da unidade e cobrindo a unidade.
create or replace function public.garante_responsavel_elegivel(p_unidade_id text, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.vinculos v
      join public.unidades u on u.id = p_unidade_id
     where v.user_id = p_user_id
       and v.status in ('ativo', 'convidado')
       and v.role <> 'master'
       and v.organizacao_id = u.organizacao_id
       and (v.unidade_id is null or v.unidade_id = u.id)
  );
$$;
revoke all on function public.garante_responsavel_elegivel(text, uuid) from public, anon, authenticated;

create or replace function public.garante_publicar(
  p_modelo_id uuid, p_setor_id uuid, p_responsavel_id uuid, p_dias smallint[], p_horario time
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_modelo record;
  v_id uuid;
begin
  select id, unidade_id, ativo into v_modelo from public.garante_modelos where id = p_modelo_id for update;
  if not found or not v_modelo.ativo then raise exception 'modelo_nao_encontrado' using errcode = 'P0002'; end if;
  if not public.usuario_pode_usar_garante(v_modelo.unidade_id, array['gestao']) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if not exists (select 1 from public.garante_itens i where i.modelo_id = p_modelo_id and i.ativo) then
    raise exception 'checklist_sem_itens' using errcode = '22023';
  end if;
  if p_responsavel_id is not null and not public.garante_responsavel_elegivel(v_modelo.unidade_id, p_responsavel_id) then
    raise exception 'responsavel_sem_acesso' using errcode = '22023';
  end if;
  if p_setor_id is not null and not exists (
    select 1 from public.setores s where s.id = p_setor_id and s.unidade_id = v_modelo.unidade_id and s.ativo
  ) then
    raise exception 'setor_invalido' using errcode = '22023';
  end if;

  insert into public.garante_publicacoes (modelo_id, unidade_id, setor_id, responsavel_id, dias_semana,
                                          horario_limite, vigente_desde, criado_por)
  values (p_modelo_id, v_modelo.unidade_id, p_setor_id, p_responsavel_id, p_dias, p_horario,
          public.garante_hoje(), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Parar uma programação: hoje ainda vale, some a partir de amanhã. Só para a frente.
create or replace function public.garante_encerrar_publicacao(p_publicacao_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pub record;
  v_hoje date := public.garante_hoje();
begin
  select id, unidade_id, vigente_ate into v_pub from public.garante_publicacoes
   where id = p_publicacao_id and ativo for update;
  if not found then raise exception 'publicacao_nao_encontrada' using errcode = 'P0002'; end if;
  if not public.usuario_pode_usar_garante(v_pub.unidade_id, array['gestao']) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_pub.vigente_ate is not null and v_pub.vigente_ate <= v_hoje then return; end if;
  update public.garante_publicacoes set vigente_ate = v_hoje where id = p_publicacao_id;
end;
$$;

-- 8: parar de usar o checklist. Sai da lista de hoje em diante; nada do passado muda.
-- Programação que já valia: termina ontem (ou hoje, se alguém já começou o de hoje).
-- Programação que ainda nem começou e nunca foi cumprida: deixa de existir.
create or replace function public.garante_parar_modelo(p_modelo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_modelo record;
  v_hoje date := public.garante_hoje();
begin
  select id, unidade_id into v_modelo from public.garante_modelos where id = p_modelo_id and ativo for update;
  if not found then raise exception 'modelo_nao_encontrado' using errcode = 'P0002'; end if;
  if not public.usuario_pode_usar_garante(v_modelo.unidade_id, array['gestao']) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  update public.garante_publicacoes p
     set ativo = false
   where p.modelo_id = p_modelo_id and p.ativo and p.vigente_desde >= v_hoje
     and not exists (select 1 from public.garante_execucoes e where e.publicacao_id = p.id);

  update public.garante_publicacoes p
     set vigente_ate = case
           when exists (select 1 from public.garante_execucoes e where e.publicacao_id = p.id and e.data = v_hoje)
             then v_hoje
           else v_hoje - 1
         end
   where p.modelo_id = p_modelo_id and p.ativo
     and (p.vigente_ate is null or p.vigente_ate >= v_hoje);

  update public.garante_modelos set ativo = false, atualizado_em = now() where id = p_modelo_id;
end;
$$;

revoke all on function public.garante_publicar(uuid, uuid, uuid, smallint[], time) from public, anon;
revoke all on function public.garante_encerrar_publicacao(uuid) from public, anon;
revoke all on function public.garante_parar_modelo(uuid) from public, anon;
grant execute on function public.garante_publicar(uuid, uuid, uuid, smallint[], time) to authenticated;
grant execute on function public.garante_encerrar_publicacao(uuid) to authenticated;
grant execute on function public.garante_parar_modelo(uuid) to authenticated;

-- 9: um critério só de item feito, usado na agenda (progresso) e na conclusão.
-- Feito = "não se aplica" com motivo, ou resposta com valor E, se o item exige foto,
-- com a foto registrada.
create or replace function public.garante_itens_completos(p_execucao_id uuid, p_snapshot jsonb)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::int
    from jsonb_array_elements(coalesce(p_snapshot, '[]'::jsonb)) x
    join public.garante_respostas r on r.execucao_id = p_execucao_id and r.item_id = (x ->> 'id')::uuid
   where r.nao_se_aplica
      or ((r.valor_bool is not null or r.valor_numero is not null or r.valor_texto is not null)
          and (not coalesce((x ->> 'foto_obrigatoria')::boolean, false) or r.foto_path is not null));
$$;
revoke all on function public.garante_itens_completos(uuid, jsonb) from public, anon;
grant execute on function public.garante_itens_completos(uuid, jsonb) to authenticated;

-- 2: operacional lê só a execução que pode cumprir (dele ou sem responsável);
-- gestão e master, todas da unidade. Respostas e fotos seguem a execução.
create or replace function public.garante_pode_ver_execucao(p_unidade_id text, p_publicacao_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.usuario_pode_cumprir_garante(
    p_unidade_id,
    (select p.responsavel_id from public.garante_publicacoes p where p.id = p_publicacao_id)
  );
$$;
revoke all on function public.garante_pode_ver_execucao(text, uuid) from public, anon;
grant execute on function public.garante_pode_ver_execucao(text, uuid) to authenticated;

drop policy if exists garante_execucoes_select on public.garante_execucoes;
create policy garante_execucoes_select on public.garante_execucoes for select to authenticated
  using (public.garante_pode_ver_execucao(unidade_id, publicacao_id));
drop policy if exists garante_respostas_select on public.garante_respostas;
create policy garante_respostas_select on public.garante_respostas for select to authenticated
  using (exists (
    select 1 from public.garante_execucoes e
     where e.id = garante_respostas.execucao_id and e.unidade_id = garante_respostas.unidade_id
  ));

-- Iniciar: só checklist com itens; janela hoje/ontem (como antes).
create or replace function public.garante_iniciar(p_publicacao_id uuid, p_data date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pub record;
  v_id uuid;
begin
  select p.*, m.nome as modelo_nome into v_pub
    from public.garante_publicacoes p
    join public.garante_modelos m on m.id = p.modelo_id
   where p.id = p_publicacao_id and p.ativo and m.ativo;
  if not found then raise exception 'publicacao_nao_encontrada' using errcode = 'P0002'; end if;
  if not public.usuario_pode_cumprir_garante(v_pub.unidade_id, v_pub.responsavel_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_data not in (public.garante_hoje(), public.garante_hoje() - 1) then
    raise exception 'data_fora_da_janela' using errcode = '22023';
  end if;
  if p_data < v_pub.vigente_desde or (v_pub.vigente_ate is not null and p_data > v_pub.vigente_ate)
     or not (extract(dow from p_data)::smallint = any (v_pub.dias_semana)) then
    raise exception 'publicacao_nao_devida_nesta_data' using errcode = '22023';
  end if;

  select id into v_id from public.garante_execucoes where publicacao_id = p_publicacao_id and data = p_data;
  if v_id is not null then return v_id; end if;

  if not exists (select 1 from public.garante_itens i where i.modelo_id = v_pub.modelo_id and i.ativo) then
    raise exception 'checklist_sem_itens' using errcode = '22023';
  end if;

  insert into public.garante_execucoes (publicacao_id, unidade_id, data, prazo, snapshot, modelo_nome, iniciada_por)
  select v_pub.id, v_pub.unidade_id, p_data,
         (p_data + v_pub.horario_limite) at time zone 'America/Sao_Paulo',
         jsonb_agg(jsonb_build_object(
           'id', i.id, 'ordem', i.ordem, 'grupo', i.grupo, 'titulo', i.titulo, 'instrucao', i.instrucao,
           'tipo', i.tipo, 'critico', i.critico, 'foto_obrigatoria', i.foto_obrigatoria,
           'permite_na', i.permite_na, 'meta_min', i.meta_min, 'meta_max', i.meta_max
         ) order by i.ordem, i.criado_em),
         v_pub.modelo_nome, auth.uid()
    from public.garante_itens i
   where i.modelo_id = v_pub.modelo_id and i.ativo
  on conflict (publicacao_id, data) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.garante_execucoes where publicacao_id = p_publicacao_id and data = p_data;
  end if;
  return v_id;
end;
$$;

-- 10: responder, fotografar e concluir também só dentro da janela (hoje ou ontem).
create or replace function public.garante_responder(
  p_execucao_id uuid,
  p_item_id uuid,
  p_valor_bool boolean default null,
  p_valor_numero numeric default null,
  p_valor_texto text default null,
  p_nao_se_aplica boolean default false,
  p_justificativa text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exec record;
  v_item jsonb;
  v_dentro boolean;
  v_min numeric;
  v_max numeric;
begin
  select e.*, p.responsavel_id into v_exec
    from public.garante_execucoes e join public.garante_publicacoes p on p.id = e.publicacao_id
   where e.id = p_execucao_id
   for update of e;
  if not found then raise exception 'execucao_nao_encontrada' using errcode = 'P0002'; end if;
  if not public.usuario_pode_cumprir_garante(v_exec.unidade_id, v_exec.responsavel_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_exec.situacao <> 'em_andamento' then raise exception 'execucao_concluida' using errcode = '22023'; end if;
  if v_exec.data < public.garante_hoje() - 1 then raise exception 'data_fora_da_janela' using errcode = '22023'; end if;

  select x into v_item from jsonb_array_elements(v_exec.snapshot) x where (x ->> 'id')::uuid = p_item_id;
  if v_item is null then raise exception 'item_fora_do_checklist' using errcode = '22023'; end if;

  if p_nao_se_aplica then
    if not (v_item ->> 'permite_na')::boolean or (v_item ->> 'critico')::boolean then
      raise exception 'nao_se_aplica_proibido' using errcode = '22023';
    end if;
    if length(btrim(coalesce(p_justificativa, ''))) < 3 then
      raise exception 'justificativa_obrigatoria' using errcode = '22023';
    end if;
    v_dentro := null;
  else
    v_min := nullif(v_item ->> 'meta_min', '')::numeric;
    v_max := nullif(v_item ->> 'meta_max', '')::numeric;
    case v_item ->> 'tipo'
      when 'check' then
        if p_valor_bool is null then raise exception 'valor_obrigatorio' using errcode = '22023'; end if;
        v_dentro := p_valor_bool;
      when 'numero' then
        if p_valor_numero is null or not (p_valor_numero between -1000000000 and 1000000000) then
          raise exception 'valor_obrigatorio' using errcode = '22023';
        end if;
        v_dentro := (v_min is null or p_valor_numero >= v_min) and (v_max is null or p_valor_numero <= v_max);
      when 'estrelas' then
        if p_valor_numero is null or p_valor_numero not in (1, 2, 3, 4, 5) then
          raise exception 'valor_obrigatorio' using errcode = '22023';
        end if;
        v_dentro := (v_min is null or p_valor_numero >= v_min) and (v_max is null or p_valor_numero <= v_max);
      when 'texto' then
        if length(btrim(coalesce(p_valor_texto, ''))) = 0 then raise exception 'valor_obrigatorio' using errcode = '22023'; end if;
        v_dentro := true;
      else
        raise exception 'tipo_invalido' using errcode = '22023';
    end case;
  end if;

  insert into public.garante_respostas (execucao_id, unidade_id, item_id, valor_bool, valor_numero, valor_texto,
                                        nao_se_aplica, justificativa, dentro_meta, respondido_por, respondido_em)
  values (p_execucao_id, v_exec.unidade_id, p_item_id,
          case when p_nao_se_aplica then null else p_valor_bool end,
          case when p_nao_se_aplica then null else p_valor_numero end,
          case when p_nao_se_aplica then null else nullif(btrim(p_valor_texto), '') end,
          p_nao_se_aplica, case when p_nao_se_aplica then btrim(p_justificativa) else null end,
          v_dentro, auth.uid(), now())
  on conflict (execucao_id, item_id) do update
     set valor_bool = excluded.valor_bool, valor_numero = excluded.valor_numero, valor_texto = excluded.valor_texto,
         nao_se_aplica = excluded.nao_se_aplica, justificativa = excluded.justificativa,
         dentro_meta = excluded.dentro_meta, respondido_por = excluded.respondido_por, respondido_em = excluded.respondido_em,
         foto_path = case when excluded.nao_se_aplica then null else public.garante_respostas.foto_path end,
         foto_recebida_em = case when excluded.nao_se_aplica then null else public.garante_respostas.foto_recebida_em end;
  return coalesce(v_dentro, true);
end;
$$;

create or replace function public.garante_registrar_foto(p_execucao_id uuid, p_item_id uuid, p_caminho text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exec record;
  v_recebida timestamptz;
begin
  select e.*, p.responsavel_id into v_exec
    from public.garante_execucoes e join public.garante_publicacoes p on p.id = e.publicacao_id
   where e.id = p_execucao_id
   for update of e;
  if not found then raise exception 'execucao_nao_encontrada' using errcode = 'P0002'; end if;
  if not public.usuario_pode_cumprir_garante(v_exec.unidade_id, v_exec.responsavel_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_exec.situacao <> 'em_andamento' then raise exception 'execucao_concluida' using errcode = '22023'; end if;
  if v_exec.data < public.garante_hoje() - 1 then raise exception 'data_fora_da_janela' using errcode = '22023'; end if;
  if not exists (select 1 from jsonb_array_elements(v_exec.snapshot) x where (x ->> 'id')::uuid = p_item_id) then
    raise exception 'item_fora_do_checklist' using errcode = '22023';
  end if;
  if p_caminho !~ ('^' || v_exec.unidade_id || '/' || p_execucao_id::text || '/' || p_item_id::text || '-[a-z0-9-]{8,64}\.jpg$') then
    raise exception 'caminho_invalido' using errcode = '22023';
  end if;
  select o.created_at into v_recebida from storage.objects o
   where o.bucket_id = 'garante-evidencias' and o.name = p_caminho;
  if v_recebida is null then raise exception 'foto_nao_recebida' using errcode = 'P0002'; end if;

  insert into public.garante_respostas (execucao_id, unidade_id, item_id, foto_path, foto_recebida_em, respondido_por)
  values (p_execucao_id, v_exec.unidade_id, p_item_id, p_caminho, v_recebida, auth.uid())
  on conflict (execucao_id, item_id) do update
     set foto_path = excluded.foto_path, foto_recebida_em = excluded.foto_recebida_em,
         nao_se_aplica = false, justificativa = null;
end;
$$;

create or replace function public.garante_concluir(p_execucao_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exec record;
  v_faltam integer;
begin
  select e.*, p.responsavel_id into v_exec
    from public.garante_execucoes e join public.garante_publicacoes p on p.id = e.publicacao_id
   where e.id = p_execucao_id
   for update of e;
  if not found then raise exception 'execucao_nao_encontrada' using errcode = 'P0002'; end if;
  if not public.usuario_pode_cumprir_garante(v_exec.unidade_id, v_exec.responsavel_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_exec.situacao = 'concluida' then return 0; end if;
  if v_exec.data < public.garante_hoje() - 1 then raise exception 'data_fora_da_janela' using errcode = '22023'; end if;

  v_faltam := jsonb_array_length(v_exec.snapshot) - public.garante_itens_completos(p_execucao_id, v_exec.snapshot);
  if jsonb_array_length(v_exec.snapshot) = 0 then v_faltam := 1; end if;
  if v_faltam > 0 then return v_faltam; end if;

  update public.garante_execucoes
     set situacao = 'concluida', concluida_em = now(), concluida_por = auth.uid()
   where id = p_execucao_id;
  return 0;
end;
$$;

-- 8 e 9: agenda com o histórico preservado e o progresso pelo mesmo critério da
-- conclusão. Dia com execução aparece sempre (mesmo de checklist que parou de ser
-- usado); dia sem execução aparece se a programação valia naquele dia.
create or replace function public.garante_agenda(p_unidade_id text, p_data date)
returns table (
  publicacao_id uuid, modelo_id uuid, modelo_nome text, setor_id uuid, responsavel_id uuid,
  horario_limite time, prazo timestamptz, execucao_id uuid, situacao text,
  total_itens integer, respondidos integer, fora_da_meta integer, concluida_em timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, m.id, coalesce(e.modelo_nome, m.nome), p.setor_id, p.responsavel_id, p.horario_limite,
         coalesce(e.prazo, (p_data + p.horario_limite) at time zone 'America/Sao_Paulo'),
         e.id,
         case when e.situacao = 'concluida' then 'concluida'
              when e.id is not null then 'em_andamento'
              else 'pendente' end,
         coalesce(jsonb_array_length(e.snapshot), (select count(*)::int from public.garante_itens i where i.modelo_id = m.id and i.ativo)),
         case when e.id is null then 0 else public.garante_itens_completos(e.id, e.snapshot) end,
         (select count(*)::int from public.garante_respostas r where r.execucao_id = e.id and r.dentro_meta = false),
         e.concluida_em
    from public.garante_publicacoes p
    join public.garante_modelos m on m.id = p.modelo_id
    left join public.garante_execucoes e on e.publicacao_id = p.id and e.data = p_data
   where p.unidade_id = p_unidade_id
     and (
       e.id is not null
       or (p.ativo
           and p_data >= p.vigente_desde and (p.vigente_ate is null or p_data <= p.vigente_ate)
           and extract(dow from p_data)::smallint = any (p.dias_semana))
     )
   order by p.horario_limite, 3;
$$;

-- 2, 6 e 10: fotos. Leitura segue a execução (RLS acima). Envio só no caminho
-- <unidade>/<execução>/<item do snapshot>-<aleatório>.jpg, execução em andamento e na janela.
drop policy if exists garante_evidencias_select on storage.objects;
create policy garante_evidencias_select on storage.objects for select to authenticated
  using (
    bucket_id = 'garante-evidencias'
    and created_at > now() - interval '40 days'
    and exists (
      select 1 from public.garante_execucoes e
       where e.id::text = (storage.foldername(name))[2]
         and e.unidade_id = (storage.foldername(name))[1]
    )
  );

drop policy if exists garante_evidencias_insert on storage.objects;
create policy garante_evidencias_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'garante-evidencias'
    and array_length(storage.foldername(name), 1) = 2
    and storage.filename(name) ~ '^[0-9a-f-]{36}-[a-z0-9-]{8,64}\.jpg$'
    and exists (
      select 1 from public.garante_execucoes e
      join public.garante_publicacoes p on p.id = e.publicacao_id
      where e.id::text = (storage.foldername(name))[2]
        and e.unidade_id = (storage.foldername(name))[1]
        and e.situacao = 'em_andamento'
        and e.data >= public.garante_hoje() - 1
        and public.usuario_pode_cumprir_garante(e.unidade_id, p.responsavel_id)
        and exists (
          select 1 from jsonb_array_elements(e.snapshot) x
           where x ->> 'id' = left(storage.filename(name), 36)
        )
    )
  );
