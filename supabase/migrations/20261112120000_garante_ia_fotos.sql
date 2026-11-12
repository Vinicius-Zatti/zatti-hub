-- Garante: a IA confere as fotos (fase de teste, 12/11/2026). Pedido de Vinícius: a equipe
-- tira a foto do item e a IA responde na hora "aprovado", "reprovado" ou "não deu para
-- conferir", com o motivo. Nesta fase só informa: não trava a conclusão do checklist e não
-- gera aviso pelo WhatsApp.
--
--   unidades.garante_ia_fotos   liga e desliga por unidade (desligada por padrão); só gestão
--                               ou master muda, pela RPC garante_definir_ia_fotos
--   garante_respostas.ia_*      último resultado da IA para a foto atual do item; foto nova ou
--                               "não se aplica" apaga o resultado (gatilho)
--   garante_ia_chamadas         uma chamada por foto (foto_path único), com tokens e custo
--                               estimado, separada da fin_ia_chamadas da Conciliação; serve
--                               também de contador do teto mensal por organização
--
-- Reserva (garante_ia_reservar) pela pessoa, com as mesmas regras de garante_registrar_foto;
-- gravar o resultado é só do servidor (service role). Idempotente.

-- ══ Liga e desliga por unidade ══════════════════════════════════════════
alter table public.unidades
  add column if not exists garante_ia_fotos boolean not null default false;

-- Unidade de teste do Vinícius (id estável): já nasce ligada. Nos outros bancos não há
-- essa unidade e nada muda.
update public.unidades set garante_ia_fotos = true where id = 'adega-alemao';

