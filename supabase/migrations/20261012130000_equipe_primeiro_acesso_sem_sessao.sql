-- Equipe, item 4 da revisão final do Codex (12/10/2026): conta pendente não tem sessão.
--
-- Antes: a senha provisória era a senha do Auth; a pessoa entrava com ela e trocava por
-- chamada HTTP ao Auth, que podia ficar indeterminada e cair depois de outra troca.
-- Agora:
--   * a conta nasce no Auth com uma senha sorteada que ninguém conhece; a provisória só
--     existe como hash em senhas_temporarias. Reenvio troca só esse hash (nenhuma
--     escrita no Auth);
--   * enquanto existe pendência, o banco recusa criar sessão (login, recuperação, link
--     mágico) e recusa trocar a senha no Auth. Sem sessão, não há requisição autenticada
--     antiga que possa cair depois da troca;
--   * o primeiro acesso é feito sem sessão: e-mail + provisória + senha nova, numa
--     transação só (`concluir_primeiro_acesso`), que grava o hash bcrypt em auth.users,
--     apaga a pendência e limpa sessões, recuperação (tokens e PKCE) e links de uso único;
--   * 10 tentativas erradas da provisória travam a pendência até a gestão reenviar.
-- Idempotente: pode rodar de novo sem efeito colateral.

-- Pré-requisito: quem roda (dono das funções e gatilhos) precisa destes privilégios.
-- Sem eles, para aqui sem mudar nada.
do $$
begin
  if not (has_table_privilege('auth.users', 'UPDATE') and has_table_privilege('auth.users', 'TRIGGER')
          and has_table_privilege('auth.sessions', 'DELETE') and has_table_privilege('auth.sessions', 'TRIGGER')
          and has_table_privilege('auth.flow_state', 'DELETE')) then
    raise exception 'Sem permissão em auth.users/auth.sessions/auth.flow_state para este usuário. Nada foi alterado.';
  end if;
end $$;

alter table public.senhas_temporarias
  add column if not exists tentativas integer not null default 0;

-- O desenho antigo (trava com prazo + escrita HTTP no Auth) sai inteiro.
drop function if exists public.iniciar_primeiro_acesso(uuid, text);
drop function if exists public.liberar_trava_senha(uuid, uuid);
drop function if exists public.concluir_primeiro_acesso(uuid, uuid);
update public.senhas_temporarias set trava_token = null, trava_ate = null
 where trava_token is not null or trava_ate is not null;
comment on column public.senhas_temporarias.trava_token is 'Sem uso desde 12/10/2026.';
comment on column public.senhas_temporarias.trava_ate is 'Sem uso desde 12/10/2026.';

-- Hash da provisória: o mesmo do servidor (sha256 de "<user_id>:<senha>", em hex).
create or replace function public.equipe_hash_provisoria(p_user_id uuid, p_senha text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_user_id::text || ':' || btrim(coalesce(p_senha, '')), 'sha256'), 'hex');
$$;
revoke all on function public.equipe_hash_provisoria(uuid, text) from public, anon, authenticated;

-- Conta pendente pelo e-mail (só o servidor usa).
create or replace function public.equipe_pendente_por_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id
    from auth.users u
    join public.senhas_temporarias t on t.user_id = u.id
   where lower(u.email) = lower(btrim(coalesce(p_email, '')))
   limit 1;
$$;
revoke all on function public.equipe_pendente_por_email(text) from public, anon, authenticated;

-- ── Proteção no Auth enquanto a conta está pendente ─────────────────────
-- Vale para QUALQUER escritor, inclusive o próprio Auth. Só passa a troca feita por
-- `concluir_primeiro_acesso`, marcada na própria transação.
create or replace function public.equipe_bloquear_sessao_pendente()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.senhas_temporarias t where t.user_id = new.user_id) then
    raise exception 'conta_pendente_sem_sessao' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.equipe_bloquear_sessao_pendente() from public, anon, authenticated, service_role;

create or replace function public.equipe_proteger_senha()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.encrypted_password is not distinct from old.encrypted_password then
    return new;
  end if;
  if current_setting('zatti.troca_senha_equipe', true) = new.id::text then
    return new;
  end if;
  if exists (select 1 from public.senhas_temporarias t where t.user_id = new.id) then
    raise exception 'senha_pendente_primeiro_acesso' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.equipe_proteger_senha() from public, anon, authenticated, service_role;

drop trigger if exists equipe_bloquear_sessao_pendente on auth.sessions;
create trigger equipe_bloquear_sessao_pendente
  before insert on auth.sessions
  for each row execute function public.equipe_bloquear_sessao_pendente();

drop trigger if exists equipe_proteger_senha on auth.users;
create trigger equipe_proteger_senha
  before update of encrypted_password on auth.users
  for each row execute function public.equipe_proteger_senha();

