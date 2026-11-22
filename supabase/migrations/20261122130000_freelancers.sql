-- Freelancers: check-in por QR Code na loja, conferência do gerente e diária no Contas a Pagar
-- (pedido de Vinícius, 12/11/2026; desenho aprovado pela Agenda em 22/11/2026).
--
--   unidades.freelancers_habilitado   módulo ligado na unidade (só master liga; nasce desligado)
--   permissoes_modulo / funções       chave nova 'freelancers'. Gestão e master conferem; a operação
--                                     começa sem acesso e o dono pode liberar "ver" ou "editar" para
--                                     o gerente que é operacional (teto da operação = "editar").
--   freela_configuracoes              uma por unidade: endereço fixo do QR (slug), diária padrão,
--                                     conta do caixa que paga a diária, check-in aberto ou não
--   freelancers                       cadastro (nome, WhatsApp, função, diária). Quem faz check-in
--                                     sem cadastro entra como "novo" e o gerente aprova ao conferir.
--   freela_checkins                   um por pessoa por dia. Pendente -> conferido | recusado.
--                                     Grava pelo QR só pela RPC do servidor (hash de IP e aparelho,
--                                     nunca o IP puro) ou à mão pelo gerente ("esqueceu do QR").
--
-- Contas a Pagar: o Financeiro Gerencial é exclusivo de Vinícius (fin_acesso_exclusivo), então o
-- gerente nunca grava em fin_*. Conferir só muda o check-in; logo depois o servidor (service role,
-- sem sessão de usuário) roda `freela_sincronizar_titulos`, que cria a despesa na conta de código
-- 'cmo_freelancers' (competência e vencimento = dia trabalhado, 1 parcela, origem 'freelancer') e,
-- se foi "pago pelo caixa", a baixa na conta do caixa: o título nasce quitado. Sem Financeiro
-- ligado, sem a conta Freelancers, com o mês fechado ou sem conta de caixa, a diária fica
-- "conferida, sem título" com o motivo, e o título nasce na próxima sincronização que puder.
-- Como os gatilhos do Financeiro não agem sem sessão (auth.uid() nulo), a função repete aqui as
-- regras que importam: conta-folha ativa, mês aberto, baixa só no caixa, status da parcela.
--
-- Desfazer conferência: o gerente volta a diária para pendente enquanto o título não tem
-- pagamento. Já paga (inclusive pelo caixa), o estorno fica com Vinícius no Financeiro.
--
-- Aditivo: nenhuma coluna existente muda. Funções existentes recriadas: `permissao_chave_liberada`,
-- `permissao_nivel_maximo` (operacional + freelancers = editar) e `salvar_permissoes_modulo`
-- (mesmo corpo de 20261112180000_avaliacoes_qr.sql, com a chave nova). O check de origem de
-- fin_lancamentos ganha 'freelancer'. Aplicar ANTES de publicar o app.
--
-- Desfazer: `drop table freela_checkins, freelancers, freela_configuracoes cascade;` + recriar as
-- três funções de permissão sem 'freelancers' (apagar antes as linhas de permissoes_modulo com
-- 'freelancers') + voltar o check de origem (sem lançamentos 'freelancer').

begin;

-- ══ 1. Módulo ligado por unidade ═════════════════════════════════════════
alter table public.unidades
  add column if not exists freelancers_habilitado boolean not null default false;

-- ══ 2. Permissão por módulo: chave 'freelancers' ═════════════════════════
alter table public.permissoes_modulo drop constraint if exists permissoes_modulo_modulo_check;
alter table public.permissoes_modulo
  add constraint permissoes_modulo_modulo_check check (modulo in (
    'estoque', 'vendas', 'financeiro', 'cardapio', 'garante', 'avaliacoes', 'freelancers', 'equipe', 'relatorios',
    'cadastros', 'configuracoes', 'financeiro.apagar_lancamento', 'financeiro.fechar_mes', 'vendas.editar_dia_lancado'
  ));

