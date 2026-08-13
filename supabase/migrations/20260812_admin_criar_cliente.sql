-- Onboarding administrativo de cliente novo - função transacional que
-- substitui o processo manual (convite avulso no Supabase Auth + SQL solto
-- no SQL Editor) usado até aqui para Dom Quixote, Adega do Alemão e Dona
-- Ninguém.
--
-- Só cria organização/unidade/perfis/vínculos (efeito colateral 100% dentro
-- do Postgres). Convidar o usuário no Supabase Auth é feito antes, em
-- Node, com a service_role key (Postgres não tem como chamar a Auth Admin
-- API) - por isso esta função recebe o user_id já resolvido em
-- p_vinculos, não o e-mail.
--
-- Defesa em profundidade: mesmo que a Server Action que chama isso já
-- exija master + AAL2 (`requireMaster()`), a função revalida os dois de
-- novo aqui dentro. Ocultar o menu no frontend, ou até um bug futuro na
-- Server Action, nunca é suficiente sozinho - ver SECURITY.md.
--
-- Idempotente por construção, no mesmo padrão validado manualmente para a
-- Dona Ninguém (ver `_entrada/registros-sessoes` do Cérebro do Gestor,
-- 2026-08-11): organização/unidade/vínculo que já existirem precisam bater
-- exatamente com o esperado, senão a função aborta (toda ela roda dentro
-- de uma única transação implícita de função - qualquer exceção desfaz
-- tudo). Repetir a mesma chamada depois de um sucesso não duplica nada.

