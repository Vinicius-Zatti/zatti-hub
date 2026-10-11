-- Equipe do cliente V1 (11/10/2026): o gestor do cliente cadastra a própria
-- equipe; conta nova recebe senha provisória pelo WhatsApp de Vinícius e só
-- ganha acesso depois de trocar a senha. Desenho e vereditos do Codex em
-- _execucao/zatti-hub/equipe-cliente-v1.md.
--
-- Conta pendente fica com vínculo status = 'convidado'. Todo helper de RLS
-- exige 'ativo' (direto ou por outro helper; provado em
-- tests/database/equipe_cliente_seguranca.sql), então nada é lido nem
-- gravado até a troca. O segredo fica em `senhas_temporarias`, que nenhum
-- usuário lê. Troca, reenvio e revogação são serializados no banco.
--
-- Só acrescenta. A flag `equipe_habilitado` nasce desligada em todas as
-- organizações; ligar é um passo separado, depois da validação.

-- ── Flag por organização ────────────────────────────────────────────────
alter table public.organizacoes
  add column if not exists equipe_habilitado boolean not null default false;

-- ── Contato e situação do envio no vínculo ──────────────────────────────
alter table public.vinculos
  add column if not exists whatsapp text,
  add column if not exists acesso_envio_status text,
  add column if not exists acesso_envio_em timestamptz,
  add column if not exists criado_por uuid references auth.users(id) on delete set null;

alter table public.vinculos drop constraint if exists vinculos_whatsapp_e164;
alter table public.vinculos
  add constraint vinculos_whatsapp_e164 check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{7,14}$');

alter table public.vinculos drop constraint if exists vinculos_acesso_envio_status_valido;
alter table public.vinculos
  add constraint vinculos_acesso_envio_status_valido
  check (acesso_envio_status is null or acesso_envio_status in ('aceito', 'falhou', 'incerto'));

-- ── Unidade do vínculo precisa ser da mesma organização ─────────────────
do $$
begin
  if exists (
    select 1 from public.vinculos v
    join public.unidades u on u.id = v.unidade_id
    where u.organizacao_id <> v.organizacao_id
  ) then
    raise exception 'Há vínculo com unidade de outra organização. Sanear antes (nada foi alterado).';
  end if;
  if exists (
    select 1 from public.vinculos
    where status in ('ativo', 'convidado')
    group by user_id, organizacao_id, unidade_id, role
    having count(*) > 1
  ) then
    raise exception 'Há vínculos duplicados ativos/convidados. Sanear antes (nada foi alterado).';
  end if;
end $$;

alter table public.unidades drop constraint if exists unidades_id_organizacao_unico;
alter table public.unidades add constraint unidades_id_organizacao_unico unique (id, organizacao_id);

alter table public.vinculos drop constraint if exists vinculos_unidade_da_organizacao_fk;
alter table public.vinculos
  add constraint vinculos_unidade_da_organizacao_fk
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id);

create unique index if not exists vinculos_unico_vigente
  on public.vinculos (user_id, organizacao_id, unidade_id, role) nulls not distinct
  where status in ('ativo', 'convidado');

-- ── Sessões anteriores deixam de valer ──────────────────────────────────
-- Gravado ao concluir o primeiro acesso. Vale a sessão (auth.sessions), não
-- o token: sessão aberta antes do corte não passa em nenhum helper de RLS,
-- nem depois de renovar o token (o refresh mantém o mesmo session_id).
alter table public.perfis
  add column if not exists sessoes_validas_desde timestamptz;

create or replace function public.sessao_vigente()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.perfis p
    where p.id = auth.uid()
      and p.sessoes_validas_desde is not null
      and not exists (
        select 1 from auth.sessions s
        where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
          and s.user_id = auth.uid()
          and s.created_at > p.sessoes_validas_desde
      )
  );
$$;

revoke all on function public.sessao_vigente() from public, anon;
grant execute on function public.sessao_vigente() to authenticated;

