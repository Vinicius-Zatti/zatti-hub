-- Senha provisória para conta que já existe e está ativa (decisão de Vinícius, 24/10/2026).
--
-- Até aqui a provisória só existia para conta nova criada pela Equipe. Agora:
--   * master gera para qualquer conta (tela Acessos);
--   * a gestão (tela Equipe) gera só para quem pertence APENAS à organização dela: todo
--     vínculo não revogado da conta (ativo ou convidado) precisa ser dessa organização,
--     nunca master, e, para gestor preso a uma unidade, dessa unidade.
-- Efeito, numa transação só: a conta volta a ficar pendente do primeiro acesso já
-- existente (20261012130000_equipe_primeiro_acesso_sem_sessao.sql). A senha do Auth vira
-- uma senha sorteada que ninguém conhece, sessões, recuperação, PKCE e links de uso único
-- caem, o corte de sessões (`perfis.sessoes_validas_desde`) sobe, e só o hash da
-- provisória fica em `senhas_temporarias`. A partir daí os gatilhos de 12/10 recusam
-- sessão e troca de senha até a pessoa concluir o primeiro acesso.
--
-- Quem pede: a Server Action passa o id de quem está logado (`p_ator`, lido da sessão no
-- servidor) e o banco confere de novo o papel dessa pessoa nos vínculos. A função fica no
-- schema public, mas o EXECUTE é revogado de public, anon, authenticated e vini_operador
-- (que ganha EXECUTE em toda função nova de public pelos default privileges de
-- 20261019180000_papel_vini_operador.sql) e concedido só ao service_role. Pela Data API,
-- um usuário logado recebe "permission denied". É o grant que protege, não o schema.
-- Toda função criada ou recriada aqui que mexe em senha ou no Auth revoga o vini_operador
-- explicitamente. Assim a provisória da Equipe vai direto para o WhatsApp da
-- pessoa e a gestão nunca a vê. O segundo fator do master é conferido pelo
-- `requireMaster()` antes da chamada.
-- Proteções extras no escopo da Equipe (revisão de segurança, 24/10): recusa se o WhatsApp
-- do vínculo mudou há menos de 30 minutos (quem troca o número e gera em seguida
-- receberia a provisória num número dele) e no máximo 5 gerações por pessoa a cada 10
-- minutos.
-- Só acrescenta (e reforça o gatilho de sessão). Idempotente.

-- Limite de frequência para conta que ainda não estava pendente: o mesmo de hoje
-- (um a cada 2 minutos), contado pela auditoria. Índice só destas linhas.
create index if not exists logs_auditoria_senha_provisoria_idx
  on public.logs_auditoria (entidade_id, criado_em)
  where acao = 'gerar_senha_provisoria';
create index if not exists logs_auditoria_senha_provisoria_ator_idx
  on public.logs_auditoria (user_id, criado_em)
  where acao = 'gerar_senha_provisoria';

-- ── Quando o WhatsApp do vínculo mudou ──────────────────────────────────
-- Gravado por gatilho, vale para qualquer escritor (tela Equipe, Acessos, SQL). Vínculo
-- novo nasce sem data: só a troca do número conta.
alter table public.vinculos add column if not exists whatsapp_alterado_em timestamptz;

create or replace function public.vinculos_marcar_troca_whatsapp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.whatsapp is distinct from old.whatsapp then
    new.whatsapp_alterado_em := now();
  else
    new.whatsapp_alterado_em := old.whatsapp_alterado_em;
  end if;
  return new;
end;
$$;
revoke all on function public.vinculos_marcar_troca_whatsapp() from public, anon, authenticated, service_role, vini_operador;

drop trigger if exists vinculos_marcar_troca_whatsapp on public.vinculos;
create trigger vinculos_marcar_troca_whatsapp
  before update on public.vinculos
  for each row execute function public.vinculos_marcar_troca_whatsapp();