-- Limpa no Auth tudo o que dá acesso ou troca a senha: sessões (refresh tokens caem em
-- cascata), recuperação e reautenticação pendentes, estado PKCE e links de uso único.
create or replace function public.equipe_limpar_acessos_auth(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update auth.users
     set recovery_token = '', recovery_sent_at = null, reauthentication_token = '',
         confirmation_token = '', email_change_token_new = '', email_change_token_current = ''
   where id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
  delete from auth.flow_state where user_id = p_user_id;
  if to_regclass('auth.one_time_tokens') is not null then
    execute 'delete from auth.one_time_tokens where user_id = $1' using p_user_id;
  end if;
end;
$$;
revoke all on function public.equipe_limpar_acessos_auth(uuid) from public, anon, authenticated, service_role;

-- Contas que já estavam pendentes no desenho antigo (provisória era a senha do Auth):
-- senha do Auth vira sorteada e o acesso aberto cai. A provisória continua valendo
-- pelo primeiro acesso novo.
do $$
declare
  v_user uuid;
begin
  for v_user in select user_id from public.senhas_temporarias loop
    perform set_config('zatti.troca_senha_equipe', v_user::text, true);
    update auth.users
       set encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf', 10))
     where id = v_user;
    perform set_config('zatti.troca_senha_equipe', '', true);
    perform public.equipe_limpar_acessos_auth(v_user);
  end loop;
end $$;

-- ── Conferir a provisória (tela de login) ───────────────────────────────
-- true = e-mail de conta pendente com a provisória vigente certa. Erro conta tentativa;
-- com 10 erros a pendência trava até a gestão reenviar. Mesma resposta para e-mail
-- inexistente, para não revelar quem tem conta.
create or replace function public.equipe_conferir_provisoria(p_email text, p_provisoria text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.equipe_pendente_por_email(p_email);
  v_linha record;
begin
  if v_user is null then return false; end if;
  select * into v_linha from public.senhas_temporarias where user_id = v_user for update;
  if v_linha.tentativas >= 10 or v_linha.expira_em <= now() then return false; end if;
  if v_linha.hash <> public.equipe_hash_provisoria(v_user, p_provisoria) then
    update public.senhas_temporarias set tentativas = tentativas + 1 where user_id = v_user;
    return false;
  end if;
  return true;
end;
$$;

-- ── Primeiro acesso, sem sessão, numa transação só ──────────────────────
-- Devolve 'ok', 'provisoria_invalida' (errada, vencida, travada ou conta sem pendência)
-- ou levanta 'senha_invalida'. Com 'ok': senha nova no Auth (bcrypt), pendência apagada,
-- acessos antigos limpos, corte de sessões e vínculos 'convidado' válidos ativados.
create or replace function public.concluir_primeiro_acesso(p_email text, p_provisoria text, p_senha_nova text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_linha record;
begin
  -- bcrypt lê só 72 bytes: senha maior é recusada, nunca cortada em silêncio.
  if p_senha_nova is null or length(p_senha_nova) < 12 or octet_length(p_senha_nova) > 72 then
    raise exception 'senha_invalida' using errcode = '22023';
  end if;
  v_user := public.equipe_pendente_por_email(p_email);
  if v_user is null then return 'provisoria_invalida'; end if;

  select * into v_linha from public.senhas_temporarias where user_id = v_user for update;
  if not found or v_linha.tentativas >= 10 or v_linha.expira_em <= now() then
    return 'provisoria_invalida';
  end if;
  if v_linha.hash <> public.equipe_hash_provisoria(v_user, p_provisoria) then
    update public.senhas_temporarias set tentativas = tentativas + 1 where user_id = v_user;
    return 'provisoria_invalida';
  end if;
  if btrim(p_senha_nova) = btrim(p_provisoria) then
    raise exception 'senha_invalida' using errcode = '22023';
  end if;

  perform set_config('zatti.troca_senha_equipe', v_user::text, true);
  update auth.users
     set encrypted_password = extensions.crypt(p_senha_nova, extensions.gen_salt('bf', 10)),
         raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('zh_pendente', false),
         updated_at = now()
   where id = v_user;
  perform set_config('zatti.troca_senha_equipe', '', true);
  perform public.equipe_limpar_acessos_auth(v_user);

  delete from public.senhas_temporarias where user_id = v_user;

  insert into public.perfis (id, sessoes_validas_desde)
  values (v_user, now())
  on conflict (id) do update set sessoes_validas_desde = excluded.sessoes_validas_desde;

  update public.vinculos v
     set status = 'ativo'
    from public.organizacoes o
   where v.user_id = v_user
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
  return 'ok';
end;
$$;

-- ── Reenvio: só o hash da provisória (nenhuma escrita no Auth) ─────────
-- Só pelo vínculo que criou a conta, no máximo um a cada 2 minutos. Zera as tentativas.
-- A versão antiga devolvia uuid (token da trava): troca de tipo exige recriar.
drop function if exists public.rotacionar_senha_temporaria(uuid, uuid, text, timestamptz);
create function public.rotacionar_senha_temporaria(
  p_user_id uuid, p_vinculo_id uuid, p_hash text, p_expira_em timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.senhas_temporarias
     set hash = p_hash, expira_em = p_expira_em, versao = versao + 1, enviada_em = now(), tentativas = 0
   where user_id = p_user_id
     and vinculo_id = p_vinculo_id
     and enviada_em < now() - interval '2 minutes';
  return found;
end;
$$;

revoke all on function public.equipe_conferir_provisoria(text, text) from public, anon, authenticated;
revoke all on function public.concluir_primeiro_acesso(text, text, text) from public, anon, authenticated;
revoke all on function public.rotacionar_senha_temporaria(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.equipe_conferir_provisoria(text, text) to service_role;
grant execute on function public.concluir_primeiro_acesso(text, text, text) to service_role;
grant execute on function public.rotacionar_senha_temporaria(uuid, uuid, text, timestamptz) to service_role;