create or replace function public.permissao_chave_liberada(p_chave text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_chave in (
    'estoque', 'vendas', 'financeiro', 'cardapio', 'garante', 'avaliacoes', 'freelancers', 'equipe', 'relatorios',
    'cadastros', 'configuracoes', 'financeiro.apagar_lancamento', 'financeiro.fechar_mes', 'vendas.editar_dia_lancado'
  );
$$;

-- antes (20261026120000_titular_e_chef.sql): sem a linha de 'freelancers'. O padrão da operação
-- continua "sem acesso"; o teto sobe para "editar" para o dono liberar o gerente operacional.
create or replace function public.permissao_nivel_maximo(p_role text, p_org_inteira boolean, p_chave text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_role = 'gestao' and p_chave = 'configuracoes' then 'ver'
    when p_role = 'operacional' and p_chave = 'cardapio' then 'chef'
    when p_role = 'operacional' and p_chave = 'freelancers' then 'editar'
    else public.permissao_nivel_padrao(p_role, p_org_inteira, p_chave)
  end;
$$;

-- antes (20261112180000_avaliacoes_qr.sql): mesma função sem 'freelancers' em c_chaves.
create or replace function public.salvar_permissoes_modulo(
  p_ator uuid,
  p_organizacao_id text,
  p_vinculo_id uuid,
  p_niveis jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_chaves constant text[] := array[
    'estoque', 'vendas', 'financeiro', 'cardapio', 'garante', 'avaliacoes', 'freelancers', 'equipe', 'relatorios',
    'cadastros', 'configuracoes', 'financeiro.apagar_lancamento', 'financeiro.fechar_mes', 'vendas.editar_dia_lancado'
  ];
  v_par record;
  v_alvo record;
  v_alvo_dono boolean;
  v_ator_master boolean;
  v_ator_dono boolean;
  v_chave text;
  v_nivel text;
  v_padrao text;
  v_novas jsonb := '{}'::jsonb;
  v_antigas jsonb;
  v_unidade_log text;
begin
  if p_ator is null or p_organizacao_id is null or p_vinculo_id is null then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;
  if p_niveis is null or jsonb_typeof(p_niveis) <> 'object' then
    return 'pedido_invalido';
  end if;
  for v_par in select key, value from jsonb_each(p_niveis) loop
    if not (v_par.key = any (c_chaves))
       or jsonb_typeof(v_par.value) <> 'string'
       or (v_par.value #>> '{}') not in ('sem_acesso', 'ver', 'chef', 'editar')
       or ((v_par.value #>> '{}') = 'chef' and v_par.key <> 'cardapio') then
      return 'pedido_invalido';
    end if;
  end loop;

  if not exists (
    select 1 from public.organizacoes
     where id = p_organizacao_id and ativo = true and equipe_habilitado = true
  ) then
    return 'sem_permissao';
  end if;
  if not public.organizacao_no_piloto_permissoes(p_organizacao_id) then
    return 'fora_do_piloto';
  end if;

  v_ator_master := exists (
    select 1 from public.vinculos where user_id = p_ator and status = 'ativo' and role = 'master'
  );
  v_ator_dono := exists (
    select 1 from public.vinculos v
     where v.user_id = p_ator and v.status = 'ativo' and v.role = 'gestao'
       and v.organizacao_id = p_organizacao_id
       and public.vinculo_e_dono(v.id)
       and not exists (
         select 1 from public.permissoes_modulo p
          where p.vinculo_id = v.id and p.modulo = 'equipe' and p.nivel <> 'editar'
       )
  );
  if not v_ator_master and not v_ator_dono then
    return 'sem_permissao';
  end if;

  perform 1 from public.organizacoes where id = p_organizacao_id for update;
  select id, user_id, organizacao_id, unidade_id, role, status into v_alvo
    from public.vinculos where id = p_vinculo_id for update;
  if not found or v_alvo.organizacao_id <> p_organizacao_id or v_alvo.role = 'master' then
    return 'nao_encontrado';
  end if;
  if v_alvo.user_id = p_ator then
    return 'proprio_vinculo';
  end if;
  if v_alvo.status = 'revogado' then
    return 'revogado';
  end if;
  v_alvo_dono := public.vinculo_e_dono(v_alvo.id);
  if not v_ator_master and v_alvo_dono then
    return 'alvo_dono';
  end if;

  foreach v_chave in array c_chaves loop
    v_padrao := public.permissao_nivel_padrao(v_alvo.role, v_alvo_dono, v_chave);
    v_nivel := coalesce(p_niveis ->> v_chave, v_padrao);
    if public.permissao_nivel_rank(v_nivel)
       > public.permissao_nivel_rank(public.permissao_nivel_maximo(v_alvo.role, v_alvo_dono, v_chave)) then
      return 'acima_do_papel';
    end if;
    if position('.' in v_chave) > 0 and v_nivel in ('ver', 'chef') then
      return 'pedido_invalido';
    end if;
    if v_nivel <> v_padrao then
      if not public.permissao_chave_liberada(v_chave) then
        return 'modulo_indisponivel';
      end if;
      v_novas := v_novas || jsonb_build_object(v_chave, v_nivel);
    end if;
  end loop;

  select coalesce(jsonb_object_agg(modulo, nivel), '{}'::jsonb) into v_antigas
    from public.permissoes_modulo where vinculo_id = v_alvo.id;
  if v_antigas = v_novas then
    return 'sem_mudanca';
  end if;

  delete from public.permissoes_modulo where vinculo_id = v_alvo.id;
  insert into public.permissoes_modulo (vinculo_id, modulo, nivel, atualizado_por)
  select v_alvo.id, e.key, e.value, p_ator from jsonb_each_text(v_novas) e;

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
  values (v_unidade_log, p_ator, 'editar_permissoes_modulo', 'vinculo', v_alvo.id::text,
          jsonb_build_object('excecoes', v_antigas),
          jsonb_build_object('excecoes', v_novas, 'userId', v_alvo.user_id, 'role', v_alvo.role,
                             'organizacaoId', v_alvo.organizacao_id));
  return 'ok';
end;
$$;

revoke all on function public.salvar_permissoes_modulo(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_permissoes_modulo(uuid, text, uuid, jsonb) to service_role;
revoke execute on function public.salvar_permissoes_modulo(uuid, text, uuid, jsonb) from vini_operador;

-- Quem usa o módulo nesta unidade: módulo ligado; master com segundo fator; gestão que alcança a
-- unidade (sem exceção abaixo de `p_nivel`); operação só com exceção gravada de pelo menos
-- `p_nivel` (o padrão dela é "sem acesso" e `pode_modulo` só restringe, nunca libera).
create or replace function public.usuario_pode_usar_freelancers(p_unidade_id text, p_nivel text default 'ver')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_nivel in ('ver', 'editar')
    and public.sessao_vigente()
    and public.usuario_tem_acesso_unidade(p_unidade_id, array['gestao', 'operacional'])
    and exists (select 1 from public.unidades u where u.id = p_unidade_id and u.freelancers_habilitado)
    and public.pode_modulo('freelancers', p_nivel, p_unidade_id)
    and exists (
      select 1
        from public.vinculos v
        join public.unidades u on u.id = p_unidade_id
       where v.user_id = auth.uid() and v.status = 'ativo'
         and (
           (v.role = 'master' and auth.jwt() ->> 'aal' = 'aal2')
           or (v.role = 'gestao' and v.organizacao_id = u.organizacao_id
               and (v.unidade_id is null or v.unidade_id = u.id))
           or (v.role = 'operacional' and v.organizacao_id = u.organizacao_id
               and (v.unidade_id is null or v.unidade_id = u.id)
               and exists (
                 select 1 from public.permissoes_modulo p
                  where p.vinculo_id = v.id and p.modulo = 'freelancers'
                    and public.permissao_nivel_rank(p.nivel) >= public.permissao_nivel_rank(p_nivel)
               ))
         )
    );
$$;
revoke all on function public.usuario_pode_usar_freelancers(text, text) from public, anon;
grant execute on function public.usuario_pode_usar_freelancers(text, text) to authenticated;

-- ══ 3. Origem nova no lançamento financeiro ══════════════════════════════
-- antes (20260922100000_financeiro_gerencial_v1_completa.sql): ('comum', 'recorrencia', 'liquidacao_provisao').
alter table public.fin_lancamentos drop constraint if exists fin_lancamentos_origem_check;
alter table public.fin_lancamentos add constraint fin_lancamentos_origem_check
  check (origem in ('comum', 'recorrencia', 'liquidacao_provisao', 'freelancer'));

-- ══ 4. Tabelas ═══════════════════════════════════════════════════════════
create table if not exists public.freela_configuracoes (
  unidade_id text primary key references public.unidades(id) on delete restrict,
  -- Endereço público fixo: /freela/<slug>. Não muda pela tela (o QR impresso apontaria para o antigo).
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  -- Valor sugerido na conferência quando o freelancer não tem diária própria. Nulo = sem sugestão.
  diaria_padrao numeric(10,2) check (diaria_padrao is null or diaria_padrao between 1 and 10000),
  -- Conta do caixa que paga a diária ("pago pelo caixa"). Nula = a única conta de caixa ativa.
  conta_caixa_id uuid,
  -- Check-in aberto. Fechado, a página do QR mostra um aviso e não grava.
  ativa boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (unidade_id, conta_caixa_id) references public.fin_contas_financeiras(unidade_id, id)
);

create table if not exists public.freelancers (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id) on delete restrict,
  nome text not null check (char_length(btrim(nome)) between 2 and 80),
  whatsapp text not null check (whatsapp ~ '^55[1-9][0-9]{9,10}$'),
  funcao text check (funcao is null or char_length(btrim(funcao)) between 2 and 40),
  -- Diária combinada com a pessoa. Nula = vale a diária padrão da unidade.
  diaria numeric(10,2) check (diaria is null or diaria between 1 and 10000),
  -- novo: entrou pelo QR sem cadastro (o gerente aprova ao conferir); inativo: não trabalha mais.
  situacao text not null default 'ativo' check (situacao in ('novo', 'ativo', 'inativo')),
  -- Nulo = cadastro que nasceu pelo QR.
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, whatsapp),
  unique (unidade_id, id)
);

create table if not exists public.freela_checkins (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id) on delete restrict,
  freelancer_id uuid not null,
  -- Dia trabalhado no fuso da operação (America/Sao_Paulo).
  dia date not null,
  entrada_em timestamptz not null default now(),
  origem text not null default 'qr' check (origem in ('qr', 'manual')),
  -- O que a pessoa digitou no QR (a tela mostra o nome do cadastro em destaque e este ao lado).
  nome_digitado text check (nome_digitado is null or char_length(nome_digitado) between 2 and 80),
  -- Antispam e alerta de aparelho repetido: SHA-256 com sal do servidor. Nunca o IP puro.
  hash_ip text check (hash_ip is null or hash_ip ~ '^[0-9a-f]{64}$'),
  hash_dispositivo text check (hash_dispositivo is null or hash_dispositivo ~ '^[0-9a-f]{64}$'),
  -- O mesmo aparelho fez check-in de mais de uma pessoa neste dia.
  aparelho_repetido boolean not null default false,
  estado text not null default 'pendente' check (estado in ('pendente', 'conferido', 'recusado')),
  valor numeric(10,2) check (valor is null or valor between 1 and 10000),
  pago_no_caixa boolean not null default false,
  motivo_recusa text check (motivo_recusa is null or char_length(btrim(motivo_recusa)) between 2 and 200),
  conferido_por uuid references auth.users(id) on delete restrict,
  conferido_em timestamptz,
  -- Título no Contas a Pagar. Nulo com titulo_gerado_em preenchido = apagado no Financeiro.
  lancamento_id uuid references public.fin_lancamentos(id) on delete set null,
  titulo_gerado_em timestamptz,
  -- Título de uma conferência desfeita, esperando o servidor apagar.
  titulo_a_remover uuid,
  -- Por que a diária conferida ainda não virou título.
  titulo_aviso text check (titulo_aviso is null or titulo_aviso in (
    'financeiro_desligado', 'sem_conta_freelancers', 'mes_fechado', 'sem_conta_caixa', 'titulo_ja_pago')),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (freelancer_id, dia),
  foreign key (unidade_id, freelancer_id) references public.freelancers(unidade_id, id) on delete restrict,
  check ((origem = 'qr') = (hash_ip is not null and hash_dispositivo is not null)),
  check ((estado = 'pendente') = (conferido_em is null and conferido_por is null)),
  check ((estado = 'conferido') = (valor is not null)),
  check (not pago_no_caixa or estado = 'conferido'),
  check ((estado = 'recusado') = (motivo_recusa is not null)),
  check (lancamento_id is null or estado = 'conferido')
);
create index if not exists freela_checkins_unidade_dia on public.freela_checkins (unidade_id, dia desc);
create index if not exists freela_checkins_sem_titulo on public.freela_checkins (unidade_id)
  where estado = 'conferido' and titulo_gerado_em is null;
create index if not exists freela_checkins_a_remover on public.freela_checkins (unidade_id) where titulo_a_remover is not null;
create index if not exists freela_checkins_aparelho on public.freela_checkins (unidade_id, dia, hash_dispositivo);
create index if not exists freela_checkins_ip on public.freela_checkins (unidade_id, dia, hash_ip);
create index if not exists freela_checkins_lancamento on public.freela_checkins (lancamento_id) where lancamento_id is not null;

drop trigger if exists tocar_atualizado_em on public.freela_configuracoes;
create trigger tocar_atualizado_em before update on public.freela_configuracoes
  for each row execute function public.tocar_atualizado_em();
drop trigger if exists tocar_atualizado_em on public.freelancers;
create trigger tocar_atualizado_em before update on public.freelancers
  for each row execute function public.tocar_atualizado_em();

-- ══ 5. RLS e privilégios ═════════════════════════════════════════════════
alter table public.freela_configuracoes enable row level security;
alter table public.freelancers enable row level security;
alter table public.freela_checkins enable row level security;

revoke all on table public.freela_configuracoes, public.freelancers, public.freela_checkins
  from public, anon, authenticated;

grant select on table public.freela_configuracoes, public.freelancers to authenticated;
-- Hashes fora do alcance da sessão (privilégio de coluna): o app lê lista explícita de colunas.
grant select (
  id, unidade_id, freelancer_id, dia, entrada_em, origem, nome_digitado, aparelho_repetido, estado, valor,
  pago_no_caixa, motivo_recusa, conferido_por, conferido_em, lancamento_id, titulo_gerado_em, titulo_a_remover,
  titulo_aviso, criado_por, criado_em
) on public.freela_checkins to authenticated;

drop policy if exists freela_configuracoes_select on public.freela_configuracoes;
create policy freela_configuracoes_select on public.freela_configuracoes for select to authenticated
  using (public.usuario_pode_usar_freelancers(unidade_id, 'ver'));
drop policy if exists freelancers_select on public.freelancers;
create policy freelancers_select on public.freelancers for select to authenticated
  using (public.usuario_pode_usar_freelancers(unidade_id, 'ver'));
drop policy if exists freela_checkins_select on public.freela_checkins;
create policy freela_checkins_select on public.freela_checkins for select to authenticated
  using (public.usuario_pode_usar_freelancers(unidade_id, 'ver'));

-- Sem policy nem grant de escrita: toda escrita passa pelas RPCs abaixo.
grant select, insert, update, delete on table public.freela_configuracoes, public.freelancers,
  public.freela_checkins to service_role;

-- Operador do Vini (default privileges de 20261019180000): só lê.
revoke insert, update, delete, truncate on table public.freela_configuracoes, public.freelancers,
  public.freela_checkins from vini_operador;
grant select on table public.freela_configuracoes, public.freelancers, public.freela_checkins to vini_operador;
do $$
declare
  t text;
begin
  foreach t in array array['freela_configuracoes', 'freelancers', 'freela_checkins'] loop
    execute format('drop policy if exists vini_operador_leitura on public.%I', t);
    execute format('create policy vini_operador_leitura on public.%I for select to vini_operador using (true)', t);
  end loop;
end $$;

-- ══ 6. Gestão: configurar e cadastrar ════════════════════════════════════

-- Hoje no fuso da operação.
create or replace function public.freela_hoje(p_agora timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select (p_agora at time zone 'America/Sao_Paulo')::date;
$$;

-- Conta de caixa que paga a diária: a escolhida (se ainda for caixa ativa da unidade) ou, sem
-- escolha, a única conta de caixa ativa. Nula = não dá para pagar pelo caixa.
create or replace function public.freela_conta_caixa(p_unidade_id text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_escolhida uuid;
  v_id uuid;
begin
  select conta_caixa_id into v_escolhida from public.freela_configuracoes where unidade_id = p_unidade_id;
  if v_escolhida is not null then
    select id into v_id from public.fin_contas_financeiras
     where unidade_id = p_unidade_id and id = v_escolhida and tipo = 'caixa' and ativo;
    return v_id;
  end if;
  if (select count(*) from public.fin_contas_financeiras
       where unidade_id = p_unidade_id and tipo = 'caixa' and ativo) = 1 then
    select id into v_id from public.fin_contas_financeiras
     where unidade_id = p_unidade_id and tipo = 'caixa' and ativo;
  end if;
  return v_id;
end;
$$;
revoke all on function public.freela_conta_caixa(text) from public, anon, authenticated;

create or replace function public.freela_criar_configuracao(p_unidade_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_nome text;
  v_base text;
  v_n integer := 1;
begin
  if not public.usuario_pode_usar_freelancers(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('freela_config:' || p_unidade_id, 0));
  select slug into v_slug from public.freela_configuracoes where unidade_id = p_unidade_id;
  if v_slug is not null then
    return v_slug;
  end if;

  select btrim(nome) into v_nome from public.unidades where id = p_unidade_id;
  v_base := lower(translate(coalesce(v_nome, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'));
  v_base := btrim(regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'), '-');
  v_base := btrim(left(v_base, 30), '-');
  if char_length(v_base) < 2 then
    v_base := 'restaurante';
  end if;
  v_slug := v_base;
  while exists (select 1 from public.freela_configuracoes where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  end loop;

  insert into public.freela_configuracoes (unidade_id, slug, criado_por) values (p_unidade_id, v_slug, auth.uid());
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_novos)
  values (p_unidade_id, auth.uid(), 'freela_criar_configuracao', 'freela_configuracao', p_unidade_id,
          jsonb_build_object('slug', v_slug));
  return v_slug;
end;
$$;
revoke all on function public.freela_criar_configuracao(text) from public, anon;
grant execute on function public.freela_criar_configuracao(text) to authenticated;

-- Diária padrão, conta do caixa e check-in aberto. Devolve 'ok' ou o código do problema.
create or replace function public.freela_salvar_configuracao(
  p_unidade_id text,
  p_diaria_padrao numeric,
  p_conta_caixa_id uuid,
  p_ativa boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
begin
  if not public.usuario_pode_usar_freelancers(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_diaria_padrao is not null and (p_diaria_padrao < 1 or p_diaria_padrao > 10000) then
    return 'diaria_invalida';
  end if;
  if p_conta_caixa_id is not null and not exists (
    select 1 from public.fin_contas_financeiras
     where unidade_id = p_unidade_id and id = p_conta_caixa_id and tipo = 'caixa' and ativo
  ) then
    return 'conta_invalida';
  end if;
  select to_jsonb(c) into v_antes from public.freela_configuracoes c where unidade_id = p_unidade_id for update;
  if v_antes is null then
    return 'sem_configuracao';
  end if;
  update public.freela_configuracoes
     set diaria_padrao = round(p_diaria_padrao, 2), conta_caixa_id = p_conta_caixa_id, ativa = coalesce(p_ativa, true)
   where unidade_id = p_unidade_id;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (p_unidade_id, auth.uid(), 'freela_salvar_configuracao', 'freela_configuracao', p_unidade_id,
          v_antes - 'criado_em' - 'atualizado_em',
          jsonb_build_object('diaria_padrao', p_diaria_padrao, 'conta_caixa_id', p_conta_caixa_id, 'ativa', p_ativa));
  return 'ok';
end;
$$;
revoke all on function public.freela_salvar_configuracao(text, numeric, uuid, boolean) from public, anon;
grant execute on function public.freela_salvar_configuracao(text, numeric, uuid, boolean) to authenticated;

-- Cria (p_id nulo) ou edita um freelancer. WhatsApp já normalizado pelo app (55 + DDD + número).
-- Devolve jsonb {ok, id} ou {ok:false, codigo}.
create or replace function public.freela_salvar_freelancer(
  p_unidade_id text,
  p_id uuid,
  p_nome text,
  p_whatsapp text,
  p_funcao text,
  p_diaria numeric,
  p_situacao text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_antes jsonb;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_funcao text := nullif(btrim(coalesce(p_funcao, '')), '');
begin
  if not public.usuario_pode_usar_freelancers(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if char_length(v_nome) not between 2 and 80 then
    return jsonb_build_object('ok', false, 'codigo', 'nome_invalido');
  end if;
  if p_whatsapp is null or p_whatsapp !~ '^55[1-9][0-9]{9,10}$' then
    return jsonb_build_object('ok', false, 'codigo', 'whatsapp_invalido');
  end if;
  if v_funcao is not null and char_length(v_funcao) not between 2 and 40 then
    return jsonb_build_object('ok', false, 'codigo', 'funcao_invalida');
  end if;
  if p_diaria is not null and (p_diaria < 1 or p_diaria > 10000) then
    return jsonb_build_object('ok', false, 'codigo', 'diaria_invalida');
  end if;
  if coalesce(p_situacao, '') not in ('ativo', 'inativo') then
    return jsonb_build_object('ok', false, 'codigo', 'situacao_invalida');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('freela_whatsapp:' || p_unidade_id || ':' || p_whatsapp, 0));
  if exists (select 1 from public.freelancers
              where unidade_id = p_unidade_id and whatsapp = p_whatsapp and id is distinct from p_id) then
    return jsonb_build_object('ok', false, 'codigo', 'whatsapp_repetido');
  end if;

  if p_id is null then
    insert into public.freelancers (unidade_id, nome, whatsapp, funcao, diaria, situacao, criado_por)
    values (p_unidade_id, v_nome, p_whatsapp, v_funcao, round(p_diaria, 2), p_situacao, auth.uid())
    returning id into v_id;
  else
    select to_jsonb(f) into v_antes from public.freelancers f
     where id = p_id and unidade_id = p_unidade_id for update;
    if v_antes is null then
      return jsonb_build_object('ok', false, 'codigo', 'nao_encontrado');
    end if;
    update public.freelancers
       set nome = v_nome, whatsapp = p_whatsapp, funcao = v_funcao, diaria = round(p_diaria, 2), situacao = p_situacao
     where id = p_id
    returning id into v_id;
  end if;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (p_unidade_id, auth.uid(), case when p_id is null then 'freela_cadastrar' else 'freela_editar' end,
          'freelancer', v_id::text, v_antes - 'criado_em' - 'atualizado_em',
          jsonb_build_object('nome', v_nome, 'funcao', v_funcao, 'diaria', p_diaria, 'situacao', p_situacao));
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.freela_salvar_freelancer(text, uuid, text, text, text, numeric, text) from public, anon;
grant execute on function public.freela_salvar_freelancer(text, uuid, text, text, text, numeric, text) to authenticated;

-- ══ 7. Gestão: conferir, recusar, desfazer, lançar à mão ═════════════════

-- Diária trabalhada vira "conferida" com o valor; "pago pelo caixa" marca que o caixa pagou.
-- Quem entrou como "novo" passa a "ativo" (o gerente aprovou). O título nasce depois, pelo
-- servidor (`freela_sincronizar_titulos`). Devolve 'ok' ou o código do problema.
create or replace function public.freela_conferir(p_checkin_id uuid, p_valor numeric, p_pago_no_caixa boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_fin boolean;
begin
  select c.id, c.unidade_id, c.freelancer_id, c.dia, c.estado into v_c
    from public.freela_checkins c where c.id = p_checkin_id for update;
  if not found or not public.usuario_pode_usar_freelancers(v_c.unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_c.estado <> 'pendente' then
    return 'ja_conferido';
  end if;
  if p_valor is null or p_valor < 1 or p_valor > 10000 then
    return 'valor_invalido';
  end if;
  select financeiro_gerencial_habilitado into v_fin from public.unidades where id = v_c.unidade_id;
  if v_fin and exists (
    select 1 from public.fin_fechamentos f
     where f.unidade_id = v_c.unidade_id and f.competencia = date_trunc('month', v_c.dia)::date and f.fechado
  ) then
    return 'mes_fechado';
  end if;
  if v_fin and coalesce(p_pago_no_caixa, false) and public.freela_conta_caixa(v_c.unidade_id) is null then
    return 'sem_conta_caixa';
  end if;

  update public.freela_checkins
     set estado = 'conferido', valor = round(p_valor, 2), pago_no_caixa = coalesce(p_pago_no_caixa, false),
         conferido_por = auth.uid(), conferido_em = now(), titulo_aviso = null
   where id = v_c.id;
  update public.freelancers set situacao = 'ativo' where id = v_c.freelancer_id and situacao = 'novo';
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_novos)
  values (v_c.unidade_id, auth.uid(), 'freela_conferir', 'freela_checkin', v_c.id::text,
          jsonb_build_object('dia', v_c.dia, 'valor', p_valor, 'pagoNoCaixa', coalesce(p_pago_no_caixa, false)));
  return 'ok';
end;
$$;
revoke all on function public.freela_conferir(uuid, numeric, boolean) from public, anon;
grant execute on function public.freela_conferir(uuid, numeric, boolean) to authenticated;

-- A pessoa não trabalhou (ou o check-in não é de verdade). Não gera título.
create or replace function public.freela_recusar(p_checkin_id uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  select c.id, c.unidade_id, c.estado into v_c from public.freela_checkins c where c.id = p_checkin_id for update;
  if not found or not public.usuario_pode_usar_freelancers(v_c.unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_c.estado <> 'pendente' then
    return 'ja_conferido';
  end if;
  if char_length(v_motivo) not between 2 and 200 then
    return 'motivo_invalido';
  end if;
  update public.freela_checkins
     set estado = 'recusado', motivo_recusa = v_motivo, conferido_por = auth.uid(), conferido_em = now()
   where id = v_c.id;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_novos)
  values (v_c.unidade_id, auth.uid(), 'freela_recusar', 'freela_checkin', v_c.id::text,
          jsonb_build_object('motivo', v_motivo));
  return 'ok';
end;
$$;
revoke all on function public.freela_recusar(uuid, text) from public, anon;
grant execute on function public.freela_recusar(uuid, text) to authenticated;

-- Volta para pendente. Conferida com título já pago (pelo caixa ou depois): não volta, o estorno é
-- no Financeiro. Título sem pagamento fica marcado para o servidor apagar.
create or replace function public.freela_desfazer(p_checkin_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
begin
  select c.id, c.unidade_id, c.estado, c.pago_no_caixa, c.lancamento_id, c.titulo_gerado_em, c.valor, c.titulo_a_remover
    into v_c from public.freela_checkins c where c.id = p_checkin_id for update;
  if not found or not public.usuario_pode_usar_freelancers(v_c.unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_c.estado = 'pendente' then
    return 'ja_pendente';
  end if;
  if v_c.lancamento_id is not null and exists (
    select 1 from public.fin_parcelas p join public.fin_baixas b on b.parcela_id = p.id
     where p.lancamento_id = v_c.lancamento_id
  ) then
    return 'ja_pago';
  end if;
  if v_c.lancamento_id is null and v_c.titulo_gerado_em is not null then
    -- O título foi apagado no Financeiro: desfazer aqui não traz de volta.
    return 'titulo_apagado';
  end if;
  if v_c.titulo_a_remover is not null and v_c.lancamento_id is not null then
    return 'aguarde';
  end if;
  update public.freela_checkins
     set estado = 'pendente', valor = null, pago_no_caixa = false, motivo_recusa = null,
         conferido_por = null, conferido_em = null, titulo_aviso = null,
         titulo_a_remover = coalesce(v_c.lancamento_id, titulo_a_remover), lancamento_id = null, titulo_gerado_em = null
   where id = v_c.id;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos)
  values (v_c.unidade_id, auth.uid(), 'freela_desfazer', 'freela_checkin', v_c.id::text,
          jsonb_build_object('estado', v_c.estado, 'valor', v_c.valor, 'lancamentoId', v_c.lancamento_id));
  return 'ok';
end;
$$;
revoke all on function public.freela_desfazer(uuid) from public, anon;
grant execute on function public.freela_desfazer(uuid) to authenticated;

-- O freelancer esqueceu do QR: o gerente lança a diária à mão (até 31 dias para trás, nunca no
-- futuro). Entra pendente, como o QR, e segue a mesma conferência.
create or replace function public.freela_adicionar_manual(p_unidade_id text, p_freelancer_id uuid, p_dia date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje date := public.freela_hoje();
  v_id uuid;
begin
  if not public.usuario_pode_usar_freelancers(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_dia is null or p_dia > v_hoje or p_dia < v_hoje - 31 then
    return 'dia_invalido';
  end if;
  if not exists (select 1 from public.freelancers
                  where id = p_freelancer_id and unidade_id = p_unidade_id and situacao <> 'inativo') then
    return 'nao_encontrado';
  end if;
  insert into public.freela_checkins (unidade_id, freelancer_id, dia, entrada_em, origem, criado_por)
  values (p_unidade_id, p_freelancer_id, p_dia, now(), 'manual', auth.uid())
  on conflict (freelancer_id, dia) do nothing
  returning id into v_id;
  if v_id is null then
    return 'ja_existe';
  end if;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_novos)
  values (p_unidade_id, auth.uid(), 'freela_adicionar_manual', 'freela_checkin', v_id::text,
          jsonb_build_object('freelancerId', p_freelancer_id, 'dia', p_dia));
  return 'ok';
end;
$$;
revoke all on function public.freela_adicionar_manual(text, uuid, date) from public, anon;
grant execute on function public.freela_adicionar_manual(text, uuid, date) to authenticated;

-- ══ 8. Página pública (só o servidor) ════════════════════════════════════

-- Nome e marca para a página do QR: a marca das Avaliações, quando a unidade tem; senão o nome.
create or replace function public.freela_pagina_publica(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', c.slug,
    'ativa', c.ativa and u.freelancers_habilitado and u.ativo,
    'nome', coalesce(p.nome_exibido, u.nome),
    'corPrincipal', coalesce(p.cor_principal, '#1F4E79'),
    'corFundo', coalesce(p.cor_fundo, '#FFFFFF'),
    'logoPath', p.logo_path
  )
    from public.freela_configuracoes c
    join public.unidades u on u.id = c.unidade_id
    left join public.avaliacoes_pesquisas p on p.unidade_id = c.unidade_id
   where c.slug = p_slug;
$$;
revoke all on function public.freela_pagina_publica(text) from public, anon, authenticated;
grant execute on function public.freela_pagina_publica(text) to service_role;

-- Check-in pelo QR. Nada do formulário é confiável: o servidor do Hub manda o WhatsApp já
-- normalizado e os hashes; aqui se confere tudo de novo, aplica o limite e grava.
-- Devolve {ok, hora, jaFeito} ou {ok:false, codigo}.
create or replace function public.freela_registrar_checkin(
  p_slug text,
  p_whatsapp text,
  p_nome text,
  p_funcao text,
  p_armadilha text,
  p_decorrido_ms integer,
  p_hash_ip text,
  p_hash_dispositivo text,
  p_agora timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg record;
  v_dia date := public.freela_hoje(p_agora);
  v_nome text := btrim(coalesce(p_nome, ''));
  v_funcao text := nullif(btrim(coalesce(p_funcao, '')), '');
  v_freela record;
  v_existente record;
  v_id uuid;
begin
  if p_armadilha is not null and btrim(p_armadilha) <> '' then
    return jsonb_build_object('ok', true, 'descartado', true);
  end if;
  if p_decorrido_ms is null or p_decorrido_ms < 1500 then
    return jsonb_build_object('ok', true, 'descartado', true);
  end if;
  if p_hash_ip is null or p_hash_ip !~ '^[0-9a-f]{64}$' or p_hash_dispositivo is null or p_hash_dispositivo !~ '^[0-9a-f]{64}$' then
    raise exception 'hash_invalido' using errcode = '22023';
  end if;

  select c.unidade_id, c.ativa, u.freelancers_habilitado, u.ativo into v_cfg
    from public.freela_configuracoes c join public.unidades u on u.id = c.unidade_id
   where c.slug = p_slug;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'nao_encontrado');
  end if;
  if not (v_cfg.ativa and v_cfg.freelancers_habilitado and v_cfg.ativo) then
    return jsonb_build_object('ok', false, 'codigo', 'fechado');
  end if;
  if p_whatsapp is null or p_whatsapp !~ '^55[1-9][0-9]{9,10}$' then
    return jsonb_build_object('ok', false, 'codigo', 'whatsapp_invalido');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('freela_whatsapp:' || v_cfg.unidade_id || ':' || p_whatsapp, 0));
  select id, situacao into v_freela from public.freelancers
   where unidade_id = v_cfg.unidade_id and whatsapp = p_whatsapp;

  -- Já fez hoje: devolve a hora (não conta no limite).
  if v_freela.id is not null then
    select entrada_em into v_existente from public.freela_checkins where freelancer_id = v_freela.id and dia = v_dia;
    if found then
      return jsonb_build_object('ok', true, 'jaFeito', true,
        'hora', to_char(v_existente.entrada_em at time zone 'America/Sao_Paulo', 'HH24:MI'));
    end if;
  end if;

  -- Limites do dia: 5 pessoas por aparelho, 60 por rede (a loja costuma ter um Wi-Fi só) e 200 por unidade.
  if (select count(*) from public.freela_checkins
       where unidade_id = v_cfg.unidade_id and dia = v_dia and hash_dispositivo = p_hash_dispositivo) >= 5
     or (select count(*) from public.freela_checkins
          where unidade_id = v_cfg.unidade_id and dia = v_dia and hash_ip = p_hash_ip) >= 60
     or (select count(*) from public.freela_checkins where unidade_id = v_cfg.unidade_id and dia = v_dia) >= 200 then
    return jsonb_build_object('ok', false, 'codigo', 'limite');
  end if;

  if v_freela.id is null then
    if char_length(v_nome) not between 2 and 80 then
      return jsonb_build_object('ok', false, 'codigo', 'nome_invalido');
    end if;
    if v_funcao is not null and char_length(v_funcao) not between 2 and 40 then
      return jsonb_build_object('ok', false, 'codigo', 'funcao_invalida');
    end if;
    insert into public.freelancers (unidade_id, nome, whatsapp, funcao, situacao)
    values (v_cfg.unidade_id, v_nome, p_whatsapp, v_funcao, 'novo')
    returning id, situacao into v_freela;
  end if;

  insert into public.freela_checkins (unidade_id, freelancer_id, dia, entrada_em, origem, nome_digitado, hash_ip, hash_dispositivo)
  values (v_cfg.unidade_id, v_freela.id, v_dia, p_agora, 'qr',
          case when char_length(v_nome) between 2 and 80 then v_nome end, p_hash_ip, p_hash_dispositivo)
  returning id into v_id;

  -- Mesmo aparelho com mais de uma pessoa no dia: marca todas (a tela Hoje destaca).
  update public.freela_checkins
     set aparelho_repetido = true
   where unidade_id = v_cfg.unidade_id and dia = v_dia and hash_dispositivo = p_hash_dispositivo
     and not aparelho_repetido
     and exists (select 1 from public.freela_checkins o
                  where o.unidade_id = v_cfg.unidade_id and o.dia = v_dia
                    and o.hash_dispositivo = p_hash_dispositivo and o.freelancer_id <> v_freela.id);

  return jsonb_build_object('ok', true, 'jaFeito', false,
    'hora', to_char(p_agora at time zone 'America/Sao_Paulo', 'HH24:MI'));
end;
$$;
revoke all on function public.freela_registrar_checkin(text, text, text, text, text, integer, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.freela_registrar_checkin(text, text, text, text, text, integer, text, text, timestamptz)
  to service_role;

-- ══ 9. Títulos no Contas a Pagar (só o servidor) ═════════════════════════

-- Apaga os títulos de conferências desfeitas (se ainda sem pagamento) e cria os das diárias
-- conferidas sem título. Idempotente: pode rodar a qualquer hora. Roda sem sessão de usuário
-- (service role), então os gatilhos do Financeiro não agem; as regras que importam estão aqui.
-- Devolve {criados, apagados, pendentes}.
create or replace function public.freela_sincronizar_titulos(p_unidade_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_fin boolean;
  v_categoria uuid;
  v_caixa uuid;
  v_lancamento uuid;
  v_parcela uuid;
  v_aviso text;
  v_criados integer := 0;
  v_apagados integer := 0;
  v_pendentes integer := 0;
begin
  if p_unidade_id is null then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('freela_titulos:' || p_unidade_id, 0));

  -- 1. Títulos de conferências desfeitas.
  for v_c in
    select c.id, c.titulo_a_remover from public.freela_checkins c
     where c.unidade_id = p_unidade_id and c.titulo_a_remover is not null
     for update
  loop
    if exists (select 1 from public.fin_parcelas p join public.fin_baixas b on b.parcela_id = p.id
                where p.lancamento_id = v_c.titulo_a_remover) then
      -- Pago no meio do caminho: o título fica e o estorno é com quem cuida do Financeiro.
      update public.freela_checkins set titulo_a_remover = null, titulo_aviso = 'titulo_ja_pago' where id = v_c.id;
    else
      delete from public.fin_lancamentos
       where id = v_c.titulo_a_remover and unidade_id = p_unidade_id and origem = 'freelancer';
      if found then
        v_apagados := v_apagados + 1;
      end if;
      update public.freela_checkins set titulo_a_remover = null where id = v_c.id;
    end if;
  end loop;

  -- 2. Diárias conferidas sem título.
  select financeiro_gerencial_habilitado into v_fin from public.unidades where id = p_unidade_id;
  select id into v_categoria from public.fin_categorias
   where unidade_id = p_unidade_id and codigo_sistema = 'cmo_freelancers' and nivel = 'conta' and not arquivado;
  v_caixa := public.freela_conta_caixa(p_unidade_id);

  for v_c in
    select c.id, c.dia, c.valor, c.pago_no_caixa, c.conferido_por, c.titulo_aviso, f.nome, f.funcao
      from public.freela_checkins c join public.freelancers f on f.id = c.freelancer_id
     where c.unidade_id = p_unidade_id and c.estado = 'conferido' and c.titulo_gerado_em is null
     order by c.dia, c.id
     for update of c
  loop
    v_aviso := case
      when not coalesce(v_fin, false) then 'financeiro_desligado'
      when v_categoria is null then 'sem_conta_freelancers'
      when exists (select 1 from public.fin_fechamentos fe
                    where fe.unidade_id = p_unidade_id and fe.competencia = date_trunc('month', v_c.dia)::date and fe.fechado)
        then 'mes_fechado'
      when v_c.pago_no_caixa and v_caixa is null then 'sem_conta_caixa'
    end;
    if v_aviso is not null then
      if v_aviso is distinct from v_c.titulo_aviso then
        update public.freela_checkins set titulo_aviso = v_aviso where id = v_c.id;
      end if;
      v_pendentes := v_pendentes + 1;
      continue;
    end if;

    insert into public.fin_lancamentos (unidade_id, tipo, categoria_id, descricao, data_competencia,
                                        conta_financeira_id, observacao, origem, criado_por)
    values (p_unidade_id, 'despesa', v_categoria,
            left('Diária freelancer - ' || v_c.nome || coalesce(' (' || v_c.funcao || ')', '') || ' - '
                 || to_char(v_c.dia, 'DD/MM/YYYY'), 200),
            v_c.dia, case when v_c.pago_no_caixa then v_caixa end,
            'Gerado pelo módulo Freelancers na conferência do gerente.', 'freelancer', v_c.conferido_por)
    returning id into v_lancamento;
    insert into public.fin_parcelas (unidade_id, lancamento_id, numero, total_parcelas, valor, data_prevista, conta_financeira_id)
    values (p_unidade_id, v_lancamento, 1, 1, v_c.valor, v_c.dia, case when v_c.pago_no_caixa then v_caixa end)
    returning id into v_parcela;
    if v_c.pago_no_caixa then
      insert into public.fin_baixas (unidade_id, parcela_id, tipo, conta_financeira_id, valor, data, observacao, criado_por)
      values (p_unidade_id, v_parcela, 'baixa', v_caixa, v_c.valor, v_c.dia, 'Pago pelo caixa (Freelancers).', v_c.conferido_por);
    end if;
    -- Sem sessão o gatilho da parcela não recalcula o status: recalcula aqui.
    update public.fin_parcelas
       set status = public.status_por_saldo_parcela(valor, public.saldo_baixado_parcela(id))
     where id = v_parcela;
    update public.freela_checkins
       set lancamento_id = v_lancamento, titulo_gerado_em = now(), titulo_aviso = null
     where id = v_c.id;
    insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_novos)
    values (p_unidade_id, v_c.conferido_por, 'freela_gerar_titulo', 'fin_lancamento', v_lancamento::text,
            jsonb_build_object('checkinId', v_c.id, 'dia', v_c.dia, 'valor', v_c.valor, 'pagoNoCaixa', v_c.pago_no_caixa));
    v_criados := v_criados + 1;
  end loop;

  return jsonb_build_object('criados', v_criados, 'apagados', v_apagados, 'pendentes', v_pendentes);
end;
$$;
revoke all on function public.freela_sincronizar_titulos(text) from public, anon, authenticated;
grant execute on function public.freela_sincronizar_titulos(text) to service_role;

-- Contas de caixa ativas da unidade, para escolher na configuração (o Financeiro é exclusivo;
-- aqui sai só id e nome, para quem edita os Freelancers da unidade).
create or replace function public.freela_contas_caixa(p_unidade_id text)
returns table (id uuid, nome text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.usuario_pode_usar_freelancers(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return query
    select c.id, c.nome from public.fin_contas_financeiras c
     where c.unidade_id = p_unidade_id and c.tipo = 'caixa' and c.ativo
     order by c.nome;
end;
$$;
revoke all on function public.freela_contas_caixa(text) from public, anon;
grant execute on function public.freela_contas_caixa(text) to authenticated;

-- Funções novas: o operador do Vini não executa (default privileges de 20261019180000).
revoke execute on function public.usuario_pode_usar_freelancers(text, text) from vini_operador;
revoke execute on function public.freela_hoje(timestamptz) from vini_operador;
revoke execute on function public.freela_conta_caixa(text) from vini_operador;
revoke execute on function public.freela_criar_configuracao(text) from vini_operador;
revoke execute on function public.freela_salvar_configuracao(text, numeric, uuid, boolean) from vini_operador;
revoke execute on function public.freela_salvar_freelancer(text, uuid, text, text, text, numeric, text) from vini_operador;
revoke execute on function public.freela_conferir(uuid, numeric, boolean) from vini_operador;
revoke execute on function public.freela_recusar(uuid, text) from vini_operador;
revoke execute on function public.freela_desfazer(uuid) from vini_operador;
revoke execute on function public.freela_adicionar_manual(text, uuid, date) from vini_operador;
revoke execute on function public.freela_pagina_publica(text) from vini_operador;
revoke execute on function public.freela_registrar_checkin(text, text, text, text, text, integer, text, text, timestamptz) from vini_operador;
revoke execute on function public.freela_sincronizar_titulos(text) from vini_operador;
revoke execute on function public.freela_contas_caixa(text) from vini_operador;

commit;