-- ── Origem da pendência ──────────────────────────────────────────────────
-- 'cadastro' = conta nova da Equipe (o fluxo de 12/10); 'redefinicao' = conta que já
-- existia e recebeu senha provisória por esta função.
alter table public.senhas_temporarias
  add column if not exists origem text not null default 'cadastro';
alter table public.senhas_temporarias drop constraint if exists senhas_temporarias_origem_valida;
alter table public.senhas_temporarias
  add constraint senhas_temporarias_origem_valida check (origem in ('cadastro', 'redefinicao'));

-- Reenvio (Equipe): mesmo corpo de 12/10, com uma condição a mais. Senha redefinida não é
-- reenviada para um WhatsApp trocado há menos de 30 minutos; sem isso, gerar com o número
-- certo, trocar o número e reenviar contornaria a espera da geração. Conta nova
-- ('cadastro') segue como antes (corrigir o número e reenviar é o uso normal).
create or replace function public.rotacionar_senha_temporaria(
  p_user_id uuid, p_vinculo_id uuid, p_hash text, p_expira_em timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.senhas_temporarias t
     set hash = p_hash, expira_em = p_expira_em, versao = versao + 1, enviada_em = now(), tentativas = 0
   where t.user_id = p_user_id
     and t.vinculo_id = p_vinculo_id
     and t.enviada_em < now() - interval '2 minutes'
     and not (
       t.origem = 'redefinicao'
       and exists (
         select 1 from public.vinculos v
          where v.id = p_vinculo_id and v.whatsapp_alterado_em > now() - interval '30 minutes'
       )
     );
  return found;
end;
$$;
revoke all on function public.rotacionar_senha_temporaria(uuid, uuid, text, timestamptz) from public, anon, authenticated, vini_operador;
grant execute on function public.rotacionar_senha_temporaria(uuid, uuid, text, timestamptz) to service_role;

-- ── Gatilho de sessão: espera quem está trocando a conta ────────────────
-- Corpo igual ao de 12/10 com uma linha a mais: antes de conferir a pendência, a sessão
-- nova pede a trava leve (FOR KEY SHARE) da linha da conta. `gerar_senha_provisoria_conta`
-- segura essa linha com FOR UPDATE; um login que estava no meio do caminho espera o fim
-- da troca e então enxerga a pendência (e é recusado), em vez de criar uma sessão que a
-- limpeza não viu. Login normal não disputa essa trava (o Auth só atualiza a linha).
create or replace function public.equipe_bloquear_sessao_pendente()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from auth.users where id = new.user_id for key share;
  if public.equipe_conta_pendente(new.user_id) then
    raise exception 'conta_pendente_sem_sessao' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.equipe_bloquear_sessao_pendente() from public, anon, authenticated, service_role, vini_operador;

-- ── Gerar a senha provisória ────────────────────────────────────────────
-- p_escopo 'master': p_ator precisa ter vínculo master ativo; vale para qualquer conta
--   com vínculo não revogado, menos a própria.
-- p_escopo 'equipe': p_ator precisa ser master ativo ou gestão ativa de p_organizacao_id
--   (organização ativa com a Equipe ligada). O vínculo escolhido é ativo, não master, da
--   organização; a conta não pode ter vínculo não revogado em outra organização nem
--   vínculo master; gestor preso a uma unidade só alcança conta cujos vínculos são todos
--   dessa unidade.
-- Devolve 'ok' ou o motivo: 'sem_permissao', 'nao_encontrado', 'propria_conta',
-- 'outra_organizacao', 'outra_unidade', 'limite', 'limite_ator' (Equipe: mais de 5 em
-- 10 minutos pela mesma pessoa), 'whatsapp_recente' (Equipe: número trocado há menos de
-- 30 minutos). Conta que já estava pendente só troca
-- o hash (mesmo efeito do reenvio). Grava a auditoria (quem, para quem, quando).
create or replace function public.gerar_senha_provisoria_conta(
  p_ator uuid,
  p_vinculo_id uuid,
  p_escopo text,
  p_organizacao_id text,
  p_hash text,
  p_expira_em timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alvo record;
  v_ator_master boolean;
  v_ator_gestao boolean;
  v_ator_unidade_fixa boolean;
  v_ator_unidade text;
  v_pendente record;
  v_ja_pendente boolean := false;
  v_unidade_log text;
begin
  if p_ator is null or p_vinculo_id is null or p_escopo is null or p_escopo not in ('master', 'equipe') then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;
  -- Mesma validade do fluxo atual (7 dias), com folga de relógio entre servidor e banco.
  if p_expira_em is null or p_expira_em <= now() or p_expira_em > now() + interval '7 days 10 minutes' then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;

  -- Quem pede.
  v_ator_master := exists (
    select 1 from public.vinculos
     where user_id = p_ator and status = 'ativo' and role = 'master'
  );
  if p_escopo = 'master' then
    if not v_ator_master then
      return 'sem_permissao';
    end if;
  else
    if p_organizacao_id is null or not exists (
      select 1 from public.organizacoes
       where id = p_organizacao_id and ativo = true and equipe_habilitado = true
    ) then
      return 'sem_permissao';
    end if;
    v_ator_gestao := exists (
      select 1 from public.vinculos
       where user_id = p_ator and status = 'ativo' and role = 'gestao' and organizacao_id = p_organizacao_id
    );
    if not v_ator_master and not v_ator_gestao then
      return 'sem_permissao';
    end if;
    -- Gestor com vínculo de organização inteira não fica preso a unidade.
    v_ator_unidade_fixa := not v_ator_master and not exists (
      select 1 from public.vinculos
       where user_id = p_ator and status = 'ativo' and role = 'gestao'
         and organizacao_id = p_organizacao_id and unidade_id is null
    );
    if v_ator_unidade_fixa then
      select min(unidade_id) into v_ator_unidade
        from public.vinculos
       where user_id = p_ator and status = 'ativo' and role = 'gestao' and organizacao_id = p_organizacao_id;
    end if;
  end if;

  -- Teto por pessoa no escopo da Equipe: 5 gerações a cada 10 minutos. A trava por
  -- pessoa serializa os pedidos dela, para dois pedidos simultâneos não passarem do teto.
  if p_escopo = 'equipe' then
    perform pg_advisory_xact_lock(hashtextextended('gerar_senha_provisoria_ator:' || p_ator::text, 0));
    if (
      select count(*) from public.logs_auditoria
       where acao = 'gerar_senha_provisoria' and user_id = p_ator
         and criado_em >= now() - interval '10 minutes'
         and dados_novos ->> 'escopo' = 'equipe'
    ) >= 5 then
      return 'limite_ator';
    end if;
  end if;

  -- Para quem.
  select id, user_id, organizacao_id, unidade_id, role, status, whatsapp_alterado_em into v_alvo
    from public.vinculos where id = p_vinculo_id;
  if not found or v_alvo.status = 'revogado' then
    return 'nao_encontrado';
  end if;
  if v_alvo.user_id = p_ator then
    return 'propria_conta';
  end if;

  if p_escopo = 'equipe' then
    -- Mesma resposta para "não existe" e "não é seu" (não revela vínculo de outro cliente).
    if v_alvo.organizacao_id <> p_organizacao_id or v_alvo.role = 'master' or v_alvo.status <> 'ativo' then
      return 'nao_encontrado';
    end if;
    if v_ator_unidade_fixa and v_alvo.unidade_id is distinct from v_ator_unidade then
      return 'nao_encontrado';
    end if;
    if exists (
      select 1 from public.vinculos
       where user_id = v_alvo.user_id and status in ('ativo', 'convidado') and role = 'master'
    ) then
      return 'nao_encontrado';
    end if;
    if exists (
      select 1 from public.vinculos
       where user_id = v_alvo.user_id and status in ('ativo', 'convidado')
         and organizacao_id <> p_organizacao_id
    ) then
      return 'outra_organizacao';
    end if;
    if v_ator_unidade_fixa and exists (
      select 1 from public.vinculos
       where user_id = v_alvo.user_id and status in ('ativo', 'convidado')
         and unidade_id is distinct from v_ator_unidade
    ) then
      return 'outra_unidade';
    end if;
    -- A provisória da Equipe vai para o WhatsApp do vínculo: número trocado agora há
    -- pouco não recebe senha (troca e geração em sequência por quem não é a pessoa).
    if v_alvo.whatsapp_alterado_em is not null and v_alvo.whatsapp_alterado_em > now() - interval '30 minutes' then
      return 'whatsapp_recente';
    end if;
  end if;

  -- Trava a conta: duas gerações seguidas fazem fila, e um login em andamento espera
  -- (ver o gatilho de sessão acima).
  perform 1 from auth.users where id = v_alvo.user_id and deleted_at is null for update;
  if not found then
    return 'nao_encontrado';
  end if;

  select * into v_pendente from public.senhas_temporarias where user_id = v_alvo.user_id for update;
  v_ja_pendente := found;

  if v_ja_pendente then
    -- Já pendente: só a provisória muda (a senha do Auth já é sorteada).
    if v_pendente.enviada_em >= now() - interval '2 minutes' then
      return 'limite';
    end if;
    update public.senhas_temporarias
       set hash = p_hash, expira_em = p_expira_em, versao = versao + 1, enviada_em = now(), tentativas = 0
     where user_id = v_alvo.user_id;
  else
    if exists (
      select 1 from public.logs_auditoria
       where acao = 'gerar_senha_provisoria' and entidade_id = v_alvo.user_id::text
         and criado_em >= now() - interval '2 minutes'
    ) then
      return 'limite';
    end if;

    -- Senha do Auth sorteada: ninguém conhece, a antiga deixa de entrar.
    perform set_config('zatti.troca_senha_equipe', v_alvo.user_id::text, true);
    update auth.users
       set encrypted_password = extensions.crypt(
             encode(extensions.gen_random_bytes(32), 'base64'), extensions.gen_salt('bf', 10)),
           updated_at = now()
     where id = v_alvo.user_id;
    perform set_config('zatti.troca_senha_equipe', '', true);
    perform public.equipe_limpar_acessos_auth(v_alvo.user_id);

    insert into public.perfis (id, sessoes_validas_desde)
    values (v_alvo.user_id, now())
    on conflict (id) do update set sessoes_validas_desde = excluded.sessoes_validas_desde;

    insert into public.senhas_temporarias (user_id, vinculo_id, hash, expira_em, versao, enviada_em, tentativas, origem)
    values (v_alvo.user_id, v_alvo.id, p_hash, p_expira_em, 1, now(), 0, 'redefinicao');
  end if;

  -- Auditoria na unidade do vínculo, ou na primeira unidade da organização dele.
  v_unidade_log := v_alvo.unidade_id;
  if v_unidade_log is null then
    select id into v_unidade_log from public.unidades
     where organizacao_id = v_alvo.organizacao_id
     order by ativo desc, id
     limit 1;
  end if;
  if v_unidade_log is null then
    raise exception 'sem_unidade_para_auditoria' using errcode = '22023';
  end if;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (v_unidade_log, p_ator, 'gerar_senha_provisoria', 'usuario', v_alvo.user_id::text,
          jsonb_build_object('contaJaPendente', v_ja_pendente),
          jsonb_build_object('escopo', p_escopo, 'vinculoId', v_alvo.id, 'organizacaoId', v_alvo.organizacao_id,
                             'expiraEm', p_expira_em));
  return 'ok';
end;
$$;

revoke all on function public.gerar_senha_provisoria_conta(uuid, uuid, text, text, text, timestamptz)
  from public, anon, authenticated, vini_operador;
grant execute on function public.gerar_senha_provisoria_conta(uuid, uuid, text, text, text, timestamptz)
  to service_role;