create or replace function public.garante_definir_ia_fotos(p_unidade_id text, p_ligada boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atual boolean;
begin
  if p_ligada is null then raise exception 'valor_obrigatorio' using errcode = '22023'; end if;
  -- usuario_pode_usar_garante com 'gestao' também vale para master (com segundo fator).
  if not public.usuario_pode_usar_garante(p_unidade_id, array['gestao'])
     or not public.pode_modulo('garante', 'editar', p_unidade_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select u.garante_ia_fotos into v_atual from public.unidades u where u.id = p_unidade_id for update;
  if v_atual is not distinct from p_ligada then
    return p_ligada;
  end if;
  update public.unidades set garante_ia_fotos = p_ligada where id = p_unidade_id;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (p_unidade_id, auth.uid(), 'garante_definir_ia_fotos', 'unidade', p_unidade_id,
          jsonb_build_object('ligada', v_atual), jsonb_build_object('ligada', p_ligada));
  return p_ligada;
end;
$$;
revoke all on function public.garante_definir_ia_fotos(text, boolean) from public, anon;
grant execute on function public.garante_definir_ia_fotos(text, boolean) to authenticated;

-- ══ Resultado na resposta do item ═══════════════════════════════════════
alter table public.garante_respostas
  add column if not exists ia_veredito text,
  add column if not exists ia_motivo text,
  add column if not exists ia_analisado_em timestamptz,
  add column if not exists ia_foto_path text;

alter table public.garante_respostas drop constraint if exists garante_respostas_ia_valores;
alter table public.garante_respostas add constraint garante_respostas_ia_valores check (
  (ia_veredito is null and ia_motivo is null and ia_analisado_em is null and ia_foto_path is null)
  or (ia_veredito in ('aprovado', 'reprovado', 'inconclusivo')
      and length(btrim(ia_motivo)) between 1 and 200
      and ia_analisado_em is not null
      and ia_foto_path = foto_path)
);

-- Foto trocada ou "não se aplica": o resultado era de outra foto, apaga.
create or replace function public.garante_respostas_limpar_ia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.foto_path is distinct from old.foto_path or new.nao_se_aplica then
    new.ia_veredito := null;
    new.ia_motivo := null;
    new.ia_analisado_em := null;
    new.ia_foto_path := null;
  end if;
  return new;
end;
$$;
revoke all on function public.garante_respostas_limpar_ia() from public, anon, authenticated;

drop trigger if exists garante_respostas_limpar_ia on public.garante_respostas;
create trigger garante_respostas_limpar_ia before update on public.garante_respostas
  for each row execute function public.garante_respostas_limpar_ia();

-- ══ Uso da IA (custo e teto) ════════════════════════════════════════════
create table if not exists public.garante_ia_chamadas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id text not null references public.organizacoes(id),
  unidade_id text not null references public.unidades(id),
  execucao_id uuid not null,
  item_id uuid not null,
  -- Uma conferência por foto, nunca repete (nem depois de erro).
  foto_path text not null unique,
  -- Mês no fuso da operação, para o teto mensal.
  mes date not null,
  modelo text not null check (char_length(modelo) between 1 and 80),
  tabela_precos_versao text not null,
  situacao text not null default 'iniciada' check (situacao in ('iniciada', 'concluida', 'erro', 'consumo_desconhecido')),
  resultado_codigo text check (resultado_codigo is null or resultado_codigo ~ '^[a-z0-9_]{1,60}$'),
  tokens_entrada integer check (tokens_entrada is null or tokens_entrada >= 0),
  tokens_saida integer check (tokens_saida is null or tokens_saida >= 0),
  tokens_cache_leitura integer check (tokens_cache_leitura is null or tokens_cache_leitura >= 0),
  tokens_cache_escrita integer check (tokens_cache_escrita is null or tokens_cache_escrita >= 0),
  custo_estimado_usd numeric(12,6) check (custo_estimado_usd is null or custo_estimado_usd >= 0),
  criado_por uuid references auth.users(id) on delete set null,
  iniciada_em timestamptz not null default now(),
  finalizada_em timestamptz,
  check ((situacao = 'concluida') = (custo_estimado_usd is not null and tokens_entrada is not null and tokens_saida is not null))
);
create index if not exists garante_ia_chamadas_org_mes on public.garante_ia_chamadas (organizacao_id, mes);
create index if not exists garante_ia_chamadas_unidade on public.garante_ia_chamadas (unidade_id, iniciada_em);

alter table public.garante_ia_chamadas enable row level security;
revoke all on table public.garante_ia_chamadas from public, anon, authenticated;
grant select on table public.garante_ia_chamadas to authenticated;
drop policy if exists garante_ia_chamadas_select on public.garante_ia_chamadas;
create policy garante_ia_chamadas_select on public.garante_ia_chamadas for select to authenticated
  using (public.usuario_pode_usar_garante(unidade_id, array['gestao']));

-- Teto mensal de conferências por organização (espelho em src/lib/garante/ia-fotos.ts).
create or replace function public.garante_ia_limite_mensal()
returns integer language sql immutable set search_path = '' as $$ select 1500 $$;
revoke all on function public.garante_ia_limite_mensal() from public, anon;
grant execute on function public.garante_ia_limite_mensal() to authenticated;

-- Reserva a conferência da foto atual do item, chamada pela pessoa logo depois de registrar a
-- foto. Mesmas regras de garante_registrar_foto (acesso, responsável, janela, execução em
-- andamento) e "editar" no Garante. Devolve {situacao, chamada_id}:
--   reservada  pode chamar a IA (chamada_id para o servidor finalizar e gravar)
--   desligada  a unidade não usa a IA
--   sem_foto   a foto não é mais a atual do item (trocada ou "não se aplica")
--   repetida   esta foto já foi conferida (ou está sendo)
--   limite     a organização chegou ao teto do mês
create or replace function public.garante_ia_reservar(
  p_execucao_id uuid, p_item_id uuid, p_foto_path text,
  p_modelo text, p_tabela_precos_versao text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exec record;
  v_org text;
  v_ligada boolean;
  v_mes date := date_trunc('month', public.garante_hoje())::date;
  v_id uuid;
begin
  select e.*, p.responsavel_id into v_exec
    from public.garante_execucoes e join public.garante_publicacoes p on p.id = e.publicacao_id
   where e.id = p_execucao_id;
  if not found then raise exception 'execucao_nao_encontrada' using errcode = 'P0002'; end if;
  if not public.usuario_pode_cumprir_garante(v_exec.unidade_id, v_exec.responsavel_id)
     or not public.pode_modulo('garante', 'editar', v_exec.unidade_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_exec.situacao <> 'em_andamento' then raise exception 'execucao_concluida' using errcode = '22023'; end if;
  if now() > v_exec.fecha_em then raise exception 'data_fora_da_janela' using errcode = '22023'; end if;

  select u.organizacao_id, u.garante_ia_fotos into v_org, v_ligada from public.unidades u where u.id = v_exec.unidade_id;
  if not coalesce(v_ligada, false) then
    return jsonb_build_object('situacao', 'desligada');
  end if;
  if not exists (
    select 1 from public.garante_respostas r
     where r.execucao_id = p_execucao_id and r.item_id = p_item_id
       and r.foto_path = p_foto_path and not r.nao_se_aplica
  ) then
    return jsonb_build_object('situacao', 'sem_foto');
  end if;

  -- Uma reserva por vez na organização: a contagem do teto não deixa passar duas no limite.
  perform pg_advisory_xact_lock(hashtextextended('garante_ia:' || v_org, 0));
  if exists (select 1 from public.garante_ia_chamadas c where c.foto_path = p_foto_path) then
    return jsonb_build_object('situacao', 'repetida');
  end if;
  if (select count(*) from public.garante_ia_chamadas c where c.organizacao_id = v_org and c.mes = v_mes)
     >= public.garante_ia_limite_mensal() then
    return jsonb_build_object('situacao', 'limite');
  end if;

  insert into public.garante_ia_chamadas (organizacao_id, unidade_id, execucao_id, item_id, foto_path, mes,
                                          modelo, tabela_precos_versao, criado_por)
  values (v_org, v_exec.unidade_id, p_execucao_id, p_item_id, p_foto_path, v_mes,
          p_modelo, p_tabela_precos_versao, auth.uid())
  returning id into v_id;
  return jsonb_build_object('situacao', 'reservada', 'chamada_id', v_id);
end;
$$;
revoke all on function public.garante_ia_reservar(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.garante_ia_reservar(uuid, uuid, text, text, text) to authenticated;

-- Grava o resultado na resposta, só se a foto conferida ainda é a atual do item. Só o
-- servidor (service role), depois de receber a resposta da IA. Devolve se gravou.
create or replace function public.garante_ia_gravar_resultado(p_chamada_id uuid, p_veredito text, p_motivo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chamada record;
begin
  if p_veredito not in ('aprovado', 'reprovado', 'inconclusivo') then
    raise exception 'veredito_invalido' using errcode = '22023';
  end if;
  select * into v_chamada from public.garante_ia_chamadas where id = p_chamada_id;
  if not found then raise exception 'chamada_nao_encontrada' using errcode = 'P0002'; end if;
  update public.garante_respostas r
     set ia_veredito = p_veredito,
         ia_motivo = left(btrim(p_motivo), 200),
         ia_analisado_em = now(),
         ia_foto_path = r.foto_path
   where r.execucao_id = v_chamada.execucao_id and r.item_id = v_chamada.item_id
     and r.foto_path = v_chamada.foto_path and not r.nao_se_aplica;
  return found;
end;
$$;
revoke all on function public.garante_ia_gravar_resultado(uuid, text, text) from public, anon, authenticated;
grant execute on function public.garante_ia_gravar_resultado(uuid, text, text) to service_role;