create or replace function public.admin_criar_cliente(
  p_organizacao_id text,
  p_organizacao_nome text,
  p_tipo_cliente text,
  p_unidade_id text,
  p_unidade_nome text,
  p_fonte_dados_estoque text,
  p_vinculos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_organizacao organizacoes%rowtype;
  v_unidade unidades%rowtype;
  v_organizacao_criada boolean := false;
  v_unidade_criada boolean := false;
  v_item jsonb;
  v_user_id uuid;
  v_nome text;
  v_role text;
  v_unidade_vinculo text;
  v_vinculo_existente vinculos%rowtype;
  v_vinculo_criado boolean;
  v_resultado_vinculos jsonb := '[]'::jsonb;
begin
  -- ── autorização (defesa em profundidade) ────────────────────────────
  if not exists (
    select 1 from vinculos v
    where v.user_id = auth.uid()
      and v.status = 'ativo'
      and v.role = 'master'
  ) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;

  if not public.tem_aal2() then
    raise exception 'Sessão sem segundo fator confirmado.' using errcode = '42501';
  end if;

  -- ── validação de entrada ─────────────────────────────────────────────
  if p_organizacao_id is null or length(trim(p_organizacao_id)) = 0
     or p_organizacao_nome is null or length(trim(p_organizacao_nome)) = 0
     or p_unidade_id is null or length(trim(p_unidade_id)) = 0
     or p_unidade_nome is null or length(trim(p_unidade_nome)) = 0 then
    raise exception 'Dados obrigatórios ausentes.' using errcode = '22023';
  end if;

  if p_tipo_cliente not in ('consultoria', 'saas', 'hybrid') then
    raise exception 'tipo_cliente inválido.' using errcode = '22023';
  end if;

  if p_fonte_dados_estoque not in ('planilha', 'banco') then
    raise exception 'fonte_dados_estoque inválida.' using errcode = '22023';
  end if;

  if p_vinculos is null or jsonb_typeof(p_vinculos) <> 'array' or jsonb_array_length(p_vinculos) = 0 then
    raise exception 'Lista de usuários vazia.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_vinculos) > 20 then
    raise exception 'Excedeu o limite de usuários por cadastro.' using errcode = '22023';
  end if;

  -- Papel nunca pode ser "master" nem qualquer outra coisa vinda da
  -- requisição - só os dois papéis que este fluxo tem permissão de criar.
  -- Confere isso antes de mexer em qualquer tabela.
  for v_item in select * from jsonb_array_elements(p_vinculos)
  loop
    v_role := v_item ->> 'role';
    if v_role is null or v_role not in ('gestao', 'operacional') then
      raise exception 'Papel inválido para vínculo novo.' using errcode = '22023';
    end if;
    if v_item ->> 'user_id' is null then
      raise exception 'Vínculo sem usuário resolvido.' using errcode = '22023';
    end if;
    v_unidade_vinculo := v_item ->> 'unidade_id';
    if v_role = 'operacional' and (v_unidade_vinculo is null or v_unidade_vinculo <> p_unidade_id) then
      raise exception 'Operacional precisa estar restrito à unidade criada.' using errcode = '22023';
    end if;
    if v_role = 'gestao' and v_unidade_vinculo is not null and v_unidade_vinculo <> p_unidade_id then
      raise exception 'Gestão só pode ser restrita à unidade criada, ou nenhuma.' using errcode = '22023';
    end if;
  end loop;

  -- ── organização: cria, ou valida que a existente bate exatamente ────
  select * into v_organizacao from organizacoes where id = p_organizacao_id;
  if found then
    if v_organizacao.nome is distinct from p_organizacao_nome
       or v_organizacao.tipo_cliente is distinct from p_tipo_cliente
       or v_organizacao.ativo is distinct from true then
      raise exception 'Organização já existe com dados divergentes.' using errcode = '23505';
    end if;
  else
    insert into organizacoes (id, nome, tipo_cliente, ativo)
    values (p_organizacao_id, p_organizacao_nome, p_tipo_cliente, true);
    v_organizacao_criada := true;
  end if;

  -- ── unidade: cria, ou valida que a existente bate exatamente ─────────
  select * into v_unidade from unidades where id = p_unidade_id;
  if found then
    if v_unidade.organizacao_id is distinct from p_organizacao_id
       or v_unidade.nome is distinct from p_unidade_nome
       or v_unidade.fonte_dados_estoque is distinct from p_fonte_dados_estoque
       or v_unidade.ativo is distinct from true then
      raise exception 'Unidade já existe com dados divergentes.' using errcode = '23505';
    end if;
  else
    insert into unidades (id, organizacao_id, nome, spreadsheet_id, fonte_dados_estoque, ativo)
    values (p_unidade_id, p_organizacao_id, p_unidade_nome, null, p_fonte_dados_estoque, true);
    v_unidade_criada := true;
  end if;

  -- ── perfis + vínculos, um por item da lista ──────────────────────────
  for v_item in select * from jsonb_array_elements(p_vinculos)
  loop
    v_user_id := (v_item ->> 'user_id')::uuid;
    v_nome := v_item ->> 'nome';
    v_role := v_item ->> 'role';
    v_unidade_vinculo := v_item ->> 'unidade_id';

    insert into perfis (id, nome)
    values (v_user_id, v_nome)
    on conflict (id) do nothing;

    select * into v_vinculo_existente
    from vinculos
    where user_id = v_user_id and organizacao_id = p_organizacao_id;

    if found then
      if v_vinculo_existente.role is distinct from v_role
         or v_vinculo_existente.unidade_id is distinct from v_unidade_vinculo
         or v_vinculo_existente.status is distinct from 'ativo' then
        raise exception 'Vínculo já existe com papel ou unidade divergente.' using errcode = '23505';
      end if;
      v_vinculo_criado := false;
    else
      insert into vinculos (user_id, organizacao_id, unidade_id, role, status)
      values (v_user_id, p_organizacao_id, v_unidade_vinculo, v_role, 'ativo');
      v_vinculo_criado := true;
    end if;

    v_resultado_vinculos := v_resultado_vinculos || jsonb_build_object(
      'user_id', v_user_id,
      'role', v_role,
      'unidade_id', v_unidade_vinculo,
      'criado', v_vinculo_criado
    );
  end loop;

  return jsonb_build_object(
    'organizacao_id', p_organizacao_id,
    'organizacao_criada', v_organizacao_criada,
    'unidade_id', p_unidade_id,
    'unidade_criada', v_unidade_criada,
    'vinculos', v_resultado_vinculos
  );
end;
$$;

comment on function public.admin_criar_cliente(text, text, text, text, text, text, jsonb) is
  'Onboarding administrativo (master + AAL2 apenas, revalidado internamente): cria organização, unidade, perfis e vínculos de forma transacional e idempotente. user_id de cada vínculo já vem resolvido do Supabase Auth - esta função nunca convida ninguém, só grava os registros de negócio.';

revoke all on function public.admin_criar_cliente(text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.admin_criar_cliente(text, text, text, text, text, text, jsonb) to authenticated;

-- ── busca de usuário existente por e-mail ───────────────────────────────
-- Usada pela Server Action antes de decidir se convida (e-mail novo) ou só
-- vincula (e-mail já tem conta no Supabase Auth). Le direto de `auth.users`
-- porque isso não é exposto via API REST normal - só alcançável de dentro
-- do Postgres. Só leitura, sem `service_role` - o convite em si (que exige
-- a Auth Admin API de verdade, chamada de Node) continua sendo o único
-- lugar que usa `service_role`.
--
-- Garantias, uma por uma:
--   1. Master global + AAL2 exigido por dentro da função (mesmas duas
--      checagens de `admin_criar_cliente`, repetidas aqui porque cada
--      função SQL se defende sozinha - não herda a autorização de quem a
--      chamou antes na mesma request).
--   2. Devolve só `uuid` (o id) - nunca email, nome, telefone, metadata,
--      `confirmed_at` ou qualquer outro campo de `auth.users`. O chamador
--      (Server Action) já sabe o e-mail que perguntou; não precisa de mais
--      nada pra decidir "convida" vs "só vincula".
--   3. Não é enumeração geral: só resolve UM e-mail exato por chamada, sem
--      LIKE/ILIKE, sem paginação, sem listagem - não dá pra pedir "todos os
--      e-mails que começam com X" nem "próxima página de usuários". Quem
--      chama já precisa saber o e-mail exato de antemão (é o que a pessoa
--      master digitou no formulário). Ficar tentando emails ao acaso pra
--      "descobrir" quem está cadastrado é limitado pelo mesmo rate limit
--      de `admin_criar_cliente` (10 chamadas/hora, cada uma com até 20
--      e-mails) - não existe uma rota separada e sem limite só pra isso.
--   4. E-mail normalizado dos dois lados da comparação (`lower(email) =
--      lower(trim(p_email))`) - maiúscula/minúscula ou espaço colado não
--      escondem nem duplicam um cadastro.
--   5. `search_path` fixo (`public, auth, pg_catalog`) - obrigatório pra
--      alcançar `auth.users` de dentro de uma função `SECURITY DEFINER`
--      sem abrir brecha de search_path hijacking.
--   6. `revoke all ... from public, anon` + só `grant ... to authenticated`
--      - mesmo padrão de toda função administrativa deste projeto
--      (`checar_rate_limit`, `admin_criar_cliente`): o papel `authenticated`
--      do Postgres é compartilhado por qualquer pessoa logada (não existe
--      papel nativo do Postgres por `gestao`/`operacional`/`master` - isso
--      é modelado na tabela `vinculos`, não em ROLE do banco), então quem
--      trava "usuário comum não passa" é mesmo a checagem 1 aqui dentro,
--      não o GRANT. `anon`/`public` continuam impedidos de chamar de
--      qualquer jeito.
create or replace function public.admin_buscar_usuario_por_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_id uuid;
begin
  if not exists (
    select 1 from vinculos v
    where v.user_id = auth.uid() and v.status = 'ativo' and v.role = 'master'
  ) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;

  if not public.tem_aal2() then
    raise exception 'Sessão sem segundo fator confirmado.' using errcode = '42501';
  end if;

  if p_email is null or length(trim(p_email)) = 0 then
    raise exception 'E-mail obrigatório.' using errcode = '22023';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;

  return v_user_id;
end;
$$;

comment on function public.admin_buscar_usuario_por_email(text) is
  'Onboarding administrativo (master + AAL2 apenas, revalidado internamente): devolve o user_id de um e-mail já cadastrado no Supabase Auth, ou null se for novo. Só leitura.';

revoke all on function public.admin_buscar_usuario_por_email(text) from public, anon;
grant execute on function public.admin_buscar_usuario_por_email(text) to authenticated;

-- ── rollback manual (referência, não executa) ──────────────────────────
-- drop function public.admin_criar_cliente(text, text, text, text, text, text, jsonb);
-- drop function public.admin_buscar_usuario_por_email(text);
-- Reversível sem risco: as funções não alteram schema, só passam a faltar
-- (a Server Action que as chama voltaria a falhar até reverter também o
-- código, o que já tira a página do ar).
