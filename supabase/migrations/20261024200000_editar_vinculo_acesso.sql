-- Editar acesso sem revogar (Navegação V2, fase 2 - 24/10/2026).
--
-- Até aqui master (tela Acessos) e gestão (tela Equipe) só conseguiam revogar um vínculo.
-- Agora dá para trocar o papel (gestão/operacional) e a unidade (uma unidade ou a
-- organização inteira) do mesmo vínculo, numa transação só, com auditoria dos dados
-- antigos e novos. A linha é a mesma (mesmo id): WhatsApp, situação do envio e a
-- pendência de primeiro acesso continuam presas a ela.
--
-- Quem pode, conferido aqui e não só na tela:
--   * escopo 'master': p_ator com vínculo master ativo; qualquer vínculo não master.
--   * escopo 'equipe': p_ator master ativo ou gestão ativa de p_organizacao_id
--     (organização ativa com a Equipe ligada); só vínculo dessa organização; gestor
--     preso a uma unidade só mexe em vínculo dessa unidade e só para ela (nunca dá
--     "todas as unidades"); nunca deixa o cliente ou a unidade sem gestão (mesma regra de
--     `revogar_vinculo_equipe`).
--   * nos dois: nunca promove a master, nunca edita vínculo master, nunca o próprio
--     vínculo (não se tranca fora), nunca vínculo revogado, operacional sempre com uma
--     unidade, unidade ativa da mesma organização, sem duplicata (mesma pessoa,
--     organização, unidade e papel já vigente).
--
-- Quem pede: a Server Action passa o id de quem está logado (`p_ator`, lido da sessão no
-- servidor) e o banco confere de novo o papel dessa pessoa nos vínculos, como em
-- 20261024150000_senha_provisoria_conta_existente.sql. A função fica em public, mas o
-- EXECUTE é revogado de public, anon, authenticated e vini_operador (que ganha EXECUTE em
-- toda função nova de public pelos default privileges de 20261019180000) e concedido só
-- ao service_role: é o grant que protege, não o schema. O segundo fator do master é
-- conferido pelo `requireMaster()`.
--
-- Sessões da pessoa editada continuam válidas: o app (`getAcessoAtual`) e todo helper de
-- RLS leem o vínculo a cada request, então papel menor vale na próxima requisição.
-- Só acrescenta. Idempotente.