-- Os quatro helpers que conferem vínculo direto ganham `sessao_vigente()`.
-- Corpo idêntico ao de 20260811090000_seguranca_rls.sql (e ao de
-- usuario_e_master), só com a condição a mais.
create or replace function public.usuario_tem_acesso_organizacao(
  p_organizacao_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.sessao_vigente()
    and (
      auth.jwt() ->> 'aal' = 'aal2'
      or not exists (
        select 1 from public.vinculos vm
        where vm.user_id = auth.uid()
          and vm.status = 'ativo'
          and vm.role = 'master'
      )
    )
    and exists (
      select 1
      from public.vinculos v
      join public.organizacoes o on o.id = p_organizacao_id
      where v.user_id = auth.uid()
        and v.status = 'ativo'
        and o.ativo = true
        and (
          (v.role = 'master' and auth.jwt() ->> 'aal' = 'aal2')
          or (v.role <> 'master' and v.organizacao_id = o.id)
        )
    );
$$;

create or replace function public.usuario_tem_acesso_unidade(
  p_unidade_id text,
  p_papeis text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.sessao_vigente()
    and (
      auth.jwt() ->> 'aal' = 'aal2'
      or not exists (
        select 1 from public.vinculos vm
        where vm.user_id = auth.uid()
          and vm.status = 'ativo'
          and vm.role = 'master'
      )
    )
    and exists (
      select 1
      from public.unidades u
      join public.organizacoes o on o.id = u.organizacao_id
      join public.vinculos v on v.user_id = auth.uid()
      where u.id = p_unidade_id
        and u.ativo = true
        and o.ativo = true
        and v.status = 'ativo'
        and (
          (v.role = 'master' and auth.jwt() ->> 'aal' = 'aal2')
          or (
            v.role <> 'master'
            and
            v.organizacao_id = u.organizacao_id
            and (v.unidade_id is null or v.unidade_id = u.id)
            and (p_papeis is null or v.role = any (p_papeis))
          )
        )
    );
$$;

create or replace function public.usuario_pode_ver_perfil(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.sessao_vigente()
    and (
      auth.jwt() ->> 'aal' = 'aal2'
      or not exists (
        select 1 from public.vinculos vm
        where vm.user_id = auth.uid()
          and vm.status = 'ativo'
          and vm.role = 'master'
      )
    )
    and (
      p_user_id = auth.uid()
      or exists (
        select 1
        from public.vinculos atual
        join public.vinculos alvo
          on alvo.user_id = p_user_id
         and alvo.status = 'ativo'
        join public.organizacoes o
          on o.id = alvo.organizacao_id
         and o.ativo = true
        where atual.user_id = auth.uid()
          and atual.status = 'ativo'
          and (
            (atual.role = 'master' and auth.jwt() ->> 'aal' = 'aal2')
            or (
              atual.role <> 'master'
              and
              atual.organizacao_id = alvo.organizacao_id
              and (
                atual.unidade_id is null
                or alvo.unidade_id is null
                or atual.unidade_id = alvo.unidade_id
              )
            )
          )
      )
    );
$$;

create or replace function public.usuario_e_master()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.sessao_vigente()
    and auth.jwt() ->> 'aal' = 'aal2'
    and exists (
      select 1 from public.vinculos v
      where v.user_id = auth.uid()
        and v.status = 'ativo'
        and v.role = 'master'
    );
$$;

-- ── Senha provisória: tabela sem nenhuma policy ─────────────────────────
-- RLS ligada e sem policy: ninguém lê nem grava pela Data API, nem o dono.
-- Guarda o hash (sha256 com o id da pessoa), nunca a senha. `vinculo_id` é
-- o vínculo que criou a conta: só a gestão daquele vínculo reenvia senha
-- (gestor de outro cliente nunca redefine a conta de ninguém).
-- `trava_token`/`trava_ate`: trava única para tudo que mexe na senha da
-- conta no Auth (primeiro acesso e reenvio). Cada operação recebe um token
-- próprio; só quem tem o token conclui ou libera.
create table if not exists public.senhas_temporarias (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vinculo_id uuid not null references public.vinculos(id) on delete cascade,
  hash text not null,
  expira_em timestamptz not null,
  versao integer not null default 1,
  enviada_em timestamptz not null default now(),
  trava_token uuid,
  trava_ate timestamptz,
  criada_em timestamptz not null default now()
);

alter table public.senhas_temporarias enable row level security;
revoke all on public.senhas_temporarias from public, anon, authenticated;
grant select, insert, update, delete on public.senhas_temporarias to service_role;

-- ── Primeiro acesso, em três passos serializados ────────────────────────
-- 1) iniciar: prova a senha provisória vigente (hash) e pega a trava por 15
--    minutos, com token próprio. A chamada ao Auth tem tempo limite de 10 s;
--    se o resultado ficar indeterminado, a trava não é liberada antes de
--    vencer, para uma escrita atrasada no Auth nunca cruzar com outra.
-- 2) o servidor troca a senha no Auth.
-- 3) concluir (com o token): apaga a pendência, invalida as sessões
--    anteriores e ativa só os vínculos 'convidado' de organização e unidade
--    ativas e coerentes. Falha no Auth: liberar a trava com o token.
create or replace function public.iniciar_primeiro_acesso(p_user_id uuid, p_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  update public.senhas_temporarias
     set trava_token = v_token,
         trava_ate = now() + interval '15 minutes'
   where user_id = p_user_id
     and hash = p_hash
     and expira_em > now()
     and (trava_ate is null or trava_ate < now());
  if not found then
    return null;
  end if;
  return v_token;
end;
$$;

create or replace function public.liberar_trava_senha(p_user_id uuid, p_token uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.senhas_temporarias
     set trava_token = null, trava_ate = null
   where user_id = p_user_id and trava_token = p_token;
$$;

create or replace function public.concluir_primeiro_acesso(p_user_id uuid, p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.senhas_temporarias
   where user_id = p_user_id
     and trava_token = p_token
     and trava_ate > now();
  if not found then
    return false;
  end if;

  insert into public.perfis (id, sessoes_validas_desde)
  values (p_user_id, now())
  on conflict (id) do update set sessoes_validas_desde = excluded.sessoes_validas_desde;

  update public.vinculos v
     set status = 'ativo'
    from public.organizacoes o
   where v.user_id = p_user_id
     and v.status = 'convidado'
     and v.role <> 'master'
     and o.id = v.organizacao_id
     and o.ativo = true
     and (
       v.unidade_id is null
       or exists (
         select 1 from public.unidades u
         where u.id = v.unidade_id and u.organizacao_id = v.organizacao_id and u.ativo = true
       )
     );

  return true;
end;
$$;

-- ── Reenvio da senha provisória ─────────────────────────────────────────
-- Só pelo vínculo que criou a conta, no máximo um a cada 2 minutos, nunca
-- com a trava ocupada. Troca o hash, sobe a versão e pega a trava (o
-- servidor troca a senha no Auth e libera com o token). Devolve o token ou
-- null.
create or replace function public.rotacionar_senha_temporaria(
  p_user_id uuid,
  p_vinculo_id uuid,
  p_hash text,
  p_expira_em timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  update public.senhas_temporarias
     set hash = p_hash,
         expira_em = p_expira_em,
         versao = versao + 1,
         enviada_em = now(),
         trava_token = v_token,
         trava_ate = now() + interval '15 minutes'
   where user_id = p_user_id
     and vinculo_id = p_vinculo_id
     and enviada_em < now() - interval '2 minutes'
     and (trava_ate is null or trava_ate < now());
  if not found then
    return null;
  end if;
  return v_token;
end;
$$;

-- ── Revogação com trava da gestão do cliente ────────────────────────────
-- Trava os vínculos de gestão da organização (dois gestores não se revogam
-- ao mesmo tempo) e nunca deixa o cliente sem gestão da organização inteira
-- nem uma unidade sem gestão. A autorização (quem pede) é da Server Action.
create or replace function public.revogar_vinculo_equipe(p_vinculo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alvo record;
  v_org text;
begin
  -- Trava comum por organização antes de qualquer vínculo: duas revogações
  -- no mesmo cliente fazem fila, sempre na mesma ordem (sem deadlock).
  select organizacao_id into v_org from public.vinculos where id = p_vinculo_id;
  if not found then
    return 'nao_encontrado';
  end if;
  perform 1 from public.organizacoes where id = v_org for update;

  select id, organizacao_id, unidade_id, role, status into v_alvo
    from public.vinculos where id = p_vinculo_id;
  if v_alvo.role = 'master' or v_alvo.organizacao_id <> v_org then
    return 'nao_encontrado';
  end if;
  if v_alvo.status = 'revogado' then
    return 'ok';
  end if;

  if v_alvo.role = 'gestao' and v_alvo.status = 'ativo' then
    if v_alvo.unidade_id is null and not exists (
      select 1 from public.vinculos
       where organizacao_id = v_alvo.organizacao_id and role = 'gestao' and status = 'ativo'
         and unidade_id is null and id <> v_alvo.id
    ) then
      return 'ultima_gestao';
    end if;
    if v_alvo.unidade_id is not null and not exists (
      select 1 from public.vinculos
       where organizacao_id = v_alvo.organizacao_id and role = 'gestao' and status = 'ativo'
         and (unidade_id is null or unidade_id = v_alvo.unidade_id) and id <> v_alvo.id
    ) then
      return 'ultima_gestao';
    end if;
  end if;

  update public.vinculos set status = 'revogado' where id = v_alvo.id;
  return 'ok';
end;
$$;

revoke all on function public.iniciar_primeiro_acesso(uuid, text) from public, anon, authenticated;
revoke all on function public.liberar_trava_senha(uuid, uuid) from public, anon, authenticated;
revoke all on function public.concluir_primeiro_acesso(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rotacionar_senha_temporaria(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.revogar_vinculo_equipe(uuid) from public, anon, authenticated;
grant execute on function public.iniciar_primeiro_acesso(uuid, text) to service_role;
grant execute on function public.liberar_trava_senha(uuid, uuid) to service_role;
grant execute on function public.concluir_primeiro_acesso(uuid, uuid) to service_role;
grant execute on function public.rotacionar_senha_temporaria(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.revogar_vinculo_equipe(uuid) to service_role;