-- Devolve 'ok' ou o motivo: 'sem_mudanca', 'sem_permissao', 'nao_encontrado',
-- 'proprio_vinculo', 'vinculo_master', 'revogado', 'papel_invalido',
-- 'operacional_sem_unidade', 'unidade_invalida', 'fora_da_unidade', 'duplicado',
-- 'ultima_gestao'.
create or replace function public.editar_vinculo_acesso(
  p_ator uuid,
  p_vinculo_id uuid,
  p_escopo text,
  p_organizacao_id text,
  p_novo_role text,
  p_nova_unidade_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org text;
  v_alvo record;
  v_ator_master boolean;
  v_ator_gestao boolean;
  v_ator_unidade_fixa boolean := false;
  v_ator_unidade text;
  v_unidade_log text;
begin
  if p_ator is null or p_vinculo_id is null or p_escopo is null or p_escopo not in ('master', 'equipe') then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;

  -- O que se pede (antes de olhar quem pede: não depende de ninguém).
  if p_novo_role is null or p_novo_role not in ('gestao', 'operacional') then
    return 'papel_invalido';
  end if;
  if p_novo_role = 'operacional' and p_nova_unidade_id is null then
    return 'operacional_sem_unidade';
  end if;

  -- Quem pede (mesmo desenho de gerar_senha_provisoria_conta).
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

  -- Trava comum por organização antes do vínculo (mesma ordem de revogar_vinculo_equipe):
  -- duas edições ou edição + revogação no mesmo cliente fazem fila, sem deadlock.
  select organizacao_id into v_org from public.vinculos where id = p_vinculo_id;
  if not found then
    return 'nao_encontrado';
  end if;
  perform 1 from public.organizacoes where id = v_org for update;

  select id, user_id, organizacao_id, unidade_id, role, status into v_alvo
    from public.vinculos where id = p_vinculo_id for update;
  if not found or v_alvo.organizacao_id <> v_org then
    return 'nao_encontrado';
  end if;

  if p_escopo = 'equipe' then
    -- Mesma resposta para "não existe" e "não é seu" (não revela vínculo de outro cliente).
    if v_alvo.organizacao_id <> p_organizacao_id or v_alvo.role = 'master' then
      return 'nao_encontrado';
    end if;
    if v_ator_unidade_fixa and v_alvo.unidade_id is distinct from v_ator_unidade then
      return 'nao_encontrado';
    end if;
  elsif v_alvo.role = 'master' then
    return 'vinculo_master';
  end if;

  if v_alvo.user_id = p_ator then
    return 'proprio_vinculo';
  end if;
  if v_alvo.status = 'revogado' then
    return 'revogado';
  end if;

  -- Unidade nova: ativa e da organização do vínculo.
  if p_nova_unidade_id is not null and not exists (
    select 1 from public.unidades
     where id = p_nova_unidade_id and organizacao_id = v_alvo.organizacao_id and ativo = true
  ) then
    return 'unidade_invalida';
  end if;
  -- Gestor de uma unidade só não tira ninguém dela nem dá "todas as unidades".
  if v_ator_unidade_fixa and p_nova_unidade_id is distinct from v_ator_unidade then
    return 'fora_da_unidade';
  end if;

  if v_alvo.role = p_novo_role and v_alvo.unidade_id is not distinct from p_nova_unidade_id then
    return 'sem_mudanca';
  end if;

  if exists (
    select 1 from public.vinculos
     where user_id = v_alvo.user_id and organizacao_id = v_alvo.organizacao_id
       and unidade_id is not distinct from p_nova_unidade_id and role = p_novo_role
       and status in ('ativo', 'convidado') and id <> v_alvo.id
  ) then
    return 'duplicado';
  end if;

  -- Equipe nunca deixa o cliente sem gestão geral nem a unidade sem gestão
  -- (regra de revogar_vinculo_equipe, aplicada ao que a edição tira).
  if p_escopo = 'equipe' and v_alvo.role = 'gestao' and v_alvo.status = 'ativo' then
    if v_alvo.unidade_id is null
       and not (p_novo_role = 'gestao' and p_nova_unidade_id is null)
       and not exists (
         select 1 from public.vinculos
          where organizacao_id = v_alvo.organizacao_id and role = 'gestao' and status = 'ativo'
            and unidade_id is null and id <> v_alvo.id
       ) then
      return 'ultima_gestao';
    end if;
    if v_alvo.unidade_id is not null
       and not (p_novo_role = 'gestao' and (p_nova_unidade_id is null or p_nova_unidade_id = v_alvo.unidade_id))
       and not exists (
         select 1 from public.vinculos
          where organizacao_id = v_alvo.organizacao_id and role = 'gestao' and status = 'ativo'
            and (unidade_id is null or unidade_id = v_alvo.unidade_id) and id <> v_alvo.id
       ) then
      return 'ultima_gestao';
    end if;
  end if;

  begin
    update public.vinculos
       set role = p_novo_role, unidade_id = p_nova_unidade_id
     where id = v_alvo.id;
  exception when unique_violation then
    return 'duplicado';
  end;

  -- Auditoria na unidade nova, ou na antiga, ou na primeira unidade da organização.
  v_unidade_log := coalesce(p_nova_unidade_id, v_alvo.unidade_id);
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
  values (v_unidade_log, p_ator, 'editar_vinculo', 'vinculo', v_alvo.id::text,
          jsonb_build_object('role', v_alvo.role, 'unidadeId', v_alvo.unidade_id),
          jsonb_build_object('role', p_novo_role, 'unidadeId', p_nova_unidade_id, 'escopo', p_escopo,
                             'userId', v_alvo.user_id, 'organizacaoId', v_alvo.organizacao_id));
  return 'ok';
end;
$$;

revoke all on function public.editar_vinculo_acesso(uuid, uuid, text, text, text, text)
  from public, anon, authenticated, vini_operador;
grant execute on function public.editar_vinculo_acesso(uuid, uuid, text, text, text, text)
  to service_role;
